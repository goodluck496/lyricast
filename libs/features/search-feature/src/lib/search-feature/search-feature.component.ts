import {
  AfterViewInit,
  Component,
  DestroyRef,
  inject,
  OnInit,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { OverlayPanel, OverlayPanelModule } from 'primeng/overlaypanel';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SelectButtonChangeEvent } from 'primeng/selectbutton/selectbutton.interface';
import { BibleSearchService } from '../bible-search.service';
import { SongSearchService } from '../song-search.service';
import { BibleSearchResultComponent } from '../components/bible-search-result/bible-search-result.component';
import { SongSearchResultComponent } from '../components/song-search-result/song-search-result.component';
import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filterEmpty } from '@lyri-cast/common';
import { Actions, ofType } from '@ngrx/effects';
import { BibleActions } from '../../../../bible-feature/src/lib/store/bible.actions';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';

export enum SearchTypeTabs {
  BIBLE = 'bible',
  SONGS = 'songs',
  PROGRAMS = 'programs',
}

@Component({
  selector: 'lyri-search-feature',
  standalone: true,
  imports: [
    CommonModule,
    InputTextModule,
    ReactiveFormsModule,
    OverlayPanelModule,
    SelectButtonModule,
    FormsModule,
    BibleSearchResultComponent,
    SongSearchResultComponent,
    IconFieldModule,
    InputIconModule,
  ],
  templateUrl: './search-feature.component.html',
  styleUrl: './search-feature.component.scss',

  providers: [BibleSearchService, SongSearchService],
})
export class SearchFeatureComponent implements OnInit, AfterViewInit {
  destroyRef = inject(DestroyRef);

  bibleSearchSrv = inject(BibleSearchService);
  songSearchSrv = inject(SongSearchService);

  actions$ = inject(Actions);

  searchOverlay = viewChild.required('searchOverlay', { read: OverlayPanel });

  searchControl = new FormControl<string>('');

  tabOptions = [
    { label: 'Библия', value: SearchTypeTabs.BIBLE },
    { label: 'Песни', value: SearchTypeTabs.SONGS },
    { label: 'Программы', value: SearchTypeTabs.PROGRAMS, disabled: true },
  ];
  lastTab = SearchTypeTabs.BIBLE;
  activeTab = new FormControl<SearchTypeTabs>(SearchTypeTabs.BIBLE);

  changePath$ = this.actions$.pipe(
    ofType(BibleActions.changePath),
    tap(() => {
      this.searchOverlay().hide();
    })
  );

  readonly SearchTypeTabs = SearchTypeTabs;

  constructor() {
    this.changePath$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  ngOnInit(): void {
    combineLatest([
      this.activeTab.valueChanges.pipe(startWith(this.lastTab)),
      this.searchControl.valueChanges.pipe(
        distinctUntilChanged(),
        filterEmpty()
      ),
    ])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        debounceTime(500),
        switchMap(([tab, value]) => {
          if (tab === SearchTypeTabs.BIBLE) {
            return this.bibleSearchSrv.search(value);
          }
          if (tab === SearchTypeTabs.SONGS) {
            return this.songSearchSrv.search(value);
          }

          return of(null);
        })
      )
      .subscribe();
  }

  ngAfterViewInit(): void {}

  onKeydown(event: KeyboardEvent): void {
    event.stopPropagation();

    if (event.key === 'Escape') {
      this.searchOverlay().hide();
    }
  }

  onClickInput(event: MouseEvent): void {
    this.searchOverlay().show(event);
  }

  onSelectTab(tab: SelectButtonChangeEvent) {
    if (!tab.value) {
      this.activeTab.setValue(this.lastTab);
      return;
    }

    this.lastTab = tab.value;
    this.activeTab.setValue(tab.value);
  }
}
