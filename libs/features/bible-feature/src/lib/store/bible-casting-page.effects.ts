import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import {
  BibleActions,
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
import { BIBLE_ACTIONS } from './bible-electron.types';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [BIBLE_ACTIONS.startCasting]: (eventData) =>
    BibleActions.startCasting(eventData.payload as BibleStartCastingPayload),
  [BIBLE_ACTIONS.changeCastingProcess]: (eventData) =>
    BibleActions.castingProcessChange(
      eventData.payload as BiblePresentationNavigatePayload
    ),
  [BIBLE_ACTIONS.pauseCasting]: () => BibleActions.pauseCasting(),
  [BIBLE_ACTIONS.stopCasting]: () => BibleActions.stopCasting(),
};

@Injectable()
@BridgeProcessForEffectsDecorator(actionsMap)
export class BibleCastingPageEffects implements BaseEffectsWithBridgeInterface {
  store = inject<Store<BibleState>>(Store);
  bridge = inject(BridgeService);
}
