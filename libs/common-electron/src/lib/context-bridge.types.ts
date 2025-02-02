import { AppDisplay, AppWindowTypes } from './common-electron';

import { BrowserWindowConstructorOptions } from 'electron';

export type OpenWindowArgs = BrowserWindowConstructorOptions & {
  type: AppWindowTypes;
  title: string;
  display: AppDisplay
};

export type CloseWindowArgs = {
  type: AppWindowTypes;
};

export const APP_COMMON_ACTIONS = {
  appInit: 'APP_INIT',
  setProcId: 'SET_PROC_ID',
  /**
   * Этот экшен нужен чтобы вызывать редюсер который обновит стейт,
   * при этом не запустит функцию закрытия уже закрытого окна.
   * Используется в случае, когда второе окно закрывают с помощью "крестика" а не кнопкой в интерфейсе
   * (возможно костыль, todo по исследовать)
   */
  clearWindowId: 'CLEAR_WINDOW_ID',
  openPage: 'OPEN_PAGE',
  openedPage: 'OPENED_PAGE',

  closeWindow: 'CLOSE_WINDOW',
} as const;

export type AppCommonActionKeys = keyof typeof APP_COMMON_ACTIONS;

export type EventData = {
  event: string;
  payload: unknown;
};

export type Context = {
  getWindowType: () => Promise<AppWindowTypes>;
  getAppVersion: () => Promise<string>;
  openWindow: (arg: OpenWindowArgs) => Promise<number>;
  closeWindow: (arg: CloseWindowArgs) => Promise<void>;
  getDisplays: () => Promise<AppDisplay[]>;

  send: (data: EventData) => void;
  receive: (cb: (event: string, payload: EventData) => void) => void;

  platform: string;
};
