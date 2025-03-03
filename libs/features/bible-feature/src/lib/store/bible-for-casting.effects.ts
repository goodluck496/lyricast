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
  selectBooks,
  selectCastingPaused,
  selectCastingProcess,
  selectSelectedBibleVerse, selectSelectedBook
} from './bible.selectors';
import {
  AppActions,
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  Pages,
  selectOpenedWindow,
  SettingsService,
  WindowService,
} from '@lyri-cast/common-browser';
import { fromPromise } from 'rxjs/internal/observable/innerFrom';
import {
  APP_COMMON_ACTIONS,
  AppWindowTypes,
  EventData,
} from '@lyri-cast/common-electron';
import { snapshot } from '@lyri-cast/common';

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
  settingsSrv = inject(SettingsService);

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
        this.bridge.send(APP_COMMON_ACTIONS.openPage, data);

        return { type: APP_COMMON_ACTIONS.openPage };
      }),
      switchMap(() => this.bridge.queueEvents),
      withLatestFrom(this.store.select(selectCastingProcess)),
      filter(
        ([event]) => !!event && event.event === APP_COMMON_ACTIONS.openedPage
      ),
      map(([, data]) => {
        if (!data) {
          return BibleActions.pauseCasting();
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

        const selectedDisplay = snapshot(
          this.settingsSrv.getDisplayForCasting()
        );

        return fromPromise(
          this.window.electronContext
            .openWindow({
              type: AppWindowTypes.CASTING,
              title: 'Casting new',
              show: true,
              center: true,
              fullscreen: true,
              focusable: true,
              display: selectedDisplay
            })
            .then((procId) => ({
              type: AppWindowTypes.CASTING,
              procId,
            }))
        ).pipe(
          tap((openedWindow) => {
            console.log('setProcId, ', openedWindow);
            this.store.dispatch(
              AppActions.setProcId({
                procId: openedWindow.procId,
                pageType: openedWindow.type,
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
          windowType: AppWindowTypes.CASTING,
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
        this.store.select(selectSelectedBook),
        this.store.select(selectSelectedBibleVerse),
        this.store.select(selectCastingPaused)
      ),
      map(([nextVerse, selectedBook, selectedVerse, paused]) => {
        if (!selectedVerse || paused) {
          return { type: BibleActionsEnum.selectPrevOrNextVerse };
        }


        this.store.dispatch(
          BibleActions.castingProcessChange({
            nextIndex: selectedVerse.number,
            currentContent: {
              ...selectedVerse,
              text: [selectedVerse.text],
              bookTitle: selectedBook!.title,
            },
          })
        );

        return { type: BibleActionsEnum.selectPrevOrNextVerse };
      })
    )
  );
}
