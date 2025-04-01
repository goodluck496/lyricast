import { Component, inject } from '@angular/core';
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
  searchSrv = inject(BibleSearchService);
  store = inject(Store);

  isLoading = this.searchSrv.isLoading;

  searchResult$: Observable<BibleSearchDto> =
    this.searchSrv.searchResult$.asObservable();

  onSelectSearchElement(value: BibleSearchSectionDto) {
    this.store.dispatch(BibleActions.changePath({ path: value.content.path }));
  }
}
