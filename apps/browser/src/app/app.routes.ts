import { Route } from '@angular/router';
import { MainComponent } from './pages/main/main.component';
import { Pages } from '@lyri-cast/common-browser';

export const appRoutes: Route[] = [
  { path: '', redirectTo: Pages.MAIN, pathMatch: 'full' },
  {
    path: Pages.MAIN,
    component: MainComponent,
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
        path: Pages.PROGRAMS,
        loadComponent: () =>
          import('./pages/programs-page/programs-page.component').then(
            (c) => c.ProgramsPageComponent
          ),
      },
      {
        path: Pages.SETTINGS,
        loadComponent: () =>
          import('./pages/settings/settings.component').then(
            (c) => c.SettingsComponent
          ),
      },
      {
        path: Pages.TEST,
        loadComponent: () =>
          import('./pages/test-page/test-page.component').then(
            (c) => c.TestPageComponent
          ),
      },
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
];
