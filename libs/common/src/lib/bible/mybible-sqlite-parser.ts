import type { SqlJsConfig, SqlJsStatic } from 'sql.js';
import {
  BibleBook,
  BibleBookType,
  BibleTranslate,
  BibleVerse,
  PrevOrNextVerse,
} from '@lyri-cast/entities';

export interface MyBibleParserOptions {
  sqlInstance?: SqlJsStatic;
  sqlJsConfig?: SqlJsConfig;
  defaultLanguage?: string;
  defaultDescription?: string;
}

async function loadSqlJsScript(): Promise<void> {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector('script[data-sql-js]');
  if (existing) {
    if ((window as unknown as { initSqlJs?: unknown }).initSqlJs) return;
    return new Promise((resolve) => existing.addEventListener('load', () => resolve()));
  }

  const scriptUrls: string[] = [];
  if (typeof document.baseURI !== 'undefined') {
    try {
      scriptUrls.push(new URL('assets/sql-wasm.js', document.baseURI).href);
    } catch {
      // ignore
    }
  }
  scriptUrls.push('/assets/sql-wasm.js');
  scriptUrls.push('assets/sql-wasm.js');
  scriptUrls.push('https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.js');

  for (const src of scriptUrls) {
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.dataset['sqlJs'] = 'true';
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => {
          script.remove();
          reject();
        };
        document.head.appendChild(script);
      });
      if ((window as unknown as { initSqlJs?: unknown }).initSqlJs) {
        return;
      }
    } catch {
      // try next URL
    }
  }
}

export async function resolveSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic> {
  const isBrowser =
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof (window as unknown as { process?: { versions?: { node?: string } } }).process?.versions?.node ===
      'undefined';

  if (isBrowser) {
    const win = window as unknown as { initSqlJs?: (c?: SqlJsConfig) => Promise<SqlJsStatic> };
    if (!win.initSqlJs) {
      await loadSqlJsScript();
    }
    if (typeof win.initSqlJs === 'function') {
      return await win.initSqlJs(config);
    }
    throw new Error('Не удалось загрузить библиотеку sql.js в браузере');
  }

  // Node.js environment
  try {
    const nodeReq =
      typeof module !== 'undefined' && module.require
        ? module.require.bind(module)
        : typeof require !== 'undefined'
        ? require
        : null;
    if (nodeReq) {
      const sqlMod = nodeReq('sql' + '.js');
      const init = sqlMod.default || sqlMod;
      return await init(config);
    }
  } catch {
    // continue to dynamic import fallback
  }

  const dynamicImport = new Function('m', 'return import(m)');
  const mod = await dynamicImport('sql.js');
  const init = mod.default || mod;
  return await init(config);
}

export interface RawMyBibleBook {
  number: number;
  originalNumber: number;
  title: { full: string; short: string };
  chapters: Array<{
    number: number;
    title: string;
    bookId: number;
    subsections: Array<{
      heading: string;
      bookId: number;
      chapterId: number;
      content: BibleVerse[];
    }>;
  }>;
  type?: BibleBookType;
}

export const NEW_TESTAMENT_ORDER_ORIGINAL_CODES: readonly number[] = [
  470, // Матфей
  480, // Марк
  490, // Лука
  500, // Иоанн
  510, // Деяния
  660, // Иаков
  670, // 1 Петра
  680, // 2 Петра
  690, // 1 Иоанна
  700, // 2 Иоанна
  710, // 3 Иоанна
  720, // Иуда
  520, // Римлянам
  530, // 1 Коринфянам
  540, // 2 Коринфянам
  550, // Галатам
  560, // Ефесянам
  570, // Филиппийцам
  580, // Колоссянам
  590, // 1 Фессалоникийцам
  600, // 2 Фессалоникийцам
  610, // 1 Тимофею
  620, // 2 Тимофею
  630, // Титу
  640, // Филимону
  650, // Евреям
  730, // Откровение
];

