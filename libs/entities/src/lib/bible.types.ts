export type BibleChapterSectionContent = {
  type: 'line';
  number: number;
  text: string;
};

export type BibleChapterSection = {
  heading: string;
  content: BibleChapterSectionContent[];
};

export type BibleChapter = {
  number: number;
  title: string;
  subsections: BibleChapterSection[];
};

export type BibleBook = {
  title: string;
  chapters: BibleChapter[];
};

const BIBLE_NAMES = {
  1: { short: 'Быт', full: 'Бытие' },
  2: { short: 'Исх', full: 'Исход' },
  3: { short: 'Лев', full: 'Левит' },
  4: { short: 'Чис', full: 'Числа' },
  5: { short: 'Втор', full: 'Второзаконие' },
  6: { short: 'Нав', full: 'ИИсус Навин' },
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
  26: { short: 'Иез', full: '' },
  27: { short: 'Дан', full: '' },
  28: { short: 'Ос', full: '' },
  29: { short: 'Иоил', full: '' },
  30: { short: 'Ам', full: '' },
  31: { short: 'Авд', full: '' },
  32: { short: 'Ион', full: '' },
  33: { short: 'Мих', full: '' },
  34: { short: 'Наум', full: '' },
  35: { short: 'Авв', full: '' },
  36: { short: 'Соф', full: '' },
  37: { short: 'Агг', full: '' },
  38: { short: 'Зах', full: '' },
  39: { short: 'Мал', full: '' },
  40: { short: 'Мат', full: '' },
  41: { short: 'Мар', full: '' },
  42: { short: 'Лук', full: '' },
  43: { short: 'Ин', full: '' },
  44: { short: 'Деян', full: '' },
  45: { short: 'Иак', full: '' },
  46: { short: '1Пет', full: '' },
  47: { short: '2Пет', full: '' },
  48: { short: '1Ин', full: '' },
  49: { short: '2Ин', full: '' },
  50: { short: '3Ин', full: '' },
  51: { short: 'Иуд', full: '' },
  52: { short: 'Рим', full: '' },
  53: { short: '1Кор', full: '' },
  54: { short: '2Кор', full: '' },
  55: { short: 'Гал', full: '' },
  56: { short: 'Еф', full: '' },
  57: { short: 'Флп', full: '' },
  58: { short: 'Кол', full: '' },
  59: { short: '1Фес', full: '' },
  60: { short: '2Фес', full: '' },
  61: { short: '1Тим', full: '' },
  62: { short: '2Тим', full: '' },
  63: { short: 'Тит', full: '' },
  64: { short: 'Флм', full: '' },
  65: { short: 'Евр', full: '' },
  66: { short: 'Откр', full: '' },
} as const;
