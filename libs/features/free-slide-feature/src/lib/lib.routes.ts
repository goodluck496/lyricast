import { Route } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';
import { inject } from '@angular/core';
import { provideState, Store } from '@ngrx/store';
import {
  FreeSlideActions,
  FreeSlideActionsEnum,
  FreeSlideCastingEffects,
  FreeSlideFeatureName,
  FreeSlideForCastingEffects,
  FreeSlideReducers,
} from '@lyri-cast/free-slide-store';
import { provideEffects } from '@ngrx/effects';

export const freeSlideFeatureRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: Pages.FREE_SLIDE,
  },
  {
    path: Pages.FREE_SLIDE,
    loadComponent: () =>
      import('./pages/free-slide-page/free-slide.component').then(
        (c) => c.FreeSlideComponent
      ),
    canDeactivate: [
      () => {
        const store = inject(Store);

        store.dispatch(FreeSlideActions[FreeSlideActionsEnum.pauseCasting]());
      },
    ],
    providers: [
      provideState(FreeSlideFeatureName, FreeSlideReducers),
      provideEffects(FreeSlideCastingEffects),
    ],
  },
  {
    path: Pages.CASTING,
    loadComponent: () =>
      import('./pages/casting/free-slide-casting.component').then(
        (c) => c.FreeSlideCastingComponent
      ),
    providers: [
      provideState(FreeSlideFeatureName, FreeSlideReducers),
      provideEffects(FreeSlideForCastingEffects),
    ],
  },
];
