import { HistoryItem, HistoryType } from '../../services/history.types';

export type GroupedHistoryItem = HistoryItem & {
  children?: HistoryItem[];
  isGroup: boolean;
};

export function groupHistoryItems(items: HistoryItem[]): GroupedHistoryItem[] {
  const uniqItems = removeDuplicates([...items]);
  const sortedItems = uniqItems.sort((a, b) => b.dateTime - a.dateTime);

  const result: GroupedHistoryItem[] = [];
  const songMap = new Map<string, GroupedHistoryItem>();
  const bibleGroups = new Map<string, GroupedHistoryItem>();

  // Шаг 1: Сначала добавляем все песни
  for (const item of sortedItems) {
    if (item.type === HistoryType.SELECT_SONG) {
      const songItem: GroupedHistoryItem = {
        ...item,
        isGroup: true,
        children: [],
      };

      if (!songMap.has(item.payload.entityId)) {
        songMap.set(item.payload.entityId, songItem);
        result.push(songItem);
      }
    }
  }

  // Шаг 2: Добавляем куплеты к песням или отдельно
  for (const item of sortedItems) {
    if (item.type === HistoryType.SELECT_LYRIC) {
      const parentSong = songMap.get(item.payload.parent.entityId);

      if (parentSong) {
        parentSong.children?.push(item);
        parentSong.children?.sort((a, b) => b.dateTime - a.dateTime);
      } else {
        result.push({
          ...item,
          isGroup: false,
        });
      }
    }
  }

  // Шаг 3: Группируем Библию по главам
  for (const item of sortedItems) {
    if (item.type === HistoryType.BIBLE) {
      const [book, chapter, verse] = item.payload.path;
      const groupKey = `${book}-${chapter}`;

      let group = bibleGroups.get(groupKey);

      if (!group) {
        group = {
          ...item,
          payload: {
            ...item.payload,
            key: groupKey,
            title: `${item.payload.currentVerse.bookTitle.short} ${chapter}:${verse}`,
            path: [book, chapter],
          },
          isGroup: true,
          children: [],
        };
        bibleGroups.set(groupKey, group);
        result.push(group);
      }

      group.children?.push(item);
      group.children?.sort((a, b) => b.dateTime - a.dateTime);
      group.dateTime = Math.max(
        ...(group.children?.map((c) => c.dateTime) ?? [group.dateTime])
      );
    }
  }

  // Шаг 4: Финальная сортировка результата
  return result
    .filter((el) => el?.children?.length)
    .sort((a, b) => b.dateTime - a.dateTime);
}

// Генерация ключа для уникальности
function getEntityKey(item: HistoryItem): string {
  switch (item.type) {
    case HistoryType.SELECT_SONG:
    case HistoryType.SELECT_LYRIC:
      return `${item.type}_${item.payload.entityId}_${item.payload.key}`;
    case HistoryType.BIBLE:
      return `${item.type}_${item.payload.path.join('-')}`;
  }
}

// Удаление дубликатов
function removeDuplicates(items: HistoryItem[]): HistoryItem[] {
  const uniqueMap = new Map<string, HistoryItem>();

  for (const item of items) {
    const key = getEntityKey(item);
    const existing = uniqueMap.get(key);

    if (!existing || item.dateTime > existing.dateTime) {
      uniqueMap.set(key, item);
    }
  }

  return Array.from(uniqueMap.values());
}
