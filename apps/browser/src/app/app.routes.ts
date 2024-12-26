import { Route } from '@angular/router';
import { Pages } from './pages/page.types';
import { MainComponent } from './pages/main/main.component';

export const appRoutes: Route[] = [
  { path: '', redirectTo: Pages.MAIN, pathMatch: 'full' },
  {
    path: Pages.MAIN,
    component: MainComponent,
    children: [
      {
        path: Pages.SONGS,
        loadComponent: () =>
          import('./pages/songs-page/songs-page.component').then(
            (c) => c.SongsPageComponent
          ),
      },
      {
        path: Pages.SONGS_NEW,
        loadComponent: () =>
          import('./pages/song-page-new/song-page-new.component').then(
            (c) => c.SongPageNewComponent
          ),
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
      }
    ],
  },
  {
    path: Pages.CASTING,
    loadComponent: () =>
      import('./pages/casting/casting.component').then(
        (c) => c.CastingComponent
      ),
  },

];
