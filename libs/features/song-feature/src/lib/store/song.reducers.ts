import { createFeature, createReducer, on } from '@ngrx/store';
import { ISong, ISongBookName } from '@lyri-cast/entities';
import {
  SongActions,
  SongPresentationNavigatePayload,
  SongStartCastingPayload,
} from './song.actions';

export const SongFeatureName = 'Song' as const;

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
  castingPaused: false,
  castingProcess: null,
  navigateState: null,
};

export const SongPageReducers = createReducer<SongPageState>(
  initState,
  on(SongActions.selectBook, (state, payload) => {
    return { ...state, selectedBook: payload };
  }),
  on(SongActions.selectSong, (state, payload) => {
    return { ...state, selectedSong: payload };
  }),
  on(SongActions.startCasting, (state, payload) => {
    return { ...state, castingProcess: payload, castingPaused: false };
  }),
  on(SongActions.openCasting, (state, payload) => {
    return { ...state, castingProcess: payload };
  }),
  on(SongActions.pauseCasting, (state) => {
    return { ...state, castingPaused: true };
  }),
  on(SongActions.stopCasting, (state) => {
    return { ...state, castingProcess: null };
  }),
  on(SongActions.slideNavigate, (state, payload) => {
    return { ...state, navigateState: payload };
  })
);

const SongFeature = createFeature({
  name: SongFeatureName,
  reducer: SongPageReducers,
});

export const {
  name,
  reducer,
  selectSongState,
  selectSelectedBook,
  selectSelectedSong,
  selectCastingProcess,
  selectNavigateState,
} = SongFeature;
