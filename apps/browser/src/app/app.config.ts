import {
  ApplicationConfig,
  inject,
  Injectable,
  LOCALE_ID,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { appRoutes } from './app.routes';
import { BASE_API_TOKEN } from '@lyri-cast/common';
import {
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { Observable, of, switchMap } from 'rxjs';
import { CustomReuseStrategy } from '../services/common/router-reuse.strategy';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideState, provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { provideEffects } from '@ngrx/effects';
import { AppEffects, AppReducer } from '@lyri-cast/common-browser';
import {
  NavigatorFeatureEffects,
  NavigatorFeatureName,
  NavigatorReducer,
} from '@lyri-cast/navigator-feature';
import {
  LuxonDateAdapter,
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
  AuthFlowService,
  AuthTokenStore,
} from '@lyri-cast/shared-browser/data-access/dictionaries';
import { AuthOverlayService } from './auth/auth-overlay.service';
import { registerLocaleData } from '@angular/common';
import localeRu from '@angular/common/locales/ru';

registerLocaleData(localeRu);

function browserScopedAuthInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  // Не трогаем запросы авторизации (auth.login), чтобы не зациклиться
  if (req.url.includes('action=auth.login')) {
    return next(req);
  }

  // В основном приложении токен нужен только для синхронизации справочников,
  // чтобы оверлей авторизации не всплывал при запуске приложения.
  const isSongsDictionariesRequest =
    req.url.includes('svc://') &&
    (req.url.includes('/songs/dictionaries') ||
      req.url.includes('/songs/dictionaries/install'));

  if (!isSongsDictionariesRequest) {
    return next(req);
  }

  // svc:// протокол в Electron/Chromium может вырезать Authorization/X-Auth-Token.
  // Поэтому дублируем токен в query-параметр authToken.
  const tokenStore = inject(AuthTokenStore);
  const authFlow = inject(AuthFlowService);

  const existing = tokenStore.getToken();
  const ensureToken$ = existing ? of(String(existing)) : authFlow.getOrRequestToken();

  return ensureToken$.pipe(
    switchMap((token) => {
      const tokenStr = String(token);
      const authReq = req.clone({
        setParams: { authToken: tokenStr },
        setHeaders: {
          Authorization: `Bearer ${tokenStr}`,
          'X-Auth-Token': tokenStr,
        },
      });
      return next(authReq);
    })
  );
}

export const RU_LUXON_DATE_FORMATS = {
  parse: {
    // как парсить строку при ручном вводе
    dateInput: 'dd.MM.yyyy',
  },
  display: {
    // как рисовать строку после выбора и при отображении в инпуте
    dateInput: 'dd.MM.yyyy',
    monthYearLabel: 'LLLL yyyy',
    dateA11yLabel: 'dd.MM.yyyy',
    monthYearA11yLabel: 'LLLL yyyy',
  },
};

@Injectable()
export class CustomLuxonDateAdapter extends LuxonDateAdapter {
  // style: 'long'|'short'|'narrow'
  override getDayOfWeekNames(style: 'long' | 'short' | 'narrow'): string[] {
    // Именно narrow заголовок календаря — возвращаем 2-буквенные
    if (style === 'narrow') {
      return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    }
    // На остальные стили можно вернуть русские полные/короткие
    if (style === 'short') {
      return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    }
    return super.getDayOfWeekNames(style);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'ru-RU' },
    provideAnimationsAsync(),
    { provide: RouteReuseStrategy, useClass: CustomReuseStrategy },
    provideHttpClient(
      withInterceptorsFromDi(),
      withInterceptors([browserScopedAuthInterceptor])
    ),
    { provide: BASE_API_TOKEN, useValue: 'http://localhost:3000/api' },
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

    provideApi('https://kantelers.ru/lyricast/api'),

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
