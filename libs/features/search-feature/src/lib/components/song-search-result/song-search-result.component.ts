import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject, output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressBarModule } from 'primeng/progressbar';
import { Store } from '@ngrx/store';
import { map, Observable, tap } from 'rxjs';
import { ISongForSearch, SongsSearchDto } from '@lyri-cast/entities';
import { SongSearchService } from '../../song-search.service';
import { SongActions, SongActionsEnum } from '@lyri-cast/song-store';

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
import { TabsModule } from 'primeng/tabs';
import { Router } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';
import { ButtonModule } from 'primeng/button';

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
    TabsModule,
    ButtonModule,
  ],
  templateUrl: './song-search-result.component.html',
  styleUrl: './song-search-result.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongSearchResultComponent {
  cdr = inject(ChangeDetectorRef);
  searchSrv = inject(SongSearchService);
  store = inject(Store);
  router = inject(Router);

  isLoading = this.searchSrv.isLoading;

  onSelectSong = output<ISongForSearch>();

  selectedTabIndex = 0;

  private waitForNextFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  private async waitForPageReady(): Promise<void> {
    await this.waitForNextFrame();
    await this.waitForNextFrame();
  }

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
    this.store.dispatch(SongActions[SongActionsEnum.selectBook](value.bookName));
    this.store.dispatch(
      SongActions[SongActionsEnum.selectSongByNumber]({
        data: { number: value.number, bookKey: value.bookName.fileKey },
      })
    );
    this.onSelectSong.emit(value);
  }

  async onPlaySearchElement(event: MouseEvent, value: ISongForSearch) {
    event.stopPropagation();
    const songPagePath = [Pages.MAIN, Pages.SONGS_FEATURE, Pages.SONGS];
    const isSongPage = this.router.isActive(songPagePath.join('/'), {
      paths: 'exact',
      queryParams: 'exact',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
    if (!isSongPage) {
      await this.router.navigate(songPagePath);
      await this.waitForPageReady();
    }
    this.store.dispatch(
      SongActions[SongActionsEnum.requestAutoStartCasting]({
        data: { number: value.number, bookKey: value.bookName.fileKey },
      })
    );
    this.store.dispatch(SongActions[SongActionsEnum.selectBook](value.bookName));
    this.store.dispatch(
      SongActions[SongActionsEnum.selectSongByNumber]({
        data: { number: value.number, bookKey: value.bookName.fileKey },
      })
    );
    this.onSelectSong.emit(value);
  }

  onChangeTab(tabValue: any) {
    const idx = Number(tabValue ?? 0);
    this.selectedTabIndex = Number.isNaN(idx) ? 0 : idx;
    this.cdr.detectChanges();
  }
}
