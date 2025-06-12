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
import { Actions } from '@ngrx/effects';
import { FreeSlideActions, FreeSlideActionsEnum, FreeSlideActionSource } from './free-slide.actions';
import { EventData } from '@lyri-cast/common-electron';
import { selectFreeSlideCastingProcess } from './free-slide.selectors';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [FreeSlideActionsEnum.startCasting]: (eventData: EventData) =>
    FreeSlideActions.startCasting(eventData.payload as any),
  [FreeSlideActionsEnum.castingStarted]: () =>
    FreeSlideActions.castingStarted(),
  [FreeSlideActionsEnum.stopCasting]: () => FreeSlideActions.stopCasting(),
  [FreeSlideActionsEnum.pauseCasting]: () => FreeSlideActions.pauseCasting(),
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
    openCastingAction: FreeSlideActions.openCasting,
    openPageAction: FreeSlideActions.openPage,
    startCastingAction: FreeSlideActions.startCasting,
    castingStartedAction: FreeSlideActions.castingStarted,
    stopCastingAction: FreeSlideActions.stopCasting,
    pauseCastingAction: FreeSlideActions.pauseCasting,
    slideNavigateAction: FreeSlideActions.slideNavigate,
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
  startCastingTrigger$ = this.base.startCastingTrigger$;
  pauseCasting$ = this.base.pauseCasting$;
  stopCasting$ = this.base.stopCasting$;
  castingStarted$ = this.base.castingStarted$;
  slideNavigate$ = this.base.slideNavigate$;

}
