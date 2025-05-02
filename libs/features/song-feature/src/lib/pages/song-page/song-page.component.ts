import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { PrimeTemplate } from 'primeng/api';

import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  filter,
  fromEvent,
  map,
  Observable,
  of,
  shareReplay,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { HighlighterPipe, PageContainerComponent } from '@lyri-cast/ui-lib';
import { AsyncPipe } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  IShortSong,
  ISong,
  ISongBookName,
  LyricForCasting,
  LyricLine,
} from '@lyri-cast/entities';
import { filterEmpty, snapshot } from '@lyri-cast/common';
import { DropdownModule } from 'primeng/dropdown';
import { ListboxModule } from 'primeng/listbox';
import { CastingService } from '../../services/casting.service';
import { InputTextModule } from 'primeng/inputtext';
import {
  SongPageSelectService,
  SPLIT_PARTS_COUNT,
  SplitPartsCount,
} from './song-page-select.service';
import { Store } from '@ngrx/store';
import {
  selectSelectedBook,
  SONG_ACTIONS,
  SongActions,
} from '@lyri-cast/song-store';
import { SongComponent } from '../../components';
import {
  IUiLyriItemInList,
  IUiLyriListItem,
  ListBoxComponent,
  ListBoxTemplates,
} from '@lyri-cast/form';
import { CheckboxModule } from 'primeng/checkbox';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PAGE_CONTAINER_TEMPLATES, Pages } from '@lyri-cast/common-browser';
import { SongsApiService } from '@lyri-cast/data-access-songs';
import { Actions, ofType } from '@ngrx/effects';
import { SongSidebarComponent } from '../../components/song-sidebar/song-sidebar.component';
import { Router } from '@angular/router';

export const SplitPartsCountMapVm: Record<SplitPartsCount, string> = {
  [SPLIT_PARTS_COUNT.NONE]: 'Нет',
  [SPLIT_PARTS_COUNT.TWO]: '2',
  [SPLIT_PARTS_COUNT.THREE]: '3',
  [SPLIT_PARTS_COUNT.FOUR]: '4',
};

@Component({
  selector: 'lyri-song-page-new',
  standalone: true,
  imports: [
    PrimeTemplate,
    AsyncPipe,
    ReactiveFormsModule,
    DropdownModule,
    ListboxModule,
    ListBoxComponent,
    SongComponent,
    HighlighterPipe,
    InputTextModule,
    FormsModule,
    PageContainerComponent,
    CheckboxModule,
    SongSidebarComponent,
  ],
  templateUrl: './song-page.component.html',
  styleUrl: './song-page.component.scss',
  providers: [SongPageSelectService],
})
export class SongPageComponent implements OnInit, AfterViewInit {
  private songPageSelectSrv = inject(SongPageSelectService);
  private readonly songsApiService = inject(SongsApiService);
  private readonly castingSrv = inject(CastingService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);

  splitCount = signal<SplitPartsCount>(SPLIT_PARTS_COUNT.NONE);
  // chorusAfterCouplet = signal(true);

  songBooksDict: IUiLyriListItem<ISongBookName>[] = [];

  isLoading = signal(false);

  songBooks$ = this.songsApiService.getAllSongBooks();

  selectedBook$ = this.store.select(selectSelectedBook);

  songBooksDict$: Observable<IUiLyriListItem<ISongBookName>[]> =
    this.songBooks$.pipe(
      map((data) =>
        data.map((el) => {
          return {
            title: el.humanName,
            searchKey: el.fileKey,
            baseEntity: el,
          };
        })
      )
    );

  selectedBook = new FormControl<IUiLyriListItem<ISongBookName> | null>(null);
  songControl = new FormControl<IUiLyriListItem<IShortSong> | null>(null);

  currentSongsList$ = new BehaviorSubject<IUiLyriItemInList<IShortSong>[]>([]);

  firstLoad = false;

