import { createReducer, on } from '@ngrx/store';
import { ISong, ISongBookName } from '@lyri-cast/entities';
import { CastingAppearance, DEFAULT_CASTING_APPEARANCE } from '@lyri-cast/common-browser';
import {
  SongActions,
  SongActionsEnum,
  SongPresentationNavigatePayload,
  SongStartCastingPayload,
} from './song.actions';

export type SongPageState = {
  selectedBook: ISongBookName | null;
  selectedSong: ISong | null;

  castingPaused: boolean;
  castingProcess: SongStartCastingPayload | null;
  navigateState: SongPresentationNavigatePayload | null;
  castingAppearance: CastingAppearance;
};

export const initState: SongPageState = {
  selectedBook: null,
  selectedSong: null,
  castingPaused: true,
  castingProcess: null,
  navigateState: null,
  castingAppearance: DEFAULT_CASTING_APPEARANCE,
};

export const SongPageReducers = createReducer<SongPageState>(
  initState,
  on(SongActions[SongActionsEnum.selectBook], (state, payload) => {
    return { ...state, selectedBook: payload } satisfies SongPageState;
  }),
  on(SongActions[SongActionsEnum.selectSong], (state, payload) => {
    return {
      ...state,
      selectedSong: payload.song,
      selectedBook: payload.bookName,
      castingProcess: null,
    } satisfies SongPageState;
  }),
  on(SongActions[SongActionsEnum.startCasting], (state, payload) => {
    return {
      ...state,
      castingProcess: payload,
      castingAppearance: payload.appearance ?? state.castingAppearance,
      castingPaused: false,
    } satisfies SongPageState;
  }),
  on(SongActions[SongActionsEnum.openCasting], (state, payload) => {
    return {
      ...state,
      castingProcess: payload,
      castingAppearance: payload.appearance ?? state.castingAppearance,
    } satisfies SongPageState;
  }),
  on(SongActions[SongActionsEnum.pauseCasting], (state) => {
    return { ...state, castingPaused: true } satisfies SongPageState;
  }),
  on(SongActions[SongActionsEnum.stopCasting], (state) => {
    return {
      ...state,
      castingProcess: null,
      castingPaused: true,
      navigateState: null,
    } satisfies SongPageState;
  }),
  on(SongActions[SongActionsEnum.slideNavigate], (state, payload) => {
    return { ...state, navigateState: payload } satisfies SongPageState;
  }),
  on(SongActions[SongActionsEnum.updateCastingAppearance], (state, payload) => {
    return { ...state, castingAppearance: payload } satisfies SongPageState;
  })
);
