import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressBarModule } from 'primeng/progressbar';
import { map, Observable, tap } from 'rxjs';
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
import { BibleActions } from '@lyri-cast/bible-store';
import { Store } from '@ngrx/store';
import { Pages } from '@lyri-cast/common-browser';
import { Router } from '@angular/router';
import { TabsModule } from 'primeng/tabs';

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

  searchResult$: Observable<BibleSearchDto> = this.searchSrv.searchResult$
    .asObservable()
    .pipe(tap(() => this.cdr.detectChanges()));

  groupedResult$ = this.searchResult$.pipe(
    map((dto) => {
      const grouped = new Map<
        number,
        {
          bookId: number;
          bookShortName: string;
          sections: BibleSearchSectionDto[];
          matchCount: number;
          bestRank: number;
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

      const groups = Array.from(grouped.values()).sort((a, b) => {
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

  onChangeTab(tabValue: any) {
    const idx = Number(tabValue ?? 0);
    this.selectedTabIndex = Number.isNaN(idx) ? 0 : idx;
    this.cdr.detectChanges();
  }
}
