import {
  ActivatedRouteSnapshot,
  Route,
  RouterStateSnapshot,
} from '@angular/router';
import { MainComponent } from './pages/main/main.component';
import { MainComponentService, Pages } from '@lyri-cast/common-browser';
import { Component, inject } from '@angular/core';

@Component({
  standalone: true,
  selector: 'lyri-empty-page',
  template: '',
})
class EmptyPageComponent {}

export const appRoutes: Route[] = [
  {
    path: Pages.MAIN,
    component: MainComponent,
    canActivate: [
      (_: ActivatedRouteSnapshot, rss: RouterStateSnapshot) => {
        return !rss.url.includes(Pages.CASTING);
      },
    ],
    children: [
      {
        path: Pages.SONGS_FEATURE,
        loadChildren: () =>
          import('@lyri-cast/song-feature').then((c) => c.SongFeatureRoutes),
      },
      {
        path: Pages.BIBLE_FEATURE,
        loadChildren: () =>
          import('@lyri-cast/bible-feature').then((c) => c.bibleFeatureRoutes),
      },
      {
        path: Pages.FREE_SLIDE_FEATURE,
        loadChildren: () =>
          import('@lyri-cast/free-slide-feature').then(
            (c) => c.freeSlideFeatureRoutes
          ),
      },
      {
        path: Pages.PROGRAMS,
        loadComponent: () =>
          import('./pages/programs-page/programs-page.component').then(
            (c) => c.ProgramsPageComponent
          ),
      },
      {
        path: Pages.QUIZ,
        loadComponent: () =>
          import('./pages/quiz/quiz.component').then(
            (c) => c.QuizComponent
          ),
      },
      {
        path: Pages.SETTINGS,
        loadComponent: () =>
          import('./pages/settings/settings.component').then(
            (c) => c.SettingsComponent
          ),
        canActivate: [
          () => {
            const mainCmpService = inject(MainComponentService);

            mainCmpService.$disableSidebar.set(true);
          },
        ],
        canDeactivate: [
          () => {
            const mainCmpService = inject(MainComponentService);

            mainCmpService.$disableSidebar.set(false);
          },
        ],
      },
      // {
      //   path: Pages.TEST,
      //   loadComponent: () =>
      //     import('./pages/test-page/test-pixi-editor3/test-pixi-editor3.component').then(
      //       (c) => c.TestPixiEditorV2Component
      //     ),
      // },
    ],
  },
  {
    path: Pages.SONGS_FEATURE,
    loadChildren: () =>
      import('@lyri-cast/song-feature').then((c) => c.SongFeatureRoutes),
  },
  {
    path: Pages.BIBLE_FEATURE,
    loadChildren: () =>
      import('@lyri-cast/bible-feature').then((c) => c.bibleFeatureRoutes),
  },
  {
    path: Pages.FREE_SLIDE_FEATURE,
    loadChildren: () =>
      import('@lyri-cast/free-slide-feature').then(
        (c) => c.freeSlideFeatureRoutes
      ),
  },

  {
    path: 'quiz-casting',
    loadComponent: () =>
      import('./pages/quiz-casting/quiz-casting.component').then(
        (c) => c.QuizCastingComponent,
      ),
  },

  { path: 'EMPTY', component: EmptyPageComponent },
];
