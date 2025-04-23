import { BibleVerseForCasting, LyricForCasting } from '@lyri-cast/entities';

export enum HistoryType {
  BIBLE = 'BIBLE',
  SELECT_SONG = 'SELECT_SONG',
  SELECT_LYRIC = 'SELECT_LYRIC',
}

export type BaseHistoryItemPayload = {
  entityId: string;
  /**
   * Некоторый ключ который явно идентифицирует элемент,
   * чтобы можно было их группировать
   */
  key: string;
  title: string;
  icon: string;
  url: string;
};

export type BibleHistoryPayload = BaseHistoryItemPayload & {
  path: string[]
  children: BibleVerseForCasting[];
};

export type LyricHistoryPayload = BaseHistoryItemPayload & {
  children: LyricForCasting[];
};

export type HistoryItem =
  | {
      type: HistoryType.BIBLE;
      dateTime: number;
      payload: BibleHistoryPayload;
    }
  | {
      type: HistoryType.SELECT_SONG;
      dateTime: number;
      payload: BaseHistoryItemPayload;
    }
  | {
      type: HistoryType.SELECT_LYRIC;
      dateTime: number;
      payload: LyricHistoryPayload;
    };
