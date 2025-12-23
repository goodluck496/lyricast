import { createActionGroup, emptyProps, props } from '@ngrx/store';
import {
  BibleBookShort,
  BibleChapterSection,
  BibleChapterShort,
  BibleTranslateShort,
  BibleVerse,
  BibleVerseForCasting,
  PrevOrNextVerse,
} from '@lyri-cast/entities';
import { Pages } from '@lyri-cast/common-browser';
import { OpenWindowArgs } from '@lyri-cast/common-electron';

export type BibleStartCastingPayload = {
  book: BibleBookShort;
  chapter: BibleChapterShort;
  content: BibleVerseForCasting[];
  fromIndex: number;
  range?: { from: number; to: number };
};

export type BiblePresentationNavigatePayload = {
  currentContent: BibleVerseForCasting;
  nextIndex: number;
  /**
   * Перемещает слайды по порядку
   */
  direction?: 'next' | 'prev';

  // Для работы с диапазоном стихов при навигации
  range?: { from: number; to: number };
  versesInRange?: BibleVerseForCasting[];
};

export const BibleActionsEnum = {
  selectLang: 'selectLang',
  selectTranslate: 'selectTranslate',
  setBooks: 'setBooks',
  setChapters: 'setChapters',
  selectBook: 'selectBook',
  chapterLoading: 'chapterLoading',
  chapterLoaded: 'chapterLoaded',
  selectChapter: 'selectChapter',
  selectChapterSection: 'selectChapterSection',
  selectBibleVerse: 'selectBibleVerse',
  selectPrevOrNextVerse: 'selectPrevOrNextVerse',
  changePath: 'changePath',
  openPage: 'openPage',
  openedCastingPage: 'openedCastingPage',
  openCasting: 'openCasting',
  startCasting: 'startCasting',
  stopCasting: 'stopCasting',
  pauseCasting: 'pauseCasting',
  castingProcessChange: 'castingProcessChange',
  selectVersesRange: 'selectVersesRange',
  resetVersesRange: 'resetVersesRange',
} as const;

export type BibleActionsEnumKeys = keyof typeof BibleActionsEnum;

export const BibleActions = createActionGroup({
  source: 'BIBLE_ACTIONS',
  events: {
    [BibleActionsEnum.selectLang]: props<{ lang: string }>(),
    [BibleActionsEnum.selectTranslate]: props<{
      translate: BibleTranslateShort;
    }>(),
    [BibleActionsEnum.setBooks]: props<{ data: BibleBookShort[] }>(),
    [BibleActionsEnum.setChapters]: props<{ data: BibleChapterShort[] }>(),
    [BibleActionsEnum.selectBook]: props<{ book: BibleBookShort | null }>(),

    [BibleActionsEnum.chapterLoading]: emptyProps(),
    [BibleActionsEnum.chapterLoaded]: emptyProps(),
    [BibleActionsEnum.selectChapter]: props<{ chapter: BibleChapterShort }>(),
    [BibleActionsEnum.selectChapterSection]: props<{
      chapterSection: BibleChapterSection[];
      contentId: string;
    }>(),
    [BibleActionsEnum.selectBibleVerse]: props<BibleVerse>(),
    [BibleActionsEnum.selectPrevOrNextVerse]: props<PrevOrNextVerse>(),

    [BibleActionsEnum.changePath]: props<{ path: string[] }>(),

    [BibleActionsEnum.openPage]: props<{
      path: Pages[];
      windowProps?: OpenWindowArgs;
    }>(),
    [BibleActionsEnum.openCasting]: props<BibleStartCastingPayload>(),
    [BibleActionsEnum.startCasting]: props<BibleStartCastingPayload>(),
    [BibleActionsEnum.stopCasting]: emptyProps(),
    [BibleActionsEnum.pauseCasting]: emptyProps(),
    [BibleActionsEnum.castingProcessChange]:
      props<BiblePresentationNavigatePayload>(),
    [BibleActionsEnum.openedCastingPage]: emptyProps(),
    [BibleActionsEnum.selectVersesRange]: props<{ from: number; to: number }>(),
    [BibleActionsEnum.resetVersesRange]: emptyProps(),
  },
});

export const BibleActionSource = 'BIBLE_ACTIONS';
