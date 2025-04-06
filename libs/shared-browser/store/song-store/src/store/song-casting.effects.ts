import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { SongPageState } from './song.reducers';
import { Actions } from '@ngrx/effects';
import { SONG_ACTIONS, SongActions } from './song.actions';
import {
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
} from '@lyri-cast/common-browser';
import { EventData } from '@lyri-cast/common-electron';
import { SongPayloadsMap } from './song-electron.types';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [SONG_ACTIONS.startCasting]: (eventData: EventData) =>
    SongActions.startCasting(
      eventData.payload as SongPayloadsMap['START_CASTING']
    ),
  [SONG_ACTIONS.pauseCasting]: () => SongActions.pauseCasting(),
  [SONG_ACTIONS.slideNavigate]: (eventData) =>
    SongActions.slideNavigate(
      eventData.payload as SongPayloadsMap['SLIDE_NAVIGATE']
    ),
};

@Injectable()
@BridgeProcessForEffectsDecorator(actionsMap)
export class SongCastingEffects implements BaseEffectsWithBridgeInterface {
  actions$ = inject(Actions);
  store = inject(Store<SongPageState>);
  bridge = inject(BridgeService);

  constructor() {
    // this.initSubscribeByBridge();
    console.log('SongCastingEffects');
  }
}
