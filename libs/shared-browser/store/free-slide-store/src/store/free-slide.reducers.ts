import { createReducer, on } from '@ngrx/store';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  FreeSlideNavigatePayload,
  FreeSlideStartCastingPayload,
  SetSlideTransitionPayload,
  UpdateTransitionSettingsPayload,
  SetGlobalTransitionPayload,
} from './free-slide.actions';
import { Slide, SlideTransition, DEFAULT_TRANSITION } from '@lyri-cast/entities';

export interface FreeSlideState {
  freeSlideCastingProcess: FreeSlideStartCastingPayload | null;
  freeSlideCastingStarted: boolean;
  freeSlideCastingPaused: boolean;
  freeSlideNavigateState: FreeSlideNavigatePayload | null;
  freeSlideSelected: Slide | null;
  slideTransitions: Map<string, SlideTransition>; // slideId -> transition
  globalTransition: SlideTransition; // глобальный переход для всех слайдов
}

export const freeSlideInitialState: FreeSlideState = {
  freeSlideCastingStarted: false,
  freeSlideCastingProcess: null,
  freeSlideCastingPaused: true,
  freeSlideNavigateState: null,
  freeSlideSelected: null,
  slideTransitions: new Map(),
  globalTransition: DEFAULT_TRANSITION,
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
      } satisfies FreeSlideState)
  ),
  on(
    FreeSlideActions[FreeSlideActionsEnum.selectSlide],
    (state, payload) =>
      ({
        ...state,
        freeSlideSelected: payload,
      } satisfies FreeSlideState)
  ),
  on(
    FreeSlideActions[FreeSlideActionsEnum.liveUpdateSlide],
    (state: FreeSlideState, { slide: updatedSlide }) => {
      if (!state.freeSlideCastingProcess) {
        return state;
      }

      const isNavigatedSlide =
        state.freeSlideNavigateState?.slide.id === updatedSlide.id;

      return {
        ...state,
        // Update the master list of slides
        freeSlideCastingProcess: {
          ...state.freeSlideCastingProcess,
          slides: state.freeSlideCastingProcess.slides.map((slide) =>
            slide.id === updatedSlide.id ? updatedSlide : slide
          ),
        },
        // If it's the active slide, update the navigate state as well to keep it fresh
        freeSlideNavigateState: isNavigatedSlide
          ? { ...(state.freeSlideNavigateState as FreeSlideNavigatePayload), slide: updatedSlide }
          : state.freeSlideNavigateState,
      };
    }
  ),
  on(
    FreeSlideActions[FreeSlideActionsEnum.setSlideTransition],
    (state: FreeSlideState, { slideId, transition }: SetSlideTransitionPayload) => {
      const newTransitions = new Map(state.slideTransitions);
      newTransitions.set(slideId, transition);
      
      return {
        ...state,
        slideTransitions: newTransitions,
      };
    }
  ),
  on(
    FreeSlideActions[FreeSlideActionsEnum.updateTransitionSettings],
    (state: FreeSlideState, { slideId, transition }: UpdateTransitionSettingsPayload) => {
      const existingTransition = state.slideTransitions.get(slideId);
      const updatedTransition = { ...existingTransition, ...transition };
      
      const newTransitions = new Map(state.slideTransitions);
      newTransitions.set(slideId, updatedTransition as SlideTransition);
      
      return {
        ...state,
        slideTransitions: newTransitions,
      };
    }
  ),
  on(
    FreeSlideActions[FreeSlideActionsEnum.setGlobalTransition],
    (state: FreeSlideState, { transition }: SetGlobalTransitionPayload) => {
      console.log('[FreeSlideReducer] setGlobalTransition', {
        oldTransition: state.globalTransition,
        newTransition: transition
      });
      return {
        ...state,
        globalTransition: transition,
      };
    }
  )
);
