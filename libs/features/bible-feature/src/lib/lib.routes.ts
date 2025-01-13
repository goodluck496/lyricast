import { Route } from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';
import { BibleFeatureName } from './store/bible.selectors';
import { BibleReducers } from './store/bible.reducers';
import { BibleEffects } from './store/bible.effects';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

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
      provideEffects(BibleEffects),
    ],
  },
];
