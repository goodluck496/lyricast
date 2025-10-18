import {
  ApplicationConfig,
  importProvidersFrom,
  Injectable,
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
    importProvidersFrom(BrowserAnimationsModule),
    { provide: RouteReuseStrategy, useClass: CustomReuseStrategy },
    provideHttpClient(withInterceptorsFromDi()),
    { provide: BASE_API_TOKEN, useValue: 'http://localhost:3000/api' },
    //для оптимизации, чтобы вспылтие события не взызывало двойного обнаржуния изменений
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),

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
  ],
};
