import { AppWindowTypes } from './common-electron';

import { BrowserWindowConstructorOptions } from 'electron';
import { ILyric, ISong } from '@lyri-cast/entities';

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
  CLOSE_WINDOW = 'CLOSE_WINDOW',
  SONG__SHOW_LYRIC_BLOCK = 'SONG__SHOW_LYRIC_BLOCK',
  SONG__HIDE_LYRIC_BLOCK = 'SONG__HIDE_LYRIC_BLOCK',
}

export type EventPayloadsMap = {
  [ElectronEvents.OPEN_PAGE]: { name: string };
  [ElectronEvents.INIT_NEW_WINDOW]: void;
  [ElectronEvents.CLOSE_WINDOW]: { processId: number };
  [ElectronEvents.SONG__SHOW_LYRIC_BLOCK]: {
    song: ISong;
    lyric: ILyric,
    showedBlock: string[];
  };
  [ElectronEvents.SONG__HIDE_LYRIC_BLOCK]: void;
};

export type EventPayloadItem<Key extends ElectronEvents> =
  EventPayloadsMap[Key];

export type EventData<Key extends ElectronEvents> = {
  event: Key;
  payload: EventPayloadItem<Key>;
};

export type Context = {
  getWindowType:() => Promise<AppWindowTypes>;
  getAppVersion: () => Promise<string>;
  openWindow: (arg: OpenWindowArgs) => Promise<number>;
  closeWindow: (arg: CloseWindowArgs) => Promise<void>;

  send: (data: EventData<ElectronEvents>) => void;
  receive: <Key extends ElectronEvents>(
    event: Key,
    cb: (payload: EventData<Key>) => void,
    once?: boolean
  ) => void;
  receive2: <Key extends ElectronEvents>(
    cb: (event: ElectronEvents, payload: EventData<Key>) => void,
  ) => void;

  platform: string;
};
