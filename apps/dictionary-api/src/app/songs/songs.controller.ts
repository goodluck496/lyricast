import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { SongsService } from './songs.service';
import { CreateSongDto, UpdateSongDto } from './dto/song.dto';
import { SongBookExportDto } from './dto/song-book-export.dto';
import {
  VersionsCheckRequestDto,
  VersionsCheckResponseDto,
  RegistryResponseDto,
} from './dto/versions.dto';
import { ImportSongBookDto } from './dto/import-song-book.dto';
import { UpdateSongBookMetaDto } from './dto/update-song-book-meta.dto';
import { CreateSongBookDto } from './dto/create-song-book.dto';
import { Response } from 'express';

@ApiTags('songs')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('songs')
export class SongsController {
  constructor(private readonly service: SongsService) {}

  /**
   * Создаёт новую песню со связанной лирикой и метаданными.
   */
  @Post()
  @ApiOperation({ summary: 'Создание песни' })
  create(@Body() dto: CreateSongDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Список песен по сборнику' })
  @ApiQuery({ name: 'songBookId', type: Number, required: true })
  @ApiQuery({ name: 'q', type: String, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'pageSize', type: Number, required: false })
  /**
   * Возвращает список песен сборника с поиском и пагинацией.
   */
  findAll(
    @Query('songBookId', ParseIntPipe) songBookId: number,
    @Query('q') q?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.service.findAll(songBookId, { q, page: Number(page), pageSize: Number(pageSize) });
  }

  /**
   * Список книг с агрегированной метой и количеством песен (registry.list).
   */
  @Get('registry')
  @ApiOperation({ summary: 'Реестр сборников (registry.list)' })
  @ApiOkResponse({ type: RegistryResponseDto })
  registry() {
    return this.service.registryList();
  }

  /**
   * Проверка версий книг (book.versions.check).
   */
  @Post('versions/check')
  @ApiOperation({ summary: 'Проверить, какие книги новее на сервере' })
  @ApiOkResponse({ type: VersionsCheckResponseDto })
  checkVersions(@Body() body: VersionsCheckRequestDto) {
    return this.service.checkVersions(body);
  }

  /**
   * Экспортирует книгу песен (SongBook) в формате SongBookExport.
   */
  @Get('song-books/:songBookId/export')
  @ApiOperation({ summary: 'Экспортирует книгу песен в JSON (SongBookExport)' })
  @ApiOkResponse({ type: SongBookExportDto, description: 'SongBookExport' })
  exportSongBook(@Param('songBookId', ParseIntPipe) songBookId: number) {
    return this.service.exportSongBook(songBookId);
  }

  /**
   * Создаёт задачу экспорта SongBook в JSON (фоново, с пуллингом статуса).
   */
  @Post('song-books/:songBookId/export-json')
  @ApiOperation({ summary: 'Создать задачу экспорта SongBook в JSON' })
  createJsonExportJob(@Param('songBookId', ParseIntPipe) songBookId: number) {
    return this.service.createJsonExportJob(songBookId);
  }

  /**
   * Создаёт задачу экспорта SongBook в SQLite (фоново).
   */
  @Post('song-books/:songBookId/export-sqlite')
  @ApiOperation({ summary: 'Создать задачу экспорта SongBook в SQLite' })
  createSqliteExportJob(@Param('songBookId', ParseIntPipe) songBookId: number) {
    return this.service.createSqliteExportJob(songBookId);
  }

  /**
   * Получить статус задачи экспорта.
   */
  @Get('export-jobs/:jobId')
  @ApiOperation({ summary: 'Статус задачи экспорта SongBook в SQLite' })
  getExportJob(@Param('jobId') jobId: string) {
    return this.service.getExportJob(jobId);
  }

  /**
   * Отменить задачу экспорта.
   */
  @Post('export-jobs/:jobId/cancel')
  @ApiOperation({ summary: 'Отменить задачу экспорта SongBook' })
  cancelExportJob(@Param('jobId') jobId: string) {
    return this.service.cancelExportJob(jobId);
  }

  /**
   * Скачать готовый файл экспорта.
   */
  @Get('export-jobs/:jobId/file')
  @ApiOperation({ summary: 'Скачать файл экспорта SongBook (SQLite)' })
  async downloadExportFile(@Param('jobId') jobId: string, @Res() res: Response) {
    const { path, fileName } = this.service.getExportedFile(jobId);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    // RFC 6266 safe header: ascii fallback + filename*
    const fallbackName = Buffer.from(fileName, 'utf8').toString('ascii').replace(/[^\x20-\x7E]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    return res.download(path, fileName);
  }

  /**
   * Импортирует книгу песен из JSON (SongBookExport) в PostgreSQL.
   */
  @Post('song-books/import')
  @ApiOperation({ summary: 'Импорт SongBook из JSON в PostgreSQL' })
  @ApiOkResponse({ description: 'Импорт завершён' })
  importSongBook(@Body() dto: ImportSongBookDto) {
    return this.service.importSongBook(dto);
  }

  /**
   * Создаёт пустой сборник без импорта JSON.
   */
  @Post('song-books')
  @ApiOperation({ summary: 'Создать пустой SongBook без импорта JSON' })
  createSongBook(@Body() dto: CreateSongBookDto) {
    return this.service.createSongBook(dto);
  }

  @Patch('song-books/:songBookId/meta')
  @ApiOperation({ summary: 'Обновить мета-информацию сборника (song_book_meta)' })
  updateSongBookMeta(
    @Param('songBookId', ParseIntPipe) songBookId: number,
    @Body() dto: UpdateSongBookMetaDto,
  ) {
    return this.service.updateSongBookMeta(songBookId, dto);
  }

  /**
   * Возвращает полную информацию о песне с лирикой и метаданными.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Получить песню' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  /**
   * Обновляет песню, лирику и метаданные с bump версий.
   */
  @Put(':id')
  @ApiOperation({ summary: 'Обновить песню' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSongDto) {
    return this.service.update(id, dto);
  }

  /**
   * Удаляет песню и bump версий сборника/каталога.
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Удалить песню' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
