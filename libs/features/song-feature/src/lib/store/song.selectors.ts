import { SongFeatureName, SongPageReducers } from './song.reducers';
import { createFeature } from '@ngrx/store';

export const selectCastProcess = createFeature({
  name: SongFeatureName,
  reducer: SongPageReducers,
});

export const {
  selectCastingProcess,
  selectSongState,
  selectNavigateState,
  selectCastingPaused
} = selectCastProcess;
