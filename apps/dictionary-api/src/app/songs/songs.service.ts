import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, eq, ilike, inArray, sql, or } from 'drizzle-orm';
import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.providers';
import * as schema from '../../lib/db/schema';
import { CreateSongDto, UpdateSongDto } from './dto/song.dto';
import { SongLyricDto } from './dto/song-lyrics.dto';
import { SongBookExport } from './song-book-export.type';
import { UpdateSongBookMetaDto } from './dto/update-song-book-meta.dto';
import {
  RegistryItemDto,
  RegistryResponseDto,
  VersionsCheckRequestDto,
  VersionsCheckResponseDto,
} from './dto/versions.dto';
import { ImportSongBookDto } from './dto/import-song-book.dto';
import { CreateSongBookDto } from './dto/create-song-book.dto';
import { Buffer } from 'buffer';
import sharp from 'sharp';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync, unlinkSync, readdirSync, mkdirSync } from 'fs';

type SongRecord = typeof schema.songs.$inferSelect;
type SongWithMeta = SongRecord & { meta: string[]; lyrics: SongLyricDto[] };
const SHARP_FORMATS = ['jpeg', 'png', 'webp', 'avif'] as const;
type SharpFormat = (typeof SHARP_FORMATS)[number];
const MAX_COVER_IMAGE_BYTES = 300 * 1024;
const COVER_MAX_DIMENSION = 512;

type ExportJobStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
type ExportJobFormat = 'sqlite' | 'json';
type ExportJob = {
  id: string;
  songBookId: number;
  format: ExportJobFormat;
  status: ExportJobStatus;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
  filePath?: string;
  fileName?: string;
};

@Injectable()
export class SongsService {
  private readonly logger = new Logger(SongsService.name);
  private readonly exportJobs = new Map<string, ExportJob>();
  private readonly exportDir: string;

  constructor(@Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>) {
    const userDataPath = process.env.USER_DATA_PATH;
    this.exportDir = userDataPath ? join(userDataPath, 'temp', 'exports') : join(tmpdir(), 'lyricast-exports');
    mkdirSync(this.exportDir, { recursive: true });
    this.cleanupTempExports();
  }

  /**
   * Создаёт песню с лирикой/метаданными и повышает версии song_book и каталога.
   */
  async create(dto: CreateSongDto) {
    const created = await this.db.transaction(async (trx) => {
      await this.ensureDatasetMeta(trx);

      const { meta = [], lyrics, ...songData } = dto;

      const [song] = await trx
        .insert(schema.songs)
        .values(songData)
        .returning({ id: schema.songs.id });

      if (meta.length > 0) {
        await trx.insert(schema.songMeta).values(
          meta.map((value, idx) => ({
            songId: song.id,
            idx,
            value,
          })),
        );
      }

      await this.persistLyrics(trx, song.id, lyrics);
      await this.bumpSongBookAndCatalogVersion(trx, dto.songBookId);

      return song;
    });

    return this.findOne(created.id);
  }

  async createSongBook(dto: CreateSongBookDto) {
    const {
      catalogId,
      title: rawTitle,
      description: rawDescription,
      language: rawLanguage,
      source: rawSource,
      coverImage,
      fileKey: requestedFileKey,
    } = dto;
    const title = rawTitle?.trim();
    const description = rawDescription?.trim();
    const language = rawLanguage?.trim();
    const source = rawSource?.trim();

    return this.db.transaction(async (trx) => {
      await this.ensureDatasetMeta(trx);

      const catalog = await trx.query.catalogs.findFirst({
        where: eq(schema.catalogs.id, catalogId),
      });
      if (!catalog) {
        throw new NotFoundException('Catalog not found');
      }

      let fileKey: string;
      if (requestedFileKey?.trim()) {
        const existing = await trx.query.songBooks.findFirst({
          where: eq(schema.songBooks.fileKey, requestedFileKey.trim()),
        });
        if (existing) {
          throw new BadRequestException('Song book with provided fileKey already exists');
        }
        fileKey = requestedFileKey.trim();
      } else {
        fileKey = await this.generateUniqueSongBookFileKey(trx, title);
      }

      const now = new Date();
      const humanName = title || 'Новый сборник';
      const [created] = await trx
        .insert(schema.songBooks)
        .values({
          catalogId,
          fileKey,
          humanName,
          headerNumber: `manual-${now.getTime()}`,
          headerTitle: humanName,
          headerAuthor: source || 'LyriCast',
          headerUpdatedAt: now,
          headerBookKey: fileKey,
          headerDisabled: false,
          updatedBy: 'manual-create',
        })
        .returning({ id: schema.songBooks.id });

      const metaInput: Record<string, string> = {};
      if (title) metaInput.title = title;
      if (description) metaInput.description = description;
      if (language) metaInput.language = language;
      if (source) metaInput.source = source;
      if (coverImage?.trim()) metaInput.coverImage = coverImage.trim();

      if (Object.keys(metaInput).length > 0) {
        const normalizedMeta = await this.normalizeBookMetaStrict(metaInput);
        const entries = Object.entries(normalizedMeta);
        if (entries.length > 0) {
          await trx.insert(schema.songBookMeta).values(
            entries.map(([metaKey, metaValue]) => ({
              fileKey,
              metaKey,
              metaValue,
              updatedAt: now,
            })),
          );
        }
      }

      await this.bumpSongBookAndCatalogVersion(trx, created.id, 'manual-create');

      this.logger.log(
        `[createSongBook] created songBookId=${created.id} fileKey=${fileKey} catalogId=${catalogId}`,
      );

      return { ok: true, songBookId: created.id, fileKey };
    });
  }

  async updateSongBookMeta(songBookId: number, dto: UpdateSongBookMetaDto) {
    return this.db.transaction(async (trx) => {
      await this.ensureDatasetMeta(trx);

      const book = await trx.query.songBooks.findFirst({
        where: eq(schema.songBooks.id, songBookId),
      });
      if (!book) {
        throw new NotFoundException('Song book not found');
      }

      const patch: Record<string, string | null> = {
        title: dto.title ?? undefined,
        description: dto.description ?? undefined,
        language: dto.language ?? undefined,
        coverImage: dto.coverImage ?? undefined,
      };

      // удаляем undefined (не переданные поля)
      for (const key of Object.keys(patch)) {
        if (patch[key] === undefined) {
          delete patch[key];
        }
      }

      if (Object.keys(patch).length === 0) {
        return { ok: true, songBookId, fileKey: book.fileKey, updated: {} };
      }

      // Нормализуем coverImage (сжатие/формат) только если она передана и не null
      if (typeof patch.coverImage === 'string') {
        patch.coverImage = await this.normalizeCoverImageStrict(patch.coverImage);
      }

      const now = new Date();
      const deletes: string[] = [];
      const upserts: Array<{ metaKey: string; metaValue: string }> = [];

      for (const [metaKey, metaValue] of Object.entries(patch)) {
        if (metaValue === null) {
          deletes.push(metaKey);
        } else if (typeof metaValue === 'string') {
          const trimmed = metaValue.trim();
          if (trimmed.length === 0) {
            deletes.push(metaKey);
          } else {
            upserts.push({ metaKey, metaValue: trimmed });
          }
        }
      }

      if (deletes.length > 0) {
        await trx
          .delete(schema.songBookMeta)
          .where(
            and(
              eq(schema.songBookMeta.fileKey, book.fileKey),
              inArray(schema.songBookMeta.metaKey, deletes),
            ),
          );
      }

      for (const entry of upserts) {
        await trx
          .insert(schema.songBookMeta)
          .values({
            fileKey: book.fileKey,
            metaKey: entry.metaKey,
            metaValue: entry.metaValue,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [schema.songBookMeta.fileKey, schema.songBookMeta.metaKey],
            set: { metaValue: entry.metaValue, updatedAt: now },
          });
      }

      await this.bumpSongBookAndCatalogVersion(trx, songBookId, 'meta');

      return { ok: true, songBookId, fileKey: book.fileKey, updated: patch };
    });
  }

