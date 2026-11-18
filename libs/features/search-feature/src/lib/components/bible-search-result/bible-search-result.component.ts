import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressBarModule } from 'primeng/progressbar';
import { combineLatest, map, Observable, tap } from 'rxjs';
import { BibleSearchDto, BibleSearchSectionDto } from '@lyri-cast/entities';
import { BibleSearchService } from '../../bible-search.service';
import { NgScrollbarExt } from 'ngx-scrollbar';
import { NgScrollbarCdkVirtualScroll } from 'ngx-scrollbar/cdk';
import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { HighlighterPipe } from '@lyri-cast/ui-lib';
import {
  BibleActions,
  selectSelectedBook,
  selectSelectedChapter,
  selectSelectedPath,
} from '@lyri-cast/bible-store';
import { Store } from '@ngrx/store';
import { Pages } from '@lyri-cast/common-browser';
import { Router } from '@angular/router';
import { TabsModule } from 'primeng/tabs';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'lyri-bible-search-result',
  standalone: true,
  imports: [
    CommonModule,
    ProgressBarModule,
    NgScrollbarExt,
    NgScrollbarCdkVirtualScroll,
    CdkVirtualScrollViewport,
    CdkFixedSizeVirtualScroll,
    CdkListbox,
    CdkVirtualForOf,
    CdkOption,
    HighlighterPipe,
    TabsModule,
    ButtonModule,
  ],
  templateUrl: './bible-search-result.component.html',
  styleUrl: './bible-search-result.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BibleSearchResultComponent {
  cdr = inject(ChangeDetectorRef);
  router = inject(Router);
  searchSrv = inject(BibleSearchService);
  store = inject(Store);

  isLoading = this.searchSrv.isLoading;

  onSelectPath = output<string[]>();

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

  searchResult$: Observable<BibleSearchDto> = this.searchSrv.searchResult$
    .asObservable()
    .pipe(
      tap(() => {
        this.selectedTabIndex = 0;
        this.cdr.detectChanges();
      })
    );

  groupedResult$ = combineLatest([
    this.searchResult$,
    this.store.select(selectSelectedBook),
    this.store.select(selectSelectedChapter),
    this.store.select(selectSelectedPath),
  ]).pipe(
    map(([dto, selectedBook, selectedChapter, selectedPath]) => {
      const currentBookId =
        selectedBook?.number ??
        (selectedPath?.[0] ? Number(selectedPath[0]) : null);
      const currentChapterId =
        selectedChapter?.number ??
        (selectedPath?.[1] ? Number(selectedPath[1]) : null);

      const grouped = new Map<
        number,
        {
          bookId: number;
          bookShortName: string;
          sections: BibleSearchSectionDto[];
          matchCount: number;
          bestRank: number;
          isCurrentScope?: boolean;
        }
      >();

      for (const [rank, section] of (dto.sections ?? []).entries()) {
        const existing = grouped.get(section.bookId);
        if (existing) {
          existing.sections.push(section);
          existing.matchCount += 1;
          existing.bestRank = Math.min(existing.bestRank, rank);
        } else {
          grouped.set(section.bookId, {
            bookId: section.bookId,
            bookShortName: section.bookShortName,
            sections: [section],
            matchCount: 1,
            bestRank: rank,
          });
        }
      }

      for (const group of grouped.values()) {
        if (currentBookId !== null && group.bookId === currentBookId) {
          group.isCurrentScope = true;
          if (currentChapterId !== null) {
            group.sections.sort((a, b) => {
              const aInChapter = a.chapterId === currentChapterId ? 0 : 1;
              const bInChapter = b.chapterId === currentChapterId ? 0 : 1;
              return aInChapter - bInChapter;
            });
          }
        }
      }

      const groups = Array.from(grouped.values()).sort((a, b) => {
        if (a.isCurrentScope && !b.isCurrentScope) {
          return -1;
        }
        if (!a.isCurrentScope && b.isCurrentScope) {
          return 1;
        }
        if (a.bestRank !== b.bestRank) {
          return a.bestRank - b.bestRank;
        }
        return a.bookId - b.bookId;
      });

      return {
        search: dto.search,
        groups,
      };
    })
  );

  async onSelectSearchElement(value: BibleSearchSectionDto) {
    const pagePath = [Pages.MAIN, Pages.BIBLE_FEATURE, Pages.BIBLE];
    const isBiblePage = this.router.isActive(pagePath.join('/'), {
      paths: 'exact',
      queryParams: 'exact',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
    if (!isBiblePage) {
      await this.router.navigate(pagePath);
    }

    this.store.dispatch(BibleActions.changePath({ path: value.content.path }));
    this.onSelectPath.emit(value.content.path);
  }

  async onPlaySearchElement(event: MouseEvent, value: BibleSearchSectionDto) {
    event.stopPropagation();
    const pagePath = [Pages.MAIN, Pages.BIBLE_FEATURE, Pages.BIBLE];
    const isBiblePage = this.router.isActive(pagePath.join('/'), {
      paths: 'exact',
      queryParams: 'exact',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
    if (!isBiblePage) {
      await this.router.navigate(pagePath);
      await this.waitForPageReady();
    }

    this.store.dispatch(
      BibleActions.requestAutoStartCasting({ path: value.content.path })
    );
    this.store.dispatch(BibleActions.changePath({ path: value.content.path }));
    this.onSelectPath.emit(value.content.path);
  }

  onChangeTab(tabValue: any) {
    const idx = Number(tabValue ?? 0);
    this.selectedTabIndex = Number.isNaN(idx) ? 0 : idx;
    this.cdr.detectChanges();
  }
}
