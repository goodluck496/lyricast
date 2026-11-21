import { Controller, Get, Param, Query, Post, Body, Headers } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { BibleByFilesService } from './bible-by-files.service';
import { BibleChapter, BibleSearchDto, BibleDictionaryCardDto } from '@lyri-cast/entities';

@Controller('bible')
export class BibleController {
  constructor(private readonly bibleService: BibleByFilesService) {}

  @Get('translates')
  getTranslates(@Query('short') short: any) {
    const isShort = short === 'true' || Number(short) === 1 || short === true;
    if (isShort) {
      return this.bibleService.getAllShortBibles();
    } else {
      return this.bibleService.getAllBibles();
    }
  }

  @Get('languages')
  getLanguages(): string[] {
    const languages = new Set<string>();
    this.bibleService
      .getAllShortBibles()
      .map((el) => el.lang)
      .forEach((el) => languages.add(el));

    return Array.from(languages);
  }

  @Get('books/:translate')
  getBooks(@Param('translate') translate: string, @Query('short') short: any) {
    const isShort = short === 'true' || Number(short) === 1 || short === true;
    if (isShort) {
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
    @Query('query') query: string
  ): BibleSearchDto {
    return this.bibleService.searchInContent(
      translate,
      query,
      Number(book),
      Number(chapter)
    );
  }

  // === Управление справочниками (для воркеров) ===

  @Get('dictionaries')
  @ApiOperation({ summary: 'Статус установленных переводов Библии' })
  async getDictionaries(
    @Headers('authorization') authorization?: string,
    @Headers('x-auth-token') xAuthToken?: string,
    @Query('authToken') authToken?: string
  ): Promise<BibleDictionaryCardDto[]> {
    const auth =
      authorization ??
      (xAuthToken ? `Bearer ${xAuthToken}` : undefined) ??
      (authToken ? `Bearer ${authToken}` : undefined);
    return this.bibleService.getDictionariesStatus(auth);
  }

  @Post('dictionaries/install')
  @ApiOperation({ summary: 'Установить перевод Библии (скачать и сохранить)' })
  async installDictionary(
    @Body() body: { fileKey: string; downloadUrl?: string },
    @Headers('authorization') authorization?: string,
    @Headers('x-auth-token') xAuthToken?: string,
    @Query('authToken') authToken?: string
  ): Promise<{ ok: boolean }> {
    const auth =
      authorization ??
      (xAuthToken ? `Bearer ${xAuthToken}` : undefined) ??
      (authToken ? `Bearer ${authToken}` : undefined);
    await this.bibleService.installDictionary(body.fileKey, body.downloadUrl, auth);
    return { ok: true };
  }

  @Post('dictionaries/delete')
  @ApiOperation({ summary: 'Удалить локальный перевод Библии' })
  async deleteDictionary(@Body() body: { fileKey: string }): Promise<{ ok: boolean }> {
    await this.bibleService.deleteDictionary(body.fileKey);
    return { ok: true };
  }

  @Post('dictionaries/clear')
  @ApiOperation({ summary: 'Очистить все пользовательские переводы (кроме дефолтных)' })
  async clearDictionaries(): Promise<{ ok: boolean }> {
    await this.bibleService.clearDictionaries();
    return { ok: true };
  }
}
