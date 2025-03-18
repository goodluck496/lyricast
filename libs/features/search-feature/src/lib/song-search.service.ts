import { inject, Injectable, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { BehaviorSubject, switchMap, tap } from 'rxjs';
import { IShortSong } from '@lyri-cast/entities';
import { filterEmpty } from '@lyri-cast/common';
import { SongsApiService } from '../../../song-feature/src/lib/services/songs-api.service';
import { selectSelectedBook, SongPageState } from '@lyri-cast/song-feature';

@Injectable()
export class SongSearchService {
  apiSrv = inject(SongsApiService);

  store = inject<Store<SongPageState>>(Store);

  isLoading = signal(false);

  searchResult$ = new BehaviorSubject<IShortSong[]>([]);

  public search(query: string) {
    const songBook$ = this.store.select(selectSelectedBook);

    return songBook$.pipe(
      filterEmpty(),
      switchMap((book) => {
        return this.apiSrv.findSongsByBook(book, query);
      }),
      tap((v) => {
        this.searchResult$.next(v);
      })
    );
  }
}
