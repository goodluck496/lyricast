import { inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { BibleActions } from './bible.actions';
import { EMPTY, Observable, filter, map, of, switchMap, take, tap, withLatestFrom, catchError } from 'rxjs';

import { BibleState } from './bible.store';
import {
  getSelectedChapter,
  selectBooks,
  selectCastingPaused,
  selectSelectedBook,
  selectSelectedChapter,
  selectSelectedPath,
  selectSelectedTranslate,
  selectSelectedChapterSections,
  selectSelectedVersesRange,
  selectSelectedBibleVerse,
  selectCastingProcess,
  selectSecondaryTranslationCache,
  selectSecondaryTranslationSettings,
} from './bible.selectors';
import {
  AppActions,
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  WindowService,
} from '@lyri-cast/common-browser';
import { APP_COMMON_ACTIONS, AppWindowTypes, EventData } from '@lyri-cast/common-electron';
import {
  BibleBookShort,
  BibleChapter,
  BibleChapterSection,
  BibleVerse,
  BibleVerseForCasting,
} from '@lyri-cast/entities';
import {
  BiblePresentationNavigatePayload,
  BibleSecondaryCastingContent,
  createBibleSecondaryTranslationCacheKey,
} from './bible.actions';
import { BibleApiService } from '@lyri-cast/data-access-bible';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [APP_COMMON_ACTIONS.openedPage]: () => {
    return AppActions.focusPage
  }
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

  /**
   * при закрытии окна нужно сбросить состояние кастинга
   */
  openedWindow$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppActions.closeWindow, AppActions.clearWindowId),
      filter((a) =>
        a.type === AppActions.closeWindow.type
          ? a.windowType === AppWindowTypes.CASTING
          : true
      ),
      map(() => BibleActions.pauseCasting())
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
      withLatestFrom(
        this.store.select(selectCastingPaused),
        this.store.select(selectSelectedBook),
        this.store.select(selectSelectedVersesRange),
        this.store.select(selectSelectedChapterSections),
        this.store.select(selectCastingProcess)
      ),
      filter(([, paused]) => !paused),
      switchMap(([verse, , book, range, sections, castingProcess]) =>
        this.createNavigateAction(
          verse,
          castingProcess?.book ?? book,
          range,
          sections,
          castingProcess?.secondaryContent
        )
      )
    )
  );

  preloadSecondaryTranslation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        BibleActions.updateSecondaryTranslationSettings,
        BibleActions.selectChapter,
        BibleActions.selectChapterSection,
        BibleActions.selectBibleVerse
      ),
      withLatestFrom(
        this.store.select(selectSecondaryTranslationSettings),
        this.store.select(selectSelectedBook),
        this.store.select(selectSelectedChapter),
        this.store.select(selectSecondaryTranslationCache)
      ),
      switchMap(([, settings, book, chapter, cache]) => {
        if (!settings.enabled || !settings.translate || !book || !chapter) {
          return EMPTY;
        }

        const cacheKey = createBibleSecondaryTranslationCacheKey(
          settings.translate,
          book,
          chapter
        );

        if (cache[cacheKey]) {
          return EMPTY;
        }

        return this.apiSrv.getSections(settings.translate, book, chapter).pipe(
          map((sections) =>
            BibleActions.setSecondaryTranslationChapter({
              cacheKey,
              sections,
            })
          ),
          catchError(() => EMPTY)
        );
      })
    )
  );

  navigateCastingOnPrevNext$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BibleActions.selectPrevOrNextVerse),
      withLatestFrom(
        this.store.select(selectCastingPaused),
        this.store.select(selectSelectedBook),
        this.store.select(selectSelectedVersesRange),
        this.store.select(selectSelectedChapterSections),
        this.store.select(selectSelectedBibleVerse),
        this.store.select(selectCastingProcess)
      ),
      filter(([, paused]) => !paused),
      switchMap(([, , book, range, sections, verse, castingProcess]) => {
        if (!verse) {
          return EMPTY;
        }

        return this.createNavigateAction(
          verse,
          castingProcess?.book ?? book,
          range,
          sections,
          castingProcess?.secondaryContent
        );
      })
    )
  );

  private createNavigateAction(
    verse: BibleVerse,
    book: BibleBookShort | null,
    range: { from: number; to: number } | null,
    sections: BibleChapterSection[],
    secondaryContent: BibleSecondaryCastingContent | undefined
  ): Observable<Action> {
    if (!book) {
      return EMPTY;
    }

    return of(secondaryContent).pipe(
      map((content) => {
        const payload = this.createNavigatePayload(
          verse,
          book,
          range,
          sections,
          content
        );

        return {
          type: BibleActions.castingProcessChange.type,
          ...payload,
        };
      })
    );
  }

  private createNavigatePayload(
    verse: BibleVerse,
    book: BibleBookShort,
    range: { from: number; to: number } | null,
    sections: BibleChapterSection[],
    secondaryContent: BibleSecondaryCastingContent | undefined
  ): BiblePresentationNavigatePayload {
    const rangeData = this.createRangePayload(range, sections, book);

    let filteredSecondaryContent: BibleSecondaryCastingContent | undefined;
    if (secondaryContent) {
      let secVerses: BibleVerseForCasting[] = [];
      if (range) {
        const from = Math.min(range.from, range.to);
        const to = Math.max(range.from, range.to);
        secVerses = secondaryContent.content.filter(
          (v) => v.number >= from && v.number <= to
        );
      } else {
        const single = secondaryContent.content.find((v) => v.number === verse.number);
        if (single) {
          secVerses = [single];
        }
      }

      filteredSecondaryContent = {
        translate: secondaryContent.translate,
        content: secVerses,
      };
    }

    return {
      currentContent: {
        ...verse,
        bookTitle: book.title,
        text: [verse.text],
      },
      secondaryContent: filteredSecondaryContent,
      nextIndex: verse.number,
      range: rangeData.range,
      versesInRange: rangeData.versesInRange,
    };
  }

  private createRangePayload(
    range: { from: number; to: number } | null,
    sections: BibleChapterSection[],
    book: BibleBookShort
  ): {
    range?: { from: number; to: number };
    versesInRange?: BibleVerseForCasting[];
  } {
    if (!range || !sections.length) {
      return {};
    }

    const from = Math.min(range.from, range.to);
    const to = Math.max(range.from, range.to);
    const allVerses = sections.flatMap((section) => section.content);
    const versesInRange = allVerses
      .filter((verse) => verse.number >= from && verse.number <= to)
      .map((verse) => ({
        ...verse,
        text: [verse.text],
        bookTitle: book.title,
      }));

    if (!versesInRange.length) {
      return {};
    }

    return {
      range: { from, to },
      versesInRange,
    };
  }

}
