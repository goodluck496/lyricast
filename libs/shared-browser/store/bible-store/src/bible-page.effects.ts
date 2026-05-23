import { inject, Injectable, NgZone } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import {
  BibleActions,
  BiblePresentationNavigatePayload,
  BibleSecondaryCastingContent,
  BibleSecondaryTranslationSettings,
  createBibleSecondaryTranslationCacheKey
} from './bible.actions';
import {
  combineLatest,
  debounceTime,
  EMPTY,
  filter,
  map,
  Observable,
  of,
  switchMap,
  take,
  tap,
  withLatestFrom
} from 'rxjs';

import { BibleState } from './bible.store';
import {
  getSelectedChapter,
  selectBooks,
  selectCastingPaused,
  selectSecondaryTranslationCache,
  selectSecondaryTranslationSettings,
  selectSelectedBibleVerse,
  selectSelectedBook,
  selectSelectedChapterSections,
  selectSelectedPath,
  selectSelectedTranslate,
  selectSelectedVersesRange
} from './bible.selectors';
import {
  AppActions,
  BaseEffectsWithBridgeInterface,
  BridgeProcessForEffectsDecorator,
  BridgeService,
  WindowService
} from '@lyri-cast/common-browser';
import { APP_COMMON_ACTIONS, AppWindowTypes, EventData } from '@lyri-cast/common-electron';
import {
  BibleBookShort,
  BibleChapterSection,
  BibleChapterShort,
  BibleVerse,
  BibleVerseForCasting
} from '@lyri-cast/entities';
import { BibleApiService } from '@lyri-cast/data-access-bible';

