import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CatalogsService } from './catalogs.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';
import { CatalogDto } from './dto/catalog.dto';

@ApiTags('catalogs')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly service: CatalogsService) {}

  @Post()
  @ApiOkResponse({ description: 'Создан каталог', type: CatalogDto })
  create(@Body() dto: CreateCatalogDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOkResponse({ description: 'Список каталогов', type: [CatalogDto] })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Каталог', type: CatalogDto })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @ApiOkResponse({ description: 'Каталог обновлён' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatalogDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Каталог удалён' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Get(':id/version')
  @ApiOkResponse({ description: 'Версии каталога и датасета' })
  version(@Param('id', ParseIntPipe) id: number) {
    return this.service.getCatalogVersion(id);
  }
}
