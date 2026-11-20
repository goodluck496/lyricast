import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.providers';
import * as schema from '../../lib/db/schema';
import {
  BibleRegistryResponseDto,
  BibleRegistryItemDto,
  BibleRegistryItemMetaDto,
  BibleVersionsCheckRequestDto,
  BibleVersionsCheckResponseDto,
  BibleVersionsCheckResponseItemDto,
  BibleDictionaryCardDto,
  BibleExportDto,
  ImportBibleDto,
  UpdateBibleMetaDto,
  UpdateBibleVerseDto,
} from './dto';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class BiblesService {
  private readonly logger = new Logger(BiblesService.name);

  constructor(@Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>) {}

  /**
   * Реестр переводов Библии с агрегированной метой и количеством книг/стихов.
   * Аналог SongsService.registryList()
   */
  async registryList(): Promise<BibleRegistryResponseDto> {
    const bibles = await this.db
      .select({
        id: schema.bibles.id,
        fileKey: schema.bibles.fileKey,
        humanName: schema.bibles.humanName,
        catalogId: schema.bibles.catalogId,
        sourceTitle: schema.bibles.sourceTitle,
        lang: schema.bibles.lang,
        version: schema.bibles.version,
        isDefault: schema.bibles.isDefault,
        isClassicBookOrder: schema.bibles.isClassicBookOrder,
        bibleVersion: schema.bibles.bibleVersion,
        updatedBy: schema.bibles.updatedBy,
        updatedAt: schema.bibles.updatedAt,
      })
      .from(schema.bibles)
      .orderBy(schema.bibles.id);

    if (bibles.length === 0) return { items: [], totalCount: 0 };

    const bibleIds = bibles.map((b) => b.id);
    const fileKeys = bibles.map((b) => b.fileKey);

    // Метаданные из bible_meta
    const metaRows = await this.db
      .select({
        fileKey: schema.bibleMeta.fileKey,
        key: schema.bibleMeta.metaKey,
        value: schema.bibleMeta.metaValue,
      })
      .from(schema.bibleMeta)
      .where(inArray(schema.bibleMeta.fileKey, fileKeys));

    // Количество книг по каждому переводу
    const bookCounts = await this.db
      .select({ bibleId: schema.bibleBooks.bibleId, count: sql<number>`count(*)` })
      .from(schema.bibleBooks)
      .where(inArray(schema.bibleBooks.bibleId, bibleIds))
      .groupBy(schema.bibleBooks.bibleId);
    const bookCountMap = new Map<number, number>();
    for (const c of bookCounts) bookCountMap.set(c.bibleId, Number(c.count ?? 0));

    // Количество стихов по каждому переводу (через книги -> главы -> стихи)
    // Быстрее: считаем через join
    const verseCounts = await this.db
      .select({
        bibleId: schema.bibles.id,
        count: sql<number>`count(*)`,
      })
      .from(schema.bibleVerses)
      .innerJoin(schema.bibleChapters, eq(schema.bibleVerses.bibleChapterId, schema.bibleChapters.id))
      .innerJoin(schema.bibleBooks, eq(schema.bibleChapters.bibleBookId, schema.bibleBooks.id))
      .innerJoin(schema.bibles, eq(schema.bibleBooks.bibleId, schema.bibles.id))
      .where(inArray(schema.bibles.id, bibleIds))
      .groupBy(schema.bibles.id);
    const verseCountMap = new Map<number, number>();
    for (const c of verseCounts) verseCountMap.set(c.bibleId, Number(c.count ?? 0));

    const metaMap = new Map<string, Record<string, string>>();
    for (const m of metaRows) {
      if (!metaMap.has(m.fileKey)) metaMap.set(m.fileKey, {});
      metaMap.get(m.fileKey)![m.key] = m.value;
    }

    const items: BibleRegistryItemDto[] = bibles.map((b) => {
      return {
        id: b.id,
        fileKey: b.fileKey,
        humanName: b.humanName,
        catalogId: b.catalogId,
        meta: {
          fileKey: b.fileKey,
          language: b.lang,
          title: b.humanName,
          sourceTitle: b.sourceTitle,
          version: b.bibleVersion,
          updatedBy: b.updatedBy ?? null,
          updatedAt: b.updatedAt?.toISOString?.() ?? null,
          bookCount: bookCountMap.get(b.id) ?? 0,
          verseCount: verseCountMap.get(b.id) ?? 0,
          isDefault: b.isDefault,
          isClassicBookOrder: b.isClassicBookOrder,
        } satisfies BibleRegistryItemMetaDto,
      };
    });

    return { items, totalCount: items.length };
  }

  /**
   * Проверка версий переводов (book.versions.check аналог).
   * Возвращает список переводов, у которых серверная версия новее клиентской.
   */
  async checkVersions(body: BibleVersionsCheckRequestDto): Promise<BibleVersionsCheckResponseDto> {
    const bibles = await this.db.select().from(schema.bibles);
    if (bibles.length === 0) return { updates: [], totalCount: 0 };

    const requested = body.bibles ?? [];
    const requestedMap = new Map<string, number>();
    for (const b of requested) requestedMap.set(b.fileKey, b.version);

    const metaRows = await this.db
      .select({
        fileKey: schema.bibleMeta.fileKey,
        key: schema.bibleMeta.metaKey,
        value: schema.bibleMeta.metaValue,
      })
      .from(schema.bibleMeta)
      .where(inArray(schema.bibleMeta.fileKey, bibles.map((b) => b.fileKey)));

    const metaMap = new Map<string, Record<string, string>>();
    for (const m of metaRows) {
      if (!metaMap.has(m.fileKey)) metaMap.set(m.fileKey, {});
      metaMap.get(m.fileKey)![m.key] = m.value;
    }

    const updates: BibleVersionsCheckResponseItemDto[] = [];
    for (const b of bibles) {
      const serverVersion = Number(metaMap.get(b.fileKey)?.version ?? b.bibleVersion ?? 0);
      const clientVersion = requestedMap.get(b.fileKey) ?? -1;
      if (requested.length === 0 || serverVersion > clientVersion) {
        updates.push({
          fileKey: b.fileKey,
          version: serverVersion,
          downloadUrl: `/bibles/${b.id}/export`,
        });
      }
    }

    return { updates, totalCount: updates.length };
  }

  /**
   * Получение облегченной структуры перевода (книги и список глав) без стихов.
   * Позволяет мгновенно открыть вьюер (30-50 мс вместо выгрузки 30 000 стихов).
   */
  async getBibleStructure(bibleId: number) {
    const bible = await this.db.query.bibles.findFirst({
      where: eq(schema.bibles.id, bibleId),
    });
    if (!bible) throw new NotFoundException('Bible not found');

    const books = await this.db
      .select({
        id: schema.bibleBooks.id,
        number: schema.bibleBooks.number,
        shortTitle: schema.bibleBooks.shortTitle,
        fullTitle: schema.bibleBooks.fullTitle,
        type: schema.bibleBooks.type,
        chapterCount: schema.bibleBooks.chapterCount,
        verseCount: schema.bibleBooks.verseCount,
      })
      .from(schema.bibleBooks)
      .where(eq(schema.bibleBooks.bibleId, bibleId))
      .orderBy(schema.bibleBooks.number);

    if (books.length === 0) {
      return {
        id: bible.id,
        fileKey: bible.fileKey,
        humanName: bible.humanName,
        title: bible.humanName,
        sourceTitle: bible.sourceTitle,
        lang: bible.lang,
        version: bible.version,
        bibleVersion: bible.bibleVersion,
        isDefault: bible.isDefault,
        isClassicBookOrder: bible.isClassicBookOrder,
        books: [],
      };
    }

    const chapters = await this.db
      .select({
        id: schema.bibleChapters.id,
        bibleBookId: schema.bibleChapters.bibleBookId,
        number: schema.bibleChapters.number,
        title: schema.bibleChapters.title,
        verseCount: schema.bibleChapters.verseCount,
      })
      .from(schema.bibleChapters)
      .where(inArray(schema.bibleChapters.bibleBookId, books.map((b) => b.id)))
      .orderBy(schema.bibleChapters.number);

    const chaptersByBookId = new Map<number, typeof chapters>();
    for (const ch of chapters) {
      if (!chaptersByBookId.has(ch.bibleBookId)) chaptersByBookId.set(ch.bibleBookId, []);
      chaptersByBookId.get(ch.bibleBookId)!.push(ch);
    }

    return {
      id: bible.id,
      fileKey: bible.fileKey,
      humanName: bible.humanName,
      title: bible.humanName,
      sourceTitle: bible.sourceTitle,
      lang: bible.lang,
      version: bible.version,
      bibleVersion: bible.bibleVersion,
      isDefault: bible.isDefault,
      isClassicBookOrder: bible.isClassicBookOrder,
      books: books.map((b) => ({
        id: b.id,
        number: b.number,
        title: { short: b.shortTitle, full: b.fullTitle },
        type: b.type as any,
        chapterCount: b.chapterCount,
        verseCount: b.verseCount,
        chapters: (chaptersByBookId.get(b.id) ?? []).map((ch) => ({
          id: ch.id,
          number: ch.number,
          title: ch.title,
          verseCount: ch.verseCount,
          bookId: b.number,
        })),
      })),
    };
  }

  /**
   * Получение стихов конкретной главы (быстрая ленивая подгрузка).
   */
  async getChapterVerses(chapterId: number) {
    const verses = await this.db
      .select({
        id: schema.bibleVerses.id,
        number: schema.bibleVerses.number,
        text: schema.bibleVerses.text,
      })
      .from(schema.bibleVerses)
      .where(eq(schema.bibleVerses.bibleChapterId, chapterId))
      .orderBy(schema.bibleVerses.number);

    return verses;
  }

  /**
   * Экспорт полного перевода в формате BibleTranslate (JSON).
   * Оптимизировано: загрузка в 3 пакетных SQL-запроса вместо 1250 последовательных.
   */
  async exportBible(bibleId: number): Promise<BibleExportDto> {
    const bible = await this.db.query.bibles.findFirst({
      where: eq(schema.bibles.id, bibleId),
    });
    if (!bible) throw new NotFoundException('Bible not found');

    const books = await this.db
      .select()
      .from(schema.bibleBooks)
      .where(eq(schema.bibleBooks.bibleId, bibleId))
      .orderBy(schema.bibleBooks.number);

    if (books.length === 0) {
      return {
        keyForSearch: bible.fileKey,
        title: bible.humanName,
        sourceTitle: bible.sourceTitle,
        lang: bible.lang,
        version: bible.version,
        books: [],
        isDefault: bible.isDefault,
        isClassicBookOrder: bible.isClassicBookOrder,
      };
    }

    const chapters = await this.db
      .select()
      .from(schema.bibleChapters)
      .where(inArray(schema.bibleChapters.bibleBookId, books.map((b) => b.id)))
      .orderBy(schema.bibleChapters.number);

    const verses =
      chapters.length > 0
        ? await this.db
            .select()
            .from(schema.bibleVerses)
            .where(inArray(schema.bibleVerses.bibleChapterId, chapters.map((c) => c.id)))
            .orderBy(schema.bibleVerses.number)
        : [];

    const versesByChapterId = new Map<number, typeof verses>();
    for (const v of verses) {
      if (!versesByChapterId.has(v.bibleChapterId)) versesByChapterId.set(v.bibleChapterId, []);
      versesByChapterId.get(v.bibleChapterId)!.push(v);
    }

    const chaptersByBookId = new Map<number, typeof chapters>();
    for (const c of chapters) {
      if (!chaptersByBookId.has(c.bibleBookId)) chaptersByBookId.set(c.bibleBookId, []);
      chaptersByBookId.get(c.bibleBookId)!.push(c);
    }

    const resultBooks = books.map((book) => {
      const bookChapters = chaptersByBookId.get(book.id) ?? [];
      const resultChapters = bookChapters.map((chapter) => {
        const chapterVerses = versesByChapterId.get(chapter.id) ?? [];
        const content = chapterVerses.map((v) => ({
          id: v.id,
          contentType: 'line' as const,
          number: v.number,
          text: v.text,
          bookId: book.number,
          chapterId: chapter.number,
          path: [book.number, chapter.number, v.number].map(String),
          next: null as any,
          prev: null as any,
        }));

        for (let i = 0; i < content.length; i++) {
          content[i].prev =
            i > 0
              ? {
                  number: content[i - 1].number,
                  chapterId: chapter.number,
                  bookId: book.number,
                  path: [book.number, chapter.number, content[i - 1].number].map(String),
                  contentType: 'line' as const,
                  chapterChanged: false,
                  bookChanged: false,
                }
              : null;
          content[i].next =
            i < content.length - 1
              ? {
                  number: content[i + 1].number,
                  chapterId: chapter.number,
                  bookId: book.number,
                  path: [book.number, chapter.number, content[i + 1].number].map(String),
                  contentType: 'line' as const,
                  chapterChanged: false,
                  bookChanged: false,
                }
              : null;
        }

        if (content.length > 0) {
          content[0].prev = {
            number: content[content.length - 1].number,
            chapterId: chapter.number,
            bookId: book.number,
            path: [book.number, chapter.number, content[content.length - 1].number].map(String),
            contentType: 'line' as const,
            chapterChanged: false,
            bookChanged: false,
          };
          content[content.length - 1].next = {
            number: content[0].number,
            chapterId: chapter.number,
            bookId: book.number,
            path: [book.number, chapter.number, content[0].number].map(String),
            contentType: 'line' as const,
            chapterChanged: false,
            bookChanged: false,
          };
        }

        return {
          number: chapter.number,
          title: chapter.title,
          bookId: book.number,
          subsections: [
            {
              heading: null,
              bookId: book.number,
              chapterId: chapter.number,
              content,
            },
          ],
        };
      });

      return {
        number: book.number,
        title: { short: book.shortTitle, full: book.fullTitle },
        chapters: resultChapters,
        type: book.type as any,
      };
    });

    return {
      keyForSearch: bible.fileKey,
      title: bible.humanName,
      sourceTitle: bible.sourceTitle,
      lang: bible.lang,
      version: bible.version,
      books: resultBooks,
      isDefault: bible.isDefault,
      isClassicBookOrder: bible.isClassicBookOrder,
    };
  }

  /**
   * Импорт перевода Библии из BibleTranslate объекта.
   * Создаёт/обновляет запись в bibles, bible_books, bible_chapters, bible_verses.
   * Инкрементит версии bible, catalog, dataset_meta.
   */
  async importBible(dto: ImportBibleDto) {
    const { catalogId, data } = dto;
    if (!data.books || data.books.length === 0) {
      throw new BadRequestException('Bible books list is empty');
    }

    const fileKey = data.keyForSearch;
    if (!fileKey) {
      throw new BadRequestException('keyForSearch is required in import payload');
    }

    const startTime = Date.now();
    this.logger.log(`[importBible] start fileKey=${fileKey} catalogId=${catalogId} books=${data.books.length}`);

    const result = await this.db.transaction(async (trx) => {
      await this.ensureDatasetMeta(trx);

      const catalog = await trx.query.catalogs.findFirst({
        where: eq(schema.catalogs.id, catalogId),
      });
      if (!catalog) {
        throw new NotFoundException('Catalog not found');
      }

      const existing = await trx.query.bibles.findFirst({
        where: eq(schema.bibles.fileKey, fileKey),
      });

      this.logger.log(`[importBible] bible ${existing ? 'update' : 'create'} fileKey=${fileKey}`);

      const now = new Date();
      const bibleBase = {
        catalogId,
        fileKey,
        humanName: data.title,
        sourceTitle: data.sourceTitle,
        lang: data.lang,
        version: data.version ?? '',
        isDefault: data.isDefault ?? false,
        isClassicBookOrder: data.isClassicBookOrder ?? false,
        updatedBy: 'import',
      };

      let bibleId: number;
      if (existing) {
        const [updated] = await trx
          .update(schema.bibles)
          .set({ ...bibleBase, updatedAt: now, bibleVersion: sql`${schema.bibles.bibleVersion} + 1` })
          .where(eq(schema.bibles.id, existing.id))
          .returning({ id: schema.bibles.id });
        bibleId = updated.id;
      } else {
        const [created] = await trx
          .insert(schema.bibles)
          .values({ ...bibleBase, bibleVersion: 1, updatedBy: 'import' })
          .returning({ id: schema.bibles.id });
        bibleId = created.id;
      }

      // Удаляем старые книги/главы/стихи для этого перевода (ON DELETE CASCADE в БД удалит главы и стихи)
      await trx.delete(schema.bibleBooks).where(eq(schema.bibleBooks.bibleId, bibleId));

      // 1. Batch-вставка всех книг за 1 запрос
      const booksToInsert = data.books.map((b) => ({
        bibleId,
        number: b.number,
        shortTitle: b.title.short,
        fullTitle: b.title.full,
        type: b.type,
        chapterCount: b.chapters.length,
        verseCount: b.chapters.reduce(
          (sum, ch) => sum + (ch.subsections?.[0]?.content?.length ?? 0),
          0
        ),
      }));

      const insertedBooks = await trx
        .insert(schema.bibleBooks)
        .values(booksToInsert)
        .returning({ id: schema.bibleBooks.id, number: schema.bibleBooks.number });

      const bookIdByNumber = new Map<number, number>();
      for (const b of insertedBooks) {
        bookIdByNumber.set(b.number, b.id);
      }

      // 2. Batch-вставка всех глав за 1 запрос
      const chaptersToInsert: Array<{
        bibleBookId: number;
        number: number;
        title: string;
        verseCount: number;
      }> = [];

      for (const b of data.books) {
        const bookId = bookIdByNumber.get(b.number)!;
        for (const ch of b.chapters) {
          const vCount = ch.subsections?.[0]?.content?.length ?? 0;
          chaptersToInsert.push({
            bibleBookId: bookId,
            number: ch.number,
            title: ch.title,
            verseCount: vCount,
          });
        }
      }

      const insertedChapters = await trx
        .insert(schema.bibleChapters)
        .values(chaptersToInsert)
        .returning({
          id: schema.bibleChapters.id,
          bibleBookId: schema.bibleChapters.bibleBookId,
          number: schema.bibleChapters.number,
        });

      const chapterIdMap = new Map<string, number>();
      for (const ch of insertedChapters) {
        chapterIdMap.set(`${ch.bibleBookId}:${ch.number}`, ch.id);
      }

      // 3. Batch-вставка всех стихов пачками по 2000 штук
      const versesToInsert: Array<{
        bibleChapterId: number;
        number: number;
        text: string;
      }> = [];

      for (const b of data.books) {
        const bookId = bookIdByNumber.get(b.number)!;
        for (const ch of b.chapters) {
          const chapterId = chapterIdMap.get(`${bookId}:${ch.number}`)!;
          const verses = ch.subsections?.[0]?.content ?? [];
          for (const v of verses) {
            versesToInsert.push({
              bibleChapterId: chapterId,
              number: v.number,
              text: v.text,
            });
          }
        }
      }

      const BATCH_SIZE = 2000;
      for (let i = 0; i < versesToInsert.length; i += BATCH_SIZE) {
        const chunk = versesToInsert.slice(i, i + BATCH_SIZE);
        await trx.insert(schema.bibleVerses).values(chunk);
      }

      // Bump versions: catalog + dataset_meta
      await trx
        .update(schema.catalogs)
        .set({ version: sql`${schema.catalogs.version} + 1`, updatedAt: now })
        .where(eq(schema.catalogs.id, catalogId));

      await this.bumpDatasetVersion(trx);

      const elapsedMs = Date.now() - startTime;
      this.logger.log(
        `[importBible] done fileKey=${fileKey} bibleId=${bibleId} books=${insertedBooks.length} chapters=${insertedChapters.length} verses=${versesToInsert.length} in ${elapsedMs}ms`
      );

      return { ok: true, bibleId, fileKey };
    });

    return result;
  }

  /**
   * Обновление метаданных перевода (PATCH /bibles/:id/meta).
   * Инкрементит bibleVersion.
   */
  async updateBibleMeta(bibleId: number, dto: UpdateBibleMetaDto, updatedBy?: string) {
    return this.db.transaction(async (trx) => {
      await this.ensureDatasetMeta(trx);

      const existing = await trx.query.bibles.findFirst({
        where: eq(schema.bibles.id, bibleId),
      });
      if (!existing) throw new NotFoundException('Bible not found');

      const updates: Partial<typeof schema.bibles.$inferInsert> = {};
      const newTitle = dto.title ?? dto.humanName;
      if (newTitle !== undefined) updates.humanName = newTitle;
      if (dto.sourceTitle !== undefined) updates.sourceTitle = dto.sourceTitle;
      if (dto.language !== undefined) updates.lang = dto.language;
      if (dto.version !== undefined) updates.version = dto.version;
      if (dto.isDefault !== undefined) updates.isDefault = dto.isDefault;
      if (dto.isClassicBookOrder !== undefined) updates.isClassicBookOrder = dto.isClassicBookOrder;
      if (updatedBy) updates.updatedBy = updatedBy;

      if (Object.keys(updates).length > 0) {
        await trx
          .update(schema.bibles)
          .set({
            ...updates,
            updatedAt: new Date(),
            bibleVersion: sql`${schema.bibles.bibleVersion} + 1`,
          })
          .where(eq(schema.bibles.id, bibleId));
      }

      // Обновляем bible_meta (версия, updated_at, updated_by)
      const now = new Date();
      const metaEntries = [
        { metaKey: 'version', metaValue: String(Number(existing.bibleVersion ?? 0) + 1) },
        { metaKey: 'updated_at', metaValue: now.toISOString() },
        { metaKey: 'updated_by', metaValue: updatedBy ?? 'system' },
      ];

      for (const entry of metaEntries) {
        await trx
          .insert(schema.bibleMeta)
          .values({
            fileKey: existing.fileKey,
            metaKey: entry.metaKey,
            metaValue: entry.metaValue,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [schema.bibleMeta.fileKey, schema.bibleMeta.metaKey],
            set: { metaValue: entry.metaValue, updatedAt: now },
          });
      }

      await this.bumpDatasetVersion(trx);

      return this.findOne(bibleId);
    });
  }

  /**
   * Обновление текста стиха (PUT /bibles/:id/verses/:verseId).
   * Инкрементит bibleVersion.
   */
  async updateVerse(bibleId: number, verseId: number, dto: UpdateBibleVerseDto, updatedBy?: string) {
    return this.db.transaction(async (trx) => {
      await this.ensureDatasetMeta(trx);

      const bible = await trx.query.bibles.findFirst({
        where: eq(schema.bibles.id, bibleId),
      });
      if (!bible) throw new NotFoundException('Bible not found');

      const verse = await trx.query.bibleVerses.findFirst({
        where: eq(schema.bibleVerses.id, verseId),
      });
      if (!verse) {
        throw new NotFoundException('Verse not found');
      }

      // Проверяем, что стих принадлежит этому переводу через chapter -> book -> bible
      const chapter = await trx.query.bibleChapters.findFirst({
        where: eq(schema.bibleChapters.id, verse.bibleChapterId),
      });
      if (!chapter) {
        throw new NotFoundException('Verse chapter not found');
      }

      const book = await trx.query.bibleBooks.findFirst({
        where: eq(schema.bibleBooks.id, chapter.bibleBookId),
      });
      if (!book || book.bibleId !== bibleId) {
        throw new NotFoundException('Verse not found in this bible');
      }

      await trx
        .update(schema.bibleVerses)
        .set({ text: dto.text })
        .where(eq(schema.bibleVerses.id, verseId));

      // Bump versions
      await trx
        .update(schema.bibles)
        .set({ bibleVersion: sql`${schema.bibles.bibleVersion} + 1`, updatedAt: new Date(), updatedBy: updatedBy ?? 'verse-edit' })
        .where(eq(schema.bibles.id, bibleId));

      // Обновляем meta
      const now = new Date();
      const metaEntries = [
        { metaKey: 'version', metaValue: String(Number(bible.bibleVersion ?? 0) + 1) },
        { metaKey: 'updated_at', metaValue: now.toISOString() },
        { metaKey: 'updated_by', metaValue: updatedBy ?? 'verse-edit' },
      ];

      for (const entry of metaEntries) {
        await trx
          .insert(schema.bibleMeta)
          .values({
            fileKey: bible.fileKey,
            metaKey: entry.metaKey,
            metaValue: entry.metaValue,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [schema.bibleMeta.fileKey, schema.bibleMeta.metaKey],
            set: { metaValue: entry.metaValue, updatedAt: now },
          });
      }

      await this.bumpDatasetVersion(trx);

      return { ok: true, verseId };
    });
  }

  /**
   * Получить один перевод по ID (для возврата после обновления).
   */
  async findOne(bibleId: number) {
    const bible = await this.db.query.bibles.findFirst({
      where: eq(schema.bibles.id, bibleId),
    });
    if (!bible) throw new NotFoundException('Bible not found');

    const metaRows = await this.db
      .select({ key: schema.bibleMeta.metaKey, value: schema.bibleMeta.metaValue })
      .from(schema.bibleMeta)
      .where(eq(schema.bibleMeta.fileKey, bible.fileKey));
    const meta: Record<string, string> = {};
    for (const row of metaRows) meta[row.key] = row.value;

    return { ...bible, title: bible.humanName, meta };
  }

  /**
   * Для воркера: список установленных переводов с метаданными (статус).
   * Возвращает BibleDictionaryCardDto[].
   */
  async getDictionariesStatus(): Promise<BibleDictionaryCardDto[]> {
    const bibles = await this.db
      .select()
      .from(schema.bibles)
      .orderBy(schema.bibles.id);

    if (bibles.length === 0) return [];

    const bibleIds = bibles.map((b) => b.id);
    const fileKeys = bibles.map((b) => b.fileKey);

    const metaRows = await this.db
      .select({
        fileKey: schema.bibleMeta.fileKey,
        key: schema.bibleMeta.metaKey,
        value: schema.bibleMeta.metaValue,
      })
      .from(schema.bibleMeta)
      .where(inArray(schema.bibleMeta.fileKey, fileKeys));

    const bookCounts = await this.db
      .select({ bibleId: schema.bibleBooks.bibleId, count: sql<number>`count(*)` })
      .from(schema.bibleBooks)
      .where(inArray(schema.bibleBooks.bibleId, bibleIds))
      .groupBy(schema.bibleBooks.bibleId);
    const bookCountMap = new Map<number, number>();
    for (const c of bookCounts) bookCountMap.set(c.bibleId, Number(c.count ?? 0));

    const verseCounts = await this.db
      .select({
        bibleId: schema.bibles.id,
        count: sql<number>`count(*)`,
      })
      .from(schema.bibleVerses)
      .innerJoin(schema.bibleChapters, eq(schema.bibleVerses.bibleChapterId, schema.bibleChapters.id))
      .innerJoin(schema.bibleBooks, eq(schema.bibleChapters.bibleBookId, schema.bibleBooks.id))
      .innerJoin(schema.bibles, eq(schema.bibleBooks.bibleId, schema.bibles.id))
      .where(inArray(schema.bibles.id, bibleIds))
      .groupBy(schema.bibles.id);
    const verseCountMap = new Map<number, number>();
    for (const c of verseCounts) verseCountMap.set(c.bibleId, Number(c.count ?? 0));

    const metaMap = new Map<string, Record<string, string>>();
    for (const m of metaRows) {
      if (!metaMap.has(m.fileKey)) metaMap.set(m.fileKey, {});
      metaMap.get(m.fileKey)![m.key] = m.value;
    }

    // Размер файла — приблизительно по количеству стихов * средняя длина
    // В реальности можно хранить sizeBytes в meta при экспорте
    return bibles.map((b) => {
      const meta = metaMap.get(b.fileKey) ?? {};
      const remoteVersion = Number(meta.version ?? b.bibleVersion ?? 0);
      return {
        fileKey: b.fileKey,
        title: b.humanName,
        language: b.lang,
        localVersion: b.bibleVersion,
        remoteVersion,
        isInstalled: true, // в БД = установлен
        needsUpdate: remoteVersion > b.bibleVersion,
        sizeBytes: verseCountMap.get(b.id) ?? 0 * 200, // грубая оценка
        bookCount: bookCountMap.get(b.id) ?? 0,
        verseCount: verseCountMap.get(b.id) ?? 0,
        sourceTitle: b.sourceTitle,
        isDefault: b.isDefault,
      };
    });
  }

  private async ensureDatasetMeta(db: PostgresJsDatabase<typeof schema>) {
    const [meta] = await db.select().from(schema.datasetMeta).limit(1);
    if (!meta) {
      await db
        .insert(schema.datasetMeta)
        .values({ id: 1, schemaVersion: 1, version: randomUUID(), updatedAt: new Date() })
        .onConflictDoNothing();
    }
  }

  private async bumpDatasetVersion(db: PostgresJsDatabase<typeof schema>) {
    await this.ensureDatasetMeta(db);
    const version = randomUUID();
    await db
      .update(schema.datasetMeta)
      .set({ version, updatedAt: new Date() })
      .where(eq(schema.datasetMeta.id, 1));
    return version;
  }
}