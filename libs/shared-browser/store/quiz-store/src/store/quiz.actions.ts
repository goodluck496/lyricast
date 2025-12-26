import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Pages } from '@lyri-cast/common-browser';

export const QuizActionsEnum = {
  openPage: '[QUIZ]openPage',
  openCasting: '[QUIZ]openCasting',
  startCasting: '[QUIZ]startCasting',
  pauseCasting: '[QUIZ]pauseCasting',
  stopCasting: '[QUIZ]stopCasting',
} as const;

export type QuizActionsEnumKeys = keyof typeof QuizActionsEnum;

export type QuizCastingPayload = {
  // пока без детализированных полей; добавим позже при реализации логики вопросов/очков
  quizId?: string;
};

export const QuizActionSource = 'QUIZ_ACTIONS';

export const QuizActions = createActionGroup({
  source: QuizActionSource,
  events: {
    [QuizActionsEnum.openPage]: props<{ path: string[] }>(),
    [QuizActionsEnum.openCasting]: props<QuizCastingPayload>(),
    [QuizActionsEnum.startCasting]: props<QuizCastingPayload>(),
    [QuizActionsEnum.pauseCasting]: emptyProps(),
    [QuizActionsEnum.stopCasting]: emptyProps(),
  },
});
