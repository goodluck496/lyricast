import { inject, Injectable } from '@angular/core';
import { Action, ActionCreator, Store } from '@ngrx/store';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { HistoryService } from '../services/history.service';
import { debounceTime, tap } from 'rxjs';
import { loggableActions } from '../navigator-feature';
import { HistoryItem } from '../services/history.types';

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
        debounceTime(300),
        tap((payload) => {
          console.log('action', payload  );
          const entry = loggableActions.find(
            (e) => e.action.type === payload.type
          );
          if (!entry) return;

          if (isActionOfType(payload, entry.action)) {
            const props = payload;
            // const props = (action as { payload: ExtractActionPayload<typeof entry.action> }).payload;
            /**
             * ANY | NEVER плохо, но по другому с этим конструктором никак, GPT не смог, deepseek не смог...
             * не вытянули репку
             */
            const historyItem = entry.toHistory(props as never);
            this.history.add(historyItem);
          }
        })
      ),
    { dispatch: false }
  );
}