const actionsMap: Record<string, (eventData: EventData) => Action> = {
  [APP_COMMON_ACTIONS.openedPage]: () => {
    return AppActions.focusPage;
  },
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
        const chapter: any = chapters.find(
          (el: any) => el.number.toString() === chapterId
        );
        if (!chapter) {
          throw new Error(
            `Not found chapterId - ${chapterId} in loaded chapters`
          );
        }
        this.store.dispatch(
          BibleActions.setChapters({ data: chapters as any[] })
        );
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
        this.store.select(selectSecondaryTranslationSettings),
        this.store.select(selectSecondaryTranslationCache)
      ),
      filter(([, paused]) => !paused),
      switchMap(([verse, , book, range, sections, settings, cache]) => {
        if (!book) {
          return EMPTY;
        }

        const chapter = book.chapters.find((c) => c.number === verse.chapterId);
        if (!chapter) {
          return EMPTY;
        }

        const secondaryContent = this.getSecondaryCastingContent(
          settings,
          cache,
          book,
          chapter,
          verse.number,
          range
        );

        return this.createNavigateAction(
          verse,
          book,
          range,
          sections,
          secondaryContent
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
        this.store.select(selectSecondaryTranslationSettings),
        this.store.select(selectSecondaryTranslationCache)
      ),
      filter(([, paused]) => !paused),
      switchMap(([, , book, range, sections, verse, settings, cache]) => {
        if (!verse || !book) {
          return EMPTY;
        }

        const chapter = book.chapters.find((c) => c.number === verse.chapterId);
        if (!chapter) {
          return EMPTY;
        }

        const secondaryContent = this.getSecondaryCastingContent(
          settings,
          cache,
          book,
          chapter,
          verse.number,
          range
        );

        return this.createNavigateAction(
          verse,
          book,
          range,
          sections,
          secondaryContent
        );
      })
    )
  );
  updateCastingOnSecondaryContentChange$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        BibleActions.updateSecondaryTranslationSettings,
        BibleActions.setSecondaryTranslationChapter
      ),
      withLatestFrom(
        this.store.select(selectCastingPaused),
        this.store.select(selectSelectedBibleVerse),
        this.store.select(selectSelectedBook),
        this.store.select(selectSelectedVersesRange),
        this.store.select(selectSelectedChapterSections),
        this.store.select(selectSecondaryTranslationSettings),
        this.store.select(selectSecondaryTranslationCache)
      ),
      filter(([, paused]) => !paused),
      switchMap(([, , verse, book, range, sections, settings, cache]) => {
        if (!verse || !book) {
          return EMPTY;
        }

        const chapter = book.chapters.find((c) => c.number === verse.chapterId);
        if (!chapter) {
          return EMPTY;
        }

        const secondaryContent = this.getSecondaryCastingContent(
          settings,
          cache,
          book,
          chapter,
          verse.number,
          range
        );

        return this.createNavigateAction(
          verse,
          book,
          range,
          sections,
          secondaryContent
        );
      })
    )
  );
  private readonly zone = inject(NgZone);
  preloadSecondaryTranslation$ = createEffect(() =>
    combineLatest([
      this.store.select(selectSecondaryTranslationSettings),
      this.store.select(selectSelectedBook),
      this.store.select(selectSelectedPath),
    ]).pipe(
      debounceTime(100),
      withLatestFrom(this.store.select(selectSecondaryTranslationCache)),
      switchMap(([[settings, book, path], cache]) => {
        if (
          !settings.enabled ||
          !settings.translate ||
          !book ||
          !path ||
          path.length < 2
        ) {
          return EMPTY;
        }

        const chapterNumber = Number(path[1]);
        if (isNaN(chapterNumber)) {
          return EMPTY;
        }

        const chapter: BibleChapterShort = {
          number: chapterNumber,
          title: `Глава ${chapterNumber}`,
        };

        const cacheKey = createBibleSecondaryTranslationCacheKey(
          settings.translate,
          book,
          chapter
        );

        if (cache[cacheKey]) {
          return EMPTY;
        }

        // Run the HTTP request outside of Angular zone to prevent freezing UI / blocking Change Detection
        return new Observable<Action>((subscriber) => {
          this.zone.runOutsideAngular(() => {
            this.apiSrv
              .getSections(settings.translate!, book, chapter)
              .subscribe({
                next: (sections) => {
                  this.zone.run(() => {
                    subscriber.next(
                      BibleActions.setSecondaryTranslationChapter({
                        cacheKey,
                        sections,
                      })
                    );
                    subscriber.complete();
                  });
                },
                error: () => {
                  this.zone.run(() => {
                    subscriber.complete();
                  });
                },
              });
          });
        });
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

    return {
      currentContent: {
        ...verse,
        bookTitle: book.title,
        text: [verse.text],
      },
      secondaryContent, // Already optimized and filtered down to the requested verse in getSecondaryCastingContent
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

  private getSecondaryCastingContent(
    settings: BibleSecondaryTranslationSettings,
    cache: Record<string, BibleChapterSection[]>,
    book: BibleBookShort,
    chapter: any,
    verseNumber: number,
    range: { from: number; to: number } | null
  ): BibleSecondaryCastingContent | undefined {
    if (!settings.enabled || !settings.translate) {
      return undefined;
    }

    const cacheKey = createBibleSecondaryTranslationCacheKey(
      settings.translate,
      book,
      chapter
    );
    const cachedSections = cache[cacheKey];

    if (!cachedSections || !cachedSections.length) {
      return undefined;
    }

    // Find and map ONLY the requested verses immediately, completely bypassing chapter flatMap/mapping overhead
    let filteredVerses: BibleVerse[] = [];
    if (range) {
      const from = Math.min(range.from, range.to);
      const to = Math.max(range.from, range.to);

      for (const section of cachedSections) {
        for (const v of section.content) {
          if (v.number >= from && v.number <= to) {
            filteredVerses.push(v);
          }
        }
      }
    } else {
      let foundVerse: BibleVerse | undefined;
      for (const section of cachedSections) {
        foundVerse = section.content.find((v) => v.number === verseNumber);
        if (foundVerse) {
          filteredVerses.push(foundVerse);
          break;
        }
      }
    }

    const content = filteredVerses.map((v) => ({
      ...v,
      text: [v.text],
      bookTitle: book.title,
    }));

    const result = {
      translate: settings.translate,
      content,
    };
    return result;
  }
}
