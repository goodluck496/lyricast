import { Injectable } from '@nestjs/common';
import * as xml2js from 'xml2js';
import path from 'path';
import fs from 'fs';
import {
  BibleBook,
  BibleBookType,
  BibleChapter,
  BibleChapterSection,
  BibleVerse,
  BibleTranslate,
  BOOK_NAMES,
} from '@lyri-cast/entities';

type TranslateMetaInfo = {
  /**
   * Данным флагом можно отключать процесс парсинга для файла перевода
   */
  enable: boolean;
  /**
   * Заголовок который отобразится в названии перевода, если не указан,
   * то будет взят из файла перевода
   */
  title: string;
  /**
   * Язык перевода
   */
  lang: string;
  /**
   * Ключ который используется для поиска по API
   */
  keyForSearch: string;

  /**
   * В современных переводах библии, изменен порядок книг в посланиях апостолов,
   * в новых версиях сперва идут послания Павла, затем остальных апостолов
   * т.к. изначально разработка началась с классическим порядком книг,
   * а затем был найден более объемный и обновляемый репозиторий с переводами
   * то пришлось писать функцию, которая умеет сортировать книги по классическому варианту,
   * т.к. это привычнее с точки зрения обычного пользователя (читающего печатные варианты)
   *
   * данный флаг позволяет отключить пересортировку,
   * в случае если использовать "классический" порядок книг
   */
  isClassicBookOrder: false;
};

@Injectable()
export class BibleXmlParserService {
  assetsPath = path.resolve(__dirname, 'assets', 'bibles', 'xml-versions');
  assetsJsonsPath = path.resolve(
    __dirname,
    'assets',
    'complete-jsons',
    'bibles'
  );

  getBookType(bookNumber: number): BibleBookType {
    if (bookNumber >= 1 && bookNumber <= 5) return BibleBookType.Law;
    if (bookNumber >= 6 && bookNumber <= 17) return BibleBookType.History;
    if (bookNumber >= 18 && bookNumber <= 22) return BibleBookType.Poetry;
    if (bookNumber >= 23 && bookNumber <= 27) return BibleBookType.MajorProphet;
    if (bookNumber >= 28 && bookNumber <= 39) return BibleBookType.MinorProphet;
    if (bookNumber >= 40 && bookNumber <= 43) return BibleBookType.Gospel;
    if (bookNumber === 44) return BibleBookType.Acts;
    if ([58, 59, 60].includes(bookNumber)) return BibleBookType.PastoralEpistle; // Пастырские послания
    if (bookNumber >= 52 && bookNumber <= 57)
      return BibleBookType.PaulineEpistle; // Послания Павла
    if (
      (bookNumber >= 61 && bookNumber <= 65) ||
      (bookNumber >= 45 && bookNumber <= 51)
    )
      return BibleBookType.GeneralEpistle; // Общие послания
    if (bookNumber === 66) return BibleBookType.Apocalyptic;
    return undefined;
  }

  parseXMLContent(xmlString: string): Promise<BibleTranslate> {
    const parser = new xml2js.Parser();

    // Возвращаем промис, чтобы дождаться завершения парсинга
    return new Promise((resolve, reject) => {
      parser.parseString(xmlString, (err, data) => {
        const result: BibleTranslate = {
          lang: '',
          sourceTitle: '',
          version: '',
          title: '',
          keyForSearch: '',
          books: [],
          isDefault: false,
          isClassicBookOrder: false,
        };
        if (err) {
          reject(err);
        } else {
          const containers = data.bible.testament;

          containers.map((testament) => {
            // Создаем массив книг
            const books = testament.book.map((bibleBook) => {
              // Объект книги
              const bookNumber = bibleBook.$.number;
              const book: BibleBook = {
                number: +bookNumber,
                title: BOOK_NAMES[bookNumber] ?? {
                  full: bookNumber,
                  short: bookNumber,
                }, // Название книги
                chapters: [],
                type: BibleBookType.Law,
              };

              // Итерируем по главах
              bibleBook.chapter.forEach((chapter) => {
                const chapterNumber = chapter.$.number;
                const currentChapter: BibleChapter = {
                  number: +chapterNumber,
                  title: `${chapterNumber}`, // Номер главы
                  subsections: [],
                  bookId: book.number,
                };

                // Добавляем стихи как подразделы главы
                const verses: BibleChapterSection = {
                  heading: null, // Заголовок для стихов отсутствует
                  bookId: book.number,
                  chapterId: currentChapter.number,
                  content: chapter.verse.map((verse) => {
                    const verseNumber = verse.$.number;
                    return {
                      contentType: 'line',
                      number: +verseNumber, // Номер стиха
                      text: verse._, // Текст стиха
                      bookId: book.number,
                      chapterId: currentChapter.number,
                    } satisfies BibleVerse;
                  }),
                };

                currentChapter.subsections.push(verses);
                book.chapters.push(currentChapter);
              });

              return book;
            });

            result.books.push(...books);
          });

          result.sourceTitle = data.bible.$.translation;

          resolve(result);
        }
      });
    });
  }

