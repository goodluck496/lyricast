import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import {
  BibleActions,
  BibleActionsEnum,
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
import {
  selectCastingPaused,
  selectCastingProcess,
  selectSelectedBibleVerse,
} from './bible.selectors';
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

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [BibleActionsEnum.startCasting]: (eventData: EventData) =>
    BibleActions.startCasting(eventData.payload as BibleStartCastingPayload),
  [BibleActionsEnum.castingProcessChange]: (eventData: EventData) =>
    BibleActions.castingProcessChange(
      eventData.payload as BiblePresentationNavigatePayload
    ),
  [BibleActionsEnum.stopCasting]: () => BibleActions.stopCasting(),
  [BibleActionsEnum.pauseCasting]: () => BibleActions.pauseCasting(),
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
        this.bridge.send(BibleActionsEnum.startCasting, data);
      }),
      map(() => ({ type: BibleActionsEnum.startCasting }))
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
          return { type: BibleActionsEnum.pauseCasting };
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

  stopCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.stopCasting),
      map(() => {
        return AppActions.closeWindow({
          windowType: AppWindowTypes.BIBLE_CASTING,
        });
      })
    )
  );

  castingChange$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.castingProcessChange),
      map((castingProcessChange) => {
        this.bridge.send(
          BibleActionsEnum.castingProcessChange,
          castingProcessChange
        );
        return { type: BibleActionsEnum.castingProcessChange };
      })
    )
  );

  prevOrNextVerse$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.selectPrevOrNextVerse),
      withLatestFrom(
        this.store.select(selectSelectedBibleVerse),
        this.store.select(selectCastingPaused)
      ),
      map(([nextVerse, selectedVerse, paused]) => {
        if (!selectedVerse || paused) {
          return { type: BibleActionsEnum.selectPrevOrNextVerse };
        }

        this.store.dispatch(
          BibleActions.castingProcessChange({
            nextIndex: selectedVerse.number,
            currentContent: {
              ...selectedVerse,
              text: [selectedVerse.text],
            },
          })
        );

        return { type: BibleActionsEnum.selectPrevOrNextVerse };
      })
    )
  );
}
