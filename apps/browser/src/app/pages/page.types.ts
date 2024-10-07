export enum Pages {
  MAIN = 'main',
  SONGS = 'songs',
  BIBLE = 'bible',
  PROGRAMS = 'programs',
  CASTING = 'casting',
}

export const PageTitlesMap: Map<Pages, string> = new Map([
  [Pages.MAIN, ''],
  [Pages.SONGS, 'Песни'],
  [Pages.BIBLE, 'Библия'],
  [Pages.PROGRAMS, 'Программы'],
  [Pages.CASTING, ''],
]);

export type Page = {
  id: Pages;
  title:string;
}
