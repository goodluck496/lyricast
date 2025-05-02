import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { SongPageState } from './song.reducers';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { SONG_ACTIONS, SongActions } from './song.actions';
import {
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  Pages,
} from '@lyri-cast/common-browser';
import { EventData } from '@lyri-cast/common-electron';
import { SongPayloadsMap } from './song-electron.types';
import { map } from 'rxjs';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [SONG_ACTIONS.startCasting]: (eventData: EventData) =>
    SongActions.startCasting(
      eventData.payload as SongPayloadsMap['START_CASTING']
    ),
  [SONG_ACTIONS.pauseCasting]: () => SongActions.pauseCasting(),
  [SONG_ACTIONS.openPage]: (eventData: EventData) =>
    SongActions.openPage(
      eventData.payload as SongPayloadsMap[typeof SONG_ACTIONS.openPage]
    ),
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

  startCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SongActions.startCasting),
      map(() => {
        this.bridge.send<typeof SONG_ACTIONS.castingStarted, SongPayloadsMap>(
          SONG_ACTIONS.castingStarted,
          void 0
        );

        return { type: SONG_ACTIONS.startCasting };
      })
    )
  );

  openPage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SongActions.openPage),
      map(() => {
        this.bridge.send<typeof SONG_ACTIONS.openedPage, SongPayloadsMap>(SONG_ACTIONS.openedPage, {page: Pages.CASTING});
        return {type: SONG_ACTIONS.openPage};
      })
    )
  );
}
