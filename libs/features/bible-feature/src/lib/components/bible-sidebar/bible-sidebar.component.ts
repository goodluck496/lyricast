import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BibleCastingPreviewComponent } from '../casting-preview/bible-casting-preview.component';
import { NavigatorFeatureComponent } from '@lyri-cast/navigator-feature';
import {
  BibleActions,
  BibleState,
  selectCastingPaused,
  selectSelectedBibleVerse,
  selectSelectedChapterSections,
  selectSelectedVersesRange,
} from '@lyri-cast/bible-store';
import { Store } from '@ngrx/store';
import { map, Observable, take, withLatestFrom } from 'rxjs';
import { filterEmpty } from '@lyri-cast/common';
import { BibleBookTitle, BibleChapterSection } from '@lyri-cast/entities';
import { AppActions, selectOpenedWindow, SidebarService, WindowService, SettingsService, BridgeService, Pages, DEFAULT_CASTING_PAGE_CONFIG } from '@lyri-cast/common-browser';
import { BibleSidebarData } from '../../types';
import { AppWindowTypes, APP_COMMON_ACTIONS } from '@lyri-cast/common-electron';
import { firstValueFrom, BehaviorSubject, combineLatest } from 'rxjs';
import { skip, filter } from 'rxjs/operators';
import { TourPrimeNgModule } from 'ngx-ui-tour-primeng';
import { BibleOnboardingService } from '../../services/bible-onboarding.service';
import { TourService } from 'ngx-ui-tour-primeng';
import { SplitButtonModule } from 'primeng/splitbutton';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'lyri-bible-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    BibleCastingPreviewComponent,
    NavigatorFeatureComponent,
    TourPrimeNgModule,
    SplitButtonModule,
  ],
  templateUrl: './bible-sidebar.component.html',
  styleUrl: './bible-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BibleSidebarComponent {
  private readonly store = inject<Store<BibleState>>(Store<BibleState>);
  private readonly sidebarService =
    inject<SidebarService<BibleSidebarData>>(SidebarService);
  private readonly bibleOnboarding = inject(BibleOnboardingService);
  private readonly tourService = inject(TourService);
  private readonly windowSrv = inject(WindowService);
  private readonly settingsSrv = inject(SettingsService);
  private readonly bridge = inject(BridgeService);

  private canTourNext(tourService: unknown): tourService is { next: () => void } {
    return typeof (tourService as { next: () => void }).next === 'function';
  }

  openedCastingWindow$ = this.store.select(selectOpenedWindow).pipe(map((e) => !!e));
  castingIsPaused$ = this.store.select(selectCastingPaused);
  sectionList$: Observable<BibleChapterSection[]> = this.store.select(
    selectSelectedChapterSections
  );
  selectedRange$ = this.store.select(selectSelectedVersesRange);

  isOpeningWindow = new BehaviorSubject<boolean>(false);

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

  onStartCasting() {
    this.store
      .select(selectSelectedBibleVerse)
      .pipe(
        take(1),
        filterEmpty(),
        withLatestFrom(this.sectionList$, this.sidebarService.data$, this.selectedRange$)
      )
      .subscribe(([verse, sections, sidebarData, range]) => {
        if (!sidebarData || !sidebarData.bibleForm) {
          return;
        }
        const groupValue = sidebarData.bibleForm;

        if (groupValue.book && groupValue.chapter && sections.length) {
          const fromNumber = range?.from ?? verse.number;
          const toNumber = range?.to ?? verse.number;

          const bookEntity = groupValue.book.baseEntity;
          const chapterEntity = groupValue.chapter.baseEntity;
          const bookTitle = groupValue.book.baseEntity?.title as BibleBookTitle;

          this.openedCastingWindow$.pipe(take(1)).subscribe((isOpen) => {
            if (!isOpen) {
              this.isOpeningWindow.next(true);
              setTimeout(() => this.isOpeningWindow.next(false), 1200);
            }
            this.store.dispatch(
              BibleActions.openCasting({
                book: bookEntity,
                chapter: chapterEntity,
                fromIndex: fromNumber,
                range: range ? { from: fromNumber, to: toNumber } : undefined,
                content: sections[0].content.map((el) => {
                  return {
                    ...el,
                    text: [el.text],
                    bookTitle: bookTitle,
                  };
                }),
              })
            );
          });
        }
      });
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
      const display = await firstValueFrom(this.settingsSrv.getDisplayForCasting());
      if (!display) return;

      this.store.dispatch(BibleActions.stopCasting());

    const procId = await this.windowSrv.electronContext.openWindow({
      ...DEFAULT_CASTING_PAGE_CONFIG,
      display,
      title: 'Casting Window',
      type: AppWindowTypes.CASTING,
    });

    this.store.dispatch(AppActions.setProcId({ procId, pageType: AppWindowTypes.CASTING }));

    await firstValueFrom(
      this.bridge.queueEvents.pipe(
        skip(1),
        filter((event): event is { event: string; payload: unknown } => !!event && event.event === APP_COMMON_ACTIONS.appInit)
      )
    );

      await this.windowSrv.electronContext.send({
        event: APP_COMMON_ACTIONS.openPage,
        payload: { path: [Pages.BIBLE_FEATURE, Pages.CASTING] } as any,
      });
    } finally {
      this.isOpeningWindow.next(false);
    }
  }
}
