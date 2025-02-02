export enum Pages {
  MAIN = 'main',
  SONGS = 'songs',
  SONGS_FEATURE = 'songs-feature',
  BIBLE_FEATURE = 'bible-feature',
  BIBLE = 'bible',
  PROGRAMS = 'programs',
  CASTING = 'casting',
  TEST = 'test',
  SETTINGS = 'settings',
}

export const PageTitlesMap: Map<Pages, string> = new Map([
  [Pages.MAIN, ''],
  [Pages.SONGS, 'Песни'],
  [Pages.BIBLE, 'Библия'],
  [Pages.PROGRAMS, 'Программы'],
  [Pages.CASTING, ''],
  [Pages.SETTINGS, 'Настройки'],
  [Pages.TEST, 'TEST'],
]);

export type Page = {
  id: Pages;
  title:string;
}
