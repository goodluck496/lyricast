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
  catchError,
  debounceTime,
  filter,
  fromEvent,
  map,
  Observable,
  of,
  shareReplay,
  startWith,
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
import { SelectModule } from 'primeng/select';
import { ListboxModule } from 'primeng/listbox';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';
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
  SongActions,
  SongActionsEnum,
} from '@lyri-cast/song-store';
import { SongComponent } from '../../components';
import {
  IUiLyriItemInList,
  IUiLyriListItem,
  ListBoxComponent,
  ListBoxTemplates,
} from '@lyri-cast/form';
import { CheckboxModule } from 'primeng/checkbox';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  OnboardingHelpService,
  CastingAppearanceService,
  DEFAULT_CASTING_APPEARANCE,
  PAGE_CONTAINER_TEMPLATES,
  Pages,
} from '@lyri-cast/common-browser';
import { SongsApiService } from '@lyri-cast/data-access-songs';
import { Actions, ofType } from '@ngrx/effects';
import { SongSidebarComponent } from '../../components/song-sidebar/song-sidebar.component';
import { Router } from '@angular/router';
import { TourAnchorPrimeNgDirective, TourPrimeNgModule } from 'ngx-ui-tour-primeng';
import { SongOnboardingService } from '../../services/song-onboarding.service';
import { SongDisplaySettingsService } from '../../services/song-display-settings.service';
import { SongUsageTrackingService } from '../../services/song-usage-tracking.service';
import { SongTextLayoutService } from '../../services/song-text-layout.service';
import { SongOverrideService } from '../../services/song-override.service';
import {
  SongUsageApiService,
  SongUsageSummaryDto,
} from '@lyri-cast/data-access-song-usage';

export const SplitPartsCountMapVm: Record<SplitPartsCount, string> = {
  [SPLIT_PARTS_COUNT.NONE]: 'Нет',
  [SPLIT_PARTS_COUNT.TWO]: '2',
  [SPLIT_PARTS_COUNT.THREE]: '3',
  [SPLIT_PARTS_COUNT.FOUR]: '4',
};

type SongListMode = 'book' | 'frequent' | 'recent';

interface SongListItem extends IUiLyriItemInList<IShortSong> {
  usageSummary?: SongUsageSummaryDto;
}

