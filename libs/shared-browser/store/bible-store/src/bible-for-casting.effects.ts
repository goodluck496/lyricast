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
import { BibleState } from './bible.store';
import {
  selectCastingPaused,
  selectCastingProcess,
  selectSelectedBibleVerse,
  selectSelectedBook,
} from './bible.selectors';
import {
  AppActions,
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  DEFAULT_CASTING_PAGE_CONFIG,
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
import { BibleApiService } from '@lyri-cast/data-access-bible';

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

  closeWindow$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AppActions.clearWindowId),
        tap(() => {
          this.store.dispatch(BibleActions.pauseCasting());
        }),
        map(() => ({type: AppActions.clearWindowId.toString()}))
      ),
    { dispatch: true }
  );

  startCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.startCasting),
      tap((data) => {
        this.bridge.send(BibleActionsEnum.startCasting, data);
      }),
      map(() => ({ type: BibleActionsEnum.startCasting }))
    )
  );

  pauseCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.pauseCasting),
      tap((data) => {
        this.bridge.send(BibleActionsEnum.pauseCasting, data);
      }),
      map(() => ({ type: BibleActionsEnum.pauseCasting }))
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
              ...DEFAULT_CASTING_PAGE_CONFIG,
              display: selectedDisplay,
            })
            .then((procId) => ({
              type: AppWindowTypes.CASTING,
              procId,
            }))
        ).pipe(
          tap((openedWindow) => {
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

        // При навигации стрелками сбрасываем выбранный диапазон,
        // чтобы вернуться к одиночным стихам
        this.store.dispatch(BibleActions.resetVersesRange());

        return { type: BibleActionsEnum.selectPrevOrNextVerse };
      })
    )
  );
}
