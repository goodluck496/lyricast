import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, of } from 'rxjs';
import { BASE_API_TOKEN } from '@lyri-cast/common';
import { IShortSong, ISong, ISongBookName } from '@lyri-cast/entities';

@Injectable({ providedIn: 'root' })
export class SongsService {
  BASE_API_TOKEN = inject(BASE_API_TOKEN);

  constructor(private http: HttpClient) {}

  getAllSongBooks(): Observable<ISongBookName[]> {
    return this.http
      .get<ISongBookName[]>(`${this.BASE_API_TOKEN}/book-names/`)
      .pipe(
        catchError((err) => {
          console.log(err);
          return of([]);
        })
      );
  }

  getSongsByBook(book: ISongBookName): Observable<IShortSong[]> {
    return this.http.get<IShortSong[]>(`${this.BASE_API_TOKEN}/book-songs/${book.fileKey}`);
  }

  getSong(book: ISongBookName, songId: number): Observable<ISong> {
    return this.http.get<ISong>(`${this.BASE_API_TOKEN}/book/${book.fileKey}/${songId}`);
  }
}
