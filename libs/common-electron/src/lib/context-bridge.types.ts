import { AppWindowTypes } from './common-electron';

import { BrowserWindowConstructorOptions } from 'electron';

export type OpenWindowArgs = BrowserWindowConstructorOptions & {
  type: AppWindowTypes;
  title: string;
};

export type CloseWindowArgs = {
  type: AppWindowTypes;
};

export enum ElectronEvents {
  OPEN_PAGE = 'OPEN_PAGE',
  INIT_NEW_WINDOW = 'INIT_NEW_WINDOW',
  CLOSE_WINDOW = 'CLOSE_WINDOW'
}

export type EventPayloadsMap = {
  [ElectronEvents.OPEN_PAGE]: { name: string };
  [ElectronEvents.INIT_NEW_WINDOW]: void;
  [ElectronEvents.CLOSE_WINDOW]: {processId: number};
};

export type EventPayloadItem<Key extends ElectronEvents> =
  EventPayloadsMap[Key];

export type EventData<Key extends ElectronEvents> = {
  event: Key;
  payload: EventPayloadItem<Key>;
};

export type Context = {
  getAppVersion: () => Promise<string>;
  openWindow: (arg: OpenWindowArgs) => Promise<number>;
  closeWindow: (arg: CloseWindowArgs) => Promise<void>;

  send: (data: EventData<ElectronEvents>) => void;
  receive: <Key extends ElectronEvents>(
    event: Key,
    cb: (payload: EventData<Key>) => void
  ) => void;

  platform: string;
};
