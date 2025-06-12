import { createReducer, on } from '@ngrx/store';
import {
  FreeSlideActions,
  FreeSlideNavigatePayload,
  FreeSlideStartCastingPayload,
} from './free-slide.actions';

export interface FreeSlideState {
  freeSlideCastingProcess: FreeSlideStartCastingPayload | null;
  freeSlideCastingPaused: boolean;
  freeSlideNavigateState: FreeSlideNavigatePayload | null;
}

export const freeSlideInitialState: FreeSlideState = {
  freeSlideCastingProcess: null,
  freeSlideCastingPaused: true,
  freeSlideNavigateState: null,
};

export const FreeSlideReducers = createReducer<FreeSlideState>(
  freeSlideInitialState,
  on(FreeSlideActions.startCasting, (state, data) => {
    return ({
      ...state,
      freeSlideCastingProcess: data,
      freeSlideCastingPaused: false,
    })
  }),
  on(FreeSlideActions.openCasting, (state, data) => ({
    ...state,
    freeSlideCastingProcess: data,
    freeSlideCastingPaused: false,
  })),
  on(FreeSlideActions.pauseCasting, (state) => ({
    ...state,
    freeSlideCastingPaused: true,
  })),
  on(FreeSlideActions.stopCasting, (state) => ({
    ...state,
    freeSlideCastingProcess: null,
    freeSlideCastingPaused: true,
  })),
  on(FreeSlideActions.slideNavigate, (state, payload) => ({
    ...state,
    freeSlideNavigateState: payload,
  }))
);
