import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ISong, ISongBookName, LyricForCasting } from '@lyri-cast/entities';
import { Pages } from '@lyri-cast/common-browser';

export const SONG_ACTIONS = {
  /**
   * Открытие страницы в открытом окне кастинга, после срабатывания "OPEN_CASTING"
   */
  openPage: 'OPEN_PAGE',
  /**
   * Вызывается после успешного открытия страницы в окне кастинга
   * приходит через bridge сервис из окна кастинга
   */
  openedPage: 'OPENED_PAGE',

  selectBook: 'SELECT_BOOK',
  selectSong: 'SELECT_SONG',
  selectSongByNumber: 'SELECT_SONG_BY_NUMBER',

  /**
   * отвечает за первичное открытие окна кастинга
   */
  openCasting: 'OPEN_CASTING',
  /**
   * запускает кастинг с первого слайда (или с того которы выбран)
   * когда "OPEN_CASTING" уже был вызван
   */
  startCasting: 'START_CASTING',
  /**
   * Вызывается после успешного начала кастинга
   * приходит через bridge сервис из окна кастинга
   */
  castingStarted: 'CASTING_STARTED',

  stopCasting: 'STOP_CASTING',
  pauseCasting: 'PAUSE_CASTING',
  slideNavigate: 'SLIDE_NAVIGATE',
} as const;

export type SongActionKeys = keyof typeof SONG_ACTIONS;

export type SongStartCastingPayload = {
  song: ISong;
  currentLyric: LyricForCasting;
  lyrics: LyricForCasting[];
  fromIndex?: number;
};

export type SongPresentationNavigatePayload = {
  currentLyric: LyricForCasting;
  /**
   * Перемещает слайды по порядку
   */
  direction?: 'next' | 'prev';
  /**
   * Выбирает слайд по индексу
   */
  index?: number;

  fromService?: boolean;
};

export const SongActions = createActionGroup({
  source: 'SONG_ACTIONS',
  events: {
    openPage: props<{ path: Pages[] }>(),
    openedPage: props<{ name: Pages }>(),
    selectBook: props<ISongBookName>(),
    selectSong: props<{bookName: ISongBookName, song: ISong}>(),
    selectSongByNumber: props<{ data: { number: number } }>(),
    openCasting: props<SongStartCastingPayload>(),
    startCasting: props<SongStartCastingPayload>(),
    stopCasting: emptyProps(),
    pauseCasting: emptyProps(),
    slideNavigate: props<SongPresentationNavigatePayload>(),
    castingStarted: emptyProps(),
  },
});
