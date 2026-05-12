import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ISong, ISongBookName, LyricForCasting } from '@lyri-cast/entities';
import { CastingAppearance, Pages } from '@lyri-cast/common-browser';

export const SongActionsEnum = {
  openPage: '[SONG]openPage',
  openCasting: '[SONG]openCasting',
  startCasting: '[SONG]startCasting',
  castingStarted: '[SONG]castingStarted',
  stopCasting: '[SONG]stopCasting',
  pauseCasting: '[SONG]pauseCasting',
  slideNavigate: '[SONG]slideNavigate',
  updateCastingAppearance: '[SONG]updateCastingAppearance',

  selectBook: '[SONG]selectBook',
  selectSong: '[SONG]selectSong',
  selectSongByNumber: '[SONG]selectSongByNumber',
} as const;

export type SongActionsEnumKeys = keyof typeof SongActionsEnum;

export type SongStartCastingPayload = {
  song: ISong;
  currentLyric: LyricForCasting;
  lyrics: LyricForCasting[];
  fromIndex?: number;
  appearance?: CastingAppearance;
  splitPartsCount?: number;
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

export const SongActionSource = 'SONG_ACTIONS';

export const SongActions = createActionGroup({
  source: SongActionSource,
  events: {
    [SongActionsEnum.openPage]: props<{ path: Pages[] }>(),
    [SongActionsEnum.openCasting]: props<SongStartCastingPayload>(),
    [SongActionsEnum.startCasting]: props<SongStartCastingPayload>(),
    [SongActionsEnum.castingStarted]: emptyProps(),
    [SongActionsEnum.stopCasting]: emptyProps(),
    [SongActionsEnum.pauseCasting]: emptyProps(),
    [SongActionsEnum.slideNavigate]: props<SongPresentationNavigatePayload>(),
    [SongActionsEnum.updateCastingAppearance]: props<CastingAppearance>(),

    [SongActionsEnum.selectBook]: props<ISongBookName>(),
    [SongActionsEnum.selectSong]: props<{ bookName: ISongBookName; song: ISong }>(),
    [SongActionsEnum.selectSongByNumber]: props<{ data: { number: number } }>(),
  },
});
