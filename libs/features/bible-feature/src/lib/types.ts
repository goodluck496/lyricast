import { IUiLyriListItem } from '@lyri-cast/form';
import {
  BibleBookShort,
  BibleChapterShort,
  BibleTranslateShort,
  BibleVerse,
} from '@lyri-cast/entities';

export type BibleSidebarData = {
  bibleForm: {
    translate: IUiLyriListItem<BibleTranslateShort> | null;
    book: IUiLyriListItem<BibleBookShort> | null;
    chapter: IUiLyriListItem<BibleChapterShort> | null;
    content: BibleVerse[];
  };
};
