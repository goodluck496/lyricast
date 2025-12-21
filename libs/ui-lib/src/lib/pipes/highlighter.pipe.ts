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

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private wrapWithUnicodeWordBoundaries(pattern: string): string {
    // JS \b doesn't work well with Cyrillic. Use Unicode property escapes.
    // Treat letters/numbers/underscore as "word" characters.
    const wordChar = '[\\p{L}\\p{N}_]';
    return `(?<!${wordChar})${pattern}(?!${wordChar})`;
  }

  private buildRegex(searchTerm: string, type: 'full' | string = ''): RegExp | null {
    const normalized = (searchTerm ?? '').trim();
    if (!normalized) return null;

    // If the user entered a phrase, we try to highlight it as a phrase first.
    // If the phrase doesn't exist in the text, we can fallback to highlighting individual terms.
    const terms = normalized.split(/\s+/g).filter(Boolean);

    if (type === 'full') {
      const escaped = this.escapeRegExp(normalized);
      return new RegExp(this.wrapWithUnicodeWordBoundaries(`(${escaped})`), 'igu');
    }

    if (terms.length > 1) {
      const escapedTerms = terms.map((t) => this.escapeRegExp(t));
      // allow whitespace and punctuation between terms (backend search normalizes punctuation)
      const phrase = escapedTerms.join('(?:[\\s\\p{P}\\p{S}]+)');
      return new RegExp(phrase, 'igu');
    }

    return new RegExp(this.escapeRegExp(normalized), 'igu');
  }

  private buildPhraseLocateRegex(searchTerm: string): RegExp | null {
    const normalized = (searchTerm ?? '').trim();
    if (!normalized) return null;

    const terms = normalized.split(/\s+/g).filter(Boolean);
    if (terms.length <= 1) return null;

    const escapedTerms = terms.map((t) => this.escapeRegExp(t));
    const phrase = escapedTerms.join('(?:[\\s\\p{P}\\p{S}]+)');
    return new RegExp(phrase, 'igu');
  }

  private buildTermsFallbackRegex(searchTerm: string): RegExp | null {
    const normalized = (searchTerm ?? '').trim();
    if (!normalized) return null;

    const terms = normalized.split(/\s+/g).filter(Boolean);
    if (terms.length <= 1) return null;

    const escaped = terms.map((t) => this.escapeRegExp(t)).join('|');
    return new RegExp(`(?:${escaped})`, 'igu');
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

    const normalizedSearch = (searchTerm ?? '').trim();
    const terms = normalizedSearch.split(/\s+/g).filter(Boolean);

    const regex = this.buildRegex(searchTerm, type);
    if (!regex) {
      return value;
    }

    // Создаем временный элемент для парсинга HTML
    const tempElement = document.createElement('div');
    tempElement.innerHTML = value;

    // Удаляем все HTML-теги, чтобы работать только с текстом
    const plainText = tempElement.textContent || tempElement.innerText || '';


    // 1) Для фразы: пытаемся найти фразу (для выбора сниппета),
    // 2) Если фразу не нашли — ищем по словам,
    // 3) Подсветку делаем словами (так читабельнее), если это фраза.

    const phraseLocateRegex = type !== 'full' ? this.buildPhraseLocateRegex(searchTerm) : null;
    const termsHighlightRegex =
      type !== 'full' && terms.length > 1 ? this.buildTermsFallbackRegex(searchTerm) : null;

    let match = plainText.match(phraseLocateRegex ?? regex);
    let locateRegex = phraseLocateRegex ?? regex;
    let highlightRegex: RegExp = termsHighlightRegex ?? locateRegex;

    if (!match) {
      const fallbackRegex = this.buildTermsFallbackRegex(searchTerm);
      if (fallbackRegex) {
        match = plainText.match(fallbackRegex);
        locateRegex = fallbackRegex;
        highlightRegex = fallbackRegex;
      }
    }
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
    truncatedHtml = truncatedHtml.replace(
      highlightRegex,
      `<span class="${this.htmlClass}">$&</span>`
    );

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
