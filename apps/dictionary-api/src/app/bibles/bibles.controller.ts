import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { BiblesService } from './bibles.service';
import {
  BibleVersionsCheckRequestDto,
  ImportBibleDto,
  CreateBibleDto,
  UpdateBibleMetaDto,
  UpdateBibleVerseDto,
} from './dto';

@ApiTags('bibles')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('bibles')
export class BiblesController {
  constructor(private readonly service: BiblesService) {}

  /**
   * Реестр переводов Библии (registry.list).
   */
  @Get('registry')
  @ApiOperation({ summary: 'Реестр переводов Библии' })
  @ApiOkResponse({ description: 'BibleRegistryResponseDto' })
  registry() {
    return this.service.registryList();
  }

  /**
   * Проверка версий переводов (bible.versions.check).
   */
  @Post('versions/check')
  @ApiOperation({ summary: 'Проверить, какие переводы новее на сервере' })
  @ApiOkResponse({ description: 'BibleVersionsCheckResponseDto' })
  checkVersions(@Body() body: BibleVersionsCheckRequestDto) {
    return this.service.checkVersions(body);
  }

  /**
   * Получение облегченной структуры перевода (книги и главы без стихов).
   */
  @Get(':id/structure')
  @ApiOperation({ summary: 'Получить структуру перевода (книги и главы) без стихов' })
  getStructure(@Param('id', ParseIntPipe) id: number) {
    return this.service.getBibleStructure(id);
  }

  /**
   * Получение стихов конкретной главы.
   */
  @Get(':id/chapters/:chapterId/verses')
  @ApiOperation({ summary: 'Получить стихи конкретной главы' })
  getChapterVerses(
    @Param('id', ParseIntPipe) _id: number,
    @Param('chapterId', ParseIntPipe) chapterId: number,
  ) {
    return this.service.getChapterVerses(chapterId);
  }

  /**
   * Экспорт полного перевода в JSON (BibleTranslate).
   */
  @Get(':id/export')
  @ApiOperation({ summary: 'Экспортирует перевод Библии в JSON' })
  @ApiOkResponse({ description: 'BibleTranslate' })
  exportBible(@Param('id', ParseIntPipe) id: number) {
    return this.service.exportBible(id);
  }

  /**
   * Импорт перевода Библии из JSON (BibleTranslate).
   */
  @Post('import')
  @ApiOperation({ summary: 'Импорт перевода Библии из JSON в PostgreSQL' })
  @ApiOkResponse({ description: 'Импорт завершён' })
  importBible(@Body() dto: ImportBibleDto) {
    return this.service.importBible(dto);
  }

  /**
   * Создание пустого перевода без импорта JSON.
   */
  @Post()
  @ApiOperation({ summary: 'Создать пустой перевод Библии без импорта JSON' })
  createBible(@Body() _dto: CreateBibleDto) {
    // TODO: реализовать в сервисе если нужно
    return { ok: false, message: 'Not implemented yet' };
  }

  /**
   * Обновление метаданных перевода.
   */
  @Patch(':id/meta')
  @ApiOperation({ summary: 'Обновить мета-информацию перевода (bible_meta)' })
  updateBibleMeta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBibleMetaDto,
  ) {
    return this.service.updateBibleMeta(id, dto);
  }

  /**
   * Обновление текста конкретного стиха.
   */
  @Put(':id/verses/:verseId')
  @ApiOperation({ summary: 'Обновить текст стиха' })
  updateVerse(
    @Param('id', ParseIntPipe) id: number,
    @Param('verseId', ParseIntPipe) verseId: number,
    @Body() dto: UpdateBibleVerseDto,
  ) {
    return this.service.updateVerse(id, verseId, dto);
  }
}