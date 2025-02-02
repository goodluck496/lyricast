import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import {
  filter,
  map,
  mergeMap,
  of,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs';
import {
  APP_COMMON_ACTIONS,
  AppWindowTypes,
  EventData,
} from '@lyri-cast/common-electron';
import {
  AppActions,
  BaseEffectsWithBridgeInterface,
  BridgeService,
  Pages,
  selectOpenedWindow,
  SettingsService,
  WindowService,
} from '@lyri-cast/common-browser';
import { Action, Store } from '@ngrx/store';
import { selectCastingProcess, SongPageState } from './song.reducers';
import { SONG_ACTIONS, SongActions } from './song.actions';
import { SongPayloadsMap } from './song-electron.types';
import { fromPromise } from 'rxjs/internal/observable/innerFrom';
import { snapshot } from '@lyri-cast/common';

@Injectable()
export class SongsPageEffects implements BaseEffectsWithBridgeInterface {
  actions$ = inject(Actions);
  store = inject(Store<SongPageState>);
  bridge = inject(BridgeService);
  window = inject(WindowService);
  settingsSrv = inject(SettingsService);

  constructor() {
    this.initSubscribeByBridge();
  }

  actionMapper(eventData: EventData): Action | null {
    switch (eventData.event) {
      case SONG_ACTIONS.selectSong:
        return SongActions.selectSong(
          (eventData.payload as SongPayloadsMap['SELECT_SONG']).song
        );

      case SONG_ACTIONS.openCasting:
        return SongActions.startCasting(
          eventData.payload as SongPayloadsMap['OPEN_CASTING']
        );

      case SONG_ACTIONS.selectBook:
        return SongActions.stopCasting();

      case SONG_ACTIONS.slideNavigate:
        return SongActions.slideNavigate(
          eventData.payload as SongPayloadsMap['SLIDE_NAVIGATE']
        );

      default:
        console.warn('Not found event', eventData.event, eventData.payload);
        return null;
    }
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

  onOpenCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SongActions.openCasting),
      withLatestFrom(this.store.select(selectOpenedWindow)),
      mergeMap(([, windowData]) => {
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
              type: AppWindowTypes.SONG_CASTING,
              title: 'Casting new',
              show: true,
              center: true,
              fullscreen: true,
              display: selectedDisplay,
            })
            .then((procId) => ({
              type: AppWindowTypes.SONG_CASTING,
              procId,
            }))
        ).pipe(
          tap((openedWindow) => {
            this.store.dispatch(
              AppActions.setProcId({
                procId: openedWindow.procId,
                pageType: AppWindowTypes.SONG_CASTING,
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

  onNavigate$ = createEffect(() =>
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
        return { type: SONG_ACTIONS.slideNavigate };
      })
    )
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
