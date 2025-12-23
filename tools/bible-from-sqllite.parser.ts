import * as fs from 'fs';
import * as path from 'path';
import initSqlJs from 'sql.js';

// Функция для удаления всех XML-тегов и их содержимого из текста
function cleanText(text: unknown): string {
  if (text == null) {
    return '';
  }

  let normalized = String(text);

  // Удаляем теги <S> и их содержимое, например <S>7225</S>
  normalized = normalized.replace(/<S>.*?<\/S>/g, '');

  // Удаляем нестандартные теги (которые не являются стандартными HTML), например <pb>, <t>
  normalized = normalized.replace(/<(?!\/?(i|b|u|em|strong|sub|sup|a)[^>]*>)[^>]+>/g, '');

  // Удаляем одиночные теги, например <pb/>
  normalized = normalized.replace(/<[^>]+\/>/g, '');

  // Удаляем <t>, <j> и т.п. (содержимое сохраняем)
  normalized = normalized.replace(/<t>/g, '').replace(/<\/t>/g, '');
  normalized = normalized.replace(/<j>/g, '').replace(/<\/j>/g, '');

  // Превращаем <i> в span с инлайновым стилем, как в исходном скрипте
  normalized = normalized
    .replace(/<i>/g, '<span style="font-style: italic;">')
    .replace(/<\/i>/g, '<\/span>');

  return normalized.trim();
}

// XML для одного завета (Old / New)
function generateTestamentXml(db: any, testamentName: string, books: any[]) {
  let xml = `\t<testament name="${testamentName}">\n`;

  books.forEach((book: any) => {
    // Получаем все стихи для данной книги
    const stmt = db.prepare(
      'SELECT chapter, verse, text FROM verses WHERE book_number = ? ORDER BY chapter, verse'
    );
    stmt.bind([book.book_number]);

    // Группировка стихов по главам
    const chapters: Record<number, { number: number; text: string }[]> = {};
    while (stmt.step()) {
      const row = stmt.getAsObject() as { chapter: number; verse: number; text: string };
      const { chapter, verse, text } = row;
      if (!chapters[chapter]) {
        chapters[chapter] = [];
      }
      chapters[chapter].push({ number: verse, text: cleanText(text) });
    }

    // book_number в базе, как правило, 10,20,..., поэтому делим на 10, чтобы получить 1..66
    const bookNumber = book.book_number / 10;

    xml += `\t\t<book number="${bookNumber}" short_name="${
      book.short_name
    }" long_name="${book.long_name}">\n`;

    Object.entries(chapters).forEach(([chapter, versesInChapter]) => {
      xml += `\t\t\t<chapter number="${chapter}">\n`;
      versesInChapter.forEach(({ number, text }) => {
        xml += `\t\t\t\t<verse number="${number}">${text}<\/verse>\n`;
      });
      xml += `\t\t\t<\/chapter>\n`;
    });

    xml += `\t\t<\/book>\n`;
  });

  xml += `\t<\/testament>\n`;
  return xml;
}

function sanitizeForFileName(value: string): string {
  return value.replace(/\s+/g, '_');
}

type BibleBook = {
  number: number;
  title: { full: string; short: string };
  chapters: any[];
  type?: string;
  // Оригинальный номер из SQLite (10, 20, ..., 730)
  originalNumber?: number;
};

type BibleTranslate = {
  lang: string;
  sourceTitle: string;
  version: string;
  title: string;
  keyForSearch: string;
  books: BibleBook[];
  isDefault: boolean;
  isClassicBookOrder: boolean;
};

function getBookType(bookNumber: number): string | undefined {
  // Ветхий Завет остаётся как раньше
  if (bookNumber >= 1 && bookNumber <= 5) return 'Law';
  if (bookNumber >= 6 && bookNumber <= 17) return 'History';
  if (bookNumber >= 18 && bookNumber <= 22) return 'Poetry';
  if (bookNumber >= 23 && bookNumber <= 27) return 'MajorProphet';
  if (bookNumber >= 28 && bookNumber <= 39) return 'MinorProphet';

  // Новый Завет с нашим новым порядком:
  // 40-43 — Евангелия
  if (bookNumber >= 40 && bookNumber <= 43) return 'Gospel';
  // 44 — Деяния
  if (bookNumber === 44) return 'Acts';
  // 45-51 — соборные послания
  if (bookNumber >= 45 && bookNumber <= 51) return 'GeneralEpistle';
  // 61-63 — пасторские послания (подмножество Павловых)
  if ([61, 62, 63].includes(bookNumber)) return 'Pastoral Epistle';
  // 52-64 — послания Павла (включая пасторские и, при желании, Евреям)
  if (bookNumber >= 52 && bookNumber <= 64) return 'Pauline Epistle';
  // 66 — Откровение (последняя книга в полном каноне)
  if (bookNumber === 66) return 'Apocalyptic';

  return undefined;
}

