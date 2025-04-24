import {
  ApplicationConfig,
  importProvidersFrom,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { appRoutes } from './app.routes';
import { BASE_API_TOKEN } from '@lyri-cast/common';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { CustomReuseStrategy } from '../services/common/router-reuse.strategy';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { provideState, provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { provideEffects } from '@ngrx/effects';
import { AppEffects, AppReducer } from '@lyri-cast/common-browser';
import {
  NavigatorFeatureEffects,
  NavigatorFeatureName,
  NavigatorReducer,
} from '@lyri-cast/navigator-feature';

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(BrowserAnimationsModule),
    { provide: RouteReuseStrategy, useClass: CustomReuseStrategy },
    provideHttpClient(withInterceptorsFromDi()),
    { provide: BASE_API_TOKEN, useValue: 'http://localhost:3000/api' },
    //для оптимизации, чтобы вспылтие события не взызывало двойного обнаржуния изменений
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),

    /**
     * NGRX
     */
    provideStore({ ApplicationFeature: AppReducer }),
    provideEffects(AppEffects),
    provideStoreDevtools(),
    //navigator state
    provideState(NavigatorFeatureName, NavigatorReducer),
    provideEffects(NavigatorFeatureEffects),
  ],
};