  /**
   * Возвращает список песен сборника с поиском по номеру/названию/ключу и пагинацией.
   */
  async findAll(
    songBookId: number,
    params?: { q?: string; page?: number; pageSize?: number },
  ): Promise<{ items: SongRecord[]; total: number }> {
    const { q, page = 1, pageSize = 20 } = params || {};
    const offset = (page - 1) * pageSize;

    const filters = [eq(schema.songs.songBookId, songBookId)];
    if (q) {
      const parsedNum = parseInt(q, 10);
      const isNum = !isNaN(parsedNum) && parsedNum.toString() === q.trim();

      const parts = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const like = parts.length > 0 ? `%${parts.join('%')}%` : `%${q}%`;

      const searchConditions = [ilike(schema.songs.title, like)];
      if (isNum) {
        searchConditions.push(eq(schema.songs.number, parsedNum));
      }

      filters.push(or(...searchConditions));
    }

    const items = await this.db
      .select({
        id: schema.songs.id,
        songBookId: schema.songs.songBookId,
        number: schema.songs.number,
        title: schema.songs.title,
        songKey: schema.songs.songKey,
        keySignature: schema.songs.keySignature,
        author: schema.songs.author,
        ref: schema.songs.ref,
        category: schema.songs.category,
      })
      .from(schema.songs)
      .where(and(...filters))
      .orderBy(schema.songs.number)
      .limit(pageSize)
      .offset(offset);

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.songs)
      .where(and(...filters));

