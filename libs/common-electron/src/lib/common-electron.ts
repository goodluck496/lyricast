import Display = Electron.Display;

export enum AppWindowTypes {
  MAIN = 'MAIN',
  CASTING = 'CASTING',
}

export type AppDisplay = Display & {
  primary: boolean;
};
