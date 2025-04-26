import {
  BibleVerseForCasting,
  ISong, ISongBookName,
  LyricForCasting
} from '@lyri-cast/entities';
import { SongPresentationNavigatePayload } from '@lyri-cast/song-store';

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
  path: string[];
  children: BibleVerseForCasting[];
  currentVerse: BibleVerseForCasting
};

export type SongHistoryPayload = BaseHistoryItemPayload & {
  entity: ISong;
  bookName: ISongBookName;
};

export type LyricHistoryPayload = BaseHistoryItemPayload & {
  parent: {
    type: HistoryType;
    entityId: string;
  };
  actionData: SongPresentationNavigatePayload
  children: LyricForCasting[];
};

export type BibleHistoryItem = {
  type: HistoryType.BIBLE;
  dateTime: number;
  payload: BibleHistoryPayload;
};
export type SongHistoryItem = {
  type: HistoryType.SELECT_SONG;
  dateTime: number;
  payload: SongHistoryPayload;
};
export type LyricHistoryItem = {
  type: HistoryType.SELECT_LYRIC;
  dateTime: number;
  payload: LyricHistoryPayload;
};

export type HistoryItem = BibleHistoryItem | SongHistoryItem | LyricHistoryItem;
