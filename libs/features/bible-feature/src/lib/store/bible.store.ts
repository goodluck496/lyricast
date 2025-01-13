import {
  BibleBookShort,
  BibleChapterSectionContent,
  BibleChapterShort,
  BibleTranslateShort,
} from '@lyri-cast/entities';

export type BibleState = {
  selectedLang: string;
  selectedTranslate: BibleTranslateShort | null;
  selectedBook: BibleBookShort | null;
  selectedChapter: BibleChapterShort | null;
  // selectedChapterSection: BibleChapterSection | null;
  selectedSectionContent: BibleChapterSectionContent[];

  castingPaused: boolean;
  castingProcess: unknown | null;
};

export const bibleInitialState: BibleState = {
  selectedLang: '',
  selectedTranslate: null,
  selectedBook: null,
  selectedChapter: null,
  // selectedChapterSection: null,
  selectedSectionContent: [],

  castingPaused: true,
  castingProcess: null
}
