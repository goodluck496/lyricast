import { createFeature, createSelector } from '@ngrx/store';
import { BibleReducers } from './bible.reducers';

export const BibleFeatureName = 'Bible' as const;
export const selectBible = createFeature({
  name: BibleFeatureName,
  reducer: BibleReducers,
});

export const {
  selectSelectedTranslate,
  selectSelectedChapter,
  selectSelectedBook,
  selectSelectedChapterSection
} = selectBible;

export const getSelectedChapter = createSelector(
  selectSelectedTranslate,
  selectSelectedBook,
  selectSelectedChapter,
  (translate, book, chapter) => ({ translate, book, chapter })
);
