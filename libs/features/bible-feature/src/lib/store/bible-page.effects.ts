import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { BibleActions, BibleActionsEnum } from './bible.actions';
import { filter, map, of, switchMap, take, tap, withLatestFrom } from 'rxjs';
import { BibleApiService } from '../services/index';
import { BibleState } from './bible.store';
import {
  getSelectedChapter,
  selectBooks,
  selectCastingPaused,
  selectSelectedBook,
  selectSelectedPath,
  selectSelectedTranslate,
} from './bible.selectors';
import {
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  WindowService,
} from '@lyri-cast/common-browser';
import { EventData } from '@lyri-cast/common-electron';
import {
  BibleBookShort,
  BibleChapter,
  BibleChapterSection,
} from '@lyri-cast/entities';

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

  selectTranslate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.selectTranslate),
      switchMap((data) => this.apiSrv.getBooks(data.translate)),
      map((data) => {
        return BibleActions.setBooks({ data: data as BibleBookShort[] });
      })
    )
  );

  loadFullChapter$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.selectChapter),
      withLatestFrom(this.store.select(getSelectedChapter)),
      tap(() => this.store.dispatch(BibleActions.chapterLoading())),
      switchMap(([actionData, { translate, book }]) => {
        if (!translate || !book) {
          return of([]);
        }
        return this.apiSrv.getSections(translate, book, actionData.chapter);
      }),
      map((data: BibleChapterSection[]) =>
        BibleActions.selectChapterSection({
          chapterSection: data,
          contentId: '1',
        })
      ),
      tap(() => this.store.dispatch(BibleActions.chapterLoaded()))
    )
  );

  changePath$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.changePath),
      withLatestFrom(this.store.select(selectBooks)),
      map(([pathData, books]) => {
        const book = books.find(
          (el) => el.number.toString() === pathData.path[0]
        );

        if (!book) {
          throw new Error(
            `Not found bookId "${pathData.path[0]}" in translate`
          );
        }

        this.store.dispatch(BibleActions.selectBook({ book: book }));
      }),
      switchMap(() =>
        this.actions$.pipe(
          ofType(BibleActions.selectBook),
          take(1),
          withLatestFrom(this.store.select(selectSelectedPath))
        )
      ),
      tap(([bookData, path]) => {
        const book = bookData.book;
        const chapterId = path[1];
        const chapter = book?.chapters.find(
          (el) => el.number.toString() === chapterId
        );
        if (!chapter) {
          throw new Error(
            `Not found chapterId - ${chapterId} in book ${book?.number} ${book?.title}`
          );
        }
        this.store.dispatch(BibleActions.chapterLoading());
      }),
      withLatestFrom(
        this.store.select(selectSelectedTranslate),
        this.store.select(selectSelectedBook)
      ),
      switchMap(([, translate, book]) => {
        if (!translate || !book) {
          return of([]);
        }
        return this.apiSrv.getBookChapters(translate, book);
      }),
      withLatestFrom(this.store.select(selectSelectedPath)),
      map(([chapters, path]) => {
        const chapterId = path[1];
        const contentId = path[2] || '1';
        const chapter: BibleChapter | undefined = chapters.find(
          (el) => el.number.toString() === chapterId
        );
        if (!chapter) {
          throw new Error(
            `Not found chapterId - ${chapterId} in loaded chapters`
          );
        }
        this.store.dispatch(BibleActions.chapterLoaded());

        return BibleActions.selectChapterSection({
          chapterSection: chapter.subsections,
          contentId,
        });
      })
    )
  );

  selectSection$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.selectChapterSection),
      withLatestFrom(this.store.select(selectSelectedPath)),
      map(([sections, path]) => {
        const contentId = path[2];
        const section = sections.chapterSection[0];
        //todo допсекция ВСЕГДА, ПОКАЧТО ОДНА, возможно появятся, но пока пропускаем
        const content = section.content.find(
          (el) => el.number.toString() === contentId
        );
        if (!content) {
          throw new Error(
            `Not found content with id ${contentId} in chapter ${section.chapterId} in bookId ${section.bookId}`
          );
        }

        return BibleActions.selectBibleVerse(content);
      })
    )
  );

  selectVerse$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.selectBibleVerse),
      withLatestFrom(this.store.select(selectCastingPaused)),
      filter(([verse, paused]) => !paused),
      map(([verse, paused]) => {
        return BibleActions.castingProcessChange({
          currentContent: {
            ...verse,
            text: [verse.text],
          },
          nextIndex: verse.number,
        });
      })
    )
  );


}
