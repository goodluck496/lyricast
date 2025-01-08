import { Routes } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';
import { provideState } from '@ngrx/store';
import {
  SongFeatureName,
  SongPageReducers,
  SongsPageEffects,
} from './lib/store';
import { provideEffects } from '@ngrx/effects';
import { SongCastingEffects } from './lib/store/song-casting.effects';

export const SongFeatureRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: Pages.SONGS_NEW,
  },
  {
    path: Pages.SONGS_NEW,
    loadComponent: () =>
      import('./lib/pages/song-page/song-page.component').then(
        (p) => p.SongPageComponent
      ),
    providers: [
      provideState(SongFeatureName, SongPageReducers),
      provideEffects(SongsPageEffects),
    ],
  },
  {
    path: Pages.CASTING_NEW,
    loadComponent: () =>
      import('./lib/pages/casting/casting.component').then(
        (p) => p.CastingComponent
      ),
    providers: [
      provideState(SongFeatureName, SongPageReducers),
      provideEffects(SongCastingEffects),
    ],
  },
];
