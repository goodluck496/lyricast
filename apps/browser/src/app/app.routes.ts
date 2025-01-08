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
        path: Pages.SONGS_NEW,
        pathMatch: 'full',
        redirectTo: `${Pages.SONGS_FEATURE}/${Pages.SONGS_NEW}`,
      },
      {
        path: Pages.BIBLE,
        loadComponent: () =>
          import('./pages/bible-page/bible-page.component').then(
            (c) => c.BiblePageComponent
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
    path: Pages.CASTING_NEW,
    pathMatch: 'full',
    redirectTo: `${Pages.SONGS_FEATURE}/${Pages.CASTING_NEW}`,
  },
];
