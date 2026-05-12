import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import {
  BibleActions,
  BibleActionsEnum,
  BiblePresentationNavigatePayload,
  BibleStartCastingPayload,
} from './bible.actions';
import { BibleState } from './bible.store';
import {
  CASTING_APPEARANCE_UPDATE_EVENT,
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  AppActions,
} from '@lyri-cast/common-browser';
import { EventData } from '@lyri-cast/common-electron';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { map } from 'rxjs';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [BibleActionsEnum.startCasting]: (eventData) =>
    BibleActions.startCasting(eventData.payload as BibleStartCastingPayload),
  [BibleActionsEnum.castingProcessChange]: (eventData) =>
    BibleActions.castingProcessChange(
      eventData.payload as BiblePresentationNavigatePayload
    ),
  [BibleActionsEnum.pauseCasting]: () => BibleActions.pauseCasting(),
  [BibleActionsEnum.stopCasting]: () => BibleActions.stopCasting(),
  [CASTING_APPEARANCE_UPDATE_EVENT]: (eventData) =>
    BibleActions.updateCastingAppearance(eventData.payload as any),
};

@Injectable()
@BridgeProcessForEffectsDecorator(actionsMap)
export class BibleCastingPageEffects implements BaseEffectsWithBridgeInterface {
  store = inject<Store<BibleState>>(Store);
  bridge = inject(BridgeService);

  private readonly actions$ = inject(Actions);

  stopCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.stopCasting),
      map(() => ({ type: '[BibleCastingPageEffects] stopCasting received' }))
    )
  );
}
