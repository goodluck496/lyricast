import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import {
  BridgeService,
  selectOpenedWindow,
  SettingsService,
  WindowService,
} from '@lyri-cast/common-browser';
import { APP_COMMON_ACTIONS, AppWindowTypes } from '@lyri-cast/common-electron';
import { QuizActions, QuizActionsEnum, QuizActionSource } from './quiz.actions';
import { QuizStateCasting } from './quiz.reducers';
import { selectQuizCastingProcess } from './quiz.selectors';
import { filter, map, switchMap, withLatestFrom } from 'rxjs/operators';
import { of, from } from 'rxjs';

@Injectable()
export class QuizCastingEffects {
  private readonly store = inject<Store<QuizStateCasting>>(Store);
  private readonly bridge = inject(BridgeService);
  private readonly settingsSrv = inject(SettingsService);
  private readonly window = inject(WindowService);
  private readonly actions$ = inject(Actions);

  // Минимальный эффект: открыть окно на выбранном дисплее и перейти на '/quiz-casting'
  openCasting$ = createEffect(() =>
    this.actions$.pipe(
      ofType(QuizActions[QuizActionsEnum.openCasting]),
      withLatestFrom(this.store.select(selectOpenedWindow)),
      switchMap(([, openedWindow]) => {
        if (openedWindow) {
          // если окно уже есть — просто сказать ему открыть нужную страницу
          return from(
            this.window.electronContext.send({
              event: APP_COMMON_ACTIONS.openPage,
              payload: { path: ['quiz-casting'] },
            }),
          ).pipe(map(() => QuizActions[QuizActionsEnum.startCasting]({})),);
        }

        return this.settingsSrv.getDisplayForCasting().pipe(
          switchMap((display) =>
            from(
              this.window.electronContext.openWindow({
                display,
                title: 'Quiz Casting',
                type: AppWindowTypes.CASTING,
                show: true,
                center: true,
                fullscreen: true,
                focusable: true,
              }),
            ).pipe(
              switchMap(() =>
                from(
                  this.window.electronContext.send({
                    event: APP_COMMON_ACTIONS.openPage,
                    payload: { path: ['quiz-casting'] },
                  }),
                ),
              ),
              map(() => QuizActions[QuizActionsEnum.startCasting]({})),
            ),
          ),
        );
      }),
    ),
  );
}
