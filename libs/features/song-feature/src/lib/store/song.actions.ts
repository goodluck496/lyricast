import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ActionCreatorProps } from '@ngrx/store/src/models';
import { ISong, ISongBookName, LyricForCasting } from '@lyri-cast/entities';
import { Pages } from '@lyri-cast/common-browser';

export const SONG_ACTIONS = {
  openPage: 'OPEN_PAGE',
  openedPage: 'OPENED_PAGE',

  selectBook: 'SELECT_BOOK',
  selectSong: 'SELECT_SONG',
  openCasting: 'OPEN_CASTING',
  startCasting: 'START_CASTING',
  stopCasting: 'STOP_CASTING',
  pauseCasting: 'PAUSE_CASTING',
  slideNavigate: 'SLIDE_NAVIGATE',
} as const;

export type SongActionKeys = keyof typeof SONG_ACTIONS;

export type SongStartCastingPayload = {
  song: ISong;
  currentLyric: LyricForCasting,
  lyrics: LyricForCasting[],
  fromIndex?: number
}

export type SongPresentationNavigatePayload = {
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

export const SongActions = createActionGroup({
  source: 'SONG_ACTIONS',
  events: {
    openPage: props<{path: Pages[]}>(),
    openedPage: props<{name: Pages}>(),
    selectBook: props<ISongBookName>(),
    selectSong: props<ISong>(),
    openCasting: props<SongStartCastingPayload>(),
    startCasting: props<SongStartCastingPayload>(),
    stopCasting: emptyProps(),
    pauseCasting: emptyProps(),
    slideNavigate: props<SongPresentationNavigatePayload>(),
  } satisfies Record<SongActionKeys, ActionCreatorProps<unknown>>,
});