  songsList$: Observable<IUiLyriItemInList<IShortSong>[]> =
    this.selectedBook.valueChanges.pipe(
      filterEmpty(),
      switchMap((value) => {
        this.isLoading.set(true);
        return this.songsApiService.getAllSongsByBook(value.baseEntity);
      }),
      map((data) => {
        return data.map((el) => {
          return {
            title: el.title,
            searchKey: String(el.number),
            baseEntity: el,
          };
        });
      }),
      tap((songs) => {
        this.currentSongsList$.next(songs);
        this.isLoading.set(false);
        if (!this.firstLoad) {
          this.firstLoad = true;
          this.songControl.setValue(songs[0]);
        }
      }),
      shareReplay(1)
    );

  selectedSong$ = new BehaviorSubject<ISong | null>(null);
  _selectedSong$: Observable<ISong | null> = this.songControl.valueChanges.pipe(
    switchMap((data) => {
      console.log('chang song control');
      this.isLoading.set(true);
      const selectedBook = this.selectedBook.value;
      if (!selectedBook) {
        throw new Error('Не выбран справочник');
      }

      if (!data) {
        this.songPageSelectSrv.selectSong(null);
        return of(null);
      }
      return this.songsApiService.getSong(
        selectedBook.baseEntity,
        data.baseEntity.number
      );
    }),
    tap(() => {
      this.isLoading.set(false);
    })
    // filterEmpty(), //почему-то даже в случае возвращения switchMapом null,
    // в data лежит предыдущий объект, можно пофиксить в рамках рефакторинга
  );

  // changeChorusAfterCouplet$ = toObservable(this.chorusAfterCouplet);

  selectBookInStore$ = this.actions$.pipe(ofType(SongActions.selectBook));
  slideNavigateInStore$ = this.actions$.pipe(ofType(SongActions.slideNavigate));

  selectSongByNumber$ = this.actions$.pipe(
    ofType(SongActions.selectSongByNumber),
    switchMap((payload) => {
      return combineLatest([
        of(payload.data.number),
        this.currentSongsList$.asObservable(),
      ]);
    }),
    map(([number, songs]) => {
      const song = songs.find((el) => el.baseEntity.number === number);
      if (!song) {
        return { type: SONG_ACTIONS.selectSong };
      }

      if (
        song.baseEntity.bookName.fileKey !== this.selectedBook.value?.searchKey
      ) {
        return { type: SONG_ACTIONS.selectSong };
      }

      this.songControl.setValue(song);

      return { type: SONG_ACTIONS.selectSong };
    })
  );

  ngOnInit() {
    fromEvent<KeyboardEvent>(window /*this.elRef.nativeElement*/, 'keydown')
      .pipe(
        debounceTime(100),
        filter(() => this.isActivePage())
      )
      .subscribe((event: KeyboardEvent) => {
        const selectedLyric = this.songPageSelectSrv.selectedLyric();
        if (selectedLyric) {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            this.onNavigateSlide(event.key === 'ArrowDown' ? 'next' : 'prev');
          }

          if (event.key === 'Enter') {
            this.onStartCasting(true);
          }

          if (event.key === 'Escape') {
            this.onPauseCasting();
          }
        }
      });

    this._selectedSong$
      .pipe(takeUntilDestroyed(this.destroyRef), filterEmpty())
      .subscribe((newSong) => {
        ///////// todo сделать отдельной функцией
        this.songPageSelectSrv.selectSong(newSong);

        this.store.dispatch(SongActions.pauseCasting());

        const splitCount =
          newSong.lyrics[0]?.splitLinesCount || SPLIT_PARTS_COUNT.NONE;
        this.splitCount.set(splitCount);
        this.songPageSelectSrv.setSplitCountValue(splitCount);
        this.selectedSong$.next(newSong);

        if (this.selectedBook.value) {
          this.store.dispatch(
            SongActions.selectSong({
              song: newSong,
              bookName: this.selectedBook.value.baseEntity,
            })
          );
        }

        this.cdr.detectChanges();
      });

