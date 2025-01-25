import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import {
  BibleActions,
  BiblePresentationNavigatePayload,
  BibleStartCastingPayload,
} from './bible.actions';
import {
  filter,
  map,
  mergeMap,
  of,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs';
import { BibleApiService } from '../services/index';
import { BibleState } from './bible.store';
import { selectCastingProcess } from './bible.selectors';
import { SONG_ACTIONS } from '@lyri-cast/song-feature';
import {
  AppActions,
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  Pages,
  selectOpenedWindow,
  WindowService,
} from '@lyri-cast/common-browser';
import { fromPromise } from 'rxjs/internal/observable/innerFrom';
import {
  APP_COMMON_ACTIONS,
  AppWindowTypes,
  EventData,
} from '@lyri-cast/common-electron';
import { BIBLE_ACTIONS } from './bible-electron.types';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [BIBLE_ACTIONS.startCasting]: (eventData: EventData) =>
    BibleActions.startCasting(eventData.payload as BibleStartCastingPayload),
  [BIBLE_ACTIONS.changeCastingProcess]: (eventData: EventData) =>
    BibleActions.castingProcessChange(
      eventData.payload as BiblePresentationNavigatePayload
    ),
  [BIBLE_ACTIONS.stopCasting]: () => BibleActions.stopCasting(),
  [BIBLE_ACTIONS.pauseCasting]: () => BibleActions.pauseCasting(),
};

@Injectable()
@BridgeProcessForEffectsDecorator(actionsMap)
export class BibleForCastingEffects implements BaseEffectsWithBridgeInterface {
  store = inject<Store<BibleState>>(Store);
  actions$ = inject(Actions);

  window = inject(WindowService);
  bridge = inject(BridgeService);
  apiSrv = inject(BibleApiService);

  startCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.startCasting),
      tap((data) => {
        this.bridge.send(
          /*<'START_CASTING', SongPayloadsMap>*/ 'START_CASTING',
          data
        );
      }),
      map(() => ({ type: SONG_ACTIONS.startCasting }))
    )
  );

  onOpenPage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.openPage),
      map((data) => {
        console.log('openPage', data);
        this.bridge.send('OPEN_PAGE', data);

        return { type: 'OPEN_PAGE' };
      }),
      switchMap(() => this.bridge.queueEvents),
      withLatestFrom(this.store.select(selectCastingProcess)),
      filter(([event]) => !!event && event.event === 'OPENED_PAGE'),
      map(([, data]) => {
        console.log('OPENED_PAGE', data);
        if (!data) {
          return { type: SONG_ACTIONS.pauseCasting };
        }
        return BibleActions.startCasting({
          ...data,
        });
      })
    )
  );

  onOpenCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.openCasting),
      withLatestFrom(this.store.select(selectOpenedWindow)),
      mergeMap(([, windowData]) => {
        if (windowData) {
          return of(
            BibleActions.openPage({
              path: [Pages.BIBLE_FEATURE, Pages.CASTING],
            })
          );
        }

        return fromPromise(
          this.window.electronContext
            .openWindow({
              type: AppWindowTypes.BIBLE_CASTING,
              title: 'Casting new',
              show: true,
              center: true,
              // fullscreen: true,
              focusable: true,
            })
            .then((procId) => ({
              type: AppWindowTypes.BIBLE_CASTING,
              procId,
            }))
        ).pipe(
          tap((openedWindow) => {
            console.log('setProcId, ', openedWindow);
            this.store.dispatch(
              AppActions.setProcId({
                procId: openedWindow.procId,
                pageType: AppWindowTypes.BIBLE_CASTING,
              })
            );
          }),
          switchMap(() => this.bridge.queueEvents),
          filter(
            (event) => !!event && event.event === APP_COMMON_ACTIONS.appInit
          ),
          map(() =>
            BibleActions.openPage({
              path: [Pages.BIBLE_FEATURE, Pages.CASTING],
            })
          )
        );
      })
    )
  );
}
