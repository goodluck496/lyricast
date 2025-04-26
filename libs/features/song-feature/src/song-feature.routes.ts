import { Routes } from '@angular/router';
import { Pages, SidebarService } from '@lyri-cast/common-browser';
import { provideState, Store } from '@ngrx/store';
import {
  SongActions,
  SongCastingEffects,
  SongFeatureName,
  SongPageReducers,
  SongsPageEffects,
} from '@lyri-cast/song-store';
import { provideEffects } from '@ngrx/effects';
import { inject } from '@angular/core';
import { IconsService } from '@lyri-cast/svg-icons';
import { lyriPlay } from '@lyri-cast/svg-icons/lyri-icons/lyri-play.icon';
import { lyriStop } from '@lyri-cast/svg-icons/lyri-icons/lyri-stop.icon';

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
    resolve: [() => {
      const iconSrv = inject(IconsService);
      return iconSrv.registerIcons([lyriPlay, lyriStop]);
    }],
    canDeactivate: [
      () => {
        const store = inject(Store);

        store.dispatch(SongActions.pauseCasting());
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
