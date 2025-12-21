import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { FreeSlideState } from './free-slide.reducers';
import {
  AppActions,
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  createCastingFlow,
  Pages,
  selectOpenedWindow,
  SettingsService,
  WindowService,
} from '@lyri-cast/common-browser';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  FreeSlideActionSource,
} from './free-slide.actions';
import { EventData } from '@lyri-cast/common-electron';
import { selectFreeSlideCastingProcess, selectFreeSlideCastingFrozen, selectGlobalTransition, selectSlideTransitions } from './free-slide.selectors';
import { AppWindowTypes } from '@lyri-cast/common-electron';
import { filter, map } from 'rxjs';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [FreeSlideActionsEnum.startCasting]: (eventData: EventData) =>
    FreeSlideActions[FreeSlideActionsEnum.startCasting](
      eventData.payload as any
    ),
  [FreeSlideActionsEnum.castingStarted]: () =>
    FreeSlideActions[FreeSlideActionsEnum.castingStarted](),
  [FreeSlideActionsEnum.stopCasting]: () =>
    FreeSlideActions[FreeSlideActionsEnum.stopCasting](),
  [FreeSlideActionsEnum.pauseCasting]: () =>
    FreeSlideActions[FreeSlideActionsEnum.pauseCasting](),
};

@Injectable()
@BridgeProcessForEffectsDecorator(actionsMap)
export class FreeSlideCastingEffects implements BaseEffectsWithBridgeInterface {
  public readonly store = inject<Store<FreeSlideState>>(Store);
  public readonly bridge = inject(BridgeService);
  private readonly settingsSrv = inject(SettingsService);
  private readonly window = inject(WindowService);
  private readonly actions$ = inject(Actions);

  private readonly base = createCastingFlow<FreeSlideState>({
    actionSource: FreeSlideActionSource,
    featureName: Pages.FREE_SLIDE_FEATURE,
    openCastingAction: FreeSlideActions[FreeSlideActionsEnum.openCasting],
    openPageAction: FreeSlideActions[FreeSlideActionsEnum.openPage],
    startCastingAction: FreeSlideActions[FreeSlideActionsEnum.startCasting],
    castingStartedAction: FreeSlideActions[FreeSlideActionsEnum.castingStarted],
    stopCastingAction: FreeSlideActions[FreeSlideActionsEnum.stopCasting],
    pauseCastingAction: FreeSlideActions[FreeSlideActionsEnum.pauseCasting],
    slideNavigateAction: FreeSlideActions[FreeSlideActionsEnum.slideNavigate],
    liveUpdateSlideAction:
      FreeSlideActions[FreeSlideActionsEnum.liveUpdateSlide],
    // централизованный проброс переходов
    setGlobalTransitionAction:
      FreeSlideActions[FreeSlideActionsEnum.setGlobalTransition],
    setSlideTransitionAction:
      FreeSlideActions[FreeSlideActionsEnum.setSlideTransition],
    updateTransitionSettingsAction:
      FreeSlideActions[FreeSlideActionsEnum.updateTransitionSettings],
    selectGlobalTransition,
    selectSlideTransitions,
    selectCastingProcess: selectFreeSlideCastingProcess,
    selectCastingFrozen: selectFreeSlideCastingFrozen,
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
  castingStarted$ = this.base.castingStarted$;
  slideNavigate$ = this.base.slideNavigate$;
  liveUpdateSlide$ = this.base.liveUpdateSlide$;
  setGlobalTransition$ = this.base.setGlobalTransition$;
  setSlideTransition$ = this.base.setSlideTransition$;
  updateTransitionSettings$ = this.base.updateTransitionSettings$;

  closeCastingWindow$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppActions.closeWindow, AppActions.clearWindowId),
      filter((a) =>
        a.type === AppActions.closeWindow.type
          ? a.windowType === AppWindowTypes.CASTING
          : true
      ),
      map(() => FreeSlideActions[FreeSlideActionsEnum.stopCasting]())
    )
  );
}
