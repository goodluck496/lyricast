import { Route } from '@angular/router';
import { DictMainComponent } from './layout/dict-main.component';

export const appRoutes: Route[] = [
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./auth/auth-callback.component').then((c) => c.AuthCallbackComponent),
  },
  {
    path: '',
    component: DictMainComponent,
    children: [
      {
        path: 'songs',
        loadComponent: () =>
          import('./pages/songs/components/song-cards/song-cards-page.component').then(
            (c) => c.SongCardsPageComponent
          ),
      },
      {
        path: 'songs/:dbId',
        loadComponent: () =>
          import('./pages/songs/songs-table-page.component').then(
            (c) => c.SongsTablePageComponent
          ),
      },
      {
        path: 'bibles',
        loadComponent: () =>
          import('./pages/bibles/components/bible-cards/bible-cards-page.component').then(
            (c) => c.BibleCardsPageComponent
          ),
      },
      {
        path: 'bibles/:bibleId',
        loadComponent: () =>
          import('./pages/bibles/bible-viewer-page.component').then(
            (c) => c.BibleViewerPageComponent
          ),
      },
      {
        path: '**',
        redirectTo: 'songs',
        pathMatch: 'full',
      },
    ],
  },
];

