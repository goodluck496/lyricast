import { ActionCreator } from '@ngrx/store';
import { HistoryItem, HistoryType } from '../services/history.types';
import { SongActions } from '@lyri-cast/song-store';
import { BibleActions } from '@lyri-cast/bible-store';

export type PayloadFor<T extends ActionCreator> = Parameters<T>[0];

function defineLoggableActions<
  TActions extends readonly ActionCreator[]
>(actions: {
  [K in keyof TActions]: {
    action: TActions[K];
    toHistory: (props: PayloadFor<TActions[K]>) => HistoryItem;
  };
}): {
  [K in keyof TActions]: {
    action: TActions[K];
    toHistory: (props: PayloadFor<TActions[K]>) => HistoryItem;
  };
} {
  return actions as any;
}

export const loggableActions = defineLoggableActions([
  {
    action: SongActions.selectSong,
    toHistory: (data) => {
      return {
        type: HistoryType.SELECT_SONG,
        dateTime: Date.now(),
        payload: {
          entityId: data.number.toString(),
          key: `select-song-${data.number}`,
          title: [data.number, data.title.slice(0, 15), '...'].join(' '),
          icon: '',
          url: '',
        },
      };
    },
  },
  {
    action: SongActions.slideNavigate,
    toHistory: (data) => ({
      type: HistoryType.SELECT_LYRIC,
      dateTime: Date.now(),
      payload: {
        entityId: data.currentLyric.songId,
        key: `select-lyric-${data.currentLyric.songId}-${data.currentLyric.sectionTitle}`,
        title: data.currentLyric.sectionTitle,
        icon: '',
        url: ``,
        children: [data.currentLyric],
      },
    }),
  },
  {
    action: BibleActions.startCasting,
    toHistory: (data) => ({
      type: HistoryType.BIBLE,
      dateTime: Date.now(),
      payload: {
        entityId: data.content[0]?.path?.join('-'),
        path: data.content[0]?.path,
        key: `select-bible-verse-${data.content[0]?.number}`,
        title: `${data.book.title.short} ${data.chapter.number}:${
          data.content[data.fromIndex - 1].number
        }`,
        icon: '',
        url: ``,
        children: [],
      },
    }),
  },
  {
    action: BibleActions.castingProcessChange,
    toHistory: (data) => ({
      type: HistoryType.BIBLE,
      dateTime: Date.now(),
      payload: {
        entityId: data.currentContent.path.join('-'),
        path: data.currentContent.path,
        key: `select-bible-verse-${data.currentContent.path}`,
        title: `${data.currentContent.bookTitle.short} ${data.currentContent.chapterId}:${data.currentContent.number}`,
        icon: '',
        url: ``,
        children: [],
      },
    }),
  },
]);