function reorderBibleBooksByNumber(books: BibleBook[]): BibleBook[] {
  // Оригинальные коды НЗ из SQLite (десятки), в желаемом порядке:
  // 4 Евангелия, Деян, соборные послания, Павел, Откровение
  const newTestamentOrderOriginalCodes = [
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
    530, // 1 Кор
    540, // 2 Кор
    550, // Галатам
    560, // Ефесянам
    570, // Филлипийцам
    580, // Колоссянам
    590, // 1 Фесс
    600, // 2 Фесс
    610, // 1 Тим
    620, // 2 Тим
    630, // Титу
    640, // Филимону
    650, // Евреям
    730, // Откровение
  ];

  // Ветхий Завет: все книги с кодом < 470 (Бытие–Малахия) в исходном порядке
  const oldTestamentBooks = books.filter(
    (book) => (book.originalNumber ?? 0) > 0 && (book.originalNumber as number) < 470
  );

  // Новый Завет: книги с кодом >= 470
  const newTestamentBooks = books.filter(
    (book) => (book.originalNumber ?? 0) >= 470
  );

  const newTestamentMap = new Map(
    newTestamentBooks.map((book) => [book.originalNumber, book] as const)
  );

  const reorderedNewTestamentBooks = newTestamentOrderOriginalCodes
    .map((code) => newTestamentMap.get(code))
    .filter((book): book is BibleBook => book !== undefined);

  return [...oldTestamentBooks, ...reorderedNewTestamentBooks].map(
    (el, index) => {
      // Если есть ВЗ, нумерация как 1..66 (ВЗ 1-39, НЗ 40-66).
      // Если перевода ВЗ нет (только НЗ), начинаем нумерацию НЗ с 40,
      // чтобы типы (Gospel, Acts, GeneralEpistle, PaulineEpistle, …) совпадали с ожидаемыми.
      const newNumber = oldTestamentBooks.length
        ? index + 1
        : 39 + index + 1;

      return {
        ...el,
        number: newNumber,
        type: getBookType(newNumber),
        chapters: el.chapters.map((chapter: any) => ({
          ...chapter,
          bookId: newNumber,
          subsections: chapter.subsections.map((subSec: any) => ({
            ...subSec,
            bookId: newNumber,
            content: subSec.content.map((content: any) => ({
              ...content,
              bookId: newNumber,
            })),
          })),
        })),
      };
    }
  );
}

function patchBibleVerse4(bible: BibleTranslate) {
  let previousVerse: any | null = null;

  const createLink = (source: any | null, target: any) =>
    source
      ? {
          number: source.number,
          chapterId: source.chapterId,
          bookId: source.bookId,
          path: [source.bookId, source.chapterId, source.number].map(String),
          contentType: source.contentType,
          chapterChanged: source.chapterId !== target.chapterId,
          bookChanged: source.bookId !== target.bookId,
        }
      : null;

  bible.books.forEach((book) =>
    book.chapters.forEach((chapter: any) =>
      chapter.subsections.forEach((section: any) =>
        section.content.forEach((verse: any) => {
          verse.path = [book.number, chapter.number, verse.number].map(String);
          verse.prev = createLink(previousVerse, verse);
          if (previousVerse)
            previousVerse.next = createLink(verse, previousVerse);
          previousVerse = verse;
        })
      )
    )
  );

  if (previousVerse && bible.books.length) {
    const firstVerse =
      bible.books[0].chapters[0].subsections[0].content[0];
    previousVerse.next = createLink(firstVerse, previousVerse);
    firstVerse.prev = createLink(previousVerse, firstVerse);
  }
}

