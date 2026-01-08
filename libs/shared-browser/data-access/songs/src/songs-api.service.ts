import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError, Observable, of } from 'rxjs';
import {
  IShortSong,
  ISong,
  ISongBookName,
  ISongForSearch,
} from '@lyri-cast/entities';
import { BASE_API_TOKEN } from '@lyri-cast/common';

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

@Injectable({ providedIn: 'root' })
export class SongsApiService {
  private readonly baseApiToken = inject(BASE_API_TOKEN);
  private http = inject(HttpClient);

  private buildUrl(path: string): string {
    const normalizedPath = path.replace(/^\/+/, '');
    const rawBase = this.baseApiToken ?? 'svc://';
    const hasProtocolSuffix = rawBase.endsWith('://');
    const trimmedBase = hasProtocolSuffix
      ? rawBase
      : rawBase.replace(/\/+$/, '');
    const songsBase = hasProtocolSuffix
      ? `${trimmedBase}songs`
      : `${trimmedBase}/songs`;

    return `${songsBase}/${normalizedPath}`;
  }

  getAllSongBooks(): Observable<ISongBookName[]> {
    return this.http
      .get<ISongBookName[]>(this.buildUrl('book-names'))
      .pipe(
        catchError((err) => {
          console.log(err);
          return of([]);
        })
      );
  }

  getAllSongsByBook(book: ISongBookName): Observable<IShortSong[]> {
    return this.http.get<IShortSong[]>(
      this.buildUrl(`book-songs/${book.fileKey}`)
    );
  }

  findSongsByBook(
    book: ISongBookName,
    search: string
  ): Observable<ISongForSearch[]> {
    const params = new HttpParams({
      fromObject: { search, 'full-model': false },
    });

    return this.http
      .get<ISongForSearch[]>(this.buildUrl(`find/${book.fileKey}`), {
        params,
      })
      .pipe(
        catchError((err) => {
          console.log('error', err);
          return of([]);
        })
      );
  }

  getSong(book: ISongBookName, songId: number): Observable<ISong> {
    return this.http.get<ISong>(
      this.buildUrl(`book/${book.fileKey}/${songId}`)
    );
  }

  getSongDictionaries(): Observable<SongDictionaryCardDto[]> {
    return this.http.get<SongDictionaryCardDto[]>(
      this.buildUrl('dictionaries')
    );
  }

  installSongDictionary(payload: {
    fileKey: string;
  }): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      this.buildUrl('dictionaries/install'),
      payload
    );
  }

  deleteSongDictionary(payload: { fileKey: string }): Observable<{ ok: true; deleted: boolean }> {
    return this.http.post<{ ok: true; deleted: boolean }>(
      this.buildUrl('dictionaries/delete'),
      payload
    );
  }

  clearSongDictionaries(): Observable<{ ok: true; deletedCount: number }> {
    return this.http.post<{ ok: true; deletedCount: number }>(
      this.buildUrl('dictionaries/clear'),
      {}
    );
  }
}
