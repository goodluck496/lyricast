import { Pipe, PipeTransform } from '@angular/core';

export function sliceTextAtBreak(text: string): string {
  // Сначала обрезаем пробелы
  const trimmedText = text.trim();
  const maxSymbols = 15;

  // Ищем первое вхождение спецсимволов (но исключаем <br>)
  const match = trimmedText.match(/(\n|,|<(?!br\s*\/?>)|\s{2,})/i);

  let result = trimmedText;

  if (match && match.index !== undefined) {
    // Обрезаем строку до найденного спецсимвола
    result = trimmedText.slice(0, match.index).trim();
  }

  // Проверяем длину и наличие <br>
  if (result.length < maxSymbols) {
    // Берем первые 20 символов исходного текста, исключая <br>
    const first20Chars = trimmedText.slice(0, maxSymbols).replace(/<br\s*\/?>/gi, '').trim();

    // Если после удаления <br> осталось достаточно текста
    if (first20Chars.length >= maxSymbols) {
      return first20Chars.slice(0, maxSymbols) + ' ...';
    }
    return first20Chars || trimmedText.slice(0, maxSymbols);
  } else

  return result.slice(0, maxSymbols) + ' ...';


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
