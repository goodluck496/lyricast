import {
  BibleBookShort,
  BibleChapterSection,
  BibleChapterShort,
  BibleTranslateShort,
  BibleVerse,
  PrevOrNextVerse,
} from '@lyri-cast/entities';
import {
  BiblePresentationNavigatePayload,
  BibleStartCastingPayload,
} from './bible.actions';
import { CastingAppearance, DEFAULT_CASTING_APPEARANCE } from '@lyri-cast/common-browser';

export type BibleState = {
  selectedLang: string;
  selectedTranslate: BibleTranslateShort | null;

  books: BibleBookShort[];
  chaptersOfBook: BibleChapterShort[];

  chapterLoading: boolean;

  selectedBook: BibleBookShort | null;
  selectedChapter: BibleChapterShort | null;
  selectedChapterSections: BibleChapterSection[];
  selectedBibleVerse: BibleVerse | null;
  selectedPrevOrNextVerse: PrevOrNextVerse | null;

  /**
   * Путь к стиху в формате '[bookId, chapterId, verseId]'
   * в пути вместо элемента может быть просто null,
   * в таком случае селектор с null останется не выбранным
   */
  selectedPath: string[];

  /** Диапазон выделенных стихов (по номерам внутри главы) */
  selectedVersesRange: { from: number; to: number } | null;

  castingProcess: BibleStartCastingPayload | null;
  castingProcessNavigate: BiblePresentationNavigatePayload | null;
  castingAppearance: CastingAppearance;

  castingPaused: boolean;
};

export const bibleInitialState: BibleState = {
  selectedLang: '',
  selectedTranslate: null,

  books: [],
  chaptersOfBook: [],

  chapterLoading: false,

  selectedBook: null,
  selectedChapter: null,
  selectedChapterSections: [],
  selectedBibleVerse: null,
  selectedPrevOrNextVerse: null,
  selectedPath: ['1', '1', '1'],

  selectedVersesRange: null,

  castingProcessNavigate: null,

  castingPaused: true,
  castingProcess: null,
  castingAppearance: DEFAULT_CASTING_APPEARANCE,
};
