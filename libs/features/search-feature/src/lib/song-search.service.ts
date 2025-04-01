import { inject, Injectable, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import {
  BehaviorSubject,
  forkJoin,
  map,
  Observable,
  of,
  switchMap,
  tap,
} from 'rxjs';

import { selectSelectedBook, SongPageState } from '@lyri-cast/song-store';
import { ISongBookName, SongsSearchDto } from '@lyri-cast/entities';
import { filterEmpty } from '@lyri-cast/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SongsApiService } from '@lyri-cast/data-access-songs';


@Injectable()
export class SongSearchService {
  apiSrv = inject(SongsApiService);

  store = inject<Store<SongPageState>>(Store);

  isLoading = signal(false);

  isSelectBookForSearch = false;

  searchResult$ = new BehaviorSubject<SongsSearchDto[]>([]);

  constructor() {
    this.searchResult$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.isLoading.set(false);
    });
  }

  public search(query: string): Observable<SongsSearchDto[]> {
    if (!query) {
      return of([]);
    }
    this.isLoading.set(true);

    if (this.isSelectBookForSearch) {
      return this.store
        .select(selectSelectedBook)
        .pipe(
          filterEmpty(),
          switchMap((book: ISongBookName) => {
            return this.apiSrv.findSongsByBook(book, query).pipe(
              map((songs) => {
                return [
                  {
                    bookName: book,
                    search: query,
                    songs,
                  } satisfies SongsSearchDto,
                ];
              })
            );
          })
        )
        .pipe(
          tap((data) => {
            this.searchResult$.next(data);
          })
        );
    }

    return this.apiSrv
      .getAllSongBooks()
      .pipe(
        switchMap((data) => {
          return forkJoin(
            [...data].map((bookName: ISongBookName) => {
              return this.apiSrv.findSongsByBook(bookName, query).pipe(
                map((songs) => {
                  return {
                    bookName: bookName,
                    search: query,
                    songs,
                  } satisfies SongsSearchDto;
                })
              );
            })
          );
        })
      )
      .pipe(
        tap((data) => {
          this.searchResult$.next(data);
        })
      );

    // return songBook$.pipe(
    //   filterEmpty(),
    //   switchMap((book) => {
    //     return this.apiSrv
    //       .findSongsByBook(book, query)
    //       .pipe(map((result) => [book, result] as [ISongBookName, IShortSong[]]));
    //   }),
    //   tap(([book, songs]) => {
    //     this.searchResult$.next({
    //       search: query,
    //       bookName: book,
    //       songs,
    //     });
    //   })
    // );
  }
}
