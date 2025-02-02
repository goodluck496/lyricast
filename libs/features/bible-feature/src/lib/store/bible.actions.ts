import { ActionCreatorProps, createActionGroup, emptyProps, props } from '@ngrx/store';
import {
  BibleBookShort,
  BibleChapterSection,
  BibleChapterShort,
  BibleTranslateShort,
  BibleVerse,
  BibleVerseForCasting,
  PrevOrNextVerse
} from '@lyri-cast/entities';
import { Pages } from '@lyri-cast/common-browser';
import { Creator } from '@ngrx/store/src/models';

// export const BibleActionsEnum = {
//   selectLang: 'selectLang',
//   selectTranslate: 'selectTranslate',
//   setBooks: 'setBooks',
//   setChapters: 'setChapters',
//   selectBook: 'selectBook',
//   chapterLoading: 'chapterLoading',
//   chapterLoaded: 'chapterLoaded',
//   selectChapter: 'selectChapter',
//   selectChapterSection: 'selectChapterSection',
//   selectBibleVerse: 'selectBibleVerse',
//   selectPrevOrNextVerse: 'selectPrevOrNextVerse',
//   changePath: 'changePath',
//   openPage: 'openPage',
//   openCasting: 'openCasting',
//   startCasting: 'startCasting',
//   stopCasting: 'stopCasting',
//   pauseCasting: 'pauseCasting',
//   castingProcessChange: 'castingProcessChange'
// } as const;
//
// type BibleActionType = (typeof BibleActionsEnum)[keyof typeof BibleActionsEnum];

export type BibleStartCastingPayload = {
  book: BibleBookShort;
  chapter: BibleChapterShort;
  content: BibleVerseForCasting[];
  fromIndex?: number;
};

export type BiblePresentationNavigatePayload = {
  currentContent: BibleVerseForCasting;
  nextIndex: number;
  /**
   * Перемещает слайды по порядку
   */
  direction?: 'next' | 'prev';
};

// type Events = Record<string, ActionCreatorProps<any> | Creator>
/*

const events: Events = {
  selectLang: props<{ lang: string }>(),
  selectTranslate: props<{ translate: BibleTranslateShort }>(),
  setBooks: props<{ data: BibleBookShort[] }>(),
  setChapters: props<{ data: BibleChapterShort[] }>(),
  selectBook: props<{ book: BibleBookShort | null }>(),


  chapterLoading: emptyProps(),
  chapterLoaded: emptyProps(),
  selectChapter: props<{ chapter: BibleChapterShort }>(),
  selectChapterSection: props<{
    chapterSection: BibleChapterSection[];
    contentId: string;
  }>(),
  selectBibleVerse: props<BibleVerse>(),
  selectPrevOrNextVerse: props<PrevOrNextVerse>(),

  changePath: props<{ path: string[] }>(),

  openPage: props<{ path: Pages[] }>(),
  openCasting: props<BibleStartCastingPayload>(),
  startCasting: props<BibleStartCastingPayload>(),
  stopCasting: emptyProps(),
  pauseCasting: emptyProps(),
  castingProcessChange: props<BiblePresentationNavigatePayload>()
} as const;
*/

/*
const events = Object.fromEntries(
  Object.entries({
    selectLang: props<{ lang: string }>(),
    selectTranslate: props<{ translate: BibleTranslateShort }>(),
    setBooks: props<{ data: BibleBookShort[] }>(),
    setChapters: props<{ data: BibleChapterShort[] }>(),
    selectBook: props<{ book: BibleBookShort | null }>(),
    chapterLoading: emptyProps(),
    chapterLoaded: emptyProps(),
    selectChapter: props<{ chapter: BibleChapterShort }>(),
    selectChapterSection: props<{
      chapterSection: BibleChapterSection[];
      contentId: string;
    }>(),
    selectBibleVerse: props<BibleVerse>(),
    selectPrevOrNextVerse: props<PrevOrNextVerse>(),
    changePath: props<{ path: string[] }>(),
    openPage: props<{ path: Pages[] }>(),
    openCasting: props<BibleStartCastingPayload>(),
    startCasting: props<BibleStartCastingPayload>(),
    stopCasting: emptyProps(),
    pauseCasting: emptyProps(),
    castingProcessChange: props<BiblePresentationNavigatePayload>()
  }).map(([key, value]) => [BibleActionsEnum[key as keyof typeof BibleActionsEnum], value])
) as const;

export const BibleActions = createActionGroup<'BIBLE_ACTIONS', typeof events>({
  source: 'BIBLE_ACTIONS',
  events
});
*/

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
  openCasting: 'openCasting',
  startCasting: 'startCasting',
  stopCasting: 'stopCasting',
  pauseCasting: 'pauseCasting',
  castingProcessChange: 'castingProcessChange'
} as const;

export type BibleActionsEnumKeys = keyof typeof BibleActionsEnum;

export const BibleActions = createActionGroup({
  source: 'BIBLE_ACTIONS',
  events: {
    [BibleActionsEnum.selectLang]: props<{ lang: string }>(),
    [BibleActionsEnum.selectTranslate]: props<{ translate: BibleTranslateShort }>(),
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

    [BibleActionsEnum.openPage]: props<{ path: Pages[] }>(),
    [BibleActionsEnum.openCasting]: props<BibleStartCastingPayload>(),
    [BibleActionsEnum.startCasting]: props<BibleStartCastingPayload>(),
    [BibleActionsEnum.stopCasting]: emptyProps(),
    [BibleActionsEnum.pauseCasting]: emptyProps(),
    [BibleActionsEnum.castingProcessChange]: props<BiblePresentationNavigatePayload>()
  }
});