/**
 * Очищает текст стиха от тегов номеров Стронга <S>...</S>,
 * нестандартных XML-тегов (кроме i, b, u, em, strong, sub, sup, a),
 * одиночных тегов и заменяет <i> на span со стилем.
 */
export function cleanVerseText(text: unknown): string {
  if (text == null) {
    return '';
  }

  let normalized = String(text);

  // Удаляем теги <S> и их содержимое, например <S>7225</S>
  normalized = normalized.replace(/<S>.*?<\/S>/gi, '');

  // Удаляем нестандартные теги (которые не являются стандартными текстовыми HTML-тегами)
  normalized = normalized.replace(/<(?!\/?(i|b|u|em|strong|sub|sup|a)[^>]*>)[^>]+>/gi, '');

  // Удаляем одиночные/самозакрывающиеся теги, например <pb/>
  normalized = normalized.replace(/<[^>]+\/>/gi, '');

  // Удаляем <t>, <j> и подобные обёртки, содержимое сохраняем
  normalized = normalized.replace(/<\/?t>/gi, '').replace(/<\/?j>/gi, '');

  // Превращаем <i> в span с инлайновым стилем, как принято в Lyricast
  normalized = normalized
    .replace(/<i>/gi, '<span style="font-style: italic;">')
    .replace(/<\/i>/gi, '</span>');

  return normalized.trim();
}

/**
 * Определяет категорию книги Библии по её каноническому номеру 1..66.
 */
export function getBookType(bookNumber: number): BibleBookType | undefined {
  if (bookNumber >= 1 && bookNumber <= 5) return BibleBookType.Law;
  if (bookNumber >= 6 && bookNumber <= 17) return BibleBookType.History;
  if (bookNumber >= 18 && bookNumber <= 22) return BibleBookType.Poetry;
  if (bookNumber >= 23 && bookNumber <= 27) return BibleBookType.MajorProphet;
  if (bookNumber >= 28 && bookNumber <= 39) return BibleBookType.MinorProphet;

  if (bookNumber >= 40 && bookNumber <= 43) return BibleBookType.Gospel;
  if (bookNumber === 44) return BibleBookType.Acts;
  if (bookNumber >= 45 && bookNumber <= 51) return BibleBookType.GeneralEpistle;
  if (bookNumber >= 61 && bookNumber <= 63) return BibleBookType.PastoralEpistle;
  if (bookNumber >= 52 && bookNumber <= 65) return BibleBookType.PaulineEpistle;
  if (bookNumber === 66) return BibleBookType.Apocalyptic;

  return undefined;
}

/**
 * Упорядочивает книги по каноническому порядку:
 * ВЗ 1..39, НЗ 40..66 (Евангелия, Деяния, Соборные, Павла, Откровение).
 */
export function reorderBibleBooksByNumber(books: RawMyBibleBook[]): BibleBook[] {
  // Ветхий Завет: книги с оригинальным кодом < 470 в исходном порядке
  const oldTestamentBooks = books.filter(
    (book) => (book.originalNumber ?? 0) > 0 && book.originalNumber < 470
  );

  // Новый Завет: книги с оригинальным кодом >= 470
  const newTestamentBooks = books.filter(
    (book) => (book.originalNumber ?? 0) >= 470
  );

  const newTestamentMap = new Map(
    newTestamentBooks.map((book) => [book.originalNumber, book] as const)
  );

  // Сортируем НЗ по каноническому порядку с каноническими номерами 40..66
  const reorderedNewTestamentBooks: Array<{ book: RawMyBibleBook; canonicalNumber: number }> = [];
  const processedCodes = new Set<number>();

  NEW_TESTAMENT_ORDER_ORIGINAL_CODES.forEach((code, idx) => {
    const book = newTestamentMap.get(code);
    if (book) {
      reorderedNewTestamentBooks.push({
        book,
        canonicalNumber: 40 + idx,
      });
      processedCodes.add(code);
    }
  });

  // Если есть нестандартные книги НЗ, не попавшие в стандартный список, добавляем их в конец
  let extraNtIndex = 67;
  for (const book of newTestamentBooks) {
    if (!processedCodes.has(book.originalNumber)) {
      reorderedNewTestamentBooks.push({
        book,
        canonicalNumber: extraNtIndex++,
      });
    }
  }

  // Для ВЗ: канонический порядок 1..39
  const mappedOldTestamentBooks = oldTestamentBooks.map((book, index) => {
    return {
      book,
      canonicalNumber: index + 1,
    };
  });

  const combinedBooks = [...mappedOldTestamentBooks, ...reorderedNewTestamentBooks];

  return combinedBooks.map(({ book: el, canonicalNumber }) => {
    const bookType = getBookType(canonicalNumber) ?? ('' as BibleBookType);

    return {
      number: canonicalNumber,
      title: {
        short: el.title.short,
        full: el.title.full,
      },
      type: bookType,
      chapters: el.chapters.map((chapter) => ({
        ...chapter,
        bookId: canonicalNumber,
        subsections: (chapter.subsections ?? []).map((subSec) => ({
          ...subSec,
          bookId: canonicalNumber,
          content: (subSec.content ?? []).map((content) => ({
            ...content,
            bookId: canonicalNumber,
          })),
        })),
      })),
    };
  });
}

