import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Body,
  Put,
  Delete,
  HttpCode,
  HttpStatus,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { PresentationDto, SerializedState } from '@lyri-cast/entities';
import { FreeSlideService, PresentationWithSlides } from './free-slide.service';
import { PptxService } from './pptx/pptx.service';
import type { Response } from 'express';

type PptxImportPayload = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

@Controller('free-slide')
export class FreeSlideController {
  constructor(
    private readonly freeSlideService: FreeSlideService,
    private readonly pptxService: PptxService
  ) {}

  @Get()
  async getAll(): Promise<PresentationWithSlides[]> {
    return this.freeSlideService.getAll();
  }

  @Get('search')
  async search(@Query('search') search: string): Promise<PresentationWithSlides[]> {
    return this.freeSlideService.search(search);
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<PresentationWithSlides> {
    return this.freeSlideService.getById(id);
  }

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() data: PresentationDto): Promise<PresentationWithSlides> {
    console.log('--------awdwa--',data);
    return this.freeSlideService.create(data);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: Partial<PresentationDto>
  ): Promise<PresentationWithSlides> {
    return this.freeSlideService.update(id, data);
  }

  @Get(':id/transition-settings')
  async getTransitionSettings(@Param('id') id: string): Promise<any> {
    return this.freeSlideService.getTransitionSettings(id);
  }

  @Put(':id/transition-settings')
  async setTransitionSettings(
    @Param('id') id: string,
    @Body() settings: any
  ): Promise<{ success: boolean }> {
    return this.freeSlideService.setTransitionSettings(id, settings);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.freeSlideService.delete(id);
  }

  @Post('pptx/import')
  async importPptx(@Body() body: PptxImportPayload): Promise<SerializedState[]> {
    if (!body?.dataBase64) {
      throw new BadRequestException('PPTX file payload is missing');
    }

    const buffer = Buffer.from(body.dataBase64, 'base64');
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new BadRequestException('PPTX payload is not a ZIP package');
    }

    return this.pptxService.importPptx(buffer);
  }

  @Post('pptx/export')
  async exportPptx(
    @Body() body: { presentationName: string; slides: SerializedState[] },
    @Res() res: Response
  ): Promise<void> {
    const { presentationName, slides } = body;
    const buffer = await this.pptxService.exportPptx(presentationName, slides);
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new BadRequestException('PPTX export did not produce a ZIP package');
    }

    const encodedName = encodeURIComponent(presentationName).replace(/'/g, '%27');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader('Content-Length', buffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodedName}.pptx`
    );
    res.end(buffer);
  }
}

/*
import { Controller, Get, Param, Post, Query, Body, Put, Delete, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import { FreeSlide, FreeSlideDto } from '@lyri-cast/entities';
import { FreeSlideService } from './free-slide.service';

@Controller('free-slide')
export class FreeSlideController {
  constructor(private readonly freeSlideService: FreeSlideService) {}

  @Get()
  async getAll(): Promise<FreeSlide[]> {
    return this.freeSlideService.getAll();
  }

  @Get('search')
  async search(@Query('search') search: string): Promise<FreeSlide[]> {
    return this.freeSlideService.search(search);
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<FreeSlide> {
    const result = await this.freeSlideService.getById(id);
    if (!result) {
      throw new NotFoundException(`Slide with ID ${id} not found`);
    }
    return result;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() data: FreeSlideDto): Promise<FreeSlide> {
    // DTO validation should be handled by a pipe
    return this.freeSlideService.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: Partial<FreeSlideDto>): Promise<FreeSlide> {
    const result = await this.freeSlideService.update(id, data);
    if (!result) {
      throw new NotFoundException(`Slide with ID ${id} not found to update`);
    }
    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    const { success } = await this.freeSlideService.delete(id);
    if (!success) {
      throw new NotFoundException(`Slide with ID ${id} not found to delete`);
    }
  }
}
*/
