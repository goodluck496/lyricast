import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map, Observable } from 'rxjs';
import {
  CreateSongDto,
  ImportSongBookDto,
  SongBookExportDto,
  SongsService,
  UpdateSongDto,
  BASE_PATH,
  CatalogsService,
  CreateCatalogDto,
  CreateCatalogDtoTypeEnum,
} from '@lyri-cast/openapi-songs-dictionary';
import {
  ISong,
  SongDatabaseInfoDto,
  SongSearchResultDto,
} from '@lyri-cast/entities';
import {
  mapRegistryItemToSongDatabaseInfoDto,
  mapSongUnionToISong,
} from './songs-dictionary.mappers';

export interface SongSearchOptions {
  db: string;
  query?: string;
  number?: number;
  page?: number;
  pageSize?: number;
  includeLyrics?: boolean;
}

export interface SongSaveResult {
  id?: number;
}

export interface CreateSongBookRequest {
  catalogId: number;
  title?: string;
  description?: string;
  language?: string;
  source?: string;
  coverImage?: string;
  fileKey?: string;
}

export interface CatalogListItem {
  id: number;
  code: string;
  title: string;
  type: string;
  meta?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class SongsDictionaryApiService {
  private readonly api = inject(SongsService);
  private readonly catalogsApi = inject(CatalogsService);
  private readonly http = inject(HttpClient);
  private readonly basePath = inject(BASE_PATH, { optional: true });

  ping(): Observable<unknown> {
    return this.api.songsControllerRegistry();
  }

  getSongDatabases(): Observable<SongDatabaseInfoDto[]> {
    return this.api
      .songsControllerRegistry()
      .pipe(
        map((res) => res.items.map(mapRegistryItemToSongDatabaseInfoDto))
      );
  }

  searchSongs(options: SongSearchOptions): Observable<SongSearchResultDto> {
    const {
      db,
      query,
      number,
      page = 1,
      pageSize = 50,
      includeLyrics = false,
    } = options;

    if (includeLyrics) {
      throw new Error(
        '[SongsDictionaryApiService] includeLyrics=true is not supported by Dictionary API findAll endpoint'
      );
    }

    if (typeof number === 'number') {
      throw new Error(
        '[SongsDictionaryApiService] number search is not supported by Dictionary API findAll endpoint'
      );
    }

    return this.api
      .songsControllerFindAll({
        songBookId: Number(db),
        q: query,
        page,
        pageSize,
      })
      .pipe(
        map((res: { items: unknown[]; total: number }) => ({
          items: (res.items ?? []).map(mapSongUnionToISong),
          totalCount: res.total ?? 0,
          page,
          pageSize,
        }))
      );
  }

  getSong(db: string, id: string): Observable<ISong> {
    return this.api
      .songsControllerFindOne({ id: Number(id) })
      .pipe(map((res: unknown) => mapSongUnionToISong(res)));
  }

  saveSong(
    db: string,
    song: ISong,
    existingId?: number | null
  ): Observable<SongSaveResult> {
    const baseDto = {
      songBookId: Number(db),
      number: song.number,
      title: song.title,
      songKey: song.key,
      keySignature: song.keySignature,
      author: song.author,
      ref: song.ref,
      category: song.category,
      meta: song.meta,
      lyrics: (song.lyrics ?? []).map((lyric, lyricIndex) => ({
        uniqId: lyric.uniqId,
        sectionTitle: lyric.sectionTitle ?? '',
        type: lyric.type,
        splitLinesCount: lyric.splitLinesCount ?? 1,
        sortIndex: lyricIndex,
        lyrics: (lyric.lines ?? []).map((line, lineIndex) => ({
          rangeIndex: String(line.rangeIndex ?? ''),
          lineIndex: line.index ?? lineIndex,
          globalSongIndex: line.globalSongIndex ?? 0,
          text: String(line.text ?? ''),
          repeatCount: 1,
        })),
      })),
    };

    if (typeof existingId === 'number') {
      return this.api.songsControllerUpdate({
        id: existingId,
        updateSongDto: {
          ...baseDto,
          id: existingId,
        } satisfies UpdateSongDto,
      });
    }

    const createSongDto: CreateSongDto = {
      ...baseDto,
    };

    return this.api.songsControllerCreate({
      createSongDto,
    });
  }

  deleteSong(db: string, id: string): Observable<void> {
    return this.api
      .songsControllerRemove({ id: Number(id) })
      .pipe(map(() => void 0));
  }

  downloadDb(db: string): Observable<Blob> {
    return new Observable<Blob>((subscriber) => {
      subscriber.error(
        new Error(
          '[SongsDictionaryApiService] downloadDb is not implemented for Dictionary API'
        )
      );
    });
  }

  exportBook(db: string, fileKey?: string): Observable<SongBookExportDto> {
    if (fileKey) {
      throw new Error(
        '[SongsDictionaryApiService] exportBook(fileKey) is not supported by Dictionary API'
      );
    }

    return this.api.songsControllerExportSongBook({ songBookId: Number(db) });
  }

  importSongBook(payload: ImportSongBookDto): Observable<unknown> {
    return this.api.songsControllerImportSongBook({
      importSongBookDto: payload,
    });
  }

  getCatalogs(): Observable<CatalogListItem[]> {
    return this.catalogsApi.catalogsControllerFindAll().pipe(
      map((res: unknown) => {
        const items = Array.isArray(res) ? res : [];
        return items
          .map((item) => this.mapCatalogItem(item))
          .filter((item): item is CatalogListItem => item !== null);
      }),
    );
  }

  createCatalog(dto: CreateCatalogDto): Observable<CatalogListItem> {
    return this.catalogsApi
      .catalogsControllerCreate({ createCatalogDto: dto })
      .pipe(map((res) => this.mapCatalogItem(res) as CatalogListItem));
  }

  async ensureCatalogExists(title: string): Promise<CatalogListItem> {
    const existing = await firstValueFrom(this.getCatalogs());
    const normalizedTitle = title.trim().toLowerCase();
    const match = existing.find(
      (item) => item.title.trim().toLowerCase() === normalizedTitle,
    );
    if (match) return match;
    return firstValueFrom(
      this.createCatalog({
        title: title.trim(),
        type: CreateCatalogDtoTypeEnum.Songs,
      }),
    );
  }

  createSongBook(payload: CreateSongBookRequest): Observable<{ ok: boolean; songBookId: number }> {
    const rawBasePath = Array.isArray(this.basePath) ? this.basePath[0] : this.basePath;
    const basePath = (rawBasePath ?? '').replace(/\/+$/, '');
    const url = basePath ? `${basePath}/api/songs/song-books` : `/api/songs/song-books`;
    return this.http.post<{ ok: boolean; songBookId: number }>(url, payload);
  }

  createEmptySong(): ISong {
    return {
      number: 0,
      title: '',
      key: '',
      keySignature: '',
      author: '',
      meta: [],
      lyrics: [],
      bookName: { fileKey: '', humanName: '' },
    };
  }

  updateBookMeta(
    db: string,
    fileKey: string,
    meta: { title: string | null; description: string | null; language: string | null; coverImage: string | null }
  ) {
    // db === songBookId (route param in dictionary-client)
    // Важно: используем basePath OpenAPI-конфига, иначе относительный /api/* уйдёт в Angular dev server
    void fileKey;
    const rawBasePath = Array.isArray(this.basePath) ? this.basePath[0] : this.basePath;
    const basePath = (rawBasePath ?? '').replace(/\/+$/, '');
    const url = basePath
      ? `${basePath}/api/songs/song-books/${Number(db)}/meta`
      : `/api/songs/song-books/${Number(db)}/meta`;
    return this.http.patch<{ ok: boolean }>(url, meta);
  }

  private mapCatalogItem(raw: any): CatalogListItem | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const id = Number((raw as any).id);
    const title = String((raw as any).title ?? '');
    if (!Number.isFinite(id) || !title) {
      return null;
    }
    return {
      id,
      code: String((raw as any).code ?? ''),
      title,
      type: String((raw as any).type ?? ''),
      meta: (raw as any).meta ?? undefined,
    };
  }
}