/**
 * Проставляет навигационные связи prev/next и path между всеми стихами перевода.
 */
export function patchBibleVerse4(bible: BibleTranslate): void {
  const allVerses: BibleVerse[] = [];
  for (const book of bible.books) {
    for (const chapter of book.chapters) {
      for (const section of chapter.subsections ?? []) {
        for (const verse of section.content ?? []) {
          verse.path = [book.number, chapter.number, verse.number].map(String);
          allVerses.push(verse);
        }
      }
    }
  }

  if (allVerses.length === 0) return;

  const createLink = (source: BibleVerse, target: BibleVerse): PrevOrNextVerse => ({
    number: source.number,
    chapterId: source.chapterId,
    bookId: source.bookId,
    path: [source.bookId, source.chapterId, source.number].map(String),
    contentType: source.contentType,
    chapterChanged: source.chapterId !== target.chapterId,
    bookChanged: source.bookId !== target.bookId,
  });

  for (let i = 0; i < allVerses.length; i++) {
    const current = allVerses[i];
    const prevVerse = i > 0 ? allVerses[i - 1] : allVerses[allVerses.length - 1];
    const nextVerse = i < allVerses.length - 1 ? allVerses[i + 1] : allVerses[0];

    current.prev = createLink(prevVerse, current);
    current.next = createLink(nextVerse, current);
  }
}

/**
 * Нормализует строку для использования в ключах поиска и именах файлов.
 */
export function sanitizeForSearchKey(value: string): string {
  return value.trim().replace(/\s+/g, '_');
}

/**
 * Парсит файл базы данных SQLite формата myBible в структуру BibleTranslate.
 */
