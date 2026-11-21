import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { OptionalAuth } from '../auth/optional-auth.decorator';
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
  @OptionalAuth()
  @ApiOperation({ summary: 'Реестр переводов Библии' })
  @ApiOkResponse({ description: 'BibleRegistryResponseDto' })
  registry(@Req() req: Request) {
    return this.service.registryList(req.authUser);
  }

  /**
   * Проверка версий переводов (bible.versions.check).
   */
  @Post('versions/check')
  @OptionalAuth()
  @ApiOperation({ summary: 'Проверить, какие переводы новее на сервере' })
  @ApiOkResponse({ description: 'BibleVersionsCheckResponseDto' })
  checkVersions(@Body() body: BibleVersionsCheckRequestDto, @Req() req: Request) {
    return this.service.checkVersions(body, req.authUser);
  }

  /**
   * Получение облегченной структуры перевода (книги и главы без стихов).
   */
  @Get(':id/structure')
  @OptionalAuth()
  @ApiOperation({ summary: 'Получить структуру перевода (книги и главы) без стихов' })
  getStructure(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.service.getBibleStructure(id, req.authUser);
  }

  /**
   * Получение стихов конкретной главы.
   */
  @Get(':id/chapters/:chapterId/verses')
  @OptionalAuth()
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
  @OptionalAuth()
  @ApiOperation({ summary: 'Экспортирует перевод Библии в JSON' })
  @ApiOkResponse({ description: 'BibleTranslate' })
  async exportBible(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const data = await this.service.exportBible(id, req.authUser);
    const jsonStr = JSON.stringify(data);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Length', Buffer.byteLength(jsonStr));
    return data;
  }

  /**
   * Импорт перевода Библии из JSON (BibleTranslate).
   */
  @Post('import')
  @ApiOperation({ summary: 'Импорт перевода Библии из JSON в PostgreSQL' })
  @ApiOkResponse({ description: 'Импорт завершён' })
  importBible(@Body() dto: ImportBibleDto, @Req() req: Request) {
    return this.service.importBible(dto, req.authUser);
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
    @Req() req: Request,
  ) {
    return this.service.updateBibleMeta(id, dto, req.authUser);
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
    @Req() req: Request,
  ) {
    return this.service.updateVerse(id, verseId, dto, req.authUser);
  }
}