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

  public transform(
    value: string,
    searchTerm: string,
    type: 'full' | string = ''
  ): string {
    if (!searchTerm) {
      return value;
    }

    return type === 'full'
      ? value.replace(
          new RegExp(`\\b(${searchTerm}\\b)`, 'igm'),
          `<span class="${this.htmlClass}">$1</span>`
        )
      : value.replace(
          new RegExp(searchTerm, 'igm'),
          `<span class="${this.htmlClass}">$&</span>`
        );
  }
}
