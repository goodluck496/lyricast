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
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
} from '@lyri-cast/common-browser';
import { EventData } from '@lyri-cast/common-electron';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [BibleActionsEnum.startCasting]: (eventData) =>
    BibleActions.startCasting(eventData.payload as BibleStartCastingPayload),
  [BibleActionsEnum.castingProcessChange]: (eventData) =>
    BibleActions.castingProcessChange(
      eventData.payload as BiblePresentationNavigatePayload
    ),
  [BibleActionsEnum.pauseCasting]: () => BibleActions.pauseCasting(),
  [BibleActionsEnum.stopCasting]: () => BibleActions.stopCasting(),
};

@Injectable()
@BridgeProcessForEffectsDecorator(actionsMap)
export class BibleCastingPageEffects implements BaseEffectsWithBridgeInterface {
  store = inject<Store<BibleState>>(Store);
  bridge = inject(BridgeService);
}
