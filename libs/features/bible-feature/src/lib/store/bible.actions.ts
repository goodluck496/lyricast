import { createActionGroup, emptyProps, props } from '@ngrx/store';
import {
  BibleBookShort,
  BibleChapterSection, BibleChapterSectionContent,
  BibleChapterSectionContentForCasting,
  BibleChapterShort,
  BibleTranslateShort
} from '@lyri-cast/entities';
import { Pages } from '@lyri-cast/common-browser';

export type BibleStartCastingPayload = {
  book: BibleBookShort;
  chapter: BibleChapterShort;
  content: BibleChapterSectionContentForCasting[];
  fromIndex?: number;
};

export type BiblePresentationNavigatePayload = {
  currentContent: BibleChapterSectionContentForCasting;
  /**
   * Перемещает слайды по порядку
   */
  direction?: 'next' | 'prev';
  /**
   * Выбирает слайд по индексу
   */
  index?: number;
};

export const BibleActions = createActionGroup({
  source: 'BIBLE_ACTIONS',
  events: {
    selectLang: props<{ lang: string }>(),
    selectTranslate: props<{ translate: BibleTranslateShort }>(),
    selectBook: props<{ book: BibleBookShort | null }>(),
    selectChapter: props<{ chapter: BibleChapterShort }>(),
    selectChapterSection: props<{ chapterSection: BibleChapterSection[] }>(),
    selectChapterSectionContent: props<BibleChapterSectionContent>(),

    changePath: props<{ path: string[] }>(),

    openPage: props<{ path: Pages[] }>(),
    openCasting: props<BibleStartCastingPayload>(),
    startCasting: props<BibleStartCastingPayload>(),
    stopCasting: emptyProps(),
    pauseCasting: emptyProps(),
    castingProcessChange: props<BiblePresentationNavigatePayload>(),
  },
});
