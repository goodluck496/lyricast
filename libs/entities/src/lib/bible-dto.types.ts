import {
  BibleBook,
  BibleVerse,
  BibleTranslate,
} from './bible.types';

export type BibleChapterSectionContentShort = {
  type: 'line';
  number: number;
};

export type BibleChapterSectionShort = {
  heading: string;
  content: BibleChapterSectionContentShort[];
};
export type BibleChapterShort = {
  number: number;
  title: string;
};
export type BibleBookShort = Omit<BibleBook, 'chapters'> & {
  chapters: BibleChapterShort[];
};

export type BibleTranslateShort = Omit<BibleTranslate, 'books'>;

export const BOOK_NAMES = {
  1: { short: 'Быт', full: 'Бытие' },
  2: { short: 'Исх', full: 'Исход' },
  3: { short: 'Лев', full: 'Левит' },
  4: { short: 'Чис', full: 'Числа' },
  5: { short: 'Втор', full: 'Второзаконие' },
  6: { short: 'Нав', full: 'Иисус Навин' },
  7: { short: 'Суд', full: 'Книга судей' },
  8: { short: 'Руфь', full: 'Руфь' },
  9: { short: '1Цар', full: '1-ая Царств' },
  10: { short: '2Цар', full: '2-ая книга Царств' },
  11: { short: '3Цар', full: '3-ая книга Царств' },
  12: { short: '4Цар', full: '4-ая книга Царств' },
  13: { short: '1Пар', full: '1-я Паралипоменон' },
  14: { short: '2Пар', full: '2-я Паралипоменон' },
  15: { short: 'Ездр', full: 'Ездра' },
  16: { short: 'Неем', full: 'Неемия' },
  17: { short: 'Есф', full: 'Есфирь' },
  18: { short: 'Иов', full: 'Иова' },
  19: { short: 'Пс', full: 'Псалмы' },
  20: { short: 'Прит', full: 'Притчи' },
  21: { short: 'Еккл', full: 'Екклесиаст' },
  22: { short: 'Песн', full: 'Песня песней' },
  23: { short: 'Ис', full: 'Исаия' },
  24: { short: 'Иер', full: 'Иеремия' },
  25: { short: 'Плач', full: 'Плач Иеремии' },
  26: { short: 'Иез', full: 'Иезекииль' },
  27: { short: 'Дан', full: 'Даниил' },
  28: { short: 'Ос', full: 'Осия' },
  29: { short: 'Иоил', full: 'Иоиль' },
  30: { short: 'Ам', full: 'Амос' },
  31: { short: 'Авд', full: 'Авдий' },
  32: { short: 'Ион', full: 'Иона' },
  33: { short: 'Мих', full: 'Михей' },
  34: { short: 'Наум', full: 'Наум' },
  35: { short: 'Авв', full: 'Аввакум' },
  36: { short: 'Соф', full: 'Софония' },
  37: { short: 'Агг', full: 'Аггей' },
  38: { short: 'Зах', full: 'Захария' },
  39: { short: 'Мал', full: 'Малахия' },
  40: { short: 'Мат', full: 'От Матфея' },
  41: { short: 'Мар', full: 'От Марка' },
  42: { short: 'Лук', full: 'От Луки' },
  43: { short: 'Ин', full: 'От Иоанна' },
  44: { short: 'Деян', full: 'Деяния апостолов' },
  45: { short: 'Иак', full: 'Иакова' },
  46: { short: '1Пет', full: '1-ое Петра' },
  47: { short: '2Пет', full: '2-ое Петра' },
  48: { short: '1Ин', full: '1-ое Иоанна' },
  49: { short: '2Ин', full: '2-ое Иоанна' },
  50: { short: '3Ин', full: '3-ое Иоанна' },
  51: { short: 'Иуд', full: 'Иуды' },
  52: { short: 'Рим', full: 'Римлянам' },
  53: { short: '1Кор', full: '1-ое Коринфянам' },
  54: { short: '2Кор', full: '2-ое Коринфянам' },
  55: { short: 'Гал', full: 'Галлатам' },
  56: { short: 'Еф', full: 'Ефесянам' },
  57: { short: 'Флп', full: 'Филиппийцам' },
  58: { short: 'Кол', full: 'Колоссянам' },
  59: { short: '1Фес', full: '1-ое Фессалоникийцам' },
  60: { short: '2Фес', full: '2-ое Фессалоникийцам' },
  61: { short: '1Тим', full: '1-ое Тимофею' },
  62: { short: '2Тим', full: '2-ое Тимофею' },
  63: { short: 'Тит', full: 'Титу' },
  64: { short: 'Флм', full: 'Филимону' },
  65: { short: 'Евр', full: 'Евреям' },
  66: { short: 'Откр', full: 'Откровение' },
} as const;

export type BibleSearchDto = {
  search: string;
  sections: {
    // translate: BibleTranslateShort;
    bookId: number;
    chapterId: number;
    content: BibleVerse;
  }[];
};
