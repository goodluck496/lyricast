import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { SongPageState } from './song.reducers';
import { Actions } from '@ngrx/effects';
import { SONG_ACTIONS, SongActions } from './song.actions';
import {
  BaseEffectsWithBridgeInterface,
  BridgeService,
} from '@lyri-cast/common-browser';
import { EventData } from '@lyri-cast/common-electron';
import { SongPayloadsMap } from './song-electron.types';


@Injectable()
export class SongCastingEffects implements BaseEffectsWithBridgeInterface {
  actions$ = inject(Actions);
  store = inject(Store<SongPageState>);
  bridge = inject(BridgeService);

  constructor() {
    this.initSubscribeByBridge();
  }

  initSubscribeByBridge() {
    this.bridge.queueEvents.subscribe((data) => {
      if (!data) {
        console.log('queue is empty');
        return;
      }
      const action = this.actionMapper(data);

      if (!action) {
        return;
      }
      this.store.dispatch(action);
    });
  }

  actionMapper(eventData: EventData): Action | null {
    switch (eventData.event) {
      case SONG_ACTIONS.startCasting:
        return SongActions.startCasting(
          eventData.payload as SongPayloadsMap['START_CASTING']
        );

      case SONG_ACTIONS.slideNavigate:
        return SongActions.slideNavigate(
          eventData.payload as SongPayloadsMap['SLIDE_NAVIGATE']
        );

      case SONG_ACTIONS.pauseCasting:
        return SongActions.pauseCasting();

      default:
        console.warn('Not found event', eventData.event, eventData.payload);
        return null;
    }
  }
}
