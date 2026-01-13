import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { appRoutes } from './app.routes';
import {
  provideHttpClient,
  withInterceptors,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { provideApi } from '@lyri-cast/openapi-songs-dictionary';
import {
  AUTH_OVERLAY_PORT,
  authInterceptor,
} from '@lyri-cast/shared-browser/data-access/dictionaries';
import { AuthOverlayService } from './auth/auth-overlay.service';
import { MessageService } from 'primeng/api';
import { apiErrorToastInterceptor } from './interceptors/api-error-toast.interceptor';
import { environment } from '../../environments/environment';
import { DICTIONARIES_API_BASE } from '@lyri-cast/shared-browser/data-access/dictionaries';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes, withHashLocation()),
    provideHttpClient(
      withInterceptorsFromDi(),
      withInterceptors([authInterceptor, apiErrorToastInterceptor])
    ),

    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.my-app-dark',
        },
      },
    }),

    provideApi(environment.API_URL),

    {
      provide: DICTIONARIES_API_BASE,
      useValue: `${environment.API_URL}/api/songs`,
    },

    MessageService,

    {
      provide: AUTH_OVERLAY_PORT,
      useExisting: AuthOverlayService,
    },
  ],
};
