import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import path from 'path';
import fs from 'fs';
import axios, { AxiosError } from 'axios';
import { lastValueFrom } from 'rxjs';

import {
  Configuration,
  DefaultService,
} from '@lyri-cast/openapi-backend-songs-domain';
import type {
  AllBooksResponse,
  ApiPhpActionBookVersionsCheckPost200Response,
  ApiPhpActionRegistryListGet200Response,
  BookVersionItem,
  BookVersionsCheckResponse,
  RegistryItem,
} from '@lyri-cast/openapi-backend-songs-domain';
import {
  IShortSong,
  ISong,
  ISongBook,
  ISongBookName,
  ISongForSearch,
  Lyric,
  LyricLine,
  LyricTypeEnum,
} from '@lyri-cast/entities';

export type SongDictionaryCardDto = {
  fileKey: string;
  title: string;
  language?: string;
  coverImage?: string;
  sizeBytes?: number;
  songCount?: number;
  localVersion?: number;
  remoteVersion?: number;
  updatedAt?: string;
  updatedBy?: string;
  isInstalled: boolean;
  needsUpdate: boolean;
};

@Injectable()
export class SongsService {
  fileNameSuffix = '.songs.json';
  // assetsPath = path.resolve(__dirname, 'assets', 'complete-jsons', 'songs');////
  assetsPath: string;
  externalAssetsPath: string;
  bookCache: Record<string, ISongBook> = {};
  songCache: Record<string, ISong> = {};

  isReady = false;
  constructor(private readonly http: HttpService) {
    this.assetsPath = path.resolve(
      process.env?.['assetsPath'] ?? '',
      'complete-jsons',
      'songs'
    );

    const userAssetsRoot = process.env?.['USER_ASSETS_PATH'] ?? '';
    this.externalAssetsPath = userAssetsRoot
      ? path.resolve(userAssetsRoot, 'complete-jsons', 'songs')
      : '';
  }

  private getExistingDirs(): string[] {
    const dirs = [this.assetsPath, this.externalAssetsPath]
      .filter(Boolean)
      .filter((dir, idx, arr) => arr.indexOf(dir) === idx)
      .filter((dir) => fs.existsSync(dir));
    return dirs;
  }

  private findBookFilePath(name: string): string | null {
    const candidate = `${name}${this.fileNameSuffix}`;
    for (const dir of this.getExistingDirs()) {
      const filePath = path.resolve(dir, candidate);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    return null;
  }

  private clearCache() {
    this.bookCache = {};
    this.songCache = {};
  }

  private getExternalDictionaryPath(fileKey: string): string {
    return path.resolve(this.externalAssetsPath, `${fileKey}${this.fileNameSuffix}`);
  }

  deleteDictionary(fileKey: string): { ok: true; deleted: boolean } {
    if (!fileKey) {
      throw new Error('fileKey is required');
    }

    if (!this.externalAssetsPath) {
      // nothing to delete, but keep API stable
      return { ok: true, deleted: false };
    }

    const target = this.getExternalDictionaryPath(fileKey);
    if (!fs.existsSync(target)) {
      return { ok: true, deleted: false };
    }

    fs.unlinkSync(target);
    this.clearCache();
    return { ok: true, deleted: true };
  }

  clearDictionaries(): { ok: true; deletedCount: number } {
    if (!this.externalAssetsPath) {
      return { ok: true, deletedCount: 0 };
    }

    if (!fs.existsSync(this.externalAssetsPath)) {
      return { ok: true, deletedCount: 0 };
    }

    const files = fs
      .readdirSync(this.externalAssetsPath)
      .filter((f) => f.endsWith(this.fileNameSuffix));

    let deletedCount = 0;
    for (const f of files) {
      try {
        fs.unlinkSync(path.resolve(this.externalAssetsPath, f));
        deletedCount++;
      } catch {
        // ignore and continue
      }
    }

    this.clearCache();
    return { ok: true, deletedCount };
  }

  private normalizeRawToken(authHeader?: string): string | undefined {
    const rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : authHeader?.trim();
    return rawToken || undefined;
  }

  private normalizeDownloadUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
      throw new Error('downloadUrl is empty');
    }

