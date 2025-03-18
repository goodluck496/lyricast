import { Pipe, PipeTransform } from '@angular/core';

/***
 * Преобразовывает передаваемый текст `searchTerm` в выделяемый текст, изменяя исходный текст `value`
 * @param {value} - исходный текст
 * @param {searchTerm} - выделяемый текст
 * @param {type} - тип выделения текста, 'full' - выделение, только при полном совпадении текста
 * @example <span [innerHTML]="text | highliter : searchTerm : 'full'"></span>
 * @example <span [innerHTML]="text | highliter : searchTerm></span>
 *
 * @returns {value}
 * - преобразованный текст с выделеннием
 */
@Pipe({
  name: 'highliter',
  standalone: true,
  pure: true,
})
export class HighlighterPipe implements PipeTransform {
  htmlClass = 'highlighted-text';

  public transform2(
    value: string,
    searchTerm: string,
    maxStringLength: number,
    type: 'full' | string = ''
  ): string {
    if (!searchTerm) {
      return value;
    }

    let result = value
    if(value.length >= maxStringLength) {

    }

    result =
      type === 'full'
        ? value.replace(
            new RegExp(`\\b(${searchTerm}\\b)`, 'igm'),
            `<span class="${this.htmlClass}">$1</span>`
          )
        : value.replace(
            new RegExp(searchTerm, 'igm'),
            `<span class="${this.htmlClass}">$&</span>`
          );

    return result;
  }


  public transform3(
    value: string,
    searchTerm: string,
    maxStringLength = 150,
    type: 'full' | string = ''
  ): string {
    if (!searchTerm || !value) {
      return value;
    }

    const regex =
      type === 'full'
        ? new RegExp(`\\b(${searchTerm}\\b)`, 'igm')
        : new RegExp(searchTerm, 'igm');

    const match = value.match(regex);
    if (!match) {
      return value;
    }

    let startIndex = value.indexOf(match[0]);
    let endIndex = startIndex + match[0].length;

    // Определяем границы обрезки
    let sliceStart = Math.max(0, startIndex - Math.floor((maxStringLength - match[0].length) / 2));
    let sliceEnd = Math.min(value.length, sliceStart + maxStringLength);

    // Гарантируем, что искомая фраза влезет в границы
    if (startIndex < sliceStart) {
      sliceStart = Math.max(0, startIndex);
      sliceEnd = Math.min(value.length, sliceStart + maxStringLength);
    }

    if (endIndex > sliceEnd) {
      sliceEnd = Math.min(value.length, endIndex);
      sliceStart = Math.max(0, sliceEnd - maxStringLength);
    }

    const truncatedValue = value.slice(sliceStart, sliceEnd);
    let highlighted = truncatedValue.replace(regex, `<span class="${this.htmlClass}">$&</span>`);

    // Добавляем многоточия, если текст был обрезан
    if (sliceStart > 0) {
      highlighted = `...${highlighted}`;
    }
    if (sliceEnd < value.length) {
      highlighted = `${highlighted}...`;
    }

    return highlighted;
  }

  public transform(
    value: string,
    searchTerm: string,
    maxStringLength = 150,
    type: 'full' | string = ''
  ): string {
    if (!searchTerm || !value) {
      return value;
    }

    const regex =
      type === 'full'
        ? new RegExp(`\\b(${searchTerm}\\b)`, 'igm')
        : new RegExp(searchTerm, 'igm');

    // Создаем временный элемент для парсинга HTML
    const tempElement = document.createElement('div');
    tempElement.innerHTML = value;

    // Удаляем все HTML-теги, чтобы работать только с текстом
    const plainText = tempElement.textContent || tempElement.innerText || '';

    const match = plainText.match(regex);
    if (!match) {
      return value; // Если нет совпадений, возвращаем оригинальный HTML
    }

    const startIndex = plainText.indexOf(match[0]);
    const endIndex = startIndex + match[0].length;

    // Определяем границы обрезки
    let sliceStart = Math.max(0, startIndex - Math.floor((maxStringLength - match[0].length) / 2));
    let sliceEnd = Math.min(plainText.length, sliceStart + maxStringLength);

    if (startIndex < sliceStart) {
      sliceStart = Math.max(0, startIndex);
      sliceEnd = Math.min(plainText.length, sliceStart + maxStringLength);
    }

    if (endIndex > sliceEnd) {
      sliceEnd = Math.min(plainText.length, endIndex);
      sliceStart = Math.max(0, sliceEnd - maxStringLength);
    }

    // Восстанавливаем HTML внутри нужного диапазона
    const range = document.createRange();
    range.setStart(tempElement, 0);
    range.setEnd(tempElement, tempElement.childNodes.length);
    const extractedHtml = range.cloneContents();

    // Создаем временный контейнер для обрезки HTML
    const tempContainer = document.createElement('div');
    tempContainer.appendChild(extractedHtml);

    // Получаем текст внутри контейнера
    let truncatedHtml = tempContainer.innerHTML;

    // Выделяем искомый текст, сохраняя разметку
    truncatedHtml = truncatedHtml.replace(regex, `<span class="${this.htmlClass}">$&</span>`);

    // Добавляем многоточия, если текст был урезан
    if (sliceStart > 0) {
      truncatedHtml = `...${truncatedHtml}`;
    }
    if (sliceEnd < plainText.length) {
      truncatedHtml = `${truncatedHtml}...`;
    }

    return truncatedHtml;
  }
}
