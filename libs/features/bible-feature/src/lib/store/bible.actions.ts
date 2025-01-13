import { createActionGroup, emptyProps, props } from '@ngrx/store';
import {
  BibleBookShort,
  BibleChapterSection,
  BibleChapterShort,
  BibleTranslateShort,
} from '@lyri-cast/entities';

export const BibleActions = createActionGroup({
  source: 'BIBLE_ACTIONS',
  events: {
    selectLang: props<{ lang: string }>(),
    selectTranslate: props<{ translate: BibleTranslateShort }>(),
    selectBook: props<{ book: BibleBookShort | null }>(),
    selectChapter: props<{ chapter: BibleChapterShort }>(),
    // selectChapterSection: props<{ chapterSection: BibleChapterSection }>(),
    selectSections: props<{
      sectionContent: BibleChapterSection[];
    }>(),
    castingPause: emptyProps(),
    castingProcessChange: props<{
      direction: 'prev' | 'next';
      index: number;
    }>(),
  },
});
