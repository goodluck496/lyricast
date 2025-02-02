import { createReducer, on } from '@ngrx/store';
import { bibleInitialState, BibleState } from './bible.store';
import { BibleActions } from './bible.actions';
import { BibleVerse } from '@lyri-cast/entities';

export const BibleReducers = createReducer<BibleState>(
  bibleInitialState,
  on(BibleActions.selectLang, (state, data) => {
    return {
      ...state,
      selectedLang: data.lang,
    } satisfies BibleState;
  }),
  on(BibleActions.selectTranslate, (state, data) => {
    return {
      ...state,
      selectedTranslate: data.translate,
      selectedBook: null,
      selectedChapter: null,
      selectedChapterSections: [],
    } satisfies BibleState;
  }),
  on(BibleActions.setBooks, (state, data) => {
    return {
      ...state,
      books: data.data,
    } satisfies BibleState;
  }),
  on(BibleActions.setChapters, (state, data) => {
    return {
      ...state,
      chaptersOfBook: data.data,
    } satisfies BibleState;
  }),
  on(BibleActions.selectBook, (state, data) => {
    return {
      ...state,
      selectedBook: data.book,
      selectedChapter: null,
      selectedChapterSections: [],
    } satisfies BibleState;
  }),
  on(BibleActions.chapterLoading, (state) => {
    return {
      ...state,
      chapterLoading: true,
    } satisfies BibleState;
  }),
  on(BibleActions.chapterLoaded, (state) => {
    return {
      ...state,
      chapterLoading: false,
    } satisfies BibleState;
  }),
  on(BibleActions.selectChapter, (state, data) => {
    return {
      ...state,
      selectedChapter: data.chapter,
      selectedPath: [
        ...state.selectedPath.slice(0, 1),
        data.chapter.number.toString(),
        '1',
      ],
    } satisfies BibleState;
  }),
  on(BibleActions.selectChapterSection, (state, data) => {
    return {
      ...state,
      selectedChapterSections: data.chapterSection,
    } satisfies BibleState;
  }),
  on(BibleActions.selectBibleVerse, (state, data) => {
    return {
      ...state,
      selectedBibleVerse: data,
      selectedPath: data.path,
    } satisfies BibleState;
  }),
  on(BibleActions.selectPrevOrNextVerse, (state, data) => {
    const section = state.selectedChapterSections[0];
    let verse: BibleVerse | null = null;
    if (section) {
      verse =
        section.content.find(
          (el) => el.path.toString() === data.path.toString()
        ) || null;
    }

    return {
      ...state,
      selectedBibleVerse: verse || state.selectedBibleVerse,
      selectedPrevOrNextVerse: data,
      selectedPath: data.path,
    } satisfies BibleState;
  }),
  on(BibleActions.startCasting, (state, data) => {
    return {
      ...state,
      castingProcess: data,
      castingPaused: false,
    } satisfies BibleState;
  }),
  on(BibleActions.openCasting, (state, data) => {
    return {
      ...state,
      castingProcess: data,
      castingPaused: false,
    } satisfies BibleState;
  }),
  on(BibleActions.stopCasting, (state) => {
    return {
      ...state,
    } satisfies BibleState;
  }),
  on(BibleActions.pauseCasting, (state) => {
    return {
      ...state,
      castingPaused: true,
    } satisfies BibleState;
  }),
  on(BibleActions.castingProcessChange, (state, data) => {
    return {
      ...state,
      castingProcessNavigate: data,
    } satisfies BibleState;
  }),
  on(BibleActions.changePath, (state, data) => {
    return {
      ...state,
      selectedPath: data.path,
    } satisfies BibleState;
  }),
);
