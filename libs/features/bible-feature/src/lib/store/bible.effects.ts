import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { BibleActions } from './bible.actions';
import { map, of, switchMap, withLatestFrom } from 'rxjs';
import { BibleApiService } from '../services/index';
import { BibleState } from './bible.store';
import { getSelectedChapter } from './bible.selectors';

@Injectable()
export class BibleEffects {
  store = inject<Store<BibleState>>(Store);
  actions$ = inject(Actions);

  apiSrv = inject(BibleApiService);

  loadFullChapter$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.selectChapter),
      withLatestFrom(this.store.select(getSelectedChapter)),
      switchMap(([actionData, { translate, book }]) => {
        if (!translate || !book) {
          return of([]);
        }
        return this.apiSrv.getSections(
          translate,
          book,
          actionData.chapter
        );
      }),
      map((data) =>
        BibleActions.selectSections({
          sectionContent: data,
        })
      )
    )
  );
}
