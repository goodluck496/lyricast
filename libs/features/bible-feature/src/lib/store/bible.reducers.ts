import { createReducer, on } from '@ngrx/store';
import { bibleInitialState, BibleState } from './bible.store';
import { BibleActions } from './bible.actions';

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
    } satisfies BibleState;
  }),
  on(BibleActions.selectBook, (state, data) => {
    return {
      ...state,
      selectedBook: data.book,
    } satisfies BibleState;
  }),
  on(BibleActions.selectChapter, (state, data) => {
    return {
      ...state,
      selectedChapter: data.chapter,
    } satisfies BibleState;
  }),
  // on(BibleActions.selectSections, (state, data) => {
  //   return {
  //     ...state,
  //     selectedSectionContent: data.sectionContent,
  //   } satisfies BibleState;
  // })
);
