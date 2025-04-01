import { createReducer, on } from '@ngrx/store';
import { ISong, ISongBookName } from '@lyri-cast/entities';
import {
  SongActions,
  SongPresentationNavigatePayload,
  SongStartCastingPayload,
} from './song.actions';

export type SongPageState = {
  selectedBook: ISongBookName | null;
  selectedSong: ISong | null;

  castingPaused: boolean;
  castingProcess: SongStartCastingPayload | null;
  navigateState: SongPresentationNavigatePayload | null;
};

export const initState: SongPageState = {
  selectedBook: null,
  selectedSong: null,
  castingPaused: true,
  castingProcess: null,
  navigateState: null,
};

export const SongPageReducers = createReducer<SongPageState>(
  initState,
  on(SongActions.selectBook, (state, payload) => {
    return { ...state, selectedBook: payload } satisfies SongPageState;
  }),
  on(SongActions.selectSong, (state, payload) => {
    return { ...state, selectedSong: payload } satisfies SongPageState;
  }),
  on(SongActions.startCasting, (state, payload) => {
    return {
      ...state,
      castingProcess: payload,
      castingPaused: false,
    } satisfies SongPageState;
  }),
  on(SongActions.openCasting, (state, payload) => {
    return { ...state, castingProcess: payload } satisfies SongPageState;
  }),
  on(SongActions.pauseCasting, (state) => {
    return { ...state, castingPaused: true } satisfies SongPageState;
  }),
  on(SongActions.stopCasting, (state) => {
    return { ...state, castingProcess: null } satisfies SongPageState;
  }),
  on(SongActions.slideNavigate, (state, payload) => {
    return { ...state, navigateState: payload } satisfies SongPageState;
  })
);
