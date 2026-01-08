import { Injectable } from '@angular/core';
import { LuxonDateAdapter } from '@angular/material-luxon-adapter';

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
