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
  DEFAULT_CASTING_PAGE_CONFIG,
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
  [SONG_ACTIONS.selectSong]: (eventData: EventData) => {
    const payload = eventData.payload as SongPayloadsMap['SELECT_SONG'];
    return SongActions.selectSong({
      ...payload,
    });
  },
  [SONG_ACTIONS.openCasting]: (eventData: EventData) =>
    SongActions.startCasting(
      eventData.payload as SongPayloadsMap['OPEN_CASTING']
    ),
  [SONG_ACTIONS.selectBook]: () => SongActions.stopCasting(),
  [SONG_ACTIONS.openedPage]: (eventData: EventData) => {
    return SongActions.openedPage({
      name:
        (eventData.payload as SongPayloadsMap[typeof SONG_ACTIONS.openedPage])
          .page || Pages.CASTING,
    });
  },
  [SONG_ACTIONS.castingStarted]: () => {
    return SongActions.castingStarted();
  },
};

@Injectable()
@BridgeProcessForEffectsDecorator(actionsMap)
export class SongsPageEffects implements BaseEffectsWithBridgeInterface {
  actions$ = inject(Actions);
  store = inject(Store<SongPageState>);
  bridge = inject(BridgeService);
  window = inject(WindowService);
  settingsSrv = inject(SettingsService);

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
        console.log('send start casting', data);
        this.bridge.send<'START_CASTING', SongPayloadsMap>(
          SONG_ACTIONS.startCasting,
          data
        );
      }),
      switchMap(() => this.actions$.pipe(ofType(SongActions.castingStarted))),
      withLatestFrom(this.store.select(selectCastingProcess)),
      map(([, process]) => {
        if (!process) {
          return { type: SONG_ACTIONS.castingStarted + 'ERROR' };
        }
        return SongActions.slideNavigate({
          index: process.fromIndex ?? 0 /*+ 1*/,
          direction: 'next',
          currentLyric: process.currentLyric,
        });
      })
    )
  );

  /**
   * Вызывается когда окно и страница с кастингом запустилась
   */
  onOpened$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SongActions.openedPage),
      withLatestFrom(this.store.select(selectCastingProcess)),
      map(([page, data]) => {
        console.log('page | data and START CASTING', page, data);
        if (!data) {
          return { type: SONG_ACTIONS.pauseCasting };
        }

        this.store.dispatch(
          SongActions.startCasting({
            ...data,
          })
        );
        return { type: SONG_ACTIONS.startCasting };
      })
    )
  );

  /**
   * Эффект отправки в окно кастинга событие открытия страницы
   */
  onOpenPage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SongActions.openPage),
      map((data) => {
        this.bridge.send<typeof SONG_ACTIONS.openPage, SongPayloadsMap>(
          SONG_ACTIONS.openPage,
          data
        );

        return { type: SONG_ACTIONS.openPage };
      })
    )
  );

  /**
   * при закрытии окна нужно сбросить состояние кастинга
   */
  closeWindow$ = createEffect(() =>
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
        console.log('onOpenCasting$', windowData);
        if (windowData) {
          // this.store.dispatch(
          //   SongActions.openPage({
          //       path: [Pages.SONGS_FEATURE, Pages.CASTING],
          //   })
          // );
          // return of({type: 'SongActions.openedPage'});
          // SongActions.openedPage({
          //   name: Pages.CASTING,
          // })
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
              ...DEFAULT_CASTING_PAGE_CONFIG,
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
          console.log('navigate');
          this.bridge.send<typeof SONG_ACTIONS.slideNavigate, SongPayloadsMap>(
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
        this.bridge.send<typeof SONG_ACTIONS.pauseCasting, SongPayloadsMap>(
          SONG_ACTIONS.pauseCasting,
          void 0
        );

        return { type: SONG_ACTIONS.pauseCasting };
      })
    )
  );
}
