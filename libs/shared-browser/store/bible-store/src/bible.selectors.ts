import { createFeature, createSelector } from '@ngrx/store';
import { BibleReducers } from './bible.reducers';

export const BibleFeatureName = 'Bible' as const;
export const selectBible = createFeature({
  name: BibleFeatureName,
  reducer: BibleReducers,
});

export const {
  selectSelectedTranslate,
  selectSelectedBook,
  selectSelectedChapterSections,
  selectCastingPaused,
  selectCastingProcess,
  selectCastingProcessNavigate,
  selectCastingAppearance,
  selectSelectedBibleVerse,
  selectSelectedPrevOrNextVerse,
  selectSelectedPath,
  selectSelectedVersesRange,
  selectBooks,
  selectChaptersOfBook,
  selectChapterLoading,
  selectSecondaryTranslationSettings,
  selectSecondaryTranslationCache,
} = selectBible;

export const selectSelectedChapter = createSelector(
  selectBible.selectSelectedChapter,
  selectSelectedPath,
  selectChaptersOfBook,
  (selectedChapter, selectedPath, chapters) => {
    if (selectedChapter) return selectedChapter;
    if (selectedPath && selectedPath.length >= 2 && chapters) {
      const chapterId = selectedPath[1];
      return chapters.find(c => c.number.toString() === chapterId) || null;
    }
    return null;
  }
);

export const getSelectedChapter = createSelector(
  selectSelectedTranslate,
  selectSelectedBook,
  selectSelectedChapter,
  (translate, book, chapter) => ({ translate, book, chapter })
);
export const selectSelectedSecondaryTranslationSections = createSelector(
  selectSecondaryTranslationSettings,
  selectSelectedBook,
  selectSelectedChapter,
  selectSecondaryTranslationCache,
  (settings, book, chapter, cache) => {
    if (!settings.enabled || !settings.translate || !book || !chapter) {
      return [];
    }

    const cacheKey = [
      settings.translate.keyForSearch,
      book.number,
      chapter.number,
    ].join(':');

    return cache[cacheKey] ?? [];
  }
);
