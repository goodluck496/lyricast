import { Route } from '@angular/router';
import { DictMainComponent } from './layout/dict-main.component';

export const appRoutes: Route[] = [
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
        path: '**',
        redirectTo: 'songs',
        pathMatch: 'full',
      },
    ],
  },
];

