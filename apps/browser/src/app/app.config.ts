import {
  APP_INITIALIZER,
  ApplicationConfig,
  inject,
  LOCALE_ID,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { appRoutes } from './app.routes';
import { BASE_API_TOKEN } from '@lyri-cast/common';
import {
  provideHttpClient,
  withInterceptors,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { CustomReuseStrategy } from '../services/common/router-reuse.strategy';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideState, provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { provideEffects } from '@ngrx/effects';
import {
  AppEffects,
  AppReducer,
  AuthStorageService,
  CustomLuxonDateAdapter,
  RU_LUXON_DATE_FORMATS,
} from '@lyri-cast/common-browser';
import {
  NavigatorFeatureEffects,
  NavigatorFeatureName,
  NavigatorReducer,
} from '@lyri-cast/navigator-feature';
import {
  MAT_LUXON_DATE_ADAPTER_OPTIONS,
  MatLuxonDateAdapterOptions,
} from '@angular/material-luxon-adapter';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
} from '@angular/material/core';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { provideApi } from '@lyri-cast/openapi-songs-dictionary';
import {
  AUTH_OVERLAY_PORT,
  browserScopedAuthInterceptor,
} from '@lyri-cast/shared-browser/data-access/dictionaries';
import { AuthOverlayService } from './auth/auth-overlay.service';
import { DICTIONARIES_API_BASE } from '@lyri-cast/shared-browser/data-access/dictionaries';
import { registerLocaleData } from '@angular/common';
import localeRu from '@angular/common/locales/ru';
import { MessageService } from 'primeng/api';

registerLocaleData(localeRu);

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => {
        const authStorage = inject(AuthStorageService);
        return () => authStorage.whenReady();
      },
    },
    { provide: LOCALE_ID, useValue: 'ru-RU' },
    provideAnimationsAsync(),
    { provide: RouteReuseStrategy, useClass: CustomReuseStrategy },
    provideHttpClient(
      withInterceptorsFromDi(),
      withInterceptors([browserScopedAuthInterceptor])
    ),
    { provide: BASE_API_TOKEN, useValue: 'svc://' },
    { provide: DICTIONARIES_API_BASE, useValue: 'svc://songs/dictionaries' },
    //для оптимизации, чтобы вспылтие события не взызывало двойного обнаржуния изменений
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),

    /**
     * PrimeNG v20 global configuration + always-on dark mode
     */
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.my-app-dark',
        },
      },
    }),

    MessageService,

    provideApi('https://lyricast-dictionary-api.onrender.com'),

    {
      provide: AUTH_OVERLAY_PORT,
      useExisting: AuthOverlayService,
    },

    /**
     * Material
     */
    { provide: MAT_DATE_LOCALE, useValue: 'ru-RU' },
    { provide: MAT_DATE_FORMATS, useValue: RU_LUXON_DATE_FORMATS },
    {
      provide: MAT_LUXON_DATE_ADAPTER_OPTIONS,
      useValue: { firstDayOfWeek: 1 } as MatLuxonDateAdapterOptions,
    },
    {
      provide: DateAdapter,
      useClass: CustomLuxonDateAdapter,
      deps: [MAT_DATE_LOCALE, MAT_LUXON_DATE_ADAPTER_OPTIONS],
    },

    /**
     * NGRX
     */
    provideStore({ ApplicationFeature: AppReducer }),
    provideEffects(AppEffects),
    provideStoreDevtools(),
    //navigator state
    provideState(NavigatorFeatureName, NavigatorReducer),
    provideEffects(NavigatorFeatureEffects),
    // Предоставляем EDITOR_CONFIG на корневом уровне
    // { provide: EDITOR_CONFIG, useValue: DEFAULT_CONFIG },
  ],
};
