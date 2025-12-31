import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { appRoutes } from './app.routes';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptors,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { provideApi } from '@lyri-cast/openapi-client';
import { authInterceptor, AUTH_OVERLAY_PORT } from '@lyri-cast/shared-browser/data-access/dictionaries';
import { AuthOverlayService } from './auth/auth-overlay.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes, withHashLocation()),
    provideHttpClient(withInterceptorsFromDi(), withInterceptors([authInterceptor])),


    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.my-app-dark',
        },
      },
    }),

    provideApi('https://kantelers.ru/lyricast/api'),

    // {
    //   provide: HTTP_INTERCEPTORS,
    //   useClass: AuthInterceptor,
    //   multi: true,
    // },

    {
      provide: AUTH_OVERLAY_PORT,
      useExisting: AuthOverlayService,
    },
  ],
};
