import { Routes } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';

export const quizFeatureRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: Pages.QUIZ,
  },
  {
    path: Pages.QUIZ,
    loadComponent: () =>
      import('./pages/quiz/quiz.component').then((c) => c.QuizComponent),
  },
  {
    path: Pages.CASTING,
    loadComponent: () =>
      import('./pages/quiz-casting/quiz-casting.component').then(
        (c) => c.QuizCastingComponent
      ),
  },
];
