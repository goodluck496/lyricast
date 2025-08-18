import { createReducer, on } from '@ngrx/store';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  FreeSlideNavigatePayload,
  FreeSlideStartCastingPayload,
} from './free-slide.actions';
import { FreeSlide } from '@lyri-cast/entities';

export interface FreeSlideState {
  freeSlideCastingProcess: FreeSlideStartCastingPayload | null;
  freeSlideCastingStarted: boolean;
  freeSlideCastingPaused: boolean;
  freeSlideNavigateState: FreeSlideNavigatePayload | null;
  freeSlideSelected: FreeSlide | null;
}

export const freeSlideInitialState: FreeSlideState = {
  freeSlideCastingStarted: false,
  freeSlideCastingProcess: null,
  freeSlideCastingPaused: true,
  freeSlideNavigateState: null,
  freeSlideSelected: null,
};

export const FreeSlideReducers = createReducer<FreeSlideState>(
  freeSlideInitialState,
  on(FreeSlideActions[FreeSlideActionsEnum.startCasting], (state, data) => {
    return {
      ...state,
      freeSlideCastingStarted: true,
      freeSlideCastingProcess: data,
      freeSlideCastingPaused: false,
    } satisfies FreeSlideState;
  }),
  on(FreeSlideActions[FreeSlideActionsEnum.openCasting], (state, data) => ({
    ...state,
    freeSlideCastingProcess: data,
    freeSlideCastingPaused: false,
  })),
  on(FreeSlideActions[FreeSlideActionsEnum.pauseCasting], (state) => ({
    ...state,
    freeSlideCastingPaused: true,
  })),
  on(
    FreeSlideActions[FreeSlideActionsEnum.stopCasting],
    (state) =>
      ({
        ...state,
        freeSlideCastingProcess: null,
        freeSlideCastingPaused: true,
        freeSlideCastingStarted: false,
      } satisfies FreeSlideState)
  ),
  on(
    FreeSlideActions[FreeSlideActionsEnum.slideNavigate],
    (state: FreeSlideState, payload) =>
      ({
        ...state,
        freeSlideNavigateState: payload,
        freeSlideCastingProcess: state.freeSlideCastingProcess
          ? {
              ...state.freeSlideCastingProcess,
              slides: state.freeSlideCastingProcess.slides.map((slide) => {
                if (payload.slide.id === slide.id) {
                  /**
                   *  момент навигации слайд мог быть изменен, нужно подменить в сторе
                   */
                  return payload.slide;
                }

                return slide;
              }),
            }
          : null,
      } satisfies FreeSlideState)
  ),
  on(
    FreeSlideActions[FreeSlideActionsEnum.selectSlide],
    (state, payload) =>
      ({
        ...state,
        freeSlideSelected: payload,
      } satisfies FreeSlideState)
  )
);
