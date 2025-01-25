import { Route } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';
import { BibleFeatureName } from './store/bible.selectors';
import { BibleReducers } from './store/bible.reducers';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import { BibleCastingPageEffects } from './store/bible-casting-page.effects';
import { BiblePageEffects } from './store/bible-page.effects';
import { BibleForCastingEffects } from './store/bible-for-casting.effects';

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
