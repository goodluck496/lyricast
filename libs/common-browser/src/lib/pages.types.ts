export enum Pages {
  MAIN = 'main',
  SONGS = 'songs',
  SONGS_NEW = 'songs-new',
  SONGS_FEATURE = 'songs-feature',
  BIBLE = 'bible',
  PROGRAMS = 'programs',
  CASTING = 'casting',
  CASTING_NEW = 'casting-new',
  TEST = 'test',
}

export const PageTitlesMap: Map<Pages, string> = new Map([
  [Pages.MAIN, ''],
  [Pages.SONGS, 'Песни'],
  [Pages.SONGS_NEW, 'Песни(NEW)'],
  [Pages.BIBLE, 'Библия'],
  [Pages.PROGRAMS, 'Программы'],
  [Pages.CASTING, ''],
  [Pages.CASTING_NEW, ''],
  [Pages.TEST, 'TEST'],
]);

export type Page = {
  id: Pages;
  title:string;
}
