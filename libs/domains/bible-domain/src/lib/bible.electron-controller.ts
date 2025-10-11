import { BibleByFilesService } from './bible-by-files.electron-service';
import {
  BibleBook,
  BibleBookShort,
  BibleChapter,
  BibleSearchDto,
} from '@lyri-cast/entities';

export class BibleController {
  constructor(private readonly bibleService: BibleByFilesService) {}

  getTranslates(short: number) {
    if (short) {
      return this.bibleService.getAllShortBibles();
    } else {
      return this.bibleService.getAllBibles();
    }
  }

  getLanguages(): string[] {
    const languages = new Set<string>();
    this.bibleService
      .getAllShortBibles()
      .map((el) => el.lang)
      .forEach((el) => languages.add(el));

    return Array.from(languages);
  }

  getBooks(translate: string, short?: number): BibleBook[];
  getBooks(translate: string, short: number): BibleBookShort[] {
    if (short) {
      return this.bibleService.getBooksShort(translate);
    } else {
      return this.bibleService.getBooks(translate);
    }
  }

  getChapters(translate: string, book: number): BibleChapter[] {
    return this.bibleService.getChaptersInBook(translate, book);
  }

  getChapter(translate: string, book: number, chapter: number) {
    return this.bibleService.getChapterSections(translate, book, chapter);
  }

  getBookById(translate: string, bookId: number) {
    return this.bibleService
      .getBooks(translate)
      .find((el) => String(el.number) === String(bookId));
  }

  search(
    query: string,
    translate: string,
    book?: number,
    chapter?: number
  ): Promise<BibleSearchDto> {
    return new Promise((res, rej) => {
      setTimeout(() => {
        try {
          const result = this.bibleService.searchInContent(
            translate,
            query,
            book,
            chapter
          );
          res(result);
        } catch (err) {
          rej(err);
        }
      });
    });
  }
}
