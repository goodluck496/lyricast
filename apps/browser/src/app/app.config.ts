import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { appRoutes } from './app.routes';
import { BASE_API_TOKEN } from '@lyri-cast/common';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { CustomReuseStrategy } from '../services/common/router-reuse.strategy';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(BrowserAnimationsModule),
    { provide: RouteReuseStrategy, useClass: CustomReuseStrategy },
    provideHttpClient(withInterceptorsFromDi()),
    { provide: BASE_API_TOKEN, useValue: 'http://localhost:3000/api' },
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
  ],
};
