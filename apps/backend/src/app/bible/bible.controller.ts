import { Controller, Get, Param, Query } from '@nestjs/common';
import { BibleService } from './bible.service';
import { BibleChapter, BibleSearchDto } from '@lyri-cast/entities';

@Controller('bible')
export class BibleController {
  constructor(private readonly bibleService: BibleService) {}

  @Get('translates')
  getTranslates(@Query('short') short: number) {
    if (short) {
      return this.bibleService.getAllShortBibles();
    } else {
      return this.bibleService.getAllBibles();
    }
  }

  @Get('languages')
  getLanguages(): string[] {
    const languages = new Set<string>();
    this.bibleService.getAllShortBibles().map((el) => el.lang).forEach(el => languages.add(el));

    return Array.from(languages)
  }

  @Get('books/:translate')
  getBooks(
    @Param('translate') translate: string,
    @Query('short') short: number
  ) {
    if (short) {
      return this.bibleService.getBooksShort(translate);
    } else {
      return this.bibleService.getBooks(translate);
    }
  }

  @Get('chapters/:translate/:book/')
  getChapters(
    @Param('translate') translate: string,
    @Param('book') book: number
  ): BibleChapter[] {
    return this.bibleService.getChaptersInBook(translate, book);
  }

  @Get('chapter/:translate/:book/:chapter')
  getChapter(
    @Param('translate') translate: string,
    @Param('book') book: number,
    @Param('chapter') chapter: number
  ) {
    return this.bibleService.getChapterSections(translate, book, chapter);
  }

  @Get('book/:translate/:book/')
  getBookById(
    @Param('translate') translate: string,
    @Param('book') bookId: number
  ) {
    return this.bibleService
      .getBooks(translate)
      .find((el) => String(el.number) === String(bookId));
  }

  @Get('search/:translate')
  search(
    @Param('translate') translate: string,
    @Query('book') book: string,
    @Query('chapter') chapter: string,
    @Query('text') search: string
  ): BibleSearchDto {
    return this.bibleService.searchInContent(
      translate,
      search,
      Number(book),
      Number(chapter)
    );
  }
}
