import { Route } from '@angular/router';
import { Pages } from './pages/page.types';

export const appRoutes: Route[] = [
  { path: '', redirectTo: Pages.HOME, pathMatch: 'full' },
  {
    path: Pages.HOME,
    loadComponent: () =>
      import('./pages/home/home.component').then((c) => c.HomeComponent),
  },
  {
    path: Pages.CASTING,
    loadComponent: () =>
      import('./pages/casting/casting.component').then(
        (c) => c.CastingComponent
      ),
  },
];