    this.selectedBook$
      .pipe(takeUntilDestroyed(this.destroyRef), filterEmpty())
      .subscribe((book) => {
        this.selectedBook.setValue(
          {
            title: book.humanName,
            searchKey: book.fileKey,
            baseEntity: book,
          },
          { emitEvent: false }
        );
      });

    this.selectBookInStore$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload) => {
        const book: IUiLyriListItem<ISongBookName> | undefined =
          this.songBooksDict.find((el) => el.searchKey === payload.fileKey);
        if (!book) {
          return;
        }
        this.selectedBook.setValue(book);
      });

    // не удалять, это для эффекта
    this.selectSongByNumber$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();

    this.slideNavigateInStore$
      .pipe(takeUntilDestroyed(this.destroyRef), filterEmpty())
      .subscribe((data) => {
        if (!data.fromService) {
          return;
        }
        const line = data.currentLyric.lines.find(
          (el) => el.globalSongIndex === (data?.index ?? 0)
        );

        console.log('from hist', line, data);
        if (!line) {
          return;
        }
        this.onSelectLyricLine([data.currentLyric, line, false]);
      });
  }

  ngAfterViewInit() {
    this.songBooksDict$.pipe(take(1)).subscribe((data) => {
      this.songBooksDict = [...data];
      const book = data.find((el) => el.searchKey.includes('pesn'));
      if (!book) {
        return;
      }
      this.selectedBook.setValue(book);
    });
  }

  isActivePage(): boolean {
    return this.router.isActive(
      [Pages.MAIN, Pages.SONGS_FEATURE, Pages.SONGS].join('/'),
      {
        paths: 'exact',
        queryParams: 'exact',
        fragment: 'ignored',
        matrixParams: 'ignored',
      }
    );
  }

  onStartCasting(fromSelectedBlock = false): void {
    const payload =
      this.songPageSelectSrv.getStartCastingPayload(fromSelectedBlock);
    if (!payload) {
      return;
    }

    this.castingSrv.openCastingPageHandler(payload);

    // this.onNavigateSlide('next');
  }

  onPauseCasting(): void {
    this.castingSrv.pauseCasting();
  }

  onSelectLyricLine([lyric, line, startPresentation]: [
    LyricForCasting,
    LyricLine,
    boolean
  ]): void {
    this.songPageSelectSrv.showPreview(true, lyric, line);

    const paused = snapshot(this.castingSrv.castingPaused$);

    if (startPresentation) {
      this.onStartCasting(true);
    } else if (!paused) {
      this.onNavigateSlide('next', line.globalSongIndex);
    }
  }

  onSelectSplitValue(value: SplitPartsCount) {
    this.songPageSelectSrv.setSplitCountValue(value);
  }

  onNavigateSlide(dir: 'prev' | 'next', index?: number) {
    const navigatePayload = this.songPageSelectSrv.getNavigatePayload(
      dir,
      index
    );
    if (!navigatePayload) {
      console.log('Cancel navigate payload', dir);
      return;
    }
    this.castingSrv.navigateSlide(navigatePayload);
  }

  protected readonly ListBoxTemplates = ListBoxTemplates;
  protected readonly SplitPartsCountOptions = (
    Object.keys(SPLIT_PARTS_COUNT) as Array<keyof typeof SPLIT_PARTS_COUNT>
  ).map((key) => {
    const value = SPLIT_PARTS_COUNT[key];
    const label =
      value === SPLIT_PARTS_COUNT.NONE
        ? 'Не делить'
        : SplitPartsCountMapVm[value];
    return { label, value };
  });
  protected readonly Pages = Pages;
  protected readonly PAGE_CONTAINER_TEMPLATES = PAGE_CONTAINER_TEMPLATES;
}
