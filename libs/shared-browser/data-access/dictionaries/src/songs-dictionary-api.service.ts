import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  ApiPhpActionRegistryListGet200Response,
  ApiPhpActionSongGetGet200Response,
  ApiPhpActionSongSavePost200Response,
  DefaultService,
  Lyric as ApiLyric,
  LyricLine as ApiLyricLine,
  SongBookExport,
  SongSaveRequest,
  SongSearchResponse,
} from '@lyri-cast/openapi-client';
import {
  ISong,
  Lyric as AppLyric,
  LyricLine,
  SongDatabaseInfoDto,
  SongSearchResultDto,
} from '@lyri-cast/entities';
import {
  mapRegistryItemToSongDatabaseInfoDto,
  mapSongSearchResponseToDto,
  mapSongUnionToISong,
} from './songs-dictionary.mappers';
import {
  SqliteCreatorPhpActionExportBookGet200Response
} from '../../../../openapi-client/generated/model/sqliteCreatorPhpActionExportBookGet200Response';


export interface SongSearchOptions {
  db: string;
  query?: string;
  number?: number;
  page?: number;
  pageSize?: number;
  includeLyrics?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SongsDictionaryApiService {
  private readonly api = inject(DefaultService);

  ping(): Observable<ApiPhpActionRegistryListGet200Response> {
    return this.api.apiPhpactionregistryListGet();
  }

  getSongDatabases(): Observable<SongDatabaseInfoDto[]> {
    return this.api
      .apiPhpactionregistryListGet()
      .pipe(
        map((res: ApiPhpActionRegistryListGet200Response) =>
          (res.items || []).map(mapRegistryItemToSongDatabaseInfoDto)
        )
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

    return this.api
      .apiPhpactionsongSearchGet({
        db,
        query,
        number,
        page,
        pageSize,
        includeLyrics: includeLyrics ? 1 : 0,
      })
      .pipe(map((res: SongSearchResponse) => mapSongSearchResponseToDto(res)));
  }

  getSong(db: string, id: string): Observable<ISong> {
    return this.api
      .apiPhpactionsongGetGet({ db, id: Number(id) })
      .pipe(
        map((res: ApiPhpActionSongGetGet200Response) =>
          mapSongUnionToISong(res.song)
        )
      );
  }

  saveSong(
    db: string,
    song: ISong,
    existingId?: number | null
  ): Observable<ApiPhpActionSongSavePost200Response> {
    const lyrics: ApiLyric[] | undefined =
      song.lyrics && song.lyrics.length > 0
        ? song.lyrics.map((lyric: AppLyric, lyricIndex: number): ApiLyric => {
            const lines: ApiLyricLine[] = (lyric.lines || []).map(
              (line: LyricLine, lineIndex: number): ApiLyricLine => ({
                id: line.id ?? 0,
                lyricId: lyric.id ?? 0,
                rangeIndex: line.rangeIndex ?? null,
                lineIndex: line.index ?? lineIndex,
                globalSongIndex: line.globalSongIndex ?? null,
                text: line.text ?? '',
              })
            );

            return {
              id: lyric.id ?? 0,
              songId: lyric.numericSongId ?? song.id ?? 0,
              uniqId: lyric.uniqId,
              sectionTitle: lyric.sectionTitle ?? '',
              type: lyric.type,
              splitLinesCount: lyric.splitLinesCount ?? 1,
              sortIndex: lyricIndex,
              lines,
            };
          })
        : undefined;

    const payload: SongSaveRequest = {
      id: existingId ?? null,
      bookFileKey: song.bookName.fileKey,
      number: song.number,
      title: song.title,
      songKey: song.key,
      keySignature: song.keySignature,
      author: song.author,
      ref: song.ref ?? null,
      category: song.category ?? null,
      lyrics,
    };

    return this.api.apiPhpactionsongSavePost({ db, songSaveRequest: payload });
  }

  deleteSong(db: string, id: string): Observable<void> {
    return this.api
      .apiPhpactionsongDeletePost({ db, id: Number(id) })
      .pipe(map(() => void 0));
  }

  downloadDb(db: string): Observable<Blob> {
    return this.api.apiPhpactiondownloadDbGet({ db });
  }

  exportBook(db: string, fileKey?: string): Observable<SongBookExport> {
    return this.api.sqliteCreatorPhpactionexportBookGet({ db, fileKey });
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
}