@Component({
  selector: 'lyri-song-page-new',
  standalone: true,
  imports: [
    PrimeTemplate,
    AsyncPipe,
    ReactiveFormsModule,
    SelectModule,
    TooltipModule,
    ListboxModule,
    ListBoxComponent,
    SongComponent,
    ButtonModule,
    HighlighterPipe,
    InputTextModule,
    FormsModule,
    PageContainerComponent,
    CheckboxModule,
    SongSidebarComponent,
    TourAnchorPrimeNgDirective,
    TourPrimeNgModule,
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
  private readonly onboardingHelpService = inject(OnboardingHelpService);
  private readonly songOnboarding = inject(SongOnboardingService);
  private readonly appearanceService = inject(CastingAppearanceService);
  private readonly songDisplaySettings = inject(SongDisplaySettingsService);
  private readonly songUsageTracking = inject(SongUsageTrackingService);
  private readonly songUsageApi = inject(SongUsageApiService);
  private readonly songTextLayout = inject(SongTextLayoutService);
  private readonly songOverrideService = inject(SongOverrideService);
  private readonly appearance$ = toObservable(this.appearanceService.appearance);
  private readonly fitTextAutoWrapEnabled$ = toObservable(
    this.songTextLayout.fitTextAutoWrapEnabled
  );

  splitCount = signal<SplitPartsCount>(SPLIT_PARTS_COUNT.NONE);
  hasOverride = signal<boolean>(false);
  overriddenSongNumbers = signal<Set<number>>(new Set());
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
  songListMode = new FormControl<SongListMode>('book', { nonNullable: true });

  currentSongsList$ = new BehaviorSubject<SongListItem[]>([]);
  usageSummaries$ = new BehaviorSubject<SongUsageSummaryDto[]>([]);

  firstLoad = false;
  private suppressSongAppearanceSave = false;
  private pendingAutoStartCasting:
    | { number: number; bookKey: string }
    | null = null;

  songsList$: Observable<SongListItem[]> = combineLatest([
    this.currentSongsList$,
    this.usageSummaries$,
    this.songListMode.valueChanges.pipe(startWith(this.songListMode.value)),
  ]).pipe(
    map(([songs, summaries, mode]) => {
      const enrichedSongs = this.mergeUsageSummaries(songs, summaries);
      return this.applySongListMode(enrichedSongs, mode);
    }),
    tap((songs) => {
      const selected = this.songControl.value;
      if (selected && !songs.some((song) => song.searchKey === selected.searchKey)) {
        this.songControl.setValue(songs[0] ?? null);
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
        this.hasOverride.set(false);
        this.songPageSelectSrv.selectSong(null);
        return of(null);
      }
      return this.songsApiService
        .getSong(selectedBook.baseEntity, data.baseEntity.number)
        .pipe(
          switchMap((song) => {
            if (!song) {
              this.hasOverride.set(false);
              return of(null);
            }
            const songWithBook: ISong = {
              ...song,
              bookName: song.bookName || selectedBook.baseEntity,
            };
            return this.songOverrideService
              .getOverride(selectedBook.searchKey, songWithBook.number)
              .pipe(
                map((overrideLyrics) => {
                  if (overrideLyrics && overrideLyrics.length > 0) {
                    this.hasOverride.set(true);
                    return {
                      ...songWithBook,
                      lyrics: overrideLyrics,
                    };
                  }
                  this.hasOverride.set(false);
                  return songWithBook;
                }),
                catchError(() => {
                  this.hasOverride.set(false);
                  return of(songWithBook);
                })
              );
          })
        );
    }),
    tap(() => {
      this.isLoading.set(false);
    })
    // filterEmpty(), //почему-то даже в случае возвращения switchMapом null,
    // в data лежит предыдущий объект, можно пофиксить в рамках рефакторинга
  );

  // changeChorusAfterCouplet$ = toObservable(this.chorusAfterCouplet);

  selectBookInStore$ = this.actions$.pipe(
    ofType(SongActions[SongActionsEnum.selectBook])
  );
  slideNavigateInStore$ = this.actions$.pipe(
    ofType(SongActions[SongActionsEnum.slideNavigate])
  );

  selectSongByNumber$ = this.actions$.pipe(
    ofType(SongActions[SongActionsEnum.selectSongByNumber]),
    switchMap((payload) =>
      combineLatest([
        of(payload.data),
        this.currentSongsList$.asObservable(),
        this.selectedBook.valueChanges.pipe(startWith(this.selectedBook.value)),
      ]).pipe(
        filter(([data, songs, selectedBook]) => {
          if (!selectedBook) {
            return false;
          }

          if (data.bookKey && selectedBook.searchKey !== data.bookKey) {
            return false;
          }

          return songs.some((song) => song.baseEntity.number === data.number);
        }),
        take(1)
      )
    ),
    map(([data, songs, selectedBook]) => {
      const number = data.number;
      const song = songs.find((el) => el.baseEntity.number === number);
      if (!song) {
        return { type: SongActionsEnum.selectSong };
      }

      if (!selectedBook) {
        return { type: SongActionsEnum.selectSong };
      }

      if (song.baseEntity.bookName.fileKey !== selectedBook.searchKey) {
        return { type: SongActionsEnum.selectSong };
      }

      this.songControl.setValue(song);

      return { type: SongActionsEnum.selectSong };
    })
  );

  ngOnInit() {
    this.songUsageTracking.connect();
    this.refreshUsageSummaries();

    this.onboardingHelpService.helpRequested$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((context) => {
        if (context !== 'songs') {
          return;
        }

        if (!this.isActivePage()) {
          return;
        }

        this.songOnboarding.start();
      });

    this.selectedBook.valueChanges
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        startWith(this.selectedBook.value),
        filterEmpty()
      )
      .subscribe(() => {
        if (!this.isActivePage()) {
          return;
        }

        this.songOnboarding.tryNext('songs:dict');
      });

    this.selectedBook.valueChanges
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        startWith(this.selectedBook.value),
        filterEmpty(),
        switchMap((book) =>
          this.songOverrideService
            .getBookOverrides(book.searchKey)
            .pipe(catchError(() => of([])))
        )
      )
      .subscribe((overrides) => {
        this.overriddenSongNumbers.set(new Set(overrides));
      });

    this.selectedBook.valueChanges
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        startWith(this.selectedBook.value),
        filterEmpty(),
        tap(() => this.isLoading.set(true)),
        switchMap((value) =>
          this.songsApiService.getAllSongsByBook(value.baseEntity).pipe(
            catchError(() => of<IShortSong[]>([]))
          )
        ),
        map((songs) => this.buildSongList(songs, this.usageSummaries$.value))
      )
      .subscribe((songs) => {
        this.currentSongsList$.next(songs);
        this.isLoading.set(false);

        if (!songs.length) {
          this.songControl.setValue(null);
          return;
        }

        const selectedSong = this.songControl.value;
        const hasSelectedSong = !!selectedSong &&
          songs.some((song) => song.searchKey === selectedSong.searchKey);

        const pendingSong =
          this.pendingAutoStartCasting &&
          this.selectedBook.value?.searchKey === this.pendingAutoStartCasting.bookKey
            ? songs.find(
                (song) =>
                  song.baseEntity.number === this.pendingAutoStartCasting?.number
              ) ?? null
            : null;

        if (pendingSong) {
          this.songControl.setValue(pendingSong);
          return;
        }

        if (!hasSelectedSong) {
          this.songControl.setValue(songs[0]);
        }
      });

    this.selectedSong$
      .pipe(takeUntilDestroyed(this.destroyRef), filterEmpty())
      .subscribe(() => {
        if (!this.isActivePage()) {
          return;
        }

        queueMicrotask(() => {
          this.songOnboarding.goToOrRestart({
            fromAnchorId: 'songs:song',
            toAnchorId: 'songs:lyric-index-0',
          });
        });
      });

    combineLatest([
      this.selectedSong$.pipe(filterEmpty()),
      this.appearance$,
      this.fitTextAutoWrapEnabled$,
    ])
      .pipe(
        debounceTime(300),
        filter(() => !this.suppressSongAppearanceSave),
        switchMap(([song, appearance, fitTextAutoWrapEnabled]) =>
          this.songDisplaySettings
            .save(
              song,
              appearance,
              this.splitCount(),
              fitTextAutoWrapEnabled
            )
            .pipe(catchError(() => of(null)))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

    fromEvent<KeyboardEvent>(window /*this.elRef.nativeElement*/, 'keydown')
      .pipe(
        debounceTime(100),
        filter(() => this.isActivePage())
      )
      .subscribe((event: KeyboardEvent) => {
        if (event.target instanceof HTMLElement && event.target.isContentEditable) {
          return;
        }
        console.log('event',event);
        const selectedLyric = this.songPageSelectSrv.selectedLyric();
        if (selectedLyric) {
          if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(event.key)) {
            this.onNavigateSlide(event.key === 'ArrowDown' || event.key === 'PageDown' ? 'next' : 'prev');
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
        const splitCount =
          newSong.lyrics[0]?.splitLinesCount || SPLIT_PARTS_COUNT.NONE;
        
        this.splitCount.set(splitCount);
        this.songPageSelectSrv.setSplitCountValue(splitCount);

        ///////// todo сделать отдельной функцией
        this.songPageSelectSrv.selectSong(newSong);
        const firstLyric = this.songPageSelectSrv.selectedLyricsForCasting()[0];
        const firstLine = firstLyric?.lines[0];
        if (firstLyric && firstLine) {
          this.songPageSelectSrv.showPreview(true, firstLyric, firstLine);
        }

        this.store.dispatch(SongActions[SongActionsEnum.pauseCasting]());

        this.selectedSong$.next(newSong);

        this.suppressSongAppearanceSave = true;
        this.songDisplaySettings.restore(newSong).pipe(take(1)).subscribe({
          next: (settings) => {
            if (!settings) {
              this.appearanceService.set(DEFAULT_CASTING_APPEARANCE);
              this.songTextLayout.setFitTextAutoWrapEnabled(false);
              this.suppressSongAppearanceSave = false;
            } else {
              this.appearanceService.set(settings.appearance);

              if (typeof settings.splitPartsCount === 'number') {
                this.splitCount.set(settings.splitPartsCount);
                this.songPageSelectSrv.setSplitCountValue(
                  settings.splitPartsCount
                );
              }

              this.songTextLayout.setFitTextAutoWrapEnabled(
                settings.fitTextAutoWrapEnabled
              );

              this.suppressSongAppearanceSave = false;
            }

            if (
              this.pendingAutoStartCasting?.bookKey ===
                newSong.bookName.fileKey &&
              this.pendingAutoStartCasting.number === newSong.number &&
              firstLyric &&
              firstLine
            ) {
              this.pendingAutoStartCasting = null;
              this.onStartCasting(true);
            }
          },
          error: () => {
            this.suppressSongAppearanceSave = false;
            return;
          },
        });

        if (this.selectedBook.value) {
          this.store.dispatch(
            SongActions[SongActionsEnum.selectSong]({
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
        const nextBook =
          this.songBooksDict.find((item) => item.searchKey === book.fileKey) ?? {
            title: book.humanName,
            searchKey: book.fileKey,
            baseEntity: book,
          };

        const currentBook = this.selectedBook.value;
        if (currentBook?.searchKey === nextBook.searchKey) {
          if (currentBook !== nextBook) {
            this.selectedBook.setValue(nextBook, { emitEvent: false });
          }
          return;
        }

        this.selectedBook.setValue(nextBook);
      });

    this.actions$
      .pipe(
        ofType(SongActions[SongActionsEnum.requestAutoStartCasting]),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ data }) => {
        this.pendingAutoStartCasting = data;
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

    this.actions$
      .pipe(
        ofType(
          SongActions[SongActionsEnum.pauseCasting],
          SongActions[SongActionsEnum.stopCasting]
        ),
        debounceTime(300),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.refreshUsageSummaries());

    this.slideNavigateInStore$
      .pipe(takeUntilDestroyed(this.destroyRef), filterEmpty())
      .subscribe((data) => {
        if (!data.fromService) {
          return;
        }

        const index = data.index ?? 0;
        const lyrics = this.songPageSelectSrv.selectedLyricsForCasting();
        const allLines = lyrics.map((el) => el.lines).flat();

        const line = allLines.find((el) => el.globalSongIndex === index);
        const lyric = lyrics.find((el) =>
          el.lines.some((el1) => el1.globalSongIndex === index)
        );

        if (!lyric || !line) {
          return;
        }

        this.onSelectLyricLine([lyric, line, false]);
      });
  }

  ngAfterViewInit() {
    this.songBooksDict$.pipe(take(1)).subscribe((data) => {
      if (!Array.isArray(data) || data.length === 0) {
        // Clear route cache to ensure dictionaries page loads every time
        const reuseStrategy = this.router.routeReuseStrategy as any;
        if (reuseStrategy && typeof reuseStrategy.clearByPathContains === 'function') {
          reuseStrategy.clearByPathContains(Pages.SONGS_FEATURE);
        }
        this.router.navigateByUrl(['/', Pages.MAIN, 'dictionaries'].join('/'));
        return;
      }
      this.songBooksDict = [...data];
      const selectedBook = this.selectedBook.value;
      if (selectedBook) {
        const matchedBook = data.find(
          (item) => item.searchKey === selectedBook.searchKey
        );
        if (matchedBook && matchedBook !== selectedBook) {
          this.selectedBook.setValue(matchedBook, { emitEvent: false });
        }
      }
      const book =
        this.selectedBook.value ??
        data.find((el) => el.searchKey.includes('pesn')) ??
        data[0];
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

    this.castingSrv.openCastingPageHandler({
      ...payload,
      appearance: this.appearanceService.appearance(),
    });

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

    if (this.isActivePage()) {
      this.songOnboarding.tryNext('songs:lyric');
    }
  }

  onSelectSplitValue(value: SplitPartsCount) {
    this.splitCount.set(value);
    this.songPageSelectSrv.setSplitCountValue(value);
    this.saveCurrentSongDisplaySettings();
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
  protected readonly SongListModeOptions: Array<{
    label: string;
    value: SongListMode;
  }> = [
    { label: 'Все', value: 'book' },
    { label: 'Часто', value: 'frequent' },
    { label: 'Недавно', value: 'recent' },
  ];
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

  protected getUsageDate(item: SongListItem): string {
    const summary = item.usageSummary;
    if (!summary?.lastUsedAt) {
      return '';
    }

    return this.formatUsageDate(summary.lastUsedAt);
  }

  protected getUsageTooltip(item: SongListItem): string {
    const summary = item.usageSummary;
    if (!summary?.lastUsedAt) {
      return '';
    }

    return `Последнее исполнение: ${this.formatUsageDate(summary.lastUsedAt)}\nВсего пели: ${summary.useCount}`;
  }

  private formatUsageDate(value: string): string {
    return new Date(value).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  }

  private refreshUsageSummaries(): void {
    this.songUsageApi
      .getSummaries()
      .pipe(take(1), catchError(() => of([])))
      .subscribe((summaries) => this.usageSummaries$.next(summaries));
  }

  private saveCurrentSongDisplaySettings(): void {
    const song = this.selectedSong$.value;
    if (!song) {
      return;
    }

    this.songDisplaySettings
      .save(
        song,
        this.appearanceService.appearance(),
        this.splitCount(),
        this.songTextLayout.fitTextAutoWrapEnabled()
      )
      .pipe(take(1), catchError(() => of(null)))
      .subscribe();
  }

  private buildSongList(
    songs: IShortSong[],
    summaries: SongUsageSummaryDto[]
  ): SongListItem[] {
    return this.mergeUsageSummaries(
      songs.map((el) => ({
        title: el.title,
        searchKey: String(el.number),
        baseEntity: el,
      })),
      summaries
    );
  }

  private mergeUsageSummaries(
    songs: SongListItem[],
    summaries: SongUsageSummaryDto[]
  ): SongListItem[] {
    const summariesMap = new Map(
      summaries.map((summary) => [this.getSummaryKey(summary), summary])
    );

    return songs.map((song) => ({
      ...song,
      usageSummary: summariesMap.get(this.getSongKey(song.baseEntity)),
    }));
  }

  private applySongListMode(
    songs: SongListItem[],
    mode: SongListMode
  ): SongListItem[] {
    if (mode === 'book') {
      return songs;
    }

    const usedSongs = songs.filter((song) => !!song.usageSummary);
    if (mode === 'frequent') {
      return usedSongs.sort((a, b) => {
        const countDiff =
          (b.usageSummary?.useCount ?? 0) - (a.usageSummary?.useCount ?? 0);
        return countDiff || this.compareLastUsedDesc(a, b);
      });
    }

    return usedSongs.sort((a, b) => this.compareLastUsedDesc(a, b));
  }

  private compareLastUsedDesc(a: SongListItem, b: SongListItem): number {
    return (
      this.getLastUsedTime(b.usageSummary) -
      this.getLastUsedTime(a.usageSummary)
    );
  }

  private getLastUsedTime(summary?: SongUsageSummaryDto): number {
    return summary?.lastUsedAt ? new Date(summary.lastUsedAt).getTime() : 0;
  }

  private getSongKey(song: IShortSong): string {
    return `${song.bookName.fileKey}:${song.number}`;
  }

  private getSummaryKey(summary: SongUsageSummaryDto): string {
    return `${summary.songBookKey}:${summary.songNumber}`;
  }

  onSongUpdated(updatedSong: ISong): void {
    const book = this.selectedBook.value;
    if (!book) return;

    const bookKey = book.searchKey || updatedSong.bookName?.fileKey;
    const songWithBook: ISong = {
      ...updatedSong,
      bookName: updatedSong.bookName || book.baseEntity,
    };

    this.hasOverride.set(true);
    const set = new Set(this.overriddenSongNumbers());
    set.add(songWithBook.number);
    this.overriddenSongNumbers.set(set);
    this.selectedSong$.next(songWithBook);
    this.songPageSelectSrv.selectSong(songWithBook);

    this.store.dispatch(
      SongActions[SongActionsEnum.selectSong]({
        song: songWithBook,
        bookName: book.baseEntity,
      })
    );

    this.songOverrideService
      .saveOverride(songWithBook, songWithBook.lyrics, bookKey)
      .pipe(take(1), catchError(() => of(null)))
      .subscribe();
  }

  onResetSongOverride(song: ISong): void {
    const book = this.selectedBook.value;
    if (!book) return;

    this.songOverrideService
      .deleteOverride(book.searchKey, song.number)
      .pipe(
        take(1),
        catchError(() => of({ success: false })),
        switchMap(() =>
          this.songsApiService
            .getSong(book.baseEntity, song.number)
            .pipe(take(1), catchError(() => of(null)))
        )
      )
      .subscribe((originalSong) => {
        if (originalSong) {
          const songWithBook: ISong = {
            ...originalSong,
            bookName: originalSong.bookName || book.baseEntity,
          };
          this.hasOverride.set(false);
          const set = new Set(this.overriddenSongNumbers());
          set.delete(song.number);
          this.overriddenSongNumbers.set(set);
          this.selectedSong$.next(songWithBook);
          this.songPageSelectSrv.selectSong(songWithBook);
          this.store.dispatch(
            SongActions[SongActionsEnum.selectSong]({
              song: songWithBook,
              bookName: book.baseEntity,
            })
          );
        }
      });
  }
}
