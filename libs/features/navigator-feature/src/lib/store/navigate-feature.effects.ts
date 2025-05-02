import { inject, Injectable } from '@angular/core';
import { Action, ActionCreator, Store } from '@ngrx/store';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { HistoryService } from '../services/history.service';
import { debounceTime, EMPTY, switchMap, tap } from 'rxjs';
import { loggableActions } from '../navigator-feature';
import { filterEmpty } from '@lyri-cast/common';

type ExtractActionPayload<T> = T extends ActionCreator<string, infer P>
  ? P extends (props: infer R) => any
    ? R
    : never
  : never;

function isActionOfType<T extends ActionCreator>(
  action: Action,
  creator: T
): action is { type: string; payload: ExtractActionPayload<T> } {
  return action.type === creator.type;
}

@Injectable({ providedIn: 'root' })
export class NavigatorFeatureEffects {
  private store = inject(Store);
  private actions$ = inject(Actions);
  private history = inject(HistoryService);

  loggable$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(...loggableActions.map((entry) => entry.action)),
        /**
         * из-за задержки при добавлении в историю некоторые события пропускаются
         * например в песнях срабатывает сначала выбор песни, затем выбор куплета
         * но почему-то выбор песни не эммитится в историю, а только выбор куплета и из-за этого
         * не строится группа событий
         *
         * пока убрал
         */
        // debounceTime(ADD_HISTORY_ITEM_DELAY),
        switchMap((payload) => {
          const entry = loggableActions.find(
            (e) => e.action.type === payload.type
          );
          if (!entry) return EMPTY;

          if (!isActionOfType(payload, entry.action)) {
            return EMPTY;
          }
          const props = payload;
          // const props = (action as { payload: ExtractActionPayload<typeof entry.action> }).payload;
          /**
           * ANY | NEVER плохо, но по-другому с этим конструктором никак, GPT не смог, deepseek не смог...
           * не вытянули репку
           */
          return entry.toHistory(props as never, [this.store]);
        }),
        filterEmpty(),
        tap((payload) => {
          this.history.add(payload);
        })
      ),
    { dispatch: false }
  );
}
