import { AppWindowTypes } from './common-electron';

import { BrowserWindowConstructorOptions } from 'electron';
import { Lyric, ISong, LyricLine, LyricForCasting } from '@lyri-cast/entities';

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
  // todo создать отдельный enum песен
  SONG__SHOW_LYRIC_BLOCK = 'SONG__SHOW_LYRIC_BLOCK',
  SONG__HIDE_LYRIC_BLOCK = 'SONG__HIDE_LYRIC_BLOCK',
  SONG__START_CASTING = 'SONG__START_CASTING',
  SONG__STOP_CASTING = 'SONG__STOP_CASTING',
  SONG__SLIDE_NAVIGATE = 'SONG__SLIDE_NAVIGATE',
}

export enum SongEvents {

}

export type AllEvents = ElectronEvents //todo когда бьудет отдельные enumы, то можно расширить AllEvents

export type EventPayloadsMap = {
  [ElectronEvents.OPEN_PAGE]: { name: string };
  [ElectronEvents.INIT_NEW_WINDOW]: void;
  [ElectronEvents.CLOSE_WINDOW]: { processId: number };
  [ElectronEvents.SONG__SHOW_LYRIC_BLOCK]: {
    song: ISong;
    lyric: Lyric,
    showedBlock: string[];
  };
  [ElectronEvents.SONG__START_CASTING]: {
    song: ISong;
    currentLyric: LyricForCasting,
    lyrics: LyricForCasting[],
    fromIndex?: number
  };
  [ElectronEvents.SONG__STOP_CASTING]: void;
  [ElectronEvents.SONG__HIDE_LYRIC_BLOCK]: void;
  [ElectronEvents.SONG__SLIDE_NAVIGATE]: {
    currentLyric: LyricForCasting,
    /**
     * Перемещает слайды по порядку
     */
    direction?: 'next' | 'prev';
    /**
     * Выбирает слайд по индексу
     */
    index?: number
  }
};

export type EventPayloadItem<Key extends AllEvents> =
  EventPayloadsMap[Key];

export type EventData<Key extends AllEvents> = {
  event: Key;
  payload: EventPayloadItem<Key>;
};

export type Context = {
  getWindowType:() => Promise<AppWindowTypes>;
  getAppVersion: () => Promise<string>;
  openWindow: (arg: OpenWindowArgs) => Promise<number>;
  closeWindow: (arg: CloseWindowArgs) => Promise<void>;

  send: (data: EventData<AllEvents>) => void;
  receive: <Key extends AllEvents>(
    event: Key,
    cb: (payload: EventData<Key>) => void,
    once?: boolean
  ) => void;
  receive2: <Key extends AllEvents>(
    cb: (event: ElectronEvents, payload: EventData<Key>) => void,
  ) => void;

  platform: string;
};