async function processSqliteFile(sqlitePath: string, outputDir: string, SQL: any) {
  const fileBuffer = fs.readFileSync(sqlitePath);
  const db = new SQL.Database(new Uint8Array(fileBuffer));

  try {
    const infoRows: any[] = [];
    {
      const stmt = db.prepare('SELECT name, value FROM info');
      while (stmt.step()) {
        infoRows.push(stmt.getAsObject());
      }
      stmt.free();
    }

    const descriptionRow: any = infoRows.find((row: any) => row.name === 'description');
    const languageRow: any = infoRows.find((row: any) => row.name === 'language');

    const description = descriptionRow?.value ?? path.basename(sqlitePath, path.extname(sqlitePath));
    const language = languageRow?.value ?? 'unknown';

    const books: any[] = [];
    {
      const stmt = db.prepare('SELECT * FROM books ORDER BY book_number');
      while (stmt.step()) {
        books.push(stmt.getAsObject());
      }
      stmt.free();
    }

    // Строим структуры книг/глав/стихов напрямую из таблиц
    const bibleBooks: BibleBook[] = [];

    for (const book of books) {
      const bookNumber = book.book_number / 10;
      const bibleBook: BibleBook = {
        number: bookNumber,
        title: {
          full: String(book.long_name || ''),
          short: String(book.short_name || ''),
        },
        chapters: [],
        originalNumber: Number(book.book_number),
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
        const chapterNum = Number(row.chapter);
        const verseNum = Number(row.verse);
        const text = cleanText(row.text);

        if (!chaptersMap.has(chapterNum)) {
          chaptersMap.set(chapterNum, { number: chapterNum, verses: [] });
        }
        chaptersMap.get(chapterNum)!.verses.push({ number: verseNum, text });
      }

      versesStmt.free();

      const sortedChapters = Array.from(chaptersMap.values()).sort(
        (a, b) => a.number - b.number
      );

      for (const ch of sortedChapters) {
        const currentChapter: any = {
          number: ch.number,
          title: String(ch.number),
          subsections: [],
          bookId: bibleBook.number,
        };

        const versesSection: any = {
          heading: null,
          bookId: bibleBook.number,
          chapterId: ch.number,
          content: ch.verses.map((v) => ({
            contentType: 'line',
            number: v.number,
            text: v.text,
            bookId: bibleBook.number,
            chapterId: ch.number,
            path: [bibleBook.number, ch.number, v.number].map(String),
            next: {
              path: [],
              bookId: bibleBook.number,
              chapterId: ch.number,
              number: v.number,
              contentType: 'line',
              chapterChanged: false,
              bookChanged: false,
            },
            prev: {
              path: [],
              bookId: bibleBook.number,
              chapterId: ch.number,
              number: v.number,
              contentType: 'line',
              chapterChanged: false,
              bookChanged: false,
            },
          })),
        };

        currentChapter.subsections.push(versesSection);
        bibleBook.chapters.push(currentChapter);
      }

      bibleBooks.push(bibleBook);
    }

    const reorderedBooks = reorderBibleBooksByNumber(bibleBooks);

    const safeLanguage = sanitizeForFileName(String(language));
    const safeDescription = sanitizeForFileName(String(description));
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

    patchBibleVerse4(translate);

    const fileName = `${safeLanguage}__${safeDescription}.bible.json`;
    const fullOutputPath = path.resolve(outputDir, fileName);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(fullOutputPath, JSON.stringify(translate, null, 2), 'utf8');

    console.log(`Создан файл: ${fullOutputPath}`);
  } finally {
    db.close();
  }
}

async function main() {
  const projectRoot = process.cwd(); // Предполагаем запуск из корня репозитория
  const sqliteDir = path.resolve(projectRoot, 'assets', 'raw', 'bibles', 'sqlite');
  const outputDir = path.resolve(projectRoot, 'assets', 'complete-jsons', 'bibles');

  if (!fs.existsSync(sqliteDir)) {
    console.error('Директория с SQLite файлами не найдена:', sqliteDir);
    return;
  }

  const files = fs
    .readdirSync(sqliteDir)
    .filter((file) => file.toLowerCase().endsWith('.sqlite3') || file.toLowerCase().endsWith('.sqlite'));

  if (!files.length) {
    console.log('SQLite файлы не найдены в', sqliteDir);
    return;
  }

  // Инициализируем sql.js один раз
  const SQL = await initSqlJs();

  for (const file of files) {
    const fullPath = path.resolve(sqliteDir, file);
    console.log('Обработка файла', fullPath);
    await processSqliteFile(fullPath, outputDir, SQL);
  }
}

main().catch((error) => {
  console.error('Ошибка при конвертации SQLite → XML → JSON:', error);
});
