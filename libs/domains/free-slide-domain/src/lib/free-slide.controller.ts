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
} from '@nestjs/common';
import { PresentationDto } from '@lyri-cast/entities';
import { FreeSlideService, PresentationWithSlides } from './free-slide.service';

@Controller('free-slide')
export class FreeSlideController {
  constructor(private readonly freeSlideService: FreeSlideService) {}

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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.freeSlideService.delete(id);
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
