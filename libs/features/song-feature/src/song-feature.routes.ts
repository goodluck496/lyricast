import { Routes } from '@angular/router';
import { MainComponentService, Pages } from '@lyri-cast/common-browser';
import { provideState } from '@ngrx/store';
import {
  SongCastingEffects,
  SongFeatureName,
  SongPageReducers,
  SongsPageEffects,
} from '@lyri-cast/song-store';
import { provideEffects } from '@ngrx/effects';
import { inject } from '@angular/core';

export const SongFeatureRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: Pages.SONGS,
  },
  {
    path: Pages.SONGS,
    loadComponent: () =>
      import('./lib/pages/song-page/song-page.component').then(
        (p) => p.SongPageComponent
      ),
    // canActivate: [(a: any,b: any) => {
    //   console.log('SongFeatureRoutes Activated', a);
    //   return true
    // }],
    canDeactivate: [
      () => {
        const mainCompSrv = inject(MainComponentService);
        mainCompSrv.setPageHeaderControlsContainer(null);
      },
    ],
    providers: [
      provideState(SongFeatureName, SongPageReducers),
      provideEffects(SongsPageEffects),
    ],
  },
  {
    path: Pages.CASTING,
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
