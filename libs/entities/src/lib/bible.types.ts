export type PrevOrNextVerse = Omit<BibleVerse, 'text' | 'prev' | 'next'> & {
  bookChanged: boolean;
  chapterChanged: boolean;
};

export type BibleVerse = {
  contentType: 'line';
  number: number;
  text: string;
  chapterId: number;
  bookId: number;
  path: string[];
  next: PrevOrNextVerse;
  prev: PrevOrNextVerse;
};

export type BibleVerseForCasting = Omit<BibleVerse, 'text'> & {
  text: string[];
  bookTitle: { short: string; full: string };
};

export type BibleChapterSection = {
  heading: string;
  content: BibleVerse[];
  chapterId: number;
  bookId: number;
};

export type BibleChapter = {
  number: number;
  title: string;
  bookId: number;
  subsections: BibleChapterSection[];
};

export enum BibleBookType {
  Law = 'Law', // Закон
  History = 'History', // История
  Poetry = 'Poetry', // Поэзия
  MajorProphet = 'MajorProphet', // Большие пророки
  MinorProphet = 'MinorProphet', // Малые пророки
  Gospel = 'Gospel', // Евангелия
  Acts = 'Acts',
  GeneralEpistle = 'GeneralEpistle', // Послания
  PaulineEpistle = 'Pauline Epistle',
  PastoralEpistle = 'Pastoral Epistle',
  Apocalyptic = 'Apocalyptic', // Апокалиптические книги
}

export type BibleBookTitle = { short: string; full: string }
export type BibleBook = {
  number: number;
  title: BibleBookTitle;
  chapters: BibleChapter[];
  type: BibleBookType;
};

export type BibleTranslate = {
  keyForSearch: string;
  title: string;
  sourceTitle: string;
  lang: string;
  version: string;
  books: BibleBook[];
  isDefault: boolean;
  isClassicBookOrder: boolean;
};
