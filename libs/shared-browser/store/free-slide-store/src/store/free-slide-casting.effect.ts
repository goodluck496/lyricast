import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { FreeSlideState } from './free-slide.reducers';
import {
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
import { FreeSlideActions, FreeSlideActionsEnum, FreeSlideActionSource } from './free-slide.actions';
import { EventData } from '@lyri-cast/common-electron';
import { selectFreeSlideCastingProcess } from './free-slide.selectors';
import { map } from 'rxjs';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [FreeSlideActionsEnum.startCasting]: (eventData: EventData) =>
    FreeSlideActions[FreeSlideActionsEnum.startCasting](eventData.payload as any),
  [FreeSlideActionsEnum.castingStarted]: () =>
    FreeSlideActions[FreeSlideActionsEnum.castingStarted](),
  [FreeSlideActionsEnum.stopCasting]: () => FreeSlideActions[FreeSlideActionsEnum.stopCasting](),
  [FreeSlideActionsEnum.pauseCasting]: () => FreeSlideActions[FreeSlideActionsEnum.pauseCasting](),
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
    liveUpdateSlideAction: FreeSlideActions[FreeSlideActionsEnum.liveUpdateSlide],
    selectCastingProcess: selectFreeSlideCastingProcess,
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





}
