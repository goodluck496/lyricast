import {
  AfterViewInit,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InputText, InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SongSearchService } from '../song-search.service';
import { BibleSearchService } from '../bible-search.service';
import { BibleSearchResultComponent } from '../components/bible-search-result/bible-search-result.component';
import { SongSearchResultComponent } from '../components/song-search-result/song-search-result.component';
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  fromEvent,
  map,
  Observable,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Actions, ofType } from '@ngrx/effects';
import { BibleActions } from '@lyri-cast/bible-store';
import { SelectModule } from 'primeng/select';
import { Popover, PopoverModule } from 'primeng/popover';
import { InputIconModule } from 'primeng/inputicon';
import { BibleTranslateShort, ISongBookName } from '@lyri-cast/entities';
import { IUiLyriItemInList, IUiLyriListItem } from '@lyri-cast/form';
import { NavigationStart, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { SongActions } from '@lyri-cast/song-store';
import { Pages } from '@lyri-cast/common-browser';
import { IconFieldModule } from 'primeng/iconfield';

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
    SelectButtonModule,
    FormsModule,
    BibleSearchResultComponent,
    SongSearchResultComponent,
    IconFieldModule,
    InputIconModule,
    SelectModule,
    PopoverModule,
  ],
  templateUrl: './search-feature.component.html',
  styleUrl: './search-feature.component.scss',
  providers: [BibleSearchService, SongSearchService],
})
export class SearchFeatureComponent implements OnInit, AfterViewInit {
  destroyRef = inject(DestroyRef);
  router = inject(Router);

  store = inject(Store);

  bibleSearchSrv = inject(BibleSearchService);
  songSearchSrv = inject(SongSearchService);

  actions$ = inject(Actions);

  defaultTab = input<SearchTypeTabs>(SearchTypeTabs.BIBLE);

  input = viewChild.required(InputText);
  searchOverlay = viewChild.required('searchOverlay', { read: Popover });

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

  updateSearchResult$ = new BehaviorSubject<void>(void 0);

  selectedSongBook: IUiLyriItemInList<ISongBookName> | null = null;
  songBooks$: Observable<IUiLyriItemInList<ISongBookName>[]> =
    this.songSearchSrv.apiSrv.getAllSongBooks().pipe(
      map((data) => [
        {
          title: 'Все сборники',
          searchKey: 'all',
          baseEntity: {
            fileKey: 'all',
            humanName: 'all',
          },
        },
        ...data.map(
          (el) =>
            ({
              title: el.humanName,
              searchKey: el.fileKey,
              baseEntity: el,
            } as IUiLyriItemInList<ISongBookName>)
        ),
      ]),
      tap((data) => {
        const all = data.find((el) =>
          el.searchKey.toLowerCase().includes('all')
        );
        if (all) {
          this.selectedSongBook = all;
          this.songSearchSrv.isLoading.set(false);
        }
      })
    );

  readonly SearchTypeTabs = SearchTypeTabs;

  selectedTranslate: IUiLyriListItem<BibleTranslateShort> | null = null;
  bibleTranslates$: Observable<IUiLyriListItem<BibleTranslateShort>[]> =
    this.bibleSearchSrv.apiSrv.getTranslates().pipe(
      map((data) =>
        data.map(
          (el) =>
            ({
              title: el.title || el.sourceTitle,
              searchKey: el.keyForSearch,
              baseEntity: el,
            } satisfies IUiLyriListItem<BibleTranslateShort>)
        )
      ),
      tap((data) => {
        const synodalTranslate = data.find((el) =>
          el.searchKey.toLowerCase().includes('rst')
        );
        if (synodalTranslate) {
          this.selectedTranslate = synodalTranslate;

          this.store.dispatch(
            BibleActions.selectTranslate({
              translate: synodalTranslate.baseEntity,
            })
          );
        }
      })
    );

  constructor() {
    let first = true;
    effect(() => {
      const tab = this.defaultTab();
      if (first) {
        this.onSelectTab({ value: tab });
        first = false;
      }
    });

    this.changePath$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe();

    this.router.events
      .pipe(
        takeUntilDestroyed(),
        filter((e) => e instanceof NavigationStart)
      )
      .subscribe(() => {
        this.searchOverlay().hide();
      });
  }

  ngOnInit(): void {
    combineLatest([
      this.updateSearchResult$.asObservable(),
      this.activeTab.valueChanges.pipe(startWith(this.lastTab)),
      this.searchControl.valueChanges.pipe(
        distinctUntilChanged(),
        map(el => el || '')
      ),
    ])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        debounceTime(500),
        switchMap(([_, tab, value]) => {
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

  ngAfterViewInit(): void {
    fromEvent<KeyboardEvent>(window, 'keydown')
      .pipe(filter((event) => event.ctrlKey && event.code === 'KeyF'))
      .subscribe((event) => {
        this.focusSearchInput();
        this.searchOverlay().show(event, this.input().el.nativeElement);
      });
  }

  private focusSearchInput(): void {
    const inputEl = this.input().el.nativeElement;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        inputEl.focus();
      });
    });

    setTimeout(() => inputEl.focus(), 0);
    setTimeout(() => inputEl.focus(), 50);
  }

  onKeydown(event: KeyboardEvent): void {
    event.stopPropagation();

    if (event.key === 'Escape') {
      this.searchOverlay().hide();
      this.input().el.nativeElement.blur();
    }
  }

  onClickInput(event: MouseEvent): void {
    event.stopPropagation();

    if (this.searchOverlay().overlayVisible) {
      return;
    }

    const isBiblePath = this.router.isActive(
      [Pages.MAIN, Pages.BIBLE_FEATURE, Pages.BIBLE].join('/'),
      {
        paths: 'exact',
        queryParams: 'exact',
        fragment: 'ignored',
        matrixParams: 'ignored',
      }
    );
    const isSongPath = this.router.isActive(
      [Pages.MAIN, Pages.SONGS_FEATURE, Pages.SONGS].join('/'),
      {
        paths: 'exact',
        queryParams: 'exact',
        fragment: 'ignored',
        matrixParams: 'ignored',
      }
    );

    if (isBiblePath) {
      this.activeTab.setValue(SearchTypeTabs.BIBLE);
    } else if (isSongPath) {
      this.activeTab.setValue(SearchTypeTabs.SONGS);
    } else {
      return;
    }

    this.searchOverlay().show(event, this.input().el.nativeElement);
    this.focusSearchInput();
  }

  onOverlayShow(): void {
    this.focusSearchInput();
  }

  onSelectTab(tab: any) {
    if (!tab.value) {
      this.activeTab.setValue(this.lastTab);
      return;
    }

    this.lastTab = tab.value;
    this.activeTab.setValue(tab.value);
  }

  onTranslateSelect(translate: IUiLyriItemInList<BibleTranslateShort>) {
    this.bibleSearchSrv.isLoading.set(true);
    this.store.dispatch(
      BibleActions.selectTranslate({
        translate: translate.baseEntity,
      })
    );
  }

  onSongBookSelect(book: IUiLyriItemInList<ISongBookName>) {
    this.songSearchSrv.isLoading.set(true);

    if (book.searchKey === 'all') {
      this.songSearchSrv.isSelectBookForSearch = false;

      this.updateSearchResult$.next();
      return;
    }

    this.songSearchSrv.isSelectBookForSearch = true;

    this.store.dispatch(
      SongActions.selectBook({
        fileKey: book.searchKey,
        humanName: book.title,
      })
    );
    this.updateSearchResult$.next();
  }
}
