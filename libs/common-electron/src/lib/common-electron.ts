import Display = Electron.Display;

export enum AppWindowTypes {
  MAIN = 'MAIN',
  SONG_CASTING = 'SONG_CASTING',
  BIBLE_CASTING = 'BIBLE_CASTING',
}


export type AppDisplay = Display & {
  primary: boolean;
}
