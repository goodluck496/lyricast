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
          import('./pages/songs/songs-dbs-page.component').then(
            (c) => c.SongsDbsPageComponent
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

