import { Injectable } from '@nestjs/common';
import * as xml2js from 'xml2js';
import path from 'path';
import fs from 'fs';
import {
  BibleBook,
  BibleChapter,
  BibleChapterSection,
} from '@lyri-cast/entities';

@Injectable()
export class BibleXmlParserService {
  assetsPath = path.resolve(__dirname, 'assets', 'bibles', 'xml-versions');
  assetsJsonsPath = path.resolve(
    __dirname,
    'assets',
    'complete-jsons',
    'bibles'
  );

  parseXMLContent(xmlString: string): Promise<BibleBook[]> {
    const parser = new xml2js.Parser();

    // Возвращаем промис, чтобы дождаться завершения парсинга
    return new Promise((resolve, reject) => {
      parser.parseString(xmlString, (err, result) => {
        if (err) {
          reject(err);
        } else {
          // Создаем массив книг
          const books = result.XMLBIBLE.BIBLEBOOK.map((bibleBook) => {
            // Объект книги
            const book = {
              title: bibleBook.$.bname, // Название книги
              chapters: [],
            };

            // Итерируем по главах
            bibleBook.CHAPTER.forEach((chapter) => {
              const currentChapter: BibleChapter = {
                number: +chapter.$.cnumber,
                title: `Глава ${chapter.$.cnumber}`, // Номер главы
                subsections: [],
              };

              // Добавляем стихи как подразделы главы
              const verses: BibleChapterSection = {
                heading: null, // Заголовок для стихов отсутствует
                content: chapter.VERS.map((verse) => ({
                  type: 'line',
                  number: +verse.$.vnumber, // Номер стиха
                  text: verse._, // Текст стиха
                })),
              };

              currentChapter.subsections.push(verses);
              book.chapters.push(currentChapter);
            });

            return book;
          });

          resolve(books);
        }
      });
    });
  }

  async convertToJson() {
    try {
      const langVersions = fs.readdirSync(this.assetsPath);

      for (const langVersion of langVersions) {
        const subVersions = fs.readdirSync(
          path.resolve(this.assetsPath, langVersion)
        );

        for (const subVersion of subVersions) {
          const bibleVersionFilePath = path.resolve(
            this.assetsPath,
            langVersion,
            subVersion
          );

          const bibleContent = fs.readFileSync(bibleVersionFilePath, {
            encoding: 'utf-8',
          });

          const parsedBible = await this.parseXMLContent(bibleContent);
          const fileName =
            path.resolve(this.assetsJsonsPath) +
            `/${langVersion}__${subVersion}.bible.json`;

          fs.mkdirSync(this.assetsJsonsPath, { recursive: true });
          fs.writeFileSync(fileName, JSON.stringify(parsedBible, null, 2));
        }
      }
    } catch (error) {
      console.log('ERROR', error);
    }
    // for (const subVersion of subVersions) {
    //   const books = fs.readdirSync(
    //     path.resolve(this.assetsPath, langVersion)
    //   );
    //
    //   console.log(subVersions, books);

    // for (const book of books) {
    //   const isBook = book.match(/\d{2}/g)?.length;
    //
    //   if (!isBook) {
    //     continue;
    //   }
    //
    //   const bookContent = fs.readFileSync(
    //     path.resolve(this.assetsPath, langVersion, subVersion, book),
    //     {
    //       encoding: 'utf-8',
    //     }
    //   );
    //
    //   const parsedBook = this.parseXMLContent(bookContent);
    //
    //   bible.push(parsedBook);
    // }
    //
    // const fileName =
    //   path.resolve(this.assetsJsonsPath) + `/${langVersion}.bible.json`;

    // fs.mkdirSync(this.assetsJsonsPath, { recursive: true });
    // fs.writeFileSync(fileName, JSON.stringify(bible, null, 2));
    // }
    //   }
    // } catch (error) {
    //   console.log('ERROR', error);
    // }
    // }
  }
}
