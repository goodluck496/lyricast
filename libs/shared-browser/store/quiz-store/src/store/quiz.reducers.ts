import { createReducer, on } from '@ngrx/store';
import { QuizActions, QuizActionsEnum, QuizCastingPayload } from './quiz.actions';

export interface QuizStateCasting {
  castingProcess: QuizCastingPayload | null;
  castingPaused: boolean;
}

export const quizCastingInitialState: QuizStateCasting = {
  castingProcess: null,
  castingPaused: true,
};

export const QuizCastingReducers = createReducer<QuizStateCasting>(
  quizCastingInitialState,
  on(QuizActions[QuizActionsEnum.openCasting], (state, payload) => ({
    ...state,
    castingProcess: payload,
    castingPaused: false,
  } satisfies QuizStateCasting)),
  on(QuizActions[QuizActionsEnum.startCasting], (state, payload) => ({
    ...state,
    castingProcess: payload,
    castingPaused: false,
  } satisfies QuizStateCasting)),
  on(QuizActions[QuizActionsEnum.pauseCasting], (state) => ({
    ...state,
    castingPaused: true,
  } satisfies QuizStateCasting)),
  on(QuizActions[QuizActionsEnum.stopCasting], () => ({
    ...quizCastingInitialState,
  } satisfies QuizStateCasting)),
);
