import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError, Observable, of } from 'rxjs';
import {
  IShortSong,
  ISong,
  ISongBookName,
  ISongForSearch,
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
  downloadUrl?: string;
};

@Injectable({ providedIn: 'root' })
export class SongsApiService {
  BASE_API_TOKEN = 'svc://'; //inject(BASE_API_TOKEN);
  API_SONGS_TOKEN = 'songs';

  constructor(private http: HttpClient) {}

  getAllSongBooks(): Observable<ISongBookName[]> {
    return this.http
      .get<ISongBookName[]>(
        `${this.BASE_API_TOKEN}/${this.API_SONGS_TOKEN}/book-names/`
      )
      .pipe(
        catchError((err) => {
          console.log(err);
          return of([]);
        })
      );
  }

  getAllSongsByBook(book: ISongBookName): Observable<IShortSong[]> {
    return this.http.get<IShortSong[]>(
      `${this.BASE_API_TOKEN}/${this.API_SONGS_TOKEN}/book-songs/${book.fileKey}`
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
      .get<ISongForSearch[]>(
        `${this.BASE_API_TOKEN}/${this.API_SONGS_TOKEN}/find/${book.fileKey}`,
        { params }
      )
      .pipe(
        catchError((err) => {
          console.log('error', err);
          return of([]);
        })
      );
  }

  getSong(book: ISongBookName, songId: number): Observable<ISong> {
    return this.http.get<ISong>(
      `${this.BASE_API_TOKEN}/${this.API_SONGS_TOKEN}/book/${book.fileKey}/${songId}`
    );
  }

  getSongDictionaries(): Observable<SongDictionaryCardDto[]> {
    return this.http.get<SongDictionaryCardDto[]>(
      `${this.BASE_API_TOKEN}/${this.API_SONGS_TOKEN}/dictionaries`
    );
  }

  installSongDictionary(payload: {
    fileKey: string;
    downloadUrl?: string;
  }): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.BASE_API_TOKEN}/${this.API_SONGS_TOKEN}/dictionaries/install`,
      payload
    );
  }

  deleteSongDictionary(payload: { fileKey: string }): Observable<{ ok: true; deleted: boolean }> {
    return this.http.post<{ ok: true; deleted: boolean }>(
      `${this.BASE_API_TOKEN}/${this.API_SONGS_TOKEN}/dictionaries/delete`,
      payload
    );
  }

  clearSongDictionaries(): Observable<{ ok: true; deletedCount: number }> {
    return this.http.post<{ ok: true; deletedCount: number }>(
      `${this.BASE_API_TOKEN}/${this.API_SONGS_TOKEN}/dictionaries/clear`,
      {}
    );
  }
}
