import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressBarModule } from 'primeng/progressbar';
import { Store } from '@ngrx/store';
import { map, Observable, take, tap } from 'rxjs';
import { ISongForSearch, SongsSearchDto } from '@lyri-cast/entities';
import { SongSearchService } from '../../song-search.service';
import { SongActions } from '@lyri-cast/song-store';

import { NgScrollbarExt } from 'ngx-scrollbar';
import { NgScrollbarCdkVirtualScroll } from 'ngx-scrollbar/cdk';
import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { HighlighterPipe } from '@lyri-cast/ui-lib';
import { filterEmpty } from '@lyri-cast/common';
import { TabViewModule } from 'primeng/tabview';
import { Actions, ofType } from '@ngrx/effects';
import { Router } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';

@Component({
  selector: 'lyri-song-search-result',
  standalone: true,
  imports: [
    CommonModule,
    ProgressBarModule,
    NgScrollbarExt,
    NgScrollbarCdkVirtualScroll,
    CdkFixedSizeVirtualScroll,
    CdkVirtualScrollViewport,
    CdkVirtualForOf,
    CdkListbox,
    CdkOption,
    HighlighterPipe,
    TabViewModule,
  ],
  templateUrl: './song-search-result.component.html',
  styleUrl: './song-search-result.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongSearchResultComponent {
  cdr = inject(ChangeDetectorRef);
  searchSrv = inject(SongSearchService);
  store = inject(Store);
  actions$ = inject(Actions);
  router = inject(Router);

  isLoading = this.searchSrv.isLoading;

  selectedTabIndex = 0;

  searchResult$: Observable<SongsSearchDto[]> = this.searchSrv.searchResult$
    .asObservable()
    .pipe(
      map((results) => {
        const emptyResults = results
          .map((el) => !el.songs.length)
          .every((empty) => empty);
        if (emptyResults) {
          return [];
        }
        return results;
      }),
      tap(() => this.cdr.detectChanges()),
      filterEmpty()
    );

  async onSelectSearchElement(value: ISongForSearch) {
    // this.store.dispatch(SongActions.selectSong(value));
    console.log('onSelectSearchElement', value);
    const songPagePath = [Pages.MAIN, Pages.SONGS_FEATURE, Pages.SONGS];
    const isSongPage = this.router.isActive(songPagePath.join('/'), {
      paths: 'exact',
      queryParams: 'exact',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
    if (!isSongPage) {
      await this.router.navigate(songPagePath);
    }
    this.actions$
      .pipe(ofType(SongActions.selectBook), take(1))
      .subscribe((payload) => {
        this.store.dispatch(
          SongActions.selectSongByNumber({ data: { number: value.number } })
        );
      });

    this.store.dispatch(SongActions.selectBook(value.bookName));

    // this.store.dispatch(SongActions.selectSong())
  }

  onChangeTab(tabIndex: number) {
    this.selectedTabIndex = tabIndex;
    this.cdr.detectChanges();
  }
}
