export enum Pages {
  MAIN = 'main',
  SONGS = 'songs',
  SONGS_FEATURE = 'songs-feature',
  BIBLE_FEATURE = 'bible-feature',
  FREE_SLIDE_FEATURE = 'free-slider-feature',
  FREE_SLIDE = 'free-slider',
  BIBLE = 'bible',
  PROGRAMS = 'programs',
  QUIZ = 'quiz',
  CASTING = 'casting',
  TEST = 'test',
  SETTINGS = 'settings',
}

export enum FreeSlidePages {
  MAIN = 'main',
  SLIDE = 'slide',
}

export const PageTitlesMap: Map<Pages, string> = new Map([
  [Pages.MAIN, ''],
  [Pages.SONGS, 'Песни'],
  [Pages.BIBLE, 'Библия'],
  [Pages.FREE_SLIDE, 'Слайд'],
  [Pages.PROGRAMS, 'Программы'],
  [Pages.QUIZ, 'Викторина'],
  [Pages.CASTING, ''],
  [Pages.SETTINGS, 'Настройки'],
  [Pages.TEST, 'TEST'],
]);

export type Page = {
  id: Pages;
  title: string;
};
