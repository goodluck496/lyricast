import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BibleCastingPreviewComponent } from '../casting-preview';
import { NavigatorFeatureComponent } from '@lyri-cast/navigator-feature';
import {
  BibleActions,
  BibleSecondaryCastingContent,
  BibleSecondaryCastingLayout,
  BibleSecondaryDestination,
  BibleState,
  createBibleSecondaryTranslationCacheKey,
  selectCastingFrozen,
  selectCastingPaused,
  selectCastingProcess,
  selectCastingProcessNavigate,
  selectSecondaryTranslationCache,
  selectSecondaryTranslationSettings,
  selectSelectedBibleVerse,
  selectSelectedBook,
  selectSelectedChapterSections,
  selectSelectedSecondaryTranslationSections,
  selectSelectedTranslate,
  selectSelectedVersesRange,
} from '@lyri-cast/bible-store';
import { Store } from '@ngrx/store';
import {
  BehaviorSubject,
  combineLatest,
  firstValueFrom,
  map,
  Observable,
  of,
  switchMap,
  take,
  withLatestFrom,
} from 'rxjs';
import { filterEmpty, snapshot } from '@lyri-cast/common';
import {
  BibleBookShort,
  BibleChapterSection,
  BibleChapterShort,
  BibleTranslateShort,
  BibleVerseForCasting,
} from '@lyri-cast/entities';
import {
  AppActions,
  BridgeService,
  CastingAppearanceService,
  DEFAULT_CASTING_PAGE_CONFIG,
  Pages,
  selectOpenedWindow,
  SettingsService,
  SidebarService,
  WindowService,
} from '@lyri-cast/common-browser';
import { BibleSidebarData } from '../../types';
import { APP_COMMON_ACTIONS, AppWindowTypes } from '@lyri-cast/common-electron';
import { filter, skip } from 'rxjs/operators';
import { TourPrimeNgModule, TourService } from 'ngx-ui-tour-primeng';
import { BibleOnboardingService } from '../../services/bible-onboarding.service';
import { SplitButtonModule } from 'primeng/splitbutton';
import { MenuItem } from 'primeng/api';
import { CastingAppearanceControlsComponent } from '@lyri-cast/asset-management';
import { BibleApiService } from '@lyri-cast/data-access-bible';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { FormsModule } from '@angular/forms';
import { MatSliderModule } from '@angular/material/slider';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'lyri-bible-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    BibleCastingPreviewComponent,
    NavigatorFeatureComponent,
    TourPrimeNgModule,
    SplitButtonModule,
    CastingAppearanceControlsComponent,
    SelectModule,
    ToggleSwitchModule,
    TooltipModule,
    FormsModule,
    MatSliderModule,
  ],
  templateUrl: './bible-sidebar.component.html',
  styleUrl: './bible-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BibleSidebarComponent {
  isOpeningWindow = new BehaviorSubject<boolean>(false);
  layoutOptions: { label: string; value: BibleSecondaryCastingLayout }[] = [
    { label: 'Справа', value: 'right' },
    { label: 'Снизу', value: 'bottom' },
  ];

  private readonly store = inject<Store<BibleState>>(Store<BibleState>);
  openedCastingWindow$ = this.store
    .select(selectOpenedWindow)
    .pipe(map((e) => !!e));
  castingIsPaused$ = this.store.select(selectCastingPaused);
  castingIsFrozen$ = this.store.select(selectCastingFrozen);
  closeMenuItems$: Observable<MenuItem[]> = combineLatest([
    this.openedCastingWindow$,
    this.isOpeningWindow,
  ]).pipe(
    map(([isOpen, isOpening]) => [
      {
        label: isOpening ? 'Открываем...' : 'Открыть окно',
        icon: isOpening ? 'pi pi-spin pi-spinner' : 'pi pi-external-link',
        command: () => this.onOpenEmptyWindow(),
        disabled: isOpen || isOpening,
      },
      {
        label: 'Закрыть',
        icon: 'pi pi-times',
        command: () => this.onCloseCasting(),
        disabled: !isOpen || isOpening,
      },
    ])
  );
  sectionList$: Observable<BibleChapterSection[]> = this.store.select(
    selectSelectedChapterSections
  );
  selectedRange$ = this.store.select(selectSelectedVersesRange);
  secondarySettings$ = this.store.select(selectSecondaryTranslationSettings);
  secondaryCache$ = this.store.select(selectSecondaryTranslationCache);
  primaryTranslate$ = this.store.select(selectSelectedTranslate);
  private readonly sidebarService =
    inject<SidebarService<BibleSidebarData>>(SidebarService);
  private readonly bibleOnboarding = inject(BibleOnboardingService);
  private readonly tourService = inject(TourService);
  private readonly windowSrv = inject(WindowService);
  private readonly settingsSrv = inject(SettingsService);
  private readonly bridge = inject(BridgeService);
  private readonly destroyRef = inject(DestroyRef);
  readonly appearanceService = inject(CastingAppearanceService);
  readonly appearance = this.appearanceService.appearanceFor('bible');
  private readonly apiSrv = inject(BibleApiService);

  activePreviewTab: 'main' | 'secondary' = 'main';

  readonly activeChannels$ = this.settingsSrv
    .getChannelsObservable()
    .pipe(map((channels) => channels.filter((c) => c.enabled)));

  readonly isLive$ = combineLatest([
    this.castingIsPaused$,
    this.openedCastingWindow$,
  ]).pipe(map(([paused, opened]) => !paused && opened));

  readonly hasObsChannel$ = this.settingsSrv
    .getChannelsObservable()
    .pipe(
      map((channels) =>
        channels.some(
          (c) =>
            c.enabled &&
            (c.role === 'lower_third' || c.targetType === 'obs_web')
        )
      )
    );

  readonly hasNdiChannel$ = this.settingsSrv
    .getChannelsObservable()
    .pipe(
      map((channels) =>
        channels.some((c) => c.enabled && c.targetType === 'ndi')
      )
    );

  isBlackoutAll = false;

  onBlackoutAllToggle(enabled: boolean): void {
    this.isBlackoutAll = enabled;
    this.bridge.send('BLACKOUT_ALL' as any, { active: enabled });
  }

  onSecondaryDestinationChange(destination: BibleSecondaryDestination): void {
    this.store.dispatch(
      BibleActions.updateSecondaryTranslationSettings({ destination })
    );
  }

  secondaryTranslateOptions$ = combineLatest([
    this.apiSrv.getTranslates(),
    this.primaryTranslate$,
  ]).pipe(
    map(([translates, primaryTranslate]) =>
      translates
        .filter(
          (translate) =>
            translate.keyForSearch !== primaryTranslate?.keyForSearch
        )
        .map((translate) => ({
          label: translate.title || translate.sourceTitle,
          value: translate,
        }))
    )
  );

  constructor() {
    combineLatest([this.primaryTranslate$, this.secondarySettings$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([primaryTranslate, secondarySettings]) => {
        if (
          !primaryTranslate ||
          !secondarySettings.translate ||
          primaryTranslate.keyForSearch !==
            secondarySettings.translate.keyForSearch
        ) {
          return;
        }

        this.store.dispatch(
          BibleActions.updateSecondaryTranslationSettings({ translate: null })
        );
      });
  }

  onStartCasting() {
    this.store
      .select(selectSelectedBibleVerse)
      .pipe(
        take(1),
        filterEmpty(),
        withLatestFrom(
          this.sectionList$,
          this.sidebarService.data$,
          this.selectedRange$,
          this.secondarySettings$,
          this.secondaryCache$
        ),
        switchMap(
          ([
            verse,
            sections,
            sidebarData,
            range,
            secondarySettings,
            secondaryCache,
          ]) => {
            if (!sidebarData || !sidebarData.bibleForm) {
              return of(null);
            }

            const groupValue = sidebarData.bibleForm;

            if (!groupValue.book || !groupValue.chapter || !sections.length) {
              return of(null);
            }

            const fromNumber = range?.from ?? verse.number;
            const toNumber = range?.to ?? verse.number;
            const bookEntity = groupValue.book.baseEntity;
            const chapterEntity = groupValue.chapter.baseEntity;
            const content = this.createCastingContent(sections, bookEntity);
            const basePayload = {
              book: bookEntity,
              chapter: chapterEntity,
              fromIndex: fromNumber,
              range: range ? { from: fromNumber, to: toNumber } : undefined,
              appearance: this.appearanceService.appearanceFor('bible')(),
              content,
              secondarySettings,
            };

            return this.resolveSecondaryContent(
              secondarySettings.enabled,
              secondarySettings.translate,
              secondaryCache,
              bookEntity,
              chapterEntity
            ).pipe(
              map((secondaryContent) => ({
                ...basePayload,
                secondaryContent,
              }))
            );
          }
        ),
        filterEmpty()
      )
      .subscribe((payload) => {
        this.openedCastingWindow$.pipe(take(1)).subscribe((isOpen) => {
          if (!isOpen) {
            this.isOpeningWindow.next(true);
            setTimeout(() => this.isOpeningWindow.next(false), 1200);
          }
          this.store.dispatch(BibleActions.openCasting(payload));
        });
      });
  }

  onSecondaryEnabledChange(enabled: boolean): void {
    this.store.dispatch(
      BibleActions.updateSecondaryTranslationSettings({ enabled })
    );
  }

  onSecondaryTranslateChange(translate: BibleTranslateShort | null): void {
    this.store.dispatch(
      BibleActions.updateSecondaryTranslationSettings({ translate })
    );
  }

  onSecondaryLayoutChange(layout: BibleSecondaryCastingLayout): void {
    this.store.dispatch(
      BibleActions.updateSecondaryTranslationSettings({ layout })
    );
  }

  onSecondarySizeChange(sizePercent: number): void {
    this.store.dispatch(
      BibleActions.updateSecondaryTranslationSettings({ sizePercent })
    );
  }

  onStopCasting() {
    this.store.dispatch(BibleActions.stopCasting());
  }

  onPauseCasting() {
    if (this.canTourNext(this.tourService)) {
      this.tourService.next();
    }

    this.store.dispatch(BibleActions.pauseCasting());
  }

  onFreezeToggle(frozen: boolean): void {
    this.store.dispatch(BibleActions.setFreezeCasting({ frozen }));
  }

  onToggleFreeze(): void {
    const isFrozen = !!snapshot(this.castingIsFrozen$);
    this.onFreezeToggle(!isFrozen);
  }

  onCloseCasting() {
    this.store.dispatch(
      AppActions.closeWindow({
        windowType: AppWindowTypes.CASTING,
      })
    );
  }

  async onOpenEmptyWindow(): Promise<void> {
    if (!this.windowSrv.hasElectron || this.isOpeningWindow.value) return;

    this.isOpeningWindow.next(true);
    try {
      await this.settingsSrv.init();
      this.store.dispatch(BibleActions.stopCasting());

      await this.settingsSrv.openActiveCastingWindows({
        featurePath: [Pages.BIBLE_FEATURE, Pages.CASTING],
        onMainWindowProcId: (procId) => {
          this.store.dispatch(
            AppActions.setProcId({ procId, pageType: AppWindowTypes.CASTING })
          );
        },
      });
    } finally {
      this.isOpeningWindow.next(false);
    }
  }

  private canTourNext(
    tourService: unknown
  ): tourService is { next: () => void } {
    return typeof (tourService as { next: () => void }).next === 'function';
  }

  private createCastingContent(
    sections: BibleChapterSection[],
    book: BibleBookShort
  ): BibleVerseForCasting[] {
    return sections.flatMap((section) =>
      section.content.map((verse) => ({
        ...verse,
        text: [verse.text],
        bookTitle: book.title,
      }))
    );
  }

  private resolveSecondaryContent(
    enabled: boolean,
    translate: BibleTranslateShort | null,
    cache: Record<string, BibleChapterSection[]>,
    book: BibleBookShort,
    chapter: BibleChapterShort
  ): Observable<BibleSecondaryCastingContent | undefined> {
    if (!enabled || !translate) {
      return of(undefined);
    }

    const cacheKey = createBibleSecondaryTranslationCacheKey(
      translate,
      book,
      chapter
    );
    const cachedSections = cache[cacheKey];

    if (cachedSections) {
      return of({
        translate,
        content: this.createCastingContent(cachedSections, book),
      });
    }

    return this.apiSrv.getSections(translate, book, chapter).pipe(
      map((sections) => {
        this.store.dispatch(
          BibleActions.setSecondaryTranslationChapter({
            cacheKey,
            sections,
          })
        );

        return {
          translate,
          content: this.createCastingContent(sections, book),
        };
      })
    );
  }
}
