import { SongPageReducers } from './song.reducers';
import { createFeature } from '@ngrx/store';

export const SongFeatureName = 'Song' as const;

export const selectCastProcess = createFeature({
  name: SongFeatureName,
  reducer: SongPageReducers,
});

export const {
  selectCastingProcess,
  selectSongState,
  selectNavigateState,
  selectCastingPaused,
  selectCastingAppearance,
  selectSelectedBook,
  selectSelectedSong,
} = selectCastProcess;
