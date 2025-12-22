import { ActionCreator, Store } from '@ngrx/store';
import { HistoryItem, HistoryType } from '../services/history.types';
import {
  selectCastingPaused,
  selectCastingProcess,
  SongActions,
  SongActionsEnum,
} from '@lyri-cast/song-store';
import { BibleActions } from '@lyri-cast/bible-store';
import { filter, map, Observable, of, take } from 'rxjs';
import { sliceTextAtBreak } from '@lyri-cast/ui-lib';

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
    action: SongActions[SongActionsEnum.openCasting],
    toHistory: (data) =>
      of({
        type: HistoryType.SELECT_SONG,
        dateTime: Date.now(),
        payload: {
          entityId: data.song.number.toString(),
          key: `select-song-${data.song.number}`,
          title: [data.song.number, data.song.title.slice(0, 25), '...'].join(
            ' '
          ),
          icon: '',
          url: '',
          entity: data.song,
          bookName: data.song.bookName,
        },
      }),
  },
  {
    action: SongActions[SongActionsEnum.startCasting],
    toHistory: (data) => {
      const currentLyric = data.currentLyric;
      const index =
        data.fromIndex ?? currentLyric?.lines?.[0]?.globalSongIndex ?? 0;

      const rawText =
        currentLyric.lines.find(
          (el: { globalSongIndex: number }) => el.globalSongIndex === index
        )?.text || '';
      const text = sliceTextAtBreak(rawText);
      const splitCount = currentLyric.lines.length;

      const title = [
        '<div class="ellipsis" style="width: 100%; height: 100%; padding: 6px 0;">',
        `<span class="history__item-label">`,
        currentLyric.sectionTitle,
        currentLyric.lines.length > 1
          ? `(${(index % splitCount) + 1})`
          : '',
        `</span>`,
        text,
        '</div>',
      ].join(' ');

      return of({
        type: HistoryType.SELECT_LYRIC,
        dateTime: Date.now(),
        payload: {
          entityId: currentLyric.songId,
          key: `select-lyric-${currentLyric.songId}-${currentLyric.sectionTitle}-${index}`,
          title,
          icon: '',
          url: ``,
          parent: {
            type: HistoryType.SELECT_SONG,
            entityId: currentLyric.songId,
          },
          actionData: {
            currentLyric,
            index,
          },
          children: [currentLyric],
        },
      });
    },
  },
  {
    action: SongActions[SongActionsEnum.slideNavigate],
    toHistory: (data, [store]) => {
      const effectiveIndex =
        data.index ?? data.currentLyric?.lines?.[0]?.globalSongIndex ?? 0;

      const title = () => {
        const index = effectiveIndex;
        const rawText =
          data.currentLyric.lines.find(
            (el: { globalSongIndex: number }) => el.globalSongIndex === index
          )
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
        take(1),
        filter((paused) => !paused),
        map(() => {
          return {
            type: HistoryType.SELECT_LYRIC,
            dateTime: Date.now(),
            payload: {
              entityId: data.currentLyric.songId,
              key: `select-lyric-${data.currentLyric.songId}-${data.currentLyric.sectionTitle}-${effectiveIndex}`,
              title: title(),
              icon: '',
              url: ``,
              parent: {
                type: HistoryType.SELECT_SONG,
                entityId: data.currentLyric.songId,
              },
              actionData: {
                ...data,
                index: effectiveIndex,
              },
              children: [data.currentLyric],
            },
          };
        })
      );
    },
  },
  {
    action: BibleActions.openCasting,
    toHistory: (data, deps) => {
      const fromNumber = data.range?.from ?? data.fromIndex;
      const toNumber = data.range?.to ?? data.fromIndex;

      const fromIndex = Math.max(0, fromNumber - 1);
      const baseVerse = data.content[fromIndex];

      const versesInRange = data.content.filter(
        (v) => v.number >= fromNumber && v.number <= toNumber
      );

      const shortTextSource = versesInRange.length ? versesInRange[0] : baseVerse;
      const shortText = Array.isArray(shortTextSource.text)
        ? shortTextSource.text.join(' ')
        : (shortTextSource as any).text;
      const previewText =
        shortText.length > 25 ? `${shortText.slice(0, 25)}...` : shortText;

      const labelNumber =
        data.range && fromNumber !== toNumber
          ? `${fromNumber}-${toNumber}`
          : `${baseVerse?.number}`;

      const bibleTitle = () => {
        return [
          '<div class="ellipsis" style="width: 100%; height: 100%; padding: 6px 0;">',
          `<span class="history__item-label">${data.book.title.short} ${
            data.chapter.number
          }:${labelNumber}</span>`,
          previewText,
          '</div>',
        ].join(' ');
      };

      return of({
        type: HistoryType.BIBLE,
        dateTime: Date.now(),
        payload: {
          entityId: baseVerse?.path?.join('-'),
          path: baseVerse?.path,
          key: `select-bible-verse-${baseVerse?.path?.join('-')}-${labelNumber}`,
          title: bibleTitle(),
          icon: '',
          url: ``,
          children: versesInRange,
          currentVerse: baseVerse,
          range:
            data.range && fromNumber !== toNumber
              ? { from: fromNumber, to: toNumber }
              : undefined,
        },
      });
    },
  },
  {
    action: BibleActions.startCasting,
    toHistory: (data, deps) => {
      const fromNumber = data.range?.from ?? data.fromIndex;
      const toNumber = data.range?.to ?? data.fromIndex;

      const fromIndex = Math.max(0, fromNumber - 1);
      const baseVerse = data.content[fromIndex];

      const versesInRange = data.content.filter(
        (v) => v.number >= fromNumber && v.number <= toNumber
      );

      const shortTextSource = versesInRange.length ? versesInRange[0] : baseVerse;
      const shortText = Array.isArray(shortTextSource.text)
        ? shortTextSource.text.join(' ')
        : (shortTextSource as any).text;
      const previewText =
        shortText.length > 20 ? `${shortText.slice(0, 20)}...` : shortText;

      const labelNumber =
        data.range && fromNumber !== toNumber
          ? `${fromNumber}-${toNumber}`
          : `${baseVerse?.number}`;

      const bibleTitle = () => {
        return [
          '<div class="ellipsis" style="width: 100%; height: 100%; padding: 6px 0;">',
          `<span class="history__item-label">${data.book.title.short} ${
            data.chapter.number
          }:${labelNumber}</span>`,
          previewText,
          '</div>',
        ].join(' ');
      };

      return of({
        type: HistoryType.BIBLE,
        dateTime: Date.now(),
        payload: {
          entityId: baseVerse?.path?.join('-'),
          path: baseVerse?.path,
          key: `select-bible-verse-${labelNumber}`,
          title: bibleTitle(),
          icon: '',
          url: ``,
          children: versesInRange,
          currentVerse: baseVerse,
          range:
            data.range && fromNumber !== toNumber
              ? { from: fromNumber, to: toNumber }
              : undefined,
        },
      });
    },
  },
  {
    action: BibleActions.castingProcessChange,
    toHistory: (data, deps) => {
      // пишем навигацию в историю только когда трансляция активна
      // (для библии это определяется состоянием castingPaused в сторе)
      // NOTE: здесь нет доступа к store, поэтому считаем, что событие приходит только при активном кастинге
      const hasRange = !!data.range && !!data.versesInRange?.length;

      const fromNumber = hasRange ? data.range!.from : data.currentContent.number;
      const toNumber = hasRange ? data.range!.to : data.currentContent.number;

      const versesInRange = hasRange
        ? data.versesInRange!
        : [data.currentContent];

      const shortTextSource = versesInRange[0];
      const shortText = Array.isArray(shortTextSource.text)
        ? shortTextSource.text.join(' ')
        : (shortTextSource as any).text;
      const previewText =
        shortText.length > 25 ? `${shortText.slice(0, 25)}...` : shortText;

      const labelNumber =
        hasRange && fromNumber !== toNumber
          ? `${fromNumber}-${toNumber}`
          : `${data.currentContent.number}`;

      const bibleTitle = () => {
        return [
          '<div class="ellipsis" style="width: 100%; height: 100%; padding: 6px 0;">',
          `<span class="history__item-label">${data.currentContent.bookTitle.short} ${data.currentContent.chapterId}:${labelNumber}</span>`,
          previewText,
          '</div>',
        ].join(' ');
      };

      const basePath = data.currentContent.path;

      return of({
        type: HistoryType.BIBLE,
        dateTime: Date.now(),
        payload: {
          entityId: basePath.join('-'),
          path: basePath,
          key: `select-bible-verse-${basePath.join('-')}-${labelNumber}`,
          title: bibleTitle(),
          icon: '',
          url: ``,
          children: versesInRange,
          currentVerse: data.currentContent,
          range:
            hasRange && fromNumber !== toNumber
              ? { from: fromNumber, to: toNumber }
              : undefined,
        },
      });
    },
  },
]);
