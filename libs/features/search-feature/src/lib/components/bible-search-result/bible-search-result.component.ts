import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressBarModule } from 'primeng/progressbar';
import { Observable } from 'rxjs';
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
  ],
  templateUrl: './bible-search-result.component.html',
  styleUrl: './bible-search-result.component.scss',
})
export class BibleSearchResultComponent {
  router = inject(Router);
  searchSrv = inject(BibleSearchService);
  store = inject(Store);

  isLoading = this.searchSrv.isLoading;

  onSelectPath = output<string[]>();

  searchResult$: Observable<BibleSearchDto> =
    this.searchSrv.searchResult$.asObservable();

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
}
