import { Pipe, PipeTransform } from '@angular/core';

export function sliceTextAtBreak(text: string): string {
  // Ищем первое вхождение спецсимволов
  const match = text.match(/(\n|<br\s*\/?>|,)/i);

  if (match && match.index !== undefined) {
    // Обрезаем строку до найденного спецсимвола
    return text.slice(0, match.index).trim();
  }

  // Если ничего не найдено — возвращаем весь текст
  return text.trim();
}


@Pipe({
  name: 'lyriSliceTextAtBreak',
  standalone: true,
})
export class SliceTextAtBreakPipe implements PipeTransform {
  transform(value: string): unknown {
    return sliceTextAtBreak(value);
  }
}
