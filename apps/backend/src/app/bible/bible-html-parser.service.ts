import { Injectable } from '@nestjs/common';

import fs from 'fs';
import * as cheerio from 'cheerio';
import path from 'path';
import {
  BibleBook,
  BibleBookType,
  BibleChapter,
  BibleChapterSection,
  BibleTranslate,
} from '@lyri-cast/entities';

@Injectable()
export class BibleHtmlParserService {
  assetsPath = path.resolve(__dirname, 'assets', 'bibles', 'html-versions');
  assetsJsonsPath = path.resolve(
    __dirname,
    'assets',
    'complete-jsons',
    'bibles'
  );

  // Функция для парсинга HTML-контента
  parseHTMLContent(html: string, bookIndex: number) {
    // Создаем объект для хранения книги
    const book: BibleBook = {
      number: bookIndex,
      title: { short: '', full: '' },
      chapters: [],
      type: BibleBookType.Law,
    };

    // Вспомогательные переменные
    let currentChapter: BibleChapter = null;
    let currentSubsection: BibleChapterSection = null;

    // Загружаем HTML с помощью cheerio
    const $ = cheerio.load(html);

    // Итерируем по элементам
    $('h2, h4, h6, p').each((i, el) => {
      const tagName = el.tagName.toLowerCase();
      const text = $(el).text().trim();

      if (tagName === 'h2') {
        // Название книги
        book.title = { short: text, full: text };
      } else if (tagName === 'h4') {
        // Начало новой главы
        const chapterNumberDelimIndex = text.indexOf('-');
        const chapterNumber = +text.slice(
          0,
          chapterNumberDelimIndex >= 0 ? chapterNumberDelimIndex : 0
        );
        currentChapter = {
          number: chapterNumber,
          bookId: book.number,
          title:
            text.slice(chapterNumberDelimIndex + 1) + ` - ${chapterNumber}`,
          subsections: [],
        };
        book.chapters.push(currentChapter);
      } else if (tagName === 'h6') {
        // Заголовок внутри главы
        if (currentChapter) {
          currentSubsection = {
            heading: text,
            bookId: book.number,
            chapterId: currentChapter.number,
            content: [],
          };
          currentChapter.subsections.push(currentSubsection);
        }
      } else if (tagName === 'p') {
        // Строки с номером
        const firstSpaceIndex = text.indexOf(' ');
        const lineNumber = text.substring(0, firstSpaceIndex);
        const lineText = text.substring(firstSpaceIndex + 1);

        if (currentSubsection) {
          currentSubsection.content.push({
            type: 'line',
            number: +lineNumber,
            text: lineText,
            bookId: book.number,
            chapterId: currentChapter.number,
          });
        } else if (currentChapter) {
          // Если нет подраздела, добавляем контент в главу
          currentChapter.subsections.push({
            heading: null,
            bookId: book.number,
            chapterId: currentChapter.number,
            content: [
              {
                type: 'line',
                number: +lineNumber,
                text: lineText,
                bookId: book.number,
                chapterId: currentChapter.number,
              },
            ],
          });
        }
      }
    });

    return book;
  }

  // readFile(filePath: string) {
  //   // Пример использования: чтение HTML из файла
  //   fs.readFile(filePath, 'utf-8', (err, data) => {
  //     if (err) {
  //       console.error('Ошибка чтения файла:', err);
  //       return;
  //     }
  //
  //     // Парсим HTML-контент
  //     const parsedBook = this.parseHTMLContent(data);
  //
  //     // Вывод результата
  //     console.log(JSON.stringify(parsedBook, null, 2));
  //   });
  // }

  convertToJson() {
    try {
      const translate: BibleTranslate = {
        title: '',
        sourceTitle: '',
        lang: '',
        version: '',
        books: [],
        keyForSearch: '',
        isDefault: false
      };

      const langVersions = fs.readdirSync(this.assetsPath);

      for (const langVersion of langVersions) {
        const subVersions = fs.readdirSync(
          path.resolve(this.assetsPath, langVersion)
        );

        translate.lang = langVersion;

        for (const subVersion of subVersions) {
          const books = fs.readdirSync(
            path.resolve(this.assetsPath, langVersion, subVersion)
          );

          translate.version = subVersion;

          if (books.includes('meta.json')) {
            const metaFilePath = path.resolve(
              this.assetsPath,
              langVersion,
              subVersion,
              'meta.json'
            );
            const metaString = fs.readFileSync(metaFilePath, {
              encoding: 'utf-8',
            });
            const { title, lang } = JSON.parse(metaString);
            translate.title = title;
            translate.lang = lang;
          }

          let bookIndex = 1;
          for (const book of books) {
            const isBook = book.match(/\d{2}/g)?.length;

            if (!isBook) {
              continue;
            }

            const bookFilePath = path.resolve(
              this.assetsPath,
              langVersion,
              subVersion,
              book
            );

            const bookContent = fs.readFileSync(bookFilePath, {
              encoding: 'utf-8',
            });

            const parsedBook = this.parseHTMLContent(bookContent, bookIndex);

            translate.books.push(parsedBook);
            bookIndex++;
          }

          const fileName = `${langVersion}__${subVersion}`;
          const extension = `.bible.json`;
          translate.keyForSearch = `${fileName}${extension}`;
          const filePath =
            path.resolve(this.assetsJsonsPath) + `/${fileName}${extension}`;

          fs.mkdirSync(this.assetsJsonsPath, { recursive: true });
          fs.writeFileSync(filePath, JSON.stringify(translate, null, 2));
        }
      }
    } catch (error) {
      console.log('ERROR', error);
    }
  }
}
