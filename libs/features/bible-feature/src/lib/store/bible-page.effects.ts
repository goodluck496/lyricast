import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { BibleActions } from './bible.actions';
import { map, of, switchMap, withLatestFrom } from 'rxjs';
import { BibleApiService } from '../services/index';
import { BibleState } from './bible.store';
import { getSelectedChapter } from './bible.selectors';
import {
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  WindowService,
} from '@lyri-cast/common-browser';
import { EventData } from '@lyri-cast/common-electron';
import { BibleChapterSection } from '@lyri-cast/entities';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  // [BIBLE_ACTIONS.startCasting]: (eventData: EventData) =>
  //   BibleActions.startCasting(eventData.payload as BibleStartCastingPayload),
  // [BIBLE_ACTIONS.changeCastingProcess]: (eventData: EventData) =>
  //   BibleActions.castingProcessChange(
  //     eventData.payload as BiblePresentationNavigatePayload
  //   ),
  // [BIBLE_ACTIONS.stopCasting]: () => BibleActions.stopCasting(),
  // [BIBLE_ACTIONS.pauseCasting]: () => BibleActions.pauseCasting(),
};

@Injectable()
@BridgeProcessForEffectsDecorator(actionsMap)
export class BiblePageEffects implements BaseEffectsWithBridgeInterface {
  store = inject<Store<BibleState>>(Store);
  actions$ = inject(Actions);

  window = inject(WindowService);
  bridge = inject(BridgeService);
  apiSrv = inject(BibleApiService);

  loadFullChapter$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.selectChapter),
      withLatestFrom(this.store.select(getSelectedChapter)),
      switchMap(([actionData, { translate, book }]) => {
        if (!translate || !book) {
          return of([]);
        }
        return this.apiSrv.getSections(translate, book, actionData.chapter);
      }),
      map((data: BibleChapterSection[]) =>
        BibleActions.selectChapterSection({ chapterSection: data })
      )
    )
  );
}
