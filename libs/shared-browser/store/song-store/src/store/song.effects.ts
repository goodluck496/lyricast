import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { filter, map, of, switchMap, tap, withLatestFrom } from 'rxjs';
import {
  APP_COMMON_ACTIONS,
  AppWindowTypes,
  EventData,
} from '@lyri-cast/common-electron';
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
import { Action, Store } from '@ngrx/store';
import { SongPageState } from './song.reducers';
import { SONG_ACTIONS, SongActions } from './song.actions';
import { SongPayloadsMap } from './song-electron.types';
import { fromPromise } from 'rxjs/internal/observable/innerFrom';
import { snapshot } from '@lyri-cast/common';
import { selectCastingProcess } from './song.selectors';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [SONG_ACTIONS.selectSong]: (eventData: EventData) =>
    SongActions.selectSong(
      (eventData.payload as SongPayloadsMap['SELECT_SONG']).song
    ),
  [SONG_ACTIONS.openCasting]: (eventData: EventData) =>
    SongActions.startCasting(
      eventData.payload as SongPayloadsMap['OPEN_CASTING']
    ),
  [SONG_ACTIONS.selectBook]: () => SongActions.stopCasting(),
  // [SONG_ACTIONS.slideNavigate]: (eventData: EventData) =>
  //   SongActions.slideNavigate(
  //     eventData.payload as SongPayloadsMap['SLIDE_NAVIGATE']
  //   ),
};

@Injectable()
@BridgeProcessForEffectsDecorator(actionsMap)
export class SongsPageEffects implements BaseEffectsWithBridgeInterface {
  actions$ = inject(Actions);
  store = inject(Store<SongPageState>);
  bridge = inject(BridgeService);
  window = inject(WindowService);
  settingsSrv = inject(SettingsService);

  constructor() {
    console.log('SongsPageEffects');
  }

  selectedSong$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SongActions.selectSong),
      map((data) => {
        if (!data) {
          return { type: 'not found song' };
        }

        return { type: SONG_ACTIONS.selectSong };
      })
    )
  );

  startCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SongActions.startCasting),
      tap((data) => {
        this.bridge.send<'START_CASTING', SongPayloadsMap>(
          SONG_ACTIONS.startCasting,
          data
        );
      }),
      map(() => ({ type: SONG_ACTIONS.startCasting }))
    )
  );

  onOpenPage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SongActions.openPage),
      map((data) => {
        this.bridge.send<'OPEN_PAGE', SongPayloadsMap>(
          SONG_ACTIONS.openPage,
          data
        );

        return { type: SONG_ACTIONS.openPage };
      }),
      switchMap(() => this.bridge.queueEvents),
      withLatestFrom(this.store.select(selectCastingProcess)),
      filter(([event]) => !!event && event.event === SONG_ACTIONS.openedPage),
      map(([, data]) => {
        if (!data) {
          return { type: SONG_ACTIONS.pauseCasting };
        }
        return SongActions.startCasting({
          ...data,
        });
      })
    )
  );

  /**
   * при закрытии окна нужно сбросить состояние кастинга
   */
  openedWindow$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppActions.closeWindow),
      map(() => SongActions.pauseCasting())
    )
  );

  onOpenCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SongActions.openCasting),
      withLatestFrom(this.store.select(selectOpenedWindow)),
      switchMap(([, windowData]) => {
        if (windowData) {
          return of(
            SongActions.openPage({
              path: [Pages.SONGS_FEATURE, Pages.CASTING],
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
              fullscreen: false,
              display: selectedDisplay,
            })
            .then((procId) => ({
              type: AppWindowTypes.CASTING,
              procId,
            }))
        ).pipe(
          // take(1),
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
            SongActions.openPage({
              path: [Pages.SONGS_FEATURE, Pages.CASTING],
            })
          )
        );
      })
    )
  );

  onNavigate$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(SongActions.slideNavigate),
        map((data) => {
          this.bridge.send<'SLIDE_NAVIGATE', SongPayloadsMap>(
            SONG_ACTIONS.slideNavigate,
            {
              currentLyric: data.currentLyric,
              direction: data.direction,
              index: data.index,
            }
          );
          return { type: '1111SONG_ACTIONS.slideNavigate' };
          // return { type: SONG_ACTIONS.slideNavigate };
        })
      ),
    { dispatch: false }
  );

  pauseCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SongActions.pauseCasting),
      map(() => {
        this.bridge.send<'PAUSE_CASTING', SongPayloadsMap>(
          SONG_ACTIONS.pauseCasting,
          void 0
        );

        return { type: SONG_ACTIONS.pauseCasting };
      })
    )
  );
}