    // Some backends can return relative URLs like "/api.php?...".
    // Axios in Node requires an absolute URL.
    try {
      return new URL(trimmed, 'https://kantelers.ru/lyricast/api/').toString();
    } catch {
      // Fallback for minor formatting issues
      return new URL(trimmed.replace(/\s+/g, ''), 'https://kantelers.ru/lyricast/api/').toString();
    }
  }

  private createRemoteApi(authHeader?: string): DefaultService {
    const rawToken = this.normalizeRawToken(authHeader);

    const cfg = new Configuration({
      basePath: 'https://kantelers.ru/lyricast/api',
      accessToken: rawToken ?? '',
      httpClient: this.http,
    });

    const api = new DefaultService(this.http, cfg);

    if (rawToken) {
      api.defaultHeaders = {
        ...(api.defaultHeaders ?? {}),
        'X-Auth-Token': rawToken,
      };
    }

    return api;
  }

  private async fetchRegistryList(
    authHeader?: string
  ): Promise<ApiPhpActionRegistryListGet200Response> {
    const api = this.createRemoteApi(authHeader);
    const res = await lastValueFrom(api.apiPhpactionregistryListGet());
    return (res as any)?.data ?? res;
  }

  private async fetchAllServerBooks(
    authHeader?: string
  ): Promise<AllBooksResponse> {
    const api = this.createRemoteApi(authHeader);
    const res = await lastValueFrom(
      api.apiPhpactionbookVersionsCheckPost({
        BookVersionsCheckRequest: { books: [] },
      })
    );

    const data = ((res as any)?.data ?? res) as ApiPhpActionBookVersionsCheckPost200Response;

    if (data && typeof data === 'object' && 'books' in data) {
      return data as AllBooksResponse;
    }
    throw new Error('Unexpected response for book.versions.check (expected books)');
  }

  private async fetchUpdatesForBooks(
    books: BookVersionItem[],
    authHeader?: string
  ): Promise<BookVersionsCheckResponse> {
    const api = this.createRemoteApi(authHeader);
    const res = await lastValueFrom(
      api.apiPhpactionbookVersionsCheckPost({
        BookVersionsCheckRequest: { books },
      })
    );

    const data = ((res as any)?.data ?? res) as ApiPhpActionBookVersionsCheckPost200Response;

    if (data && typeof data === 'object' && 'updates' in data) {
      if (process.env.NODE_ENV !== 'production') {
        const updatesArr = Array.isArray((data as any).updates) ? (data as any).updates : [];
        const withUrl = updatesArr.filter((u: any) => typeof u?.downloadUrl === 'string' && u.downloadUrl.trim()).length;
        console.log('[songs] book.versions.check returned updates', {
          count: updatesArr.length,
          withDownloadUrl: withUrl,
        });
      }
      return data as BookVersionsCheckResponse;
    }
    // если апдейтов нет, сервер иногда может вернуть AllBooksResponse. Конвертим в пустые updates.
    if (data && typeof data === 'object' && 'books' in data) {
      const allBooks = data as unknown as AllBooksResponse;
      const mappedUpdates = (Array.isArray(allBooks.books) ? allBooks.books : [])
        .map((b: any) => {
          const rawUrl: unknown = b?.downloadUrl;
          const downloadUrl =
            typeof rawUrl === 'string' && rawUrl.trim() ? String(rawUrl) : undefined;
          return {
            fileKey: String(b?.fileKey ?? ''),
            version: Number(b?.version) || 0,
            ...(downloadUrl ? { downloadUrl } : {}),
          };
        })
        .filter((u: any) => typeof u.fileKey === 'string' && u.fileKey);

      if (process.env.NODE_ENV !== 'production') {
        const withUrl = mappedUpdates.filter(
          (u: any) => typeof u?.downloadUrl === 'string' && u.downloadUrl.trim()
        ).length;
        console.log('[songs] book.versions.check returned books (mapped to updates)', {
          booksCount: Array.isArray((allBooks as any).books) ? (allBooks as any).books.length : 0,
          mappedUpdatesCount: mappedUpdates.length,
          withDownloadUrl: withUrl,
        });
      }

      return {
        ok: (allBooks as any).ok ?? true,
        db: (allBooks as any).db ?? '',
        updates: mappedUpdates as any,
        totalCount:
          typeof (allBooks as any).totalCount === 'number'
            ? (allBooks as any).totalCount
            : mappedUpdates.length,
      };
    }
    throw new Error('Unexpected response for book.versions.check (expected updates)');
  }

  private buildRemoteMetaByKey(items: RegistryItem[]) {
    const remoteMetaByKey = new Map<
      string,
      {
        title?: string;
        language?: string;
        coverImage?: string;
        updatedBy?: string;
        updatedAt?: string;
        sizeBytes?: number;
        songCount?: number;
      }
    >();

    for (const item of items) {
      const key = item?.meta?.fileKey ?? null;
      if (!key) continue;
      remoteMetaByKey.set(key, {
        title: typeof item.meta?.title === 'string' ? item.meta?.title : undefined,
        language:
          typeof item.meta?.language === 'string' ? item.meta?.language : undefined,
        coverImage:
          typeof item.meta?.coverImage === 'string'
            ? item.meta?.coverImage
            : undefined,
        updatedBy:
          typeof item.meta?.updatedBy === 'string' ? item.meta?.updatedBy : undefined,
        updatedAt:
          typeof item.meta?.updatedAt === 'string' ? item.meta?.updatedAt : undefined,
        sizeBytes:
          typeof (item as any)?.size === 'number'
            ? Number((item as any).size)
            : typeof (item as any)?.meta?.size === 'number'
              ? Number((item as any).meta.size)
              : undefined,
        songCount:
          typeof (item as any)?.meta?.songCount === 'number'
            ? Number((item as any).meta.songCount)
            : undefined,
      });
    }

    return remoteMetaByKey;
  }

  private scanLocalBooks() {
    const localBooksByKey = new Map<string, ISongBook>();
    const localFileKeys = new Set<string>();

    for (const dir of this.getExistingDirs()) {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.includes(this.fileNameSuffix));
      for (const f of files) {
        const prepared = f.replace(this.fileNameSuffix, '');
        const book = this.readBook(prepared);
        if (!book) continue;
        const key = book.header.bookKey;
        if (!key) continue;
        localFileKeys.add(key);
        if (!localBooksByKey.has(key)) {
          localBooksByKey.set(key, book);
        }
      }
    }

    return { localBooksByKey, localFileKeys };
  }

  private toLocalVersionItem(fileKey: string, localBooksByKey: Map<string, ISongBook>): BookVersionItem {
    const local = localBooksByKey.get(fileKey);
    const raw = local?.meta?.version;
    const version = raw != null ? Number(raw) : 0;
    return {
      fileKey,
      version: Number.isFinite(version) ? version : 0,
    };
  }

  private buildCards(params: {
    allKeys: string[];
    localBooksByKey: Map<string, ISongBook>;
    remoteVersionByKey: Map<string, number>;
    remoteMetaByKey: Map<
      string,
      {
        title?: string;
        language?: string;
        coverImage?: string;
        updatedBy?: string;
        updatedAt?: string;
        sizeBytes?: number;
        songCount?: number;
      }
    >;
  }): SongDictionaryCardDto[] {
    const {
      allKeys,
      localBooksByKey,
      remoteVersionByKey,
      remoteMetaByKey,
    } = params;

    const cards: SongDictionaryCardDto[] = [];
    for (const fileKey of allKeys) {
      const local = localBooksByKey.get(fileKey);
      const localVersionRaw = local?.meta?.version;
      const localVersion = localVersionRaw != null ? Number(localVersionRaw) : undefined;
      const remoteVersion = remoteVersionByKey.get(fileKey);
      const needsUpdate =
        localVersion != null && remoteVersion != null
          ? localVersion < remoteVersion
          : false;

      const isInstalled = !!local;
      const remoteMeta = remoteMetaByKey.get(fileKey);

      let localSizeBytes: number | undefined;
      if (isInstalled && this.externalAssetsPath) {
        try {
          const p = path.resolve(this.externalAssetsPath, `${fileKey}${this.fileNameSuffix}`);
          if (fs.existsSync(p)) {
            localSizeBytes = fs.statSync(p).size;
          }
        } catch {
          // ignore
        }
      }

      const localSongCount = local?.songs ? local.songs.length : undefined;

      const localUpdatedAt =
        typeof (local as any)?.meta?.updatedAt === 'string'
          ? (local as any).meta.updatedAt
          : typeof (local as any)?.meta?.updated_at === 'string'
            ? (local as any).meta.updated_at
            : undefined;
      const localUpdatedBy =
        typeof (local as any)?.meta?.updatedBy === 'string'
          ? (local as any).meta.updatedBy
          : typeof (local as any)?.meta?.updated_by === 'string'
            ? (local as any).meta.updated_by
            : undefined;

      cards.push({
        fileKey,
        title:
          remoteMeta?.title || local?.meta?.title || local?.header?.title || fileKey,
        language: remoteMeta?.language || local?.meta?.language,
        coverImage: remoteMeta?.coverImage || local?.meta?.coverImage,
        sizeBytes: remoteMeta?.sizeBytes ?? localSizeBytes,
        songCount: remoteMeta?.songCount ?? localSongCount,
        localVersion: Number.isFinite(localVersion as any)
          ? (localVersion as number)
          : undefined,
        remoteVersion,
        updatedAt: remoteMeta?.updatedAt || localUpdatedAt,
        updatedBy: remoteMeta?.updatedBy || localUpdatedBy,
        isInstalled,
        needsUpdate,
      });
    }

    return cards;
  }

  readBookNames(): ISongBookName[] {
    try {
      const bookFiles = this.getExistingDirs()
        .flatMap((dir) => fs.readdirSync(dir).map((f) => ({ dir, f })))
        .filter(({ f }) => f.includes(this.fileNameSuffix))
        .map(({ f }) => f);

      const names: ISongBookName[] = [];

      for (const bookName of bookFiles) {
        const preparedBookName = bookName.replace(this.fileNameSuffix, '');
        const book = this.readBook(preparedBookName);
        if (!book || book.header.disabled) {
          continue;
        }
        names.push({
          fileKey: book.header.bookKey,
          humanName: book.header.title,
        });
      }

      return names.sort((a, b) => {
        return a.humanName.toLowerCase().includes('песнь') ? -1 : 1;
      });
    } catch (error) {
      console.log('ERROR', error);
      return [];
    }
  }

  readBook(name: string): ISongBook | null {
    if (name in this.bookCache) {
      return this.bookCache[name];
    }

    try {
      const filePath = this.findBookFilePath(name);
      if (!filePath) {
        return null;
      }

      const jsonBook = fs.readFileSync(filePath);
      const rawBook = JSON.parse(jsonBook.toString());

      // нормализуем структуру строк куплетов: string[] -> LyricLine[]
      const book: ISongBook = {
        ...rawBook,
        songs: (rawBook.songs || []).map((song: ISong) => ({
          ...song,
          lyrics: (song.lyrics || []).map((lyric: Lyric) => {
            const lines = (lyric.lines || []) as any[];
            // если это уже LyricLine[], оставляем как есть
            if (lines.length > 0 && typeof lines[0] !== 'string') {
              return lyric;
            }
            const normalizedLines: LyricLine[] = lines.map(
              (text: string, index: number): LyricLine => ({
                id: undefined,
                rangeIndex: `${index}-${index}`,
                index,
                globalSongIndex: index,
                text,
              })
            );
            return {
              ...lyric,
              lines: normalizedLines,
            } as Lyric;
          }),
        })),
      };

      this.bookCache[name] = book;

      return book;
    } catch (error) {
      console.log('ERROR', error);
      return null;
    }
  }

  async getDictionariesStatus(authHeader?: string): Promise<SongDictionaryCardDto[]> {
    const registry = await this.fetchRegistryList(authHeader);
    const remoteMetaByKey = this.buildRemoteMetaByKey(registry.items ?? []);

    const allBooks = await this.fetchAllServerBooks(authHeader);
    const serverVersionByKey = new Map<string, number>();
    for (const b of Array.isArray(allBooks.books) ? allBooks.books : []) {
      serverVersionByKey.set(b.fileKey, Number(b.version) || 0);
    }

    const { localBooksByKey, localFileKeys } = this.scanLocalBooks();
    const allKeys = new Set<string>([
      ...Array.from(serverVersionByKey.keys()),
      ...Array.from(localFileKeys.values()),
      ...Array.from(remoteMetaByKey.keys()),
    ]);

    const checkPayloadBooks = Array.from(allKeys.values()).map((fileKey) =>
      this.toLocalVersionItem(fileKey, localBooksByKey)
    );

    await this.fetchUpdatesForBooks(checkPayloadBooks, authHeader);

    const cards = this.buildCards({
      allKeys: Array.from(allKeys.values()),
      localBooksByKey,
      remoteVersionByKey: serverVersionByKey,
      remoteMetaByKey,
    });

    console.log('carss', cards.map(el => ({...el, coverImage: ''})));
    return cards.sort((a, b) => a.title.localeCompare(b.title));
  }

  async installDictionary(
    fileKey: string,
    authHeader?: string,
    downloadUrl?: string
  ): Promise<void> {
    if (!fileKey) {
      throw new Error('fileKey is required');
    }

    let url = downloadUrl;
    if (!url) {
      const local = this.readBook(fileKey);
      const localVersionRaw = local?.meta?.version;
      const localVersion = localVersionRaw != null ? Number(localVersionRaw) : 0;
      //

      const item: BookVersionItem = {
        fileKey,
        version: Number.isFinite(localVersion) ? localVersion : 0,
      };
      const updates = await this.fetchUpdatesForBooks([item], authHeader);
      const upd = Array.isArray(updates.updates)
        ? updates.updates.find((u: any) => u?.fileKey === fileKey)
        : undefined;

      const rawUrl: unknown = (upd as any)?.downloadUrl;
      url = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl : undefined;

      if (!url) {
        const allBooks = await this.fetchAllServerBooks(authHeader);
        const book = Array.isArray(allBooks.books)
          ? allBooks.books.find((b: any) => b?.fileKey === fileKey)
          : undefined;
        const rawUrlFromBooks: unknown = (book as any)?.downloadUrl;
        url =
          typeof rawUrlFromBooks === 'string' && rawUrlFromBooks.trim()
            ? rawUrlFromBooks
            : undefined;
      }
    }

    if (!url) {
      throw new Error('downloadUrl is required');
    }

    if (!this.externalAssetsPath) {
      throw new Error('USER_ASSETS_PATH is not configured');
    }

    fs.mkdirSync(this.externalAssetsPath, { recursive: true });

    const normalizedUrl = this.normalizeDownloadUrl(url);

    let text: string;
    try {
      const rawToken = this.normalizeRawToken(authHeader);
      const res = await axios.get<string>(normalizedUrl, {
        responseType: 'text',
        headers: rawToken
          ? {
              Authorization: `Bearer ${rawToken}`,
              'X-Auth-Token': rawToken,
            }
          : undefined,
      });
      text = res.data;
    } catch (e) {
      const err = e as AxiosError;
      const status = err.response?.status;
      const data = err.response?.data;
      const msg =
        typeof data === 'string'
          ? data
          : data
            ? JSON.stringify(data)
            : err.message;
      throw new Error(`Failed download: ${status ?? 'unknown'} ${msg}`);
    }
    const target = path.resolve(this.externalAssetsPath, `${fileKey}${this.fileNameSuffix}`);
    fs.writeFileSync(target, text);

    this.clearCache();
  }

  getBookSongNames(bookName: string): IShortSong[] {
    const book = this.readBook(bookName);
    if (!book) {
      return [];
    }

    return book.songs.map(({ title, number }) => ({
      title,
      number,
      bookName: this.convertBookToShortBook(book),
    }));
  }

  readSong(
    bookName: string,
    songId: number,
    chorusAfterCouplet: boolean
  ): ISong | undefined {
    const book = this.readBook(bookName);
    if (!book) {
      return;
    }

    const keyInCache = `${book.header.bookKey}__${songId}`;

    if (keyInCache in this.songCache) {
      return this.songCache[keyInCache];
    }

    const foundSong = book.songs.find((item) => item.number === songId);
    if (!foundSong) {
      return;
    }

    function updateSong(song: ISong): ISong {
      const cloneSong: ISong = JSON.parse(JSON.stringify(song));

      if (!chorusAfterCouplet) {
        return {
          ...cloneSong,
          lyrics: clearChorus(cloneSong.lyrics),
        };
      }

      // удаляет дублирующиеся куплеты
      function clearChorus(lyrics: Lyric[]) {
        const newLyric: Lyric[] = [];

        lyrics.forEach((lyric) => {
          const foundChorus = newLyric.find(
            (el) => el.type === LyricTypeEnum.CHORUS
          );
          if (foundChorus && lyric.type === LyricTypeEnum.CHORUS) {
            return;
          }
          newLyric.push(lyric);
        });

        return newLyric;
      }

      // добавляет куплеты после припевов
      function insertChorus(lyrics: Lyric[]) {
        const result: Lyric[] = [];
        const chorus = lyrics.find(
          (item) => item.type === LyricTypeEnum.CHORUS
        );
        if (!chorus) return lyrics;

        for (let i = 0; i < lyrics.length; i++) {
          const lyric = lyrics[i];
          const nextLyricIsChorus =
            lyrics[i + 1]?.type === LyricTypeEnum.CHORUS;

          result.push(lyric);

          if (lyric.type === LyricTypeEnum.COUPLET && !nextLyricIsChorus) {
            result.push({
              ...chorus,
              uniqId: lyric.uniqId + (Math.random() * 1000).toFixed(0),
            });
          }
        }

        return result;
      }

      cloneSong.lyrics = insertChorus(song.lyrics);

      return cloneSong;
    }

    const updatedSong = updateSong(foundSong);

    this.songCache[keyInCache] = updatedSong;

    return updatedSong;
  }

  findSongByText(bookName: string, text: string): ISong[] {
    const book = this.readBook(bookName);
    if (!book) {
      return [];
    }

    const preparedText = text.trim().toLowerCase();

    return book.songs.filter(
      (item) =>
        String(item.number).includes(preparedText) ||
        item.title.toLowerCase().includes(preparedText) ||
        !!item.lyrics.find((lyric) =>
          lyric.lines.find((el) => {
            return el.text.trim().toLowerCase().includes(preparedText);
          })
        )
    );
  }

  convertToShortSong(song: ISong): IShortSong {
    return {
      number: song.number,
      title: song.title,
      bookName: song.bookName,
    };
  }

  convertToSearchSong(song: ISong, query: string): ISongForSearch {
    const preparedQuery = query.toLowerCase();
    const inlineContent = song.lyrics.reduce((acc, curr) => {
      const texts = (curr.lines || []).map((l) => l.text);
      const joined = texts.join(' ').toLowerCase();
      if (joined.includes(preparedQuery)) {
        acc += texts.join(' ');
      }
      return acc;
    }, '');

    return {
      title: song.title,
      number: song.number,
      bookName: song.bookName,
      inlineContent,
    };
  }

  convertBookToShortBook(book: ISongBook): ISongBookName {
    return {
      humanName: book.header.title,
      fileKey: book.header.bookKey,
    };
  }
}
