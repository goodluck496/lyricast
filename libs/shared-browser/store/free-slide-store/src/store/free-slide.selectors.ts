import { createFeature } from '@ngrx/store';
import { FreeSlideReducers } from './free-slide.reducers';

export const FreeSlideFeatureName = 'FreeSlide' as const;

export const freeSlideCastProcess = createFeature({
  name: FreeSlideFeatureName,
  reducer: FreeSlideReducers,
});

export const {
  selectFreeSlideCastingProcess,
  selectFreeSlideNavigateState,
  selectFreeSlideCastingPaused,
  selectFreeSlideCastingStarted,
  selectFreeSlideCastingFrozen,
  selectFreeSlideState,
  selectFreeSlideSelected,
  selectSlideTransitions,
  selectGlobalTransition,
} = freeSlideCastProcess;
