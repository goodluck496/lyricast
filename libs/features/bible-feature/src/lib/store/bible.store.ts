import {
  BibleBookShort, BibleChapterSection,
  BibleChapterSectionContent,
  BibleChapterShort,
  BibleTranslateShort
} from '@lyri-cast/entities';

export type BibleState = {
  selectedLang: string;
  selectedTranslate: BibleTranslateShort | null;
  selectedBook: BibleBookShort | null;
  selectedChapter: BibleChapterShort | null;
  selectedChapterSection: BibleChapterSection[];
  selectedSectionContent: BibleChapterSectionContent[];

  castingPaused: boolean;
  castingProcess: unknown | null;
};

export const bibleInitialState: BibleState = {
  selectedLang: '',
  selectedTranslate: null,
  selectedBook: null,
  selectedChapter: null,
  selectedChapterSection: [],
  selectedSectionContent: [],

  castingPaused: true,
  castingProcess: null
}
