import { createFeatureSelector, createSelector } from '@ngrx/store';
import { QuizStateCasting } from './quiz.reducers';

export const QUIZ_CASTING_FEATURE_KEY = 'quizCasting';

export const selectQuizCastingState = createFeatureSelector<QuizStateCasting>(
  QUIZ_CASTING_FEATURE_KEY,
);

export const selectQuizCastingProcess = createSelector(
  selectQuizCastingState,
  (state) => state.castingProcess,
);
