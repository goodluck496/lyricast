import { ActionCreator, Store } from '@ngrx/store';
import { HistoryItem, HistoryType } from '../services/history.types';
import {
  selectCastingPaused,
  selectCastingProcess,
  SongActions,
} from '@lyri-cast/song-store';
import { BibleActions } from '@lyri-cast/bible-store';
import { debounceTime, filter, map, Observable, of } from 'rxjs';
import { sliceTextAtBreak } from '@lyri-cast/ui-lib';
import { filterEmpty } from '@lyri-cast/common';

export type PayloadFor<T extends ActionCreator> = Parameters<T>[0];

function defineLoggableActions<
  TActions extends readonly ActionCreator[]
>(actions: {
  [K in keyof TActions]: {
    action: TActions[K];
    toHistory: (
      props: PayloadFor<TActions[K]>,
      deps: [Store]
    ) => Observable<HistoryItem | never>;
  };
}): {
  [K in keyof TActions]: {
    action: TActions[K];
    toHistory: (
      props: PayloadFor<TActions[K]>,
      deps: [Store]
    ) => Observable<HistoryItem | never>;
  };
} {
  return actions as any;
}

export const loggableActions = defineLoggableActions([
  {
    action: SongActions.openCasting,
    toHistory: (data, [store]) => {
      return store.select(selectCastingProcess).pipe(
        debounceTime(300),
        filterEmpty(),
        map((castProcess) => {
          return {
            type: HistoryType.SELECT_SONG,
            dateTime: Date.now(),
            payload: {
              entityId: data.song.number.toString(),
              key: `select-song-${data.song.number}`,
              title: [
                data.song.number,
                data.song.title.slice(0, 15),
                '...',
              ].join(' '),
              icon: '',
              url: '',
              entity: data.song,
              bookName: data.song.bookName,
            },
          };
        })
      );
    },
  },
  {
    action: SongActions.slideNavigate,
    toHistory: (data, [store]) => {
      const title = () => {
        const index = data.index ?? 0;
        const rawText =
          data.currentLyric.lines.find((el) => el.globalSongIndex === index)
            ?.text || '';
        const text = sliceTextAtBreak(rawText);
        const splitCount = data.currentLyric.lines.length;

        return [
          '<div class="ellipsis" style="width: 100%; height: 100%; padding: 6px 0;">',
          `<span class="history__item-label">`,
          data.currentLyric.sectionTitle,
          data.currentLyric.lines.length > 1
            ? `(${(index % splitCount) + 1})`
            : '',
          `</span>`,
          text,
          '</div>',
        ].join(' ');
      };

      return store.select(selectCastingPaused).pipe(
        filter((paused) => !paused),
        map((casting) => {
          return {
            type: HistoryType.SELECT_LYRIC,
            dateTime: Date.now(),
            payload: {
              entityId: data.currentLyric.songId,
              key: `select-lyric-${data.currentLyric.songId}-${data.currentLyric.sectionTitle}-${data.index}`,
              title: title(),
              icon: '',
              url: ``,
              parent: {
                type: HistoryType.SELECT_SONG,
                entityId: data.currentLyric.songId,
              },
              actionData: data,
              children: [data.currentLyric],
            },
          };
        })
      );
    },
  },
  {
    action: BibleActions.startCasting,
    toHistory: (data, deps) => {
      const bibleTitle = () => {
        return [
          '<div class="ellipsis" style="width: 100%; height: 100%; padding: 6px 0;">',
          `<span class="history__item-label">${data.book.title.short} ${
            data.chapter.number
          }:${data.content[data.fromIndex - 1].number}</span>`,
          data.content[data.fromIndex - 1].text.slice(0, 20),
          '</div>',
        ].join(' ');
      };
      return of({
        type: HistoryType.BIBLE,
        dateTime: Date.now(),
        payload: {
          entityId: data.content[0]?.path?.join('-'),
          path: data.content[0]?.path,
          key: `select-bible-verse-${data.content[0]?.number}`,
          title: bibleTitle(),
          icon: '',
          url: ``,
          children: [],
          currentVerse: data.content[data.fromIndex],
        },
      });
    },
  },
  {
    action: BibleActions.castingProcessChange,
    toHistory: (data, deps) => {
      const bibleTitle = () => {
        return [
          '<div class="ellipsis" style="width: 100%; height: 100%; padding: 6px 0;">',
          `<span class="history__item-label">${data.currentContent.bookTitle.short} ${data.currentContent.chapterId}:${data.currentContent.number}</span>`,
          data.currentContent.text.slice(0, 20),
          '</div>',
        ].join(' ');
      };

      return of({
        type: HistoryType.BIBLE,
        dateTime: Date.now(),
        payload: {
          entityId: data.currentContent.path.join('-'),
          path: data.currentContent.path,
          key: `select-bible-verse-${data.currentContent.path}`,
          title: bibleTitle(),
          icon: '',
          url: ``,
          children: [],
          currentVerse: data.currentContent,
        },
      });
    },
  },
]);