  async convertToJson() {
    try {
      const langVersions = fs.readdirSync(this.assetsPath);
      const translate: BibleTranslate = {
        title: '',
        sourceTitle: '',
        version: '',
        lang: '',
        books: [],
        keyForSearch: '',
        isClassicBookOrder: false,
        isDefault: false,
      };

      for (const langVersion of langVersions) {
        const subVersions = fs.readdirSync(
          path.resolve(this.assetsPath, langVersion)
        );

        translate.lang = langVersion;

        for (const subVersion of subVersions) {
          const bibleVersionFilePath = path.resolve(
            this.assetsPath,
            langVersion,
            subVersion
          );
          translate.version = subVersion;

          const fileInVersion = fs.readdirSync(
            path.resolve(bibleVersionFilePath)
          );

          fileInVersion.sort((a, b) =>
            a.includes('meta.json') ? -1 : b.includes('meta.json') ? 1 : 0
          );

          const metaFilePath = path.resolve(
            bibleVersionFilePath,
            fileInVersion.shift()
          );

          const metaString = fs.readFileSync(metaFilePath, {
            encoding: 'utf-8',
          });
          const {
            title,
            lang,
            enable,
            keyForSearch,
            isClassicBookOrder,
          }: TranslateMetaInfo = JSON.parse(metaString);

          if (!enable) {
            continue;
          }
          translate.title = title;
          translate.lang = lang;

          for (const file of fileInVersion) {
            const filePath = path.resolve(bibleVersionFilePath, file);
            const bibleContent = fs.readFileSync(filePath, {
              encoding: 'utf-8',
            });

            const parseResult = await this.parseXMLContent(bibleContent);

            if (keyForSearch) {
              translate.keyForSearch = keyForSearch;
            } else {
              translate.keyForSearch = file.split('.')[0];
            }

            if (isClassicBookOrder) {
              translate.books = [...parseResult.books];
              translate.isClassicBookOrder = true;
            } else {
              translate.books = [
                // ...this.reassignBibleBookNumbers(parseResult.books),
                ...this.reorderBibleBooksByNumber(parseResult.books),
              ];
            }

            translate.sourceTitle = parseResult.sourceTitle;

            const fileName =
              path.resolve(this.assetsJsonsPath) +
              `/${langVersion}__${subVersion}.bible.json`;

            fs.mkdirSync(this.assetsJsonsPath, { recursive: true });
            fs.writeFileSync(fileName, JSON.stringify(translate, null, 2));
          }
        }
      }
    } catch (error) {
      console.log('ERROR', error);
    }
  }

  reorderBibleBooksByNumber = (books: BibleBook[]): BibleBook[] => {
    // Классический порядок книг Нового Завета
    const newTestamentOrder = [
      ...Array.from({ length: 5 }, (_, i) => i + 40), // Евангелия и Деяния (от 40 до 44)
      59,
      60,
      61,
      62,
      63,
      64,
      65, // Послания других апостолов (Иакова - Иуды)
      45,
      46,
      47,
      48,
      49,
      50,
      51,
      52,
      53,
      54,
      55,
      56,
      57,
      58, // Послания Павла
      66, // Откровение
    ];

    // Разделяем книги на Ветхий и Новый Завет
    const oldTestamentBooks = books.filter((book) => book.number < 40);
    const newTestamentBooks = books.filter((book) => book.number >= 40);

    // Создаем объект для быстрого поиска книги по номеру
    const newTestamentMap = new Map(
      newTestamentBooks.map((book) => [book.number, book])
    );

    // Сортируем книги Нового Завета в классическом порядке
    const reorderedNewTestamentBooks = newTestamentOrder
      .map((number) => newTestamentMap.get(number))
      .filter((book): book is BibleBook => book !== undefined);

    // Возвращаем объединенный массив
    return [...oldTestamentBooks, ...reorderedNewTestamentBooks].map(
      (el, index) => {
        const newNumber = oldTestamentBooks.length ? index + 1 : 39 + index + 1;

        return {
          ...el,
          number: newNumber,
          type: this.getBookType(newNumber),
          chapters: el.chapters.map((chapter) => ({
            ...chapter,
            bookId: newNumber,
            subsections: chapter.subsections.map((subSec) => ({
              ...subSec,
              bookId: newNumber,
              content: subSec.content.map((content) => ({
                ...content,
                bookId: newNumber,
              })),
            })),
          })),
        };
      }
    );
  };
}
