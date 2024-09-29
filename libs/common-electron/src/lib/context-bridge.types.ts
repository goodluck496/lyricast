import { AppWindowTypes } from './common-electron';

import { BrowserWindowConstructorOptions } from 'electron';

export type OpenWindowArgs = BrowserWindowConstructorOptions & {
  title: string;
};

export type CloseWindowArgs = {
  type: AppWindowTypes;
};

export type Context = {
  getAppVersion: () => Promise<string>;
  openWindow: (arg: OpenWindowArgs) => Promise<string>;
  closeWindow: (arg: CloseWindowArgs) => Promise<string>;
  platform: string;
};
