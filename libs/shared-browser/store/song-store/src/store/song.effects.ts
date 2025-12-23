import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import {
  AppActions,
  BridgeService,
  createCastingFlow,
  Pages,
  selectOpenedWindow,
  SettingsService,
  WindowService,
} from '@lyri-cast/common-browser';
import { AppWindowTypes } from '@lyri-cast/common-electron';
import { SongPageState } from './song.reducers';
import {
  SongActionSource,
  SongActions,
  SongActionsEnum,
} from './song.actions';
import { selectCastingProcess } from './song.selectors';
import { filter, map } from 'rxjs';

@Injectable()
export class SongsPageEffects {
  private readonly store = inject<Store<SongPageState>>(Store);
  private readonly bridge = inject(BridgeService);
  private readonly settingsSrv = inject(SettingsService);
  private readonly window = inject(WindowService);
  private readonly actions$ = inject(Actions);

  private readonly base = createCastingFlow<SongPageState>({
    actionSource: SongActionSource,
    featureName: Pages.SONGS_FEATURE,
    openCastingAction: SongActions[SongActionsEnum.openCasting],
    openPageAction: SongActions[SongActionsEnum.openPage],
    startCastingAction: SongActions[SongActionsEnum.startCasting],
    pauseCastingAction: SongActions[SongActionsEnum.pauseCasting],
    stopCastingAction: SongActions[SongActionsEnum.stopCasting],
    slideNavigateAction: SongActions[SongActionsEnum.slideNavigate],
    selectCastingProcess,
    selectOpenedWindow,
    getDisplayForCasting: () => this.settingsSrv.getDisplayForCasting(),
    store: this.store,
    bridge: this.bridge,
    window: this.window,
    actions$: this.actions$,
  });

  openCasting$ = this.base.openCasting$;
  onOpenPage$ = this.base.onOpenPage$;
  onOpenedPage$ = this.base.onOpenedPage$;
  startCastingTrigger$ = this.base.startCastingTrigger$;
  pauseCasting$ = this.base.pauseCasting$;
  stopCasting$ = this.base.stopCasting$;
  slideNavigate$ = this.base.slideNavigate$;

  closeCastingWindow$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppActions.closeWindow, AppActions.clearWindowId),
      filter((a) =>
        a.type === AppActions.closeWindow.type
          ? a.windowType === AppWindowTypes.CASTING
          : true
      ),
      map(() => SongActions[SongActionsEnum.pauseCasting]())
    )
  );
}