    return { items, total: Number(countRow?.count ?? 0) };
  }

  /**
   * Загружает полные данные песни по id с лирикой и метаданными.
   */
  async findOne(id: number): Promise<SongWithMeta> {
    const song = await this.db.query.songs.findFirst({
      where: eq(schema.songs.id, id),
    });
    if (!song) {
      throw new NotFoundException('Song not found');
    }

    const meta = await this.loadSongMeta(this.db, id);
    const lyrics = await this.loadLyricsWithLines(this.db, id);

    const lyricsDto: SongLyricDto[] = lyrics.map((l) => ({
      uniqId: l.uniqId,
      sectionTitle: l.sectionTitle,
      type: l.type,
      splitLinesCount: l.splitLinesCount,
      sortIndex: l.sortIndex,
      lyrics: l.lines.map((ln) => ({
        rangeIndex: ln.rangeIndex ?? undefined,
        lineIndex: ln.lineIndex,
        globalSongIndex: ln.globalSongIndex ?? undefined,
        text: ln.text,
        repeatCount: ln.repeatCount ?? 1,
      })),
    }));

    return { ...song, meta, lyrics: lyricsDto };
  }

  /**
   * Обновляет песню и лирику/мета, синхронно повышает версии song_book, каталога и dataset_meta.
   */
  async update(id: number, dto: UpdateSongDto) {
    await this.db.transaction(async (trx) => {
      const existing = await trx.query.songs.findFirst({
        where: eq(schema.songs.id, id),
      });
      if (!existing) {
        throw new NotFoundException('Song not found');
      }

      const songBookId = dto.songBookId ?? existing.songBookId;

      const updates: Partial<typeof schema.songs.$inferInsert> = {};
      if (dto.songBookId !== undefined) updates.songBookId = dto.songBookId;
      if (dto.number !== undefined) updates.number = dto.number;
      if (dto.title !== undefined) updates.title = dto.title;
      if (dto.songKey !== undefined) updates.songKey = dto.songKey;
      if (dto.keySignature !== undefined) updates.keySignature = dto.keySignature;
      if (dto.author !== undefined) updates.author = dto.author;
      if (dto.ref !== undefined) updates.ref = dto.ref;
      if (dto.category !== undefined) updates.category = dto.category;

      if (Object.keys(updates).length > 0) {
        await trx.update(schema.songs).set(updates).where(eq(schema.songs.id, id));
      }

      if (dto.meta) {
        await trx.delete(schema.songMeta).where(eq(schema.songMeta.songId, id));
        if (dto.meta.length > 0) {
          await trx.insert(schema.songMeta).values(
            dto.meta.map((value, idx) => ({
              songId: id,
              idx,
              value,
            })),
          );
        }
      }

      if (dto.lyrics) {
        await trx.delete(schema.lyrics).where(eq(schema.lyrics.songId, id));
        await this.persistLyrics(trx, id, dto.lyrics);
      }

      await this.bumpSongBookAndCatalogVersion(trx, songBookId);
    });

    return this.findOne(id);
  }

  /**
   * Удаляет песню и повышает версию song_book и каталога.
   */
  async remove(id: number) {
    await this.db.transaction(async (trx) => {
      const song = await trx.query.songs.findFirst({
        where: eq(schema.songs.id, id),
      });
      if (!song) {
        throw new NotFoundException('Song not found');
      }

      await trx.delete(schema.songs).where(eq(schema.songs.id, id));
      await this.bumpSongBookAndCatalogVersion(trx, song.songBookId);
    });

    return { ok: true, id };
  }

  /**
   * Экспортирует книгу песен (SongBook) в формат SongBookExport.
   */
  async exportSongBook(songBookId: number): Promise<SongBookExport> {
    const book = await this.db.query.songBooks.findFirst({
      where: eq(schema.songBooks.id, songBookId),
    });
    if (!book) throw new NotFoundException('Song book not found');

    const bookMeta = await this.loadSongBookMeta(this.db, book.fileKey);

    const songs = await this.db
      .select()
      .from(schema.songs)
      .where(eq(schema.songs.songBookId, songBookId))
      .orderBy(schema.songs.number);

    const resultSongs: SongBookExport['songs'] = [];
    for (const song of songs) {
      const meta = await this.loadSongMeta(this.db, song.id);
      const lyricsRaw = await this.loadLyricsWithLines(this.db, song.id);

      resultSongs.push({
        number: song.number,
        title: song.title,
        key: song.songKey,
        keySignature: song.keySignature,
        author: song.author,
        meta,
        lyrics: lyricsRaw.map((l) => ({
          songId: String(song.number),
          uniqId: l.uniqId,
          sectionTitle: l.sectionTitle,
          type: l.type,
          splitLinesCount: l.splitLinesCount,
          lines: l.lines.map((ln) => ({
            id: ln.id,
            songId: String(song.number),
            rangeIndex: ln.rangeIndex,
            index: ln.lineIndex,
            globalSongIndex: ln.globalSongIndex,
            text: ln.text,
          })),
        })),
        ref: song.ref,
        category: song.category,
        bookName: {
          fileKey: book.fileKey,
          humanName: book.humanName,
        },
      });
    }

    return {
      header: {
        number: book.headerNumber,
        title: book.headerTitle,
        author: book.headerAuthor,
        updatedAt: book.headerUpdatedAt?.toISOString?.() ?? new Date().toISOString(),
        bookKey: book.headerBookKey,
        disabled: book.headerDisabled,
      },
      meta: bookMeta,
      songs: resultSongs,
    };
  }

  /**
   * Создаёт задачу экспорта SongBook в SQLite и возвращает jobId.
   */
  async createSqliteExportJob(songBookId: number) {
    const jobId = randomUUID();
    const now = new Date();
    const job: ExportJob = {
      id: jobId,
      songBookId,
      format: 'sqlite',
      status: 'pending',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.exportJobs.set(jobId, job);

    // запускаем без ожидания
    void this.runSqliteExportJob(jobId, songBookId);
    return { jobId };
  }

  /**
   * Возвращает статус задачи экспорта.
   */
  getExportJob(jobId: string) {
    const job = this.exportJobs.get(jobId);
    if (!job) {
      throw new NotFoundException('Export job not found');
    }
    return {
      jobId: job.id,
      format: job.format,
      status: job.status,
      progress: job.progress,
      error: job.error ?? null,
      downloadUrl: job.status === 'done' ? `/api/songs/export-jobs/${job.id}/file` : null,
    };
  }

  /**
   * Возвращает путь к готовому файлу экспорта (проверяет статус).
   */
  getExportedFile(jobId: string): { path: string; fileName: string } {
    const job = this.exportJobs.get(jobId);
    if (!job) {
      throw new NotFoundException('Export job not found');
    }
    if (job.status !== 'done' || !job.filePath || !job.fileName || !existsSync(job.filePath)) {
      throw new BadRequestException('Export is not ready');
    }
    return { path: job.filePath, fileName: job.fileName };
  }

  private async runSqliteExportJob(jobId: string, songBookId: number) {
    this.updateExportJob(jobId, { status: 'running', progress: 5 });
    this.logger.log(`[export:${jobId}] start sqlite export for songBookId=${songBookId}`);

    try {
      this.ensureNotCancelled(jobId);
      const datasetMeta = await this.loadDatasetMeta(this.db);
      const book = await this.db.query.songBooks.findFirst({
        where: eq(schema.songBooks.id, songBookId),
      });
      if (!book) {
        throw new NotFoundException('Song book not found');
      }
      this.ensureNotCancelled(jobId);
      const catalog = await this.db.query.catalogs.findFirst({
        where: eq(schema.catalogs.id, book.catalogId),
      });
      const bookMeta = await this.loadSongBookMeta(this.db, book.fileKey);
      const songs = await this.db
        .select()
        .from(schema.songs)
        .where(eq(schema.songs.songBookId, songBookId))
        .orderBy(schema.songs.number);

      this.ensureNotCancelled(jobId);
      this.updateExportJob(jobId, { progress: 25 });
      this.logger.log(`[export:${jobId}] songs fetched: ${songs.length}`);

      const songsWithDetails = await this.loadSongsWithDetailsBulk(songs, jobId);

      this.ensureNotCancelled(jobId);
      this.updateExportJob(jobId, { progress: 80 });
      this.logger.log(`[export:${jobId}] building sqlite file…`);

      const safeKey = book.fileKey?.trim() || 'songbook';
      const fileName = `${safeKey}.sqlite`;
      const filePath = join(this.exportDir, `dictionary-export-${jobId}.sqlite`);

      this.buildSqliteFile({
        filePath,
        datasetMeta,
        catalog,
        book,
        bookMeta,
        songs: songsWithDetails,
      });

      this.updateExportJob(jobId, {
        status: 'done',
        progress: 100,
        filePath,
        fileName,
        error: undefined,
      });
      this.logger.log(`[export:${jobId}] done. file=${filePath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown export error';
      this.logger.error(`Export job ${jobId} failed`, err as Error);
      this.updateExportJob(jobId, { status: 'failed', progress: 100, error: message });
    }
  }

  /**
   * Создаёт задачу экспорта SongBook в JSON файл (фоново).
   */
  async createJsonExportJob(songBookId: number) {
    const jobId = randomUUID();
    const now = new Date();
    const job: ExportJob = {
      id: jobId,
      songBookId,
      format: 'json',
      status: 'pending',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.exportJobs.set(jobId, job);

    void this.runJsonExportJob(jobId, songBookId);
    return { jobId };
  }

  private async runJsonExportJob(jobId: string, songBookId: number) {
    this.updateExportJob(jobId, { status: 'running', progress: 5 });
    try {
      this.logger.log(`[export:${jobId}] start json export for songBookId=${songBookId}`);
      this.ensureNotCancelled(jobId);
      const { payload, fileName } = await this.buildJsonExport(songBookId, jobId);

      this.ensureNotCancelled(jobId);
      this.updateExportJob(jobId, { progress: 85 });
      const filePath = join(this.exportDir, `dictionary-export-${jobId}.json`);
      await this.saveJsonToFile(payload, filePath);

      this.updateExportJob(jobId, {
        status: 'done',
        progress: 100,
        filePath,
        fileName,
        error: undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown export error';
      this.logger.error(`Export JSON job ${jobId} failed`, err as Error);
      const status: ExportJobStatus = message === 'Cancelled' ? 'cancelled' : 'failed';
      this.updateExportJob(jobId, { status, progress: 100, error: status === 'failed' ? message : undefined });
    }
  }

  private async buildJsonExport(
    songBookId: number,
    jobId?: string,
  ): Promise<{ payload: SongBookExport; fileName: string }> {
    const book = await this.db.query.songBooks.findFirst({
      where: eq(schema.songBooks.id, songBookId),
    });
    if (!book) throw new NotFoundException('Song book not found');

    const bookMeta = await this.loadSongBookMeta(this.db, book.fileKey);
    const songs = await this.db
      .select()
      .from(schema.songs)
      .where(eq(schema.songs.songBookId, songBookId))
      .orderBy(schema.songs.number);

    this.updateExportJob(jobId ?? '', { progress: 25 });
    this.logger.log(`[export:${jobId ?? 'json'}] songs fetched: ${songs.length}`);

    const songsWithDetails = await this.loadSongsWithDetailsBulk(songs, jobId);
    this.ensureNotCancelled(jobId ?? '');
    this.updateExportJob(jobId ?? '', { progress: 70 });

    const resultSongs: SongBookExport['songs'] = songsWithDetails.map(({ song, meta, lyrics }) => ({
      number: song.number,
      title: song.title,
      key: song.songKey,
      keySignature: song.keySignature,
      author: song.author,
      meta,
      lyrics: lyrics.map((l) => ({
        songId: String(song.number),
        uniqId: l.uniqId,
        sectionTitle: l.sectionTitle,
        type: l.type,
        splitLinesCount: l.splitLinesCount,
        lines: l.lines.map((ln) => ({
          id: ln.id,
          songId: String(song.number),
          rangeIndex: ln.rangeIndex ?? undefined,
          index: ln.lineIndex,
          globalSongIndex: ln.globalSongIndex ?? undefined,
          text: ln.text,
        })),
      })),
      ref: song.ref,
      category: song.category,
      bookName: {
        fileKey: book.fileKey,
        humanName: book.humanName,
      },
    }));

    const payload: SongBookExport = {
      header: {
        number: book.headerNumber,
        title: book.headerTitle,
        author: book.headerAuthor,
        updatedAt: book.headerUpdatedAt?.toISOString?.() ?? new Date().toISOString(),
        bookKey: book.headerBookKey,
        disabled: book.headerDisabled,
      },
      meta: bookMeta,
      songs: resultSongs,
    };

    const safeKey = book.fileKey?.trim() || 'songbook';
    const fileName = `${safeKey}.songs.json`;

    return { payload, fileName };
  }

  cancelExportJob(jobId: string) {
    const job = this.exportJobs.get(jobId);
    if (!job) {
      throw new NotFoundException('Export job not found');
    }
    if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
      return { ok: true, status: job.status };
    }
    this.updateExportJob(jobId, { status: 'cancelled', progress: 100, error: 'Cancelled' });
    if (job.filePath && existsSync(job.filePath)) {
      unlinkSync(job.filePath);
    }
    return { ok: true, status: 'cancelled' };
  }

  private updateExportJob(jobId: string, patch: Partial<ExportJob>) {
    const current = this.exportJobs.get(jobId);
    if (!current) return;
    const updated: ExportJob = {
      ...current,
      ...patch,
      updatedAt: new Date(),
    };
    this.exportJobs.set(jobId, updated);
  }

  private ensureNotCancelled(jobId: string) {
    if (!jobId) return;
    const job = this.exportJobs.get(jobId);
    if (job?.status === 'cancelled') {
      throw new Error('Cancelled');
    }
  }

  private buildSqliteFile({
    filePath,
    datasetMeta,
    catalog,
    book,
    bookMeta,
    songs,
  }: {
    filePath: string;
    datasetMeta: typeof schema.datasetMeta.$inferSelect | null;
    catalog: typeof schema.catalogs.$inferSelect | null;
    book: typeof schema.songBooks.$inferSelect;
    bookMeta: Record<string, string>;
    songs: Array<{
      song: typeof schema.songs.$inferSelect;
      meta: string[];
      lyrics: Awaited<ReturnType<typeof this.loadLyricsWithLines>>;
    }>;
  }) {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    const dbSqlite = new Database(filePath);
    try {
      dbSqlite.pragma('journal_mode = WAL');
      dbSqlite.exec(`
        CREATE TABLE catalogs (
          id INTEGER PRIMARY KEY,
          code TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          version INTEGER NOT NULL,
          updated_at TEXT
        );
        CREATE TABLE song_books (
          id INTEGER PRIMARY KEY,
          catalog_id INTEGER NOT NULL,
          file_key TEXT NOT NULL,
          human_name TEXT NOT NULL,
          header_number TEXT NOT NULL,
          header_title TEXT NOT NULL,
          header_author TEXT NOT NULL,
          header_updated_at TEXT NOT NULL,
          header_book_key TEXT NOT NULL,
          header_disabled INTEGER NOT NULL,
          version INTEGER NOT NULL,
          updated_by TEXT,
          updated_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE song_book_meta (
          file_key TEXT NOT NULL,
          meta_key TEXT NOT NULL,
          meta_value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE songs (
          id INTEGER PRIMARY KEY,
          song_book_id INTEGER NOT NULL,
          number INTEGER NOT NULL,
          title TEXT NOT NULL,
          song_key TEXT NOT NULL,
          key_signature TEXT NOT NULL,
          author TEXT NOT NULL,
          ref TEXT,
          category TEXT
        );
        CREATE TABLE song_meta (
          song_id INTEGER NOT NULL,
          idx INTEGER NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE lyrics (
          id INTEGER PRIMARY KEY,
          song_id INTEGER NOT NULL,
          uniq_id TEXT NOT NULL,
          section_title TEXT NOT NULL,
          type TEXT NOT NULL,
          split_lines_count INTEGER NOT NULL,
          sort_index INTEGER NOT NULL
        );
        CREATE TABLE lyric_lines (
          id INTEGER PRIMARY KEY,
          lyric_id INTEGER NOT NULL,
          range_index TEXT,
          line_index INTEGER NOT NULL,
          global_song_index INTEGER,
          text TEXT NOT NULL,
          repeat_count INTEGER NOT NULL
        );
        CREATE TABLE dataset_meta (
          id INTEGER PRIMARY KEY,
          schema_version INTEGER NOT NULL,
          version TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      if (catalog) {
        const stmt = dbSqlite.prepare(
          `INSERT INTO catalogs (id, code, type, title, version, updated_at)
           VALUES (@id, @code, @type, @title, @version, @updated_at)`,
        );
        stmt.run({
          id: catalog.id,
          code: catalog.code,
          type: catalog.type,
          title: catalog.title,
          version: catalog.version,
          updated_at: catalog.updatedAt?.toISOString?.() ?? null,
        });
      }

      const bookStmt = dbSqlite.prepare(
        `INSERT INTO song_books (
          id, catalog_id, file_key, human_name, header_number, header_title, header_author,
          header_updated_at, header_book_key, header_disabled, version, updated_by, updated_at, created_at
        ) VALUES (
          @id, @catalog_id, @file_key, @human_name, @header_number, @header_title, @header_author,
          @header_updated_at, @header_book_key, @header_disabled, @version, @updated_by, @updated_at, @created_at
        )`,
      );
      bookStmt.run({
        id: book.id,
        catalog_id: book.catalogId,
        file_key: book.fileKey,
        human_name: book.humanName,
        header_number: book.headerNumber,
        header_title: book.headerTitle,
        header_author: book.headerAuthor,
        header_updated_at: book.headerUpdatedAt.toISOString(),
        header_book_key: book.headerBookKey,
        header_disabled: book.headerDisabled ? 1 : 0,
        version: book.version,
        updated_by: book.updatedBy ?? null,
        updated_at: book.updatedAt.toISOString(),
        created_at: book.createdAt.toISOString(),
      });

      const metaStmt = dbSqlite.prepare(
        `INSERT INTO song_book_meta (file_key, meta_key, meta_value, updated_at)
         VALUES (@file_key, @meta_key, @meta_value, @updated_at)`,
      );
      for (const [key, value] of Object.entries(bookMeta)) {
        metaStmt.run({
          file_key: book.fileKey,
          meta_key: key,
          meta_value: value,
          updated_at: book.updatedAt.toISOString(),
        });
      }

      const songStmt = dbSqlite.prepare(
        `INSERT INTO songs (
          id, song_book_id, number, title, song_key, key_signature, author, ref, category
        ) VALUES (
          @id, @song_book_id, @number, @title, @song_key, @key_signature, @author, @ref, @category
        )`,
      );
      const songMetaStmt = dbSqlite.prepare(
        `INSERT INTO song_meta (song_id, idx, value) VALUES (@song_id, @idx, @value)`,
      );
      const lyricsStmt = dbSqlite.prepare(
        `INSERT INTO lyrics (
          id, song_id, uniq_id, section_title, type, split_lines_count, sort_index
        ) VALUES (
          @id, @song_id, @uniq_id, @section_title, @type, @split_lines_count, @sort_index
        )`,
      );
      const lyricLinesStmt = dbSqlite.prepare(
        `INSERT INTO lyric_lines (
          id, lyric_id, range_index, line_index, global_song_index, text, repeat_count
        ) VALUES (
          @id, @lyric_id, @range_index, @line_index, @global_song_index, @text, @repeat_count
        )`,
      );

      for (const item of songs) {
        const { song, meta, lyrics } = item;
        songStmt.run({
          id: song.id,
          song_book_id: song.songBookId,
          number: song.number,
          title: song.title,
          song_key: song.songKey,
          key_signature: song.keySignature,
          author: song.author,
          ref: song.ref ?? null,
          category: song.category ?? null,
        });

        meta.forEach((value, idx) => {
          songMetaStmt.run({ song_id: song.id, idx, value });
        });

        for (const l of lyrics) {
          const currentLyricId = l.id;
          lyricsStmt.run({
            id: currentLyricId,
            song_id: song.id,
            uniq_id: l.uniqId,
            section_title: l.sectionTitle,
            type: l.type,
            split_lines_count: l.splitLinesCount,
            sort_index: l.sortIndex,
          });

          for (const line of l.lines) {
            lyricLinesStmt.run({
              id: line.id,
              lyric_id: currentLyricId,
              range_index: line.rangeIndex ?? null,
              line_index: line.lineIndex,
              global_song_index: line.globalSongIndex ?? null,
              text: line.text,
              repeat_count: line.repeatCount ?? 1,
            });
          }
        }
      }

      if (datasetMeta) {
        const datasetStmt = dbSqlite.prepare(
          `INSERT INTO dataset_meta (id, schema_version, version, updated_at)
           VALUES (@id, @schema_version, @version, @updated_at)`,
        );
        datasetStmt.run({
          id: datasetMeta.id,
          schema_version: datasetMeta.schemaVersion,
          version: datasetMeta.version,
          updated_at: datasetMeta.updatedAt.toISOString(),
        });
      }
    } finally {
      dbSqlite.close();
    }
  }

  private async persistLyrics(
    trx: PostgresJsDatabase<typeof schema>,
    songId: number,
    lyrics: SongLyricDto[],
  ) {
    for (const [idx, lyric] of lyrics.entries()) {
      const [l] = await trx
        .insert(schema.lyrics)
        .values({
          songId,
          uniqId: lyric.uniqId,
          sectionTitle: lyric.sectionTitle,
          type: lyric.type,
          splitLinesCount: lyric.splitLinesCount ?? 0,
          sortIndex: lyric.sortIndex ?? idx,
        })
        .returning({ id: schema.lyrics.id });

      if (lyric.lyrics && lyric.lyrics.length > 0) {
        await trx.insert(schema.lyricLines).values(
          lyric.lyrics.map((line) => ({
            lyricId: l.id,
            rangeIndex: line.rangeIndex ?? null,
            lineIndex: line.lineIndex,
            globalSongIndex: line.globalSongIndex ?? null,
            text: line.text,
            repeatCount: line.repeatCount ?? 1,
          })),
        );
      }
    }
  }

  private async ensureDatasetMeta(db: PostgresJsDatabase<typeof schema>) {
    const [meta] = await db.select().from(schema.datasetMeta).limit(1);
    if (!meta) {
      await db
        .insert(schema.datasetMeta)
        .values({ id: 1, schemaVersion: 1, version: this.randomVersion(), updatedAt: new Date() })
        .onConflictDoNothing();
    }
  }

  private async bumpSongBookAndCatalogVersion(
    db: PostgresJsDatabase<typeof schema>,
    songBookId: number,
    updatedBy = 'system',
  ) {
    const [songBook] = await db
      .select({ id: schema.songBooks.id, catalogId: schema.songBooks.catalogId })
      .from(schema.songBooks)
      .where(eq(schema.songBooks.id, songBookId))
      .limit(1);
    if (!songBook) throw new NotFoundException('Song book not found');

    await db
      .update(schema.songBooks)
      .set({
        version: sql<number>`${schema.songBooks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.songBooks.id, songBookId));

    await this.bumpSongBookMetaVersion(db, songBookId, updatedBy);

    await db
      .update(schema.catalogs)
      .set({
        version: sql<number>`${schema.catalogs.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.catalogs.id, songBook.catalogId));

    await this.bumpDatasetVersion(db);
  }

  private async bumpSongBookMetaVersion(
    db: PostgresJsDatabase<typeof schema>,
    songBookId: number,
    updatedBy = 'system',
  ) {
    const [row] = await db
      .select({ fileKey: schema.songBooks.fileKey, version: schema.songBooks.version })
      .from(schema.songBooks)
      .where(eq(schema.songBooks.id, songBookId))
      .limit(1);
    if (!row) throw new NotFoundException('Song book not found');

    const nowIso = new Date().toISOString();
    const now = new Date();

    const entries = [
      { metaKey: 'version', metaValue: String(Number(row.version ?? 0)) },
      { metaKey: 'updated_at', metaValue: nowIso },
      { metaKey: 'updated_by', metaValue: updatedBy },
    ];

    for (const entry of entries) {
      await db
        .insert(schema.songBookMeta)
        .values({
          fileKey: row.fileKey,
          metaKey: entry.metaKey,
          metaValue: entry.metaValue,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.songBookMeta.fileKey, schema.songBookMeta.metaKey],
          set: { metaValue: entry.metaValue, updatedAt: now },
        });
    }
  }

  private async bumpDatasetVersion(db: PostgresJsDatabase<typeof schema>) {
    await this.ensureDatasetMeta(db);
    const version = this.randomVersion();
    await db
      .update(schema.datasetMeta)
      .set({ version, updatedAt: new Date() })
      .where(eq(schema.datasetMeta.id, 1));
    return version;
  }

  private randomVersion() {
    return randomUUID();
  }

  private async loadSongMeta(db: PostgresJsDatabase<typeof schema>, songId: number): Promise<string[]> {
    const metaRows = await db
      .select({ idx: schema.songMeta.idx, value: schema.songMeta.value })
      .from(schema.songMeta)
      .where(eq(schema.songMeta.songId, songId))
      .orderBy(schema.songMeta.idx);
    return metaRows.map((m) => m.value);
  }

  private async loadSongBookMeta(
    db: PostgresJsDatabase<typeof schema>,
    fileKey: string,
  ): Promise<Record<string, string>> {
    const metaRows = await db
      .select({
        key: schema.songBookMeta.metaKey,
        value: schema.songBookMeta.metaValue,
      })
      .from(schema.songBookMeta)
      .where(eq(schema.songBookMeta.fileKey, fileKey));

    const meta: Record<string, string> = {};
    for (const row of metaRows) {
      meta[row.key] = row.value;
    }
    return meta;
  }

  private async loadLyricsWithLines(
    db: PostgresJsDatabase<typeof schema>,
    songId: number,
  ): Promise<
    Array<{
      id: number;
      uniqId: string;
      sectionTitle: string;
      type: string;
      splitLinesCount: number;
      sortIndex: number;
      lines: Array<{
        id: number;
        rangeIndex: string | null;
        lineIndex: number;
        globalSongIndex: number | null;
        text: string;
        repeatCount: number | null;
      }>;
    }>
  > {
    const lyricsRows = await db
      .select({
        id: schema.lyrics.id,
        uniqId: schema.lyrics.uniqId,
        sectionTitle: schema.lyrics.sectionTitle,
        type: schema.lyrics.type,
        splitLinesCount: schema.lyrics.splitLinesCount,
        sortIndex: schema.lyrics.sortIndex,
      })
      .from(schema.lyrics)
      .where(eq(schema.lyrics.songId, songId))
      .orderBy(schema.lyrics.sortIndex);

    const lyrics = [];
    for (const l of lyricsRows) {
      const lines = await db
        .select({
          id: schema.lyricLines.id,
          rangeIndex: schema.lyricLines.rangeIndex,
          lineIndex: schema.lyricLines.lineIndex,
          globalSongIndex: schema.lyricLines.globalSongIndex,
          text: schema.lyricLines.text,
          repeatCount: schema.lyricLines.repeatCount,
        })
        .from(schema.lyricLines)
        .where(eq(schema.lyricLines.lyricId, l.id))
        .orderBy(schema.lyricLines.lineIndex);

      lyrics.push({
        id: l.id,
        uniqId: l.uniqId,
        sectionTitle: l.sectionTitle,
        type: l.type,
        splitLinesCount: l.splitLinesCount,
        sortIndex: l.sortIndex,
        lines,
      });
    }

    return lyrics;
  }

  private async loadDatasetMeta(db: PostgresJsDatabase<typeof schema>) {
    await this.ensureDatasetMeta(db);
    const [meta] = await db.select().from(schema.datasetMeta).where(eq(schema.datasetMeta.id, 1));
    return meta ?? null;
  }

  private async loadSongsWithDetailsBulk(
    songs: typeof schema.songs.$inferSelect[],
    jobId?: string,
  ): Promise<
    Array<{
      song: typeof schema.songs.$inferSelect;
      meta: string[];
      lyrics: Awaited<ReturnType<typeof this.loadLyricsWithLines>>;
    }>
  > {
    const BATCH = 100;
    const result = [];
    const total = songs.length || 1;
    const started = Date.now();

    for (let start = 0; start < songs.length; start += BATCH) {
      this.ensureNotCancelled(jobId ?? '');
      const slice = songs.slice(start, start + BATCH);
      const batchStart = Date.now();
      const songIds = slice.map((s) => s.id);

      // meta одним запросом
      const metaRows = await this.db
        .select({
          songId: schema.songMeta.songId,
          idx: schema.songMeta.idx,
          value: schema.songMeta.value,
        })
        .from(schema.songMeta)
        .where(inArray(schema.songMeta.songId, songIds))
        .orderBy(schema.songMeta.songId, schema.songMeta.idx);
      this.ensureNotCancelled(jobId ?? '');
      const metaMap = new Map<number, string[]>();
      for (const row of metaRows) {
        if (!metaMap.has(row.songId)) metaMap.set(row.songId, []);
        metaMap.get(row.songId)![row.idx] = row.value;
      }

      // lyrics одним запросом
      const lyricsRows = await this.db
        .select({
          id: schema.lyrics.id,
          songId: schema.lyrics.songId,
          uniqId: schema.lyrics.uniqId,
          sectionTitle: schema.lyrics.sectionTitle,
          type: schema.lyrics.type,
          splitLinesCount: schema.lyrics.splitLinesCount,
          sortIndex: schema.lyrics.sortIndex,
        })
        .from(schema.lyrics)
        .where(inArray(schema.lyrics.songId, songIds))
        .orderBy(schema.lyrics.songId, schema.lyrics.sortIndex);
      this.ensureNotCancelled(jobId ?? '');

      const lyricIds = lyricsRows.map((l) => l.id);
      const linesRows =
        lyricIds.length === 0
          ? []
          : await this.db
              .select({
                lyricId: schema.lyricLines.lyricId,
                id: schema.lyricLines.id,
                rangeIndex: schema.lyricLines.rangeIndex,
                lineIndex: schema.lyricLines.lineIndex,
                globalSongIndex: schema.lyricLines.globalSongIndex,
                text: schema.lyricLines.text,
                repeatCount: schema.lyricLines.repeatCount,
              })
              .from(schema.lyricLines)
              .where(inArray(schema.lyricLines.lyricId, lyricIds))
              .orderBy(schema.lyricLines.lyricId, schema.lyricLines.lineIndex);
      this.ensureNotCancelled(jobId ?? '');

      const linesMap = new Map<number, typeof linesRows>();
      for (const row of linesRows) {
        if (!linesMap.has(row.lyricId)) linesMap.set(row.lyricId, []);
        linesMap.get(row.lyricId)!.push(row);
      }

      for (const song of slice) {
        this.ensureNotCancelled(jobId ?? '');
        const meta = metaMap.get(song.id) ?? [];
        const lyrics = lyricsRows
          .filter((l) => l.songId === song.id)
          .map((l) => ({
            id: l.id,
            uniqId: l.uniqId,
            sectionTitle: l.sectionTitle,
            type: l.type,
            splitLinesCount: l.splitLinesCount,
            sortIndex: l.sortIndex,
            lines: (linesMap.get(l.id) ?? []).map((ln) => ({
              id: ln.id,
              rangeIndex: ln.rangeIndex,
              lineIndex: ln.lineIndex,
              globalSongIndex: ln.globalSongIndex,
              text: ln.text,
              repeatCount: ln.repeatCount,
            })),
          }));
        result.push({ song, meta, lyrics });
      }

      const processed = Math.min(start + BATCH, songs.length);
      const progressStep = 25 + Math.floor((processed / total) * 50); // 25..75
      this.updateExportJob(jobId, { progress: progressStep });
      const batchMs = Date.now() - batchStart;
      this.logger.debug(`[export:${jobId}] processed songs ${processed}/${total} (+${batchMs} ms)`);
    }

    const totalMs = Date.now() - started;
    this.logger.log(`[export:${jobId}] songs details loaded in ${totalMs} ms`);

    return result;
  }

  private cleanupTempExports() {
    try {
      const files = readdirSync(this.exportDir, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile()) continue;
        if (!file.name.startsWith('dictionary-export-')) continue;
        const fullPath = join(this.exportDir, file.name);
        try {
          unlinkSync(fullPath);
        } catch {
          // ignore cleanup errors
        }
      }
    } catch {
      // ignore cleanup errors
    }
  }

  private async saveJsonToFile(data: unknown, filePath: string) {
    const serialized = JSON.stringify(data, null, 2);
    await import('fs/promises').then(({ writeFile }) => writeFile(filePath, serialized, 'utf-8'));
  }

  /**
   * Возвращает список книг с агрегированной метой и количеством песен (registry.list аналог).
   */
  async registryList(): Promise<RegistryResponseDto> {
    const books = await this.db
      .select({
        id: schema.songBooks.id,
        fileKey: schema.songBooks.fileKey,
        humanName: schema.songBooks.humanName,
        catalogId: schema.songBooks.catalogId,
      })
      .from(schema.songBooks)
      .orderBy(schema.songBooks.id);
    if (books.length === 0) return { items: [], totalCount: 0 };

    const fileKeys = books.map((b) => b.fileKey);
    const metaRows = await this.db
      .select({
        fileKey: schema.songBookMeta.fileKey,
        key: schema.songBookMeta.metaKey,
        value: schema.songBookMeta.metaValue,
      })
      .from(schema.songBookMeta)
      .where(inArray(schema.songBookMeta.fileKey, fileKeys));

    const counts = await this.db
      .select({ songBookId: schema.songs.songBookId, count: sql<number>`count(*)` })
      .from(schema.songs)
      .where(inArray(schema.songs.songBookId, books.map((b) => b.id)))
      .groupBy(schema.songs.songBookId);
    const countMap = new Map<number, number>();
    for (const c of counts) countMap.set(c.songBookId, Number(c.count ?? 0));

    const metaMap = new Map<string, Record<string, string>>();
    for (const m of metaRows) {
      if (!metaMap.has(m.fileKey)) metaMap.set(m.fileKey, {});
      metaMap.get(m.fileKey)![m.key] = m.value;
    }

    const items: RegistryItemDto[] = books.map((b) => {
      const meta = metaMap.get(b.fileKey) ?? {};
      return {
        id: b.id,
        fileKey: b.fileKey,
        humanName: b.humanName,
        catalogId: b.catalogId,
        meta: {
          fileKey: b.fileKey,
          language: meta.language ?? null,
          title: meta.title ?? null,
          description: meta.description ?? null,
          coverImage: meta.coverImage ?? null,
          version: Number(meta.version ?? 0),
          updatedBy: meta.updated_by ?? null,
          updatedAt: meta.updated_at ?? null,
          songCount: countMap.get(b.id) ?? 0,
        },
      };
    });

    return { items, totalCount: items.length };
  }

  /**
   * Возвращает список книг с версиями, которые новее клиента (book.versions.check).
   */
  async checkVersions(body: VersionsCheckRequestDto): Promise<VersionsCheckResponseDto> {
    const books = await this.db.select().from(schema.songBooks);
    if (books.length === 0) return { updates: [], totalCount: 0 };

    const requested = body.books ?? [];
    const requestedMap = new Map<string, number>();
    for (const b of requested) requestedMap.set(b.fileKey, b.version);

    const metaRows = await this.db
      .select({
        fileKey: schema.songBookMeta.fileKey,
        key: schema.songBookMeta.metaKey,
        value: schema.songBookMeta.metaValue,
      })
      .from(schema.songBookMeta)
      .where(inArray(schema.songBookMeta.fileKey, books.map((b) => b.fileKey)));

    const metaMap = new Map<string, Record<string, string>>();
    for (const m of metaRows) {
      if (!metaMap.has(m.fileKey)) metaMap.set(m.fileKey, {});
      metaMap.get(m.fileKey)![m.key] = m.value;
    }

    const updates = [];
    for (const b of books) {
      const serverVersion = Number(metaMap.get(b.fileKey)?.version ?? b.version ?? 0);
      const clientVersion = requestedMap.get(b.fileKey) ?? -1;
      if (requested.length === 0 || serverVersion > clientVersion) {
        updates.push({
          fileKey: b.fileKey,
          version: serverVersion,
          downloadUrl: `/songs/song-books/${b.id}/export`,
        });
      }
    }

    return { updates, totalCount: updates.length };
  }

  /**
   * Импортирует книгу песен (SongBookExport) в PostgreSQL, пересоздаёт песни/мету и bump версий.
   */
  async importSongBook(dto: ImportSongBookDto) {
    const startedAt = Date.now();
    const { catalogId, data } = dto;
    if (!Array.isArray(data.songs) || data.songs.length === 0) {
      throw new BadRequestException('Song list is empty');
    }

    const fileKey = this.resolveFileKey(data);
    if (!fileKey) {
      throw new BadRequestException('fileKey is required in import payload');
    }

    this.logger.log(
      `[importSongBook] start fileKey=${fileKey} catalogId=${catalogId} songs=${data.songs.length}`,
    );

    const result = await this.db.transaction(async (trx) => {
      await this.ensureDatasetMeta(trx);

      const catalog = await trx.query.catalogs.findFirst({
        where: eq(schema.catalogs.id, catalogId),
      });
      if (!catalog) {
        throw new NotFoundException('Catalog not found');
      }

      const existing = await trx.query.songBooks.findFirst({
        where: eq(schema.songBooks.fileKey, fileKey),
      });

      this.logger.log(
        `[importSongBook] songBook ${existing ? 'update' : 'create'} fileKey=${fileKey}`,
      );

      const songBookBase = {
        catalogId,
        fileKey,
        humanName: data.songs[0]?.bookName.humanName ?? data.header.title,
        headerNumber: data.header.number,
        headerTitle: data.header.title,
        headerAuthor: data.header.author,
        headerUpdatedAt: new Date(data.header.updatedAt),
        headerBookKey: data.header.bookKey,
        headerDisabled: data.header.disabled,
      };

      let songBookId: number;
      if (existing) {
        const [updated] = await trx
          .update(schema.songBooks)
          .set({ ...songBookBase, updatedAt: new Date(), updatedBy: 'import' })
          .where(eq(schema.songBooks.id, existing.id))
          .returning({ id: schema.songBooks.id });
        songBookId = updated.id;
      } else {
        const [created] = await trx
          .insert(schema.songBooks)
          .values({ ...songBookBase, updatedBy: 'import' })
          .returning({ id: schema.songBooks.id });
        songBookId = created.id;
      }

      const metaStartedAt = Date.now();
      const normalizedMeta = await this.normalizeBookMetaStrict(data.meta ?? {});
      this.logger.log(
        `[importSongBook] meta normalized in ${Date.now() - metaStartedAt}ms (keys=${Object.keys(normalizedMeta).length})`,
      );

      // Обновляем мета книги (после успешной нормализации, чтобы не потерять existing meta при ошибке)
      await trx.delete(schema.songBookMeta).where(eq(schema.songBookMeta.fileKey, fileKey));

      const bookMetaEntries = Object.entries(normalizedMeta);
      if (bookMetaEntries.length > 0) {
        await trx.insert(schema.songBookMeta).values(
          bookMetaEntries.map(([metaKey, metaValue]) => ({
            fileKey,
            metaKey,
            metaValue,
            updatedAt: new Date(),
          })),
        );
      }

      // Пересоздаём песни
      this.logger.log(`[importSongBook] delete songs for songBookId=${songBookId}`);
      await trx.delete(schema.songs).where(eq(schema.songs.songBookId, songBookId));

      const songsTotal = data.songs.length;
      let insertedSongs = 0;

      let insertedLyrics = 0;
      let insertedLines = 0;

      const chunkSize = 100;
      for (let offset = 0; offset < data.songs.length; offset += chunkSize) {
        const chunk = data.songs.slice(offset, offset + chunkSize);

        const inserted = await trx
          .insert(schema.songs)
          .values(
            chunk.map((song) => ({
              songBookId,
              number: song.number,
              title: song.title,
              songKey: song.key,
              keySignature: song.keySignature,
              author: song.author,
              ref: song.ref ?? null,
              category: song.category ?? null,
            })),
          )
          .returning({ id: schema.songs.id, number: schema.songs.number });

        const songIdByNumber = new Map<number, number>();
        for (const row of inserted) {
          songIdByNumber.set(row.number, row.id);
        }

        insertedSongs += inserted.length;

        // meta для песен
        const metaValues: Array<typeof schema.songMeta.$inferInsert> = [];
        for (const song of chunk) {
          const songId = songIdByNumber.get(song.number);
          if (!songId) continue;
          if (!Array.isArray(song.meta) || song.meta.length === 0) continue;
          for (let idx = 0; idx < song.meta.length; idx++) {
            metaValues.push({ songId, idx, value: song.meta[idx] });
          }
        }
        if (metaValues.length > 0) {
          await trx.insert(schema.songMeta).values(metaValues);
        }

        // lyrics для чанка
        const lyricsValues: Array<typeof schema.lyrics.$inferInsert> = [];
        for (const song of chunk) {
          const songId = songIdByNumber.get(song.number);
          if (!songId) continue;
          if (!Array.isArray(song.lyrics) || song.lyrics.length === 0) continue;
          for (let sortIndex = 0; sortIndex < song.lyrics.length; sortIndex++) {
            const lyric = song.lyrics[sortIndex];
            lyricsValues.push({
              songId,
              uniqId: lyric.uniqId,
              sectionTitle: lyric.sectionTitle,
              type: lyric.type,
              splitLinesCount: lyric.splitLinesCount ?? 0,
              sortIndex,
            });
          }
        }

        const insertedLyricsRows =
          lyricsValues.length > 0
            ? await trx
                .insert(schema.lyrics)
                .values(lyricsValues)
                .returning({
                  id: schema.lyrics.id,
                  songId: schema.lyrics.songId,
                  uniqId: schema.lyrics.uniqId,
                })
            : [];

        const lyricIdBySongUniqId = new Map<string, number>();
        for (const row of insertedLyricsRows) {
          lyricIdBySongUniqId.set(`${row.songId}:${row.uniqId}`, row.id);
        }

        // lines для чанка
        const lineValues: Array<typeof schema.lyricLines.$inferInsert> = [];
        for (const song of chunk) {
          const songId = songIdByNumber.get(song.number);
          if (!songId) continue;
          if (!Array.isArray(song.lyrics) || song.lyrics.length === 0) continue;
          for (const lyric of song.lyrics) {
            const lyricId = lyricIdBySongUniqId.get(`${songId}:${lyric.uniqId}`);
            if (!lyricId) continue;
            if (!Array.isArray(lyric.lines) || lyric.lines.length === 0) continue;
            for (const line of lyric.lines) {
              lineValues.push({
                lyricId,
                rangeIndex: line.rangeIndex ?? null,
                lineIndex: line.index,
                globalSongIndex: line.globalSongIndex ?? null,
                text: line.text,
                repeatCount: 1,
              });
            }
          }
        }
        if (lineValues.length > 0) {
          await trx.insert(schema.lyricLines).values(lineValues);
        }

        // метрики/прогресс
        insertedLyrics += insertedLyricsRows.length;
        insertedLines += lineValues.length;

        if (insertedSongs === 1 || insertedSongs % 25 === 0 || insertedSongs === songsTotal) {
          this.logger.log(
            `[importSongBook] progress ${insertedSongs}/${songsTotal} songs (lyrics≈${insertedLyrics}, lines≈${insertedLines})`,
          );
        }
      }

      await this.bumpSongBookAndCatalogVersion(trx, songBookId, 'import');

      return { songBookId, fileKey };
    });

    this.logger.log(
      `[importSongBook] done fileKey=${fileKey} songBookId=${result.songBookId} in ${Date.now() - startedAt}ms`,
    );

    return { ok: true, ...result };
  }

  private async persistLyricsFromExport(
    trx: PostgresJsDatabase<typeof schema>,
    songId: number,
    lyrics: SongBookExport['songs'][number]['lyrics'],
  ) {
    if (!Array.isArray(lyrics) || lyrics.length === 0) {
      return;
    }

    const insertedLyrics = await trx
      .insert(schema.lyrics)
      .values(
        lyrics.map((lyric, idx) => ({
          songId,
          uniqId: lyric.uniqId,
          sectionTitle: lyric.sectionTitle,
          type: lyric.type,
          splitLinesCount: lyric.splitLinesCount ?? 0,
          sortIndex: idx,
        })),
      )
      .returning({ id: schema.lyrics.id, uniqId: schema.lyrics.uniqId });

    const lyricIdByUniqId = new Map<string, number>();
    for (const row of insertedLyrics) {
      lyricIdByUniqId.set(row.uniqId, row.id);
    }

    const lineValues: Array<typeof schema.lyricLines.$inferInsert> = [];
    for (const lyric of lyrics) {
      const lyricId = lyricIdByUniqId.get(lyric.uniqId);
      if (!lyricId) continue;

      if (!Array.isArray(lyric.lines) || lyric.lines.length === 0) continue;
      for (const line of lyric.lines) {
        lineValues.push({
          lyricId,
          rangeIndex: line.rangeIndex ?? null,
          lineIndex: line.index,
          globalSongIndex: line.globalSongIndex ?? null,
          text: line.text,
          repeatCount: 1,
        });
      }
    }

    if (lineValues.length > 0) {
      await trx.insert(schema.lyricLines).values(lineValues);
    }
  }

  private resolveFileKey(data: SongBookExport): string | null {
    const fromHeader = data.header?.bookKey?.trim();
    if (fromHeader) return fromHeader;
    const fromSong = data.songs[0]?.bookName?.fileKey?.trim();
    if (fromSong) return fromSong;
    const fromMeta = data.meta?.['fileKey']?.trim();
    if (fromMeta) return fromMeta;
    return null;
  }

  private async generateUniqueSongBookFileKey(
    trx: PostgresJsDatabase<typeof schema>,
    title?: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = this.generateSongBookFileKey(title);
      const existing = await trx.query.songBooks.findFirst({
        where: eq(schema.songBooks.fileKey, candidate),
      });
      if (!existing) {
        return candidate;
      }
    }

    return `book-${randomUUID()}`;
  }

  private generateSongBookFileKey(title?: string): string {
    const base =
      title
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        ?.slice(0, 32) || 'book';
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    return `${base}-${suffix}`;
  }

  private async normalizeBookMeta(meta: Record<string, string>): Promise<Record<string, string>> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value !== 'string') continue;
      if (key === 'coverImage') {
        const sanitized = await this.normalizeCoverImage(value);
        if (sanitized) normalized[key] = sanitized;
      } else {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  private async normalizeCoverImageStrict(raw: string): Promise<string> {
    const sanitized = await this.normalizeCoverImage(raw);
    if (!sanitized) {
      throw new BadRequestException(
        'coverImage: неподдерживаемый формат или некорректные данные. Поддерживаются png/jpeg/webp/avif, размер после обработки ≤ 300KB.',
      );
    }
    return sanitized;
  }

  private async normalizeBookMetaStrict(meta: Record<string, string>): Promise<Record<string, string>> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value !== 'string') continue;
      if (key === 'coverImage') {
        normalized[key] = await this.normalizeCoverImageStrict(value);
      } else {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  private async normalizeCoverImage(raw: string): Promise<string | null> {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let mime = 'image/png';
    let base64 = trimmed;
    const dataUrlMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(trimmed);
    if (dataUrlMatch) {
      mime = dataUrlMatch[1];
      base64 = dataUrlMatch[2];
    }

    let source: Buffer;
    try {
      source = Buffer.from(base64, 'base64');
      if (source.length === 0) return null;
    } catch {
      return null;
    }

    try {
      const resized = await this.downscaleCoverImage(source, mime);
      if (!resized) return null;
      return `data:${resized.mime};base64,${resized.buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private async downscaleCoverImage(
    buffer: Buffer,
    mime: string,
  ): Promise<{ buffer: Buffer; mime: string } | null> {
    const format = this.pickSharpFormat(mime);
    if (!format) return null;

    const pipeline = sharp(buffer, { failOn: 'none' }).resize(COVER_MAX_DIMENSION, COVER_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    const { outputFormat, options } = this.resolveOutputFormat(format);
    const resized = await pipeline
      .toFormat(outputFormat, options)
      .toBuffer();
    if (resized.length === 0 || resized.length > MAX_COVER_IMAGE_BYTES) {
      return null;
    }

    const outputMime = this.getMimeByFormat(outputFormat);
    return { buffer: resized, mime: outputMime };
  }

  private pickSharpFormat(mime: string): SharpFormat | null {
    const normalized = mime.toLowerCase();
    if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpeg';
    if (normalized === 'image/png') return 'png';
    if (normalized === 'image/webp') return 'webp';
    if (normalized === 'image/avif') return 'avif';
    return null;
  }

  private resolveOutputFormat(format: SharpFormat): {
    outputFormat: SharpFormat;
    options?:
      | sharp.JpegOptions
      | sharp.PngOptions
      | sharp.WebpOptions
      | sharp.AvifOptions;
  } {
    switch (format) {
      case 'jpeg':
        return { outputFormat: 'jpeg', options: { quality: 85 } };
      case 'png':
        return { outputFormat: 'png', options: { compressionLevel: 7 } };
      case 'webp':
        return { outputFormat: 'webp', options: { quality: 80 } };
      case 'avif':
        return { outputFormat: 'avif', options: { quality: 70 } };
      default:
        return { outputFormat: 'png', options: { compressionLevel: 7 } };
    }
  }

  private getMimeByFormat(format: SharpFormat): string {
    switch (format) {
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'avif':
        return 'image/avif';
      default:
        return 'image/png';
    }
  }
}
