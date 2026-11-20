import initSqlJs from 'sql.js';
import {
  cleanVerseText,
  getBookType,
  reorderBibleBooksByNumber,
  patchBibleVerse4,
  parseMyBibleSqlite,
  sanitizeForSearchKey,
  RawMyBibleBook,
} from './mybible-sqlite-parser';
import { BibleBookType, BibleTranslate } from '@lyri-cast/entities';

describe('MyBibleSqliteParser', () => {
  describe('cleanVerseText', () => {
    it('should return empty string for null/undefined/empty input', () => {
      expect(cleanVerseText(null)).toBe('');
      expect(cleanVerseText(undefined)).toBe('');
      expect(cleanVerseText('')).toBe('');
    });

    it('should strip Strong numbers <S>...</S>', () => {
      const input = 'В начале<S>7225</S> сотворил<S>1254</S> Бог<S>430</S>';
      expect(cleanVerseText(input)).toBe('В начале сотворил Бог');
    });

    it('should strip <pb/>, <pb>, <t>, <j> tags but keep text inside', () => {
      const input = '<pb/>В начале <t>было</t> <j>Слово</j>';
      expect(cleanVerseText(input)).toBe('В начале было Слово');
    });

    it('should convert <i> into span with italic font-style', () => {
      const input = 'слово <i>выделенное</i> курсивом';
      expect(cleanVerseText(input)).toBe(
        'слово <span style="font-style: italic;">выделенное</span> курсивом'
      );
    });

    it('should preserve standard HTML formatting tags like <b>, <u>, <sup>', () => {
      const input = '<b>Жирный</b> <u>подчёркнутый</u> <sup>12</sup>';
      expect(cleanVerseText(input)).toBe('<b>Жирный</b> <u>подчёркнутый</u> <sup>12</sup>');
    });
  });

  describe('getBookType', () => {
    it('should classify Old Testament books correctly', () => {
      expect(getBookType(1)).toBe(BibleBookType.Law);
      expect(getBookType(5)).toBe(BibleBookType.Law);
      expect(getBookType(6)).toBe(BibleBookType.History);
      expect(getBookType(17)).toBe(BibleBookType.History);
      expect(getBookType(18)).toBe(BibleBookType.Poetry);
      expect(getBookType(22)).toBe(BibleBookType.Poetry);
      expect(getBookType(23)).toBe(BibleBookType.MajorProphet);
      expect(getBookType(27)).toBe(BibleBookType.MajorProphet);
      expect(getBookType(28)).toBe(BibleBookType.MinorProphet);
      expect(getBookType(39)).toBe(BibleBookType.MinorProphet);
    });

    it('should classify New Testament books correctly', () => {
      expect(getBookType(40)).toBe(BibleBookType.Gospel);
      expect(getBookType(43)).toBe(BibleBookType.Gospel);
      expect(getBookType(44)).toBe(BibleBookType.Acts);
      expect(getBookType(45)).toBe(BibleBookType.GeneralEpistle);
      expect(getBookType(51)).toBe(BibleBookType.GeneralEpistle);
      expect(getBookType(52)).toBe(BibleBookType.PaulineEpistle);
      expect(getBookType(61)).toBe(BibleBookType.PastoralEpistle);
      expect(getBookType(62)).toBe(BibleBookType.PastoralEpistle);
      expect(getBookType(63)).toBe(BibleBookType.PastoralEpistle);
      expect(getBookType(64)).toBe(BibleBookType.PaulineEpistle);
      expect(getBookType(65)).toBe(BibleBookType.PaulineEpistle);
      expect(getBookType(66)).toBe(BibleBookType.Apocalyptic);
    });

    it('should return undefined for out-of-range book numbers', () => {
      expect(getBookType(0)).toBeUndefined();
      expect(getBookType(67)).toBeUndefined();
      expect(getBookType(-1)).toBeUndefined();
    });
  });

  describe('sanitizeForSearchKey', () => {
    it('should replace spaces with underscores and trim', () => {
      expect(sanitizeForSearchKey('  Русский Синодальный   ')).toBe('Русский_Синодальный');
    });
  });

  describe('reorderBibleBooksByNumber', () => {
    it('should order NT books according to canonical order and update bookId', () => {
      const rawBooks: RawMyBibleBook[] = [
        {
          number: 1,
          originalNumber: 10, // Бытие
          title: { short: 'Быт', full: 'Бытие' },
          chapters: [
            {
              number: 1,
              title: '1',
              bookId: 1,
              subsections: [
                {
                  heading: '',
                  chapterId: 1,
                  bookId: 1,
                  content: [
                    {
                      number: 1,
                      text: 'В начале',
                      chapterId: 1,
                      bookId: 1,
                      contentType: 'line',
                      path: ['1', '1', '1'],
                      next: null as any,
                      prev: null as any,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          number: 52,
          originalNumber: 520, // Римлянам (в SQLite идёт перед Соборными 660)
          title: { short: 'Рим', full: 'Римлянам' },
          chapters: [],
        },
        {
          number: 45,
          originalNumber: 660, // Иаков (Соборное послание)
          title: { short: 'Иак', full: 'Иакова' },
          chapters: [],
        },
      ];

      const reordered = reorderBibleBooksByNumber(rawBooks);

      // ВЗ остаётся первым (Бытие = 1)
      expect(reordered[0].title.short).toBe('Быт');
      expect(reordered[0].number).toBe(1);

      // Иаков (660) в каноническом порядке идёт ПЕРЕД Римлянами (520)
      expect(reordered[1].title.short).toBe('Иак');
      expect(reordered[2].title.short).toBe('Рим');
    });
  });

  describe('patchBibleVerse4', () => {
    it('should wire prev, next and circular links', () => {
      const translate: BibleTranslate = {
        keyForSearch: 'test',
        title: 'Test',
        sourceTitle: 'Test',
        lang: 'ru',
        version: '1',
        isDefault: false,
        isClassicBookOrder: false,
        books: [
          {
            number: 1,
            title: { short: 'Кн1', full: 'Книга 1' },
            type: BibleBookType.Law,
            chapters: [
              {
                number: 1,
                title: '1',
                bookId: 1,
                subsections: [
                  {
                    heading: '',
                    chapterId: 1,
                    bookId: 1,
                    content: [
                      {
                        contentType: 'line',
                        number: 1,
                        text: 'Стих 1',
                        chapterId: 1,
                        bookId: 1,
                        path: [],
                        next: null as any,
                        prev: null as any,
                      },
                      {
                        contentType: 'line',
                        number: 2,
                        text: 'Стих 2',
                        chapterId: 1,
                        bookId: 1,
                        path: [],
                        next: null as any,
                        prev: null as any,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      patchBibleVerse4(translate);

      const v1 = translate.books[0].chapters[0].subsections[0].content[0];
      const v2 = translate.books[0].chapters[0].subsections[0].content[1];

      expect(v1.path).toEqual(['1', '1', '1']);
      expect(v2.path).toEqual(['1', '1', '2']);

      expect(v1.next.number).toBe(2);
      expect(v2.prev.number).toBe(1);

      // Circular link: last verse -> first, first verse <- last
      expect(v2.next.number).toBe(1);
      expect(v1.prev.number).toBe(2);
    });
  });

  describe('parseMyBibleSqlite', () => {
    it('should parse an in-memory SQLite database into a BibleTranslate object', async () => {
      const SQL = await initSqlJs();
      const db = new SQL.Database();

      // Создаём минимальную схему myBible
      db.run(`
        CREATE TABLE info (name TEXT PRIMARY KEY, value TEXT);
        INSERT INTO info (name, value) VALUES ('description', 'Тестовый перевод');
        INSERT INTO info (name, value) VALUES ('language', 'ru');

        CREATE TABLE books (book_number INTEGER PRIMARY KEY, short_name TEXT, long_name TEXT);
        INSERT INTO books (book_number, short_name, long_name) VALUES (10, 'Быт', 'Бытие');
        INSERT INTO books (book_number, short_name, long_name) VALUES (470, 'Мф', 'От Матфея');

        CREATE TABLE verses (book_number INTEGER, chapter INTEGER, verse INTEGER, text TEXT);
        INSERT INTO verses (book_number, chapter, verse, text) VALUES (10, 1, 1, 'В начале<S>101</S> <i>сотворил</i> Бог небо<pb/>');
        INSERT INTO verses (book_number, chapter, verse, text) VALUES (10, 1, 2, 'Земля же была безвидна');
        INSERT INTO verses (book_number, chapter, verse, text) VALUES (470, 1, 1, 'Родословие Иисуса Христа');
      `);

      const binary = db.export();
      db.close();

      const result = await parseMyBibleSqlite(binary);

      expect(result.title).toBe('Тестовый перевод');
      expect(result.lang).toBe('ru');
      expect(result.keyForSearch).toBe('ru__Тестовый_перевод');
      expect(result.books.length).toBe(2);

      // Бытие
      const genesis = result.books[0];
      expect(genesis.number).toBe(1);
      expect(genesis.title.short).toBe('Быт');
      expect(genesis.title.full).toBe('Бытие');
      expect(genesis.type).toBe(BibleBookType.Law);
      expect(genesis.chapters.length).toBe(1);
      expect(genesis.chapters[0].subsections[0].content.length).toBe(2);

      const v1 = genesis.chapters[0].subsections[0].content[0];
      expect(v1.text).toBe('В начале <span style="font-style: italic;">сотворил</span> Бог небо');
      expect(v1.path).toEqual(['1', '1', '1']);

      // Матфей
      const matthew = result.books[1];
      expect(matthew.number).toBe(40);
      expect(matthew.title.short).toBe('Мф');
      expect(matthew.type).toBe(BibleBookType.Gospel);
    });
  });
});
