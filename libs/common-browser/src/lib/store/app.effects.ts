import { inject, Injectable } from '@angular/core';
import { BridgeService } from '../services/index';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Action, Store } from '@ngrx/store';
import { Router } from '@angular/router';
import {
  APP_COMMON_ACTIONS,
  AppWindowTypes,
  EventData,
} from '@lyri-cast/common-electron';
import { filter, map, tap } from 'rxjs';
import { ActionOpenPageProps, AppActions } from './app.store';

@Injectable()
export class AppEffects {
  private readonly actions$ = inject(Actions);
  private readonly bridge = inject(BridgeService);
  private readonly store = inject(Store);
  private readonly router = inject(Router);

  constructor() {
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
      case APP_COMMON_ACTIONS.openPage: {
        const data = eventData.payload as ActionOpenPageProps;
        return AppActions.openPage({
          path: data.path,
        });
      }
      case APP_COMMON_ACTIONS.openedPage: {
        // const data = eventData.payload as ActionOpenPageProps;
        // return AppActions.openPage({
        //   path: data.path,
        // });

        return AppActions.focusPage();
      }

      case APP_COMMON_ACTIONS.closeWindow: {
        return AppActions.clearWindowId();
      }
      default:
        console.warn('Not found event', eventData.event, eventData.payload);
        return null;
    }
  }

  openPage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppActions.openPage),
      filter(() => this.bridge.windowType !== AppWindowTypes.MAIN),
      tap((data) => {
        this.router
          .navigate([...data.path], { replaceUrl: true })
          .then((r) => console.log('open page', r));
      }),
      map((data) => ({ type: APP_COMMON_ACTIONS.openPage, payload: data }))
    )
  );

  appInit$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppActions.appInit),
      map(() => {
        this.bridge.send(APP_COMMON_ACTIONS.appInit, undefined);
        return { type: APP_COMMON_ACTIONS.appInit };
      })
    )
  );

  closePage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppActions.closeWindow),
      map((data) => {
        this.bridge.windowSrv.electronContext.closeWindow({
          type: data.windowType,
        });

        return { type: APP_COMMON_ACTIONS.closeWindow };
      })
    )
  );
}
