export type BibleVerse = {
  contentType: 'line';
  number: number;
  text: string;
  chapterId: number;
  bookId: number;
};

export type BibleChapterSectionContentForCasting = Omit<BibleVerse, 'text'> & {
  text: string[];
}

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

export type BibleBook = {
  number: number;
  title: { short: string; full: string };
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
  isClassicBookOrder: boolean
};
