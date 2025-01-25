import {
  BibleBookShort,
  BibleChapterSection, BibleChapterSectionContent,
  BibleChapterSectionContentForCasting,
  BibleChapterShort,
  BibleTranslateShort
} from '@lyri-cast/entities';
import { BiblePresentationNavigatePayload, BibleStartCastingPayload } from './bible.actions';

export type BibleState = {
  selectedLang: string;
  selectedTranslate: BibleTranslateShort | null;
  selectedBook: BibleBookShort | null;
  selectedChapter: BibleChapterShort | null;
  selectedChapterSection: BibleChapterSection[];
  selectedChapterSectionContent: BibleChapterSectionContent | null;

  /**
   * Путь к стиху в формате '[bookId, chapterId, verseId]'
   * в пути вместо элемента может быть просто null,
   * в таком случае селектор с null останется не выбранным
   */
  selectedPath: string[]

  castingProcess: BibleStartCastingPayload | null;
  castingProcessNavigate:BiblePresentationNavigatePayload | null

  castingPaused: boolean;
};

export const bibleInitialState: BibleState = {
  selectedLang: '',
  selectedTranslate: null,
  selectedBook: null,
  selectedChapter: null,
  selectedChapterSection: [],
  selectedChapterSectionContent: null,
  selectedPath: ['1', '1', '1'],

  castingProcessNavigate: null,

  castingPaused: true,
  castingProcess: null
}
