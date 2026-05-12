import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SongCastingPreviewComponent } from '../casting-preview/song-casting-preview.component';
import { NavigatorFeatureComponent } from '@lyri-cast/navigator-feature';
import { selectCastingPaused, SongActions, SongActionsEnum } from '@lyri-cast/song-store';
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

  onCloseCasting(): void {
    this.castingSrv.closeCasting();
  }

  async onOpenEmptyWindow(): Promise<void> {
    if (!this.windowSrv.hasElectron || this.isOpeningWindow.value) return;

    this.isOpeningWindow.next(true);
    try {
      await this.settingsSrv.init();
      const display = await firstValueFrom(this.settingsSrv.getDisplayForCasting());
      if (!display) return;

      this.store.dispatch(SongActions[SongActionsEnum.stopCasting]());

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
        payload: { path: [Pages.SONGS_FEATURE, Pages.CASTING] } as any,
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
}