export async function parseMyBibleSqlite(
  buffer: Uint8Array | ArrayBuffer | Buffer,
  options?: MyBibleParserOptions
): Promise<BibleTranslate> {
  const SQL = options?.sqlInstance ?? (await resolveSqlJs(options?.sqlJsConfig));
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const db = new SQL.Database(uint8);

  try {
    // 1. Читаем info
    const infoMap = new Map<string, string>();
    try {
      const stmt = db.prepare('SELECT name, value FROM info');
      while (stmt.step()) {
        const row = stmt.getAsObject() as { name?: string; value?: string };
        if (row.name) {
          infoMap.set(String(row.name), String(row.value ?? ''));
        }
      }
      stmt.free();
    } catch {
      // Игнорируем, если таблица info отсутствует
    }

    const description =
      infoMap.get('description') ||
      infoMap.get('russian_description') ||
      options?.defaultDescription ||
      'Unknown Bible';
    const language = infoMap.get('language') || options?.defaultLanguage || 'unknown';

    // 2. Читаем books
    const books: Array<{ book_number: number; short_name: string; long_name: string }> = [];
    {
      const stmt = db.prepare('SELECT book_number, short_name, long_name FROM books ORDER BY book_number');
      while (stmt.step()) {
        const row = stmt.getAsObject() as {
          book_number: number;
          short_name: string;
          long_name: string;
        };
        books.push({
          book_number: Number(row.book_number),
          short_name: String(row.short_name ?? ''),
          long_name: String(row.long_name ?? ''),
        });
      }
      stmt.free();
    }

    // 3. Читаем стихи по каждой книге
    const rawBooks: RawMyBibleBook[] = [];

    for (const book of books) {
      const bookNumber = book.book_number / 10;
      const rawBook: RawMyBibleBook = {
        number: bookNumber,
        originalNumber: book.book_number,
        title: {
          full: book.long_name || book.short_name,
          short: book.short_name || book.long_name,
        },
        chapters: [],
      };

      const versesStmt = db.prepare(
        'SELECT chapter, verse, text FROM verses WHERE book_number = ? ORDER BY chapter, verse'
      );
      versesStmt.bind([book.book_number]);

      const chaptersMap = new Map<number, { number: number; verses: { number: number; text: string }[] }>();

      while (versesStmt.step()) {
        const row = versesStmt.getAsObject() as {
          chapter: number;
          verse: number;
          text: unknown;
        };
        const chNum = Number(row.chapter);
        const vNum = Number(row.verse);
        const text = cleanVerseText(row.text);

        let chapterItem = chaptersMap.get(chNum);
        if (!chapterItem) {
          chapterItem = { number: chNum, verses: [] };
          chaptersMap.set(chNum, chapterItem);
        }
        chapterItem.verses.push({ number: vNum, text });
      }

      versesStmt.free();

      const sortedChapters = Array.from(chaptersMap.values()).sort((a, b) => a.number - b.number);

      for (const ch of sortedChapters) {
        rawBook.chapters.push({
          number: ch.number,
          title: String(ch.number),
          bookId: rawBook.number,
          subsections: [
            {
              heading: '',
              bookId: rawBook.number,
              chapterId: ch.number,
              content: ch.verses.map((v) => ({
                contentType: 'line' as const,
                number: v.number,
                text: v.text,
                bookId: rawBook.number,
                chapterId: ch.number,
                path: [rawBook.number, ch.number, v.number].map(String),
                next: {} as PrevOrNextVerse,
                prev: {} as PrevOrNextVerse,
              })),
            },
          ],
        });
      }

      rawBooks.push(rawBook);
    }

    // 4. Канонический порядок книг
    const reorderedBooks = reorderBibleBooksByNumber(rawBooks);

    const safeLanguage = sanitizeForSearchKey(language);
    const safeDescription = sanitizeForSearchKey(description);
    const keyForSearch = `${safeLanguage}__${safeDescription}`;

    const translate: BibleTranslate = {
      lang: language,
      sourceTitle: description,
      version: '',
      title: description,
      keyForSearch,
      books: reorderedBooks,
      isDefault: false,
      isClassicBookOrder: false,
    };

    // 5. Проставляем навигационные связи prev/next
    patchBibleVerse4(translate);

    return translate;
  } finally {
    db.close();
  }
}

/**
 * Сервисный класс-обёртка для инъекции или ООП-использования парсера.
 */
export class MyBibleSqliteParserService {
  parseMyBibleSqlite(
    buffer: Uint8Array | ArrayBuffer | Buffer,
    options?: MyBibleParserOptions
  ): Promise<BibleTranslate> {
    return parseMyBibleSqlite(buffer, options);
  }

  cleanVerseText(text: unknown): string {
    return cleanVerseText(text);
  }

  getBookType(bookNumber: number): BibleBookType | undefined {
    return getBookType(bookNumber);
  }

  reorderBibleBooksByNumber(books: RawMyBibleBook[]): BibleBook[] {
    return reorderBibleBooksByNumber(books);
  }

  patchBibleVerse4(bible: BibleTranslate): void {
    patchBibleVerse4(bible);
  }
}
