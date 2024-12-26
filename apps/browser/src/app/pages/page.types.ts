export enum Pages {
  MAIN = 'main',
  SONGS = 'songs',
  SONGS_NEW = 'songs-new',
  BIBLE = 'bible',
  PROGRAMS = 'programs',
  CASTING = 'casting',
  TEST = 'test',
}

export const PageTitlesMap: Map<Pages, string> = new Map([
  [Pages.MAIN, ''],
  [Pages.SONGS, 'Песни'],
  [Pages.SONGS_NEW, 'Песни(NEW)'],
  [Pages.BIBLE, 'Библия'],
  [Pages.PROGRAMS, 'Программы'],
  [Pages.CASTING, ''],
  [Pages.TEST, 'TEST'],
]);

export type Page = {
  id: Pages;
  title:string;
}
