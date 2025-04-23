import { Route } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';
import { provideEffects } from '@ngrx/effects';
import { provideState, Store } from '@ngrx/store';

import {
  BibleActions,
  BibleCastingPageEffects,
  BibleFeatureName,
  BibleForCastingEffects,
  BiblePageEffects,
  BibleReducers,
} from '@lyri-cast/bible-store';
import { inject } from '@angular/core';

export const bibleFeatureRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: Pages.BIBLE,
  },
  {
    path: Pages.BIBLE,
    loadComponent: () =>
      import('./pages/bible-page/bible-page.component').then(
        (p) => p.BiblePageComponent
      ),
    canDeactivate: [
      () => {
        const store = inject(Store);

        store.dispatch(BibleActions.pauseCasting());
      },
    ],
    providers: [
      provideState(BibleFeatureName, BibleReducers),
      provideEffects(BibleForCastingEffects),
      provideEffects(BiblePageEffects),
    ],
  },
  {
    path: Pages.CASTING,
    loadComponent: () =>
      import('./pages/casting/bible-casting.component').then(
        (p) => p.BibleCastingComponent
      ),
    providers: [
      provideState(BibleFeatureName, BibleReducers),
      provideEffects(BibleCastingPageEffects),
    ],
  },
];
