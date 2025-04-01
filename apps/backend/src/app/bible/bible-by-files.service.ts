import { Injectable } from '@nestjs/common';
import path from 'path';
import {
  BibleBook,
  BibleBookShort,
  BibleChapter,
  BibleChapterSection,
  BibleChapterShort,
  BibleSearchDto,
  BibleTranslate,
  BibleTranslateShort,
  BOOK_NAMES,
} from '@lyri-cast/entities';
import fs from 'fs';

@Injectable()
export class BibleByFilesService {
  assetsPath = path.resolve(__dirname, 'assets', 'complete-jsons', 'bibles');

  biblesCache: Record<string, BibleTranslate> = {};

  isReady = false;

  constructor() {} // private readonly bibleTranslateRepo: Repository<BibleTranslateEntity> // @InjectRepository(BibleTranslateEntity)

  getAllBibles(): BibleTranslate[] {
    const allBibles = this.getAllShortBibles();

    return allBibles.map((el) => this.biblesCache[el.keyForSearch]);
  }

  getAllShortBibles(): BibleTranslateShort[] {
    const translatesFiles = fs.readdirSync(this.assetsPath);
    const translates: BibleTranslateShort[] = [];

    try {
      for (const translateFile of translatesFiles) {
        if (this.biblesCache[translateFile]) {
          translates.push(this.biblesCache[translateFile]);
          continue;
        }

        const translateStr = fs.readFileSync(
          path.resolve(this.assetsPath, translateFile)
        );
        const translate: BibleTranslate = JSON.parse(translateStr.toString());

        translates.push({
          title: translate.title,
          sourceTitle: translate.sourceTitle,
          keyForSearch: translate.keyForSearch,
          lang: translate.lang,
          version: translate.version,
          isDefault: false,
          isClassicBookOrder: translate.isClassicBookOrder,
        });
        this.biblesCache[translate.keyForSearch] = translate;
      }

      return translates;
    } catch (error) {
      console.log('getAllBibles', error);
      return [];
    }
  }

  getBooks(key: string): BibleBook[] {
    const translate = this.getAllBibles().find((el) => el.keyForSearch === key);
    if (!translate) {
      return [];
    }

    return translate.books.map((book) => {
      const bookName = book.title ?? BOOK_NAMES[book.number];
      return {
        ...book,
        title: bookName ?? book.title,
      };
    });
  }

  getBooksShort(key: string): BibleBookShort[] {
    return this.getBooks(key).map(
      (el) =>
        ({
          ...el,
          chapters: el.chapters.map(
            (chapter) =>
              ({
                title: chapter.title,
                number: chapter.number,
              } satisfies BibleChapterShort)
          ),
        } satisfies BibleBookShort)
    ) satisfies BibleBookShort[];
  }

  getChaptersInBook(translate: string, bookId: number): BibleChapter[] {
    const books = this.getBooks(translate);

    return (
      books.find((el) => String(el.number) === String(bookId)).chapters ?? []
    );
  }

  getChapterSections(
    translate: string,
    bookId: number,
    chapterId: number
  ): BibleChapterSection[] {
    const chapters = this.getChaptersInBook(translate, bookId).find(
      (el) => String(el.number) === String(chapterId)
    );

    return chapters.subsections;
  }

  searchInContent(
    translate: string,
    search: string,
    bookId?: number,
    chapterId?: number
  ) {
    const result: BibleSearchDto = {
      search,
      sections: [],
    };

    const books = this.getBooks(translate).filter((book) =>
      bookId ? book.number === bookId : true
    );

    // Удаление знаков препинания из строки поиска
    const punctPattern = new RegExp('[.,\\/#!$%\\^&\\*;:{}=\\-_`~()]', 'gi');
    const cleanedSearch = search.replace(punctPattern, '').toLowerCase();
    const searchTerms = cleanedSearch.split(' ');

    const matches = [];

    books.forEach((book) => {
      book.chapters.forEach((chapter) => {
        if (chapterId && chapter.number !== chapterId) {
          return;
        }
        chapter.subsections.forEach((section) => {
          const cleanedContentText = section.content.map((content) => ({
            ...content,
            cleanedText: (content.text || '').replace(punctPattern, '').toLowerCase(),
          }));

          const searchWithTerms = (terms: string[]) => {
            const regex = new RegExp(terms.join(' '), 'i'); // Регулярное выражение для поиска фразы

            cleanedContentText.forEach((content) => {
              let score = 0;

              if (regex.test(content.cleanedText)) {
                score += terms.length * 3; // Даем больше очков за совпадение регулярного выражения
              }

              terms.forEach((term) => {
                const termRegex = new RegExp(term, 'i'); // Регулярное выражение для поиска отдельных слов
                const matches = content.cleanedText.match(termRegex);
                if (matches) {
                  score += matches.length; // Даем очки за каждое совпадение термина
                }
              });

              if (score > 0) {
                matches.push({
                  bookId: book.number,
                  chapterId: chapter.number,
                  content: content,
                  score: score,
                });
              }
            });
          };

          if (searchTerms.length > 2) {
            searchWithTerms([cleanedSearch]);
          } else {
            for (let i = searchTerms.length; i > 0; i--) {
              searchWithTerms(searchTerms.slice(0, i));
            }
          }
        });
      });
    });

    const uniqueMatches = matches.filter(
      (match, index, self) =>
        index ===
        self.findIndex(
          (m) => m.bookId === match.bookId && m.chapterId === match.chapterId
        )
    );

    uniqueMatches.sort((a, b) => b.score - a.score);

    result.sections = uniqueMatches.map((match) => {
      const foundBook = books.find((book) => String(book.number) === String(match.bookId));
      const bookShortName = foundBook.title.short;

      return {
        bookId: match.bookId,
        bookShortName: bookShortName ?? match.bookId,
        chapterId: match.chapterId,
        content: match.content,
      };
    });

    return result;
  }
}
