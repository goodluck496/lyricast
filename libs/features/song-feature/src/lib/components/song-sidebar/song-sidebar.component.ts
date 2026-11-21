import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SongCastingPreviewComponent } from '../casting-preview/song-casting-preview.component';
import { NavigatorFeatureComponent } from '@lyri-cast/navigator-feature';
import {
  selectCastingFrozen,
  selectCastingPaused,
  SongActions,
  SongActionsEnum,
} from '@lyri-cast/song-store';
import { SongPageSelectService } from '../../pages/song-page/song-page-select.service';
import { AppActions, selectOpenedWindow, SidebarService, WindowService, SettingsService, BridgeService, Pages, DEFAULT_CASTING_PAGE_CONFIG, CastingAppearanceService } from '@lyri-cast/common-browser';
import { AppWindowTypes, APP_COMMON_ACTIONS } from '@lyri-cast/common-electron';
import { map, Observable, firstValueFrom, BehaviorSubject, combineLatest, take } from 'rxjs';
import { skip, filter } from 'rxjs/operators';
import { SongsApiService } from '@lyri-cast/data-access-songs';
import { CastingService } from '../../services/casting.service';
import { Store } from '@ngrx/store';
import { Actions } from '@ngrx/effects';
import { SongSidebarData } from '../../types';
import {
  TourAnchorPrimeNgDirective,
  TourPrimeNgModule,
} from 'ngx-ui-tour-primeng';
import { SplitButtonModule } from 'primeng/splitbutton';
import { MenuItem } from 'primeng/api';
import { CastingAppearanceControlsComponent } from '@lyri-cast/asset-management';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { FormsModule } from '@angular/forms';
import { SongTextLayoutService } from '../../services/song-text-layout.service';
import { snapshot } from '@lyri-cast/common';

@Component({
  selector: 'lyri-song-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    SongCastingPreviewComponent,
    NavigatorFeatureComponent,
    TourAnchorPrimeNgDirective,
    TourPrimeNgModule,
    SplitButtonModule,
    CastingAppearanceControlsComponent,
    ToggleSwitchModule,
    FormsModule,
  ],
  templateUrl: './song-sidebar.component.html',
  styleUrl: './song-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongSidebarComponent {
  private songPageSelectSrv = inject(SongPageSelectService);
  private readonly songsApiService = inject(SongsApiService);
  private readonly castingSrv = inject(CastingService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject(Store);
  castingIsPaused$ = this.store.select(selectCastingPaused);
  castingIsFrozen$ = this.store.select(selectCastingFrozen);
  openedCastingWindow$ = this.store
    .select(selectOpenedWindow)
    .pipe(map((e) => !!e));
  private readonly actions$ = inject(Actions);
  private readonly sidebarService =
    inject<SidebarService<SongSidebarData>>(SidebarService);
  private readonly windowSrv = inject(WindowService);
  private readonly settingsSrv = inject(SettingsService);
  private readonly bridge = inject(BridgeService);
  private readonly appearanceService = inject(CastingAppearanceService);
  readonly textLayout = inject(SongTextLayoutService);

  activePreviewTab: 'main' | 'stage' = 'main';
  readonly clockTime = signal<string>(new Date().toLocaleTimeString('ru-RU'));
  private clockInterval: any;

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

  readonly currentLyricText = computed(() => {
    const line = this.songPageSelectSrv.selectedLyricLine();
    return line ? this.textLayout.formatHtmlForDisplay(line.text) : '';
  });

  readonly nextLyricText = computed(() => {
    const line = this.songPageSelectSrv.selectedLyricLine();
    if (!line) return '';
    const lyrics = this.songPageSelectSrv.selectedLyricsForCasting();
    const allLines = lyrics.flatMap((l) => l.lines);
    const next = allLines.find(
      (l) => l.globalSongIndex === line.globalSongIndex + 1
    );
    return next ? this.textLayout.formatHtmlForDisplay(next.text) : '';
  });

  constructor() {
    this.clockInterval = setInterval(() => {
      this.clockTime.set(new Date().toLocaleTimeString('ru-RU'));
    }, 1000);
    this.destroyRef.onDestroy(() => {
      if (this.clockInterval) {
        clearInterval(this.clockInterval);
      }
    });
  }

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

  onStartCasting(fromSelectedBlock = false): void {
    const payload =
      this.songPageSelectSrv.getStartCastingPayload(fromSelectedBlock);
    if (!payload) {
      return;
    }

    this.openedCastingWindow$.pipe(take(1)).subscribe((isOpen) => {
      if (!isOpen) {
        this.isOpeningWindow.next(true);
        setTimeout(() => this.isOpeningWindow.next(false), 1200);
      }
      this.castingSrv.openCastingPageHandler({
        ...payload,
        appearance: this.appearanceService.appearance(),
      });
    });
  }

  onPauseCasting(): void {
    this.castingSrv.pauseCasting();
  }

  onFreezeToggle(frozen: boolean): void {
    this.store.dispatch(SongActions[SongActionsEnum.setFreezeCasting]({ frozen }));
  }

  onCloseCasting(): void {
    this.castingSrv.closeCasting();
  }

  isBlackoutAll = false;

  onBlackoutAllToggle(enabled: boolean): void {
    this.isBlackoutAll = enabled;
    this.bridge.send('BLACKOUT_ALL' as any, { active: enabled });
  }

  async onOpenEmptyWindow(): Promise<void> {
    if (!this.windowSrv.hasElectron || this.isOpeningWindow.value) return;

    this.isOpeningWindow.next(true);
    try {
      await this.settingsSrv.init();
      this.store.dispatch(SongActions[SongActionsEnum.stopCasting]());

      await this.settingsSrv.openActiveCastingWindows({
        featurePath: [Pages.SONGS_FEATURE, Pages.CASTING],
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

  onNavigateSlide(dir: 'prev' | 'next') {
    const navigatePayload = this.songPageSelectSrv.getNavigatePayload(dir);
    if (!navigatePayload) {
      console.log('Cancel navigate payload', dir);
      return;
    }
    this.castingSrv.navigateSlide(navigatePayload);
  }

  onFitTextAutoWrapToggle(enabled: boolean): void {
    this.textLayout.setFitTextAutoWrapEnabled(enabled);

    if (snapshot(this.castingIsPaused$)) {
      return;
    }

    this.onStartCasting(true);
  }
}
