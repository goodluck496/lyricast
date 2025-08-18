import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { FreeSlide, FreeSlideDto } from '@lyri-cast/entities';
import { FreeSlideService } from './free-slide.service';

@Controller('free-slide')
export class FreeSlideController {
  constructor(private readonly freeSlideService: FreeSlideService) {}

  @Get()
  getAll(): FreeSlide[] {
    return this.freeSlideService.getAllSlides();
  }

  @Get(':id')
  getById(@Param('id') id: string): FreeSlide | null {
    const res = this.freeSlideService.getSlide(id);

    if ('empty' in res) {
      return null;
    }

    return res;
  }

  @Post()
  addSlide(data: FreeSlideDto): boolean {
    return this.freeSlideService.saveSlide(data);
  }

  @Get('search')
  search(@Query('search') search: string): FreeSlide[] {
    return this.freeSlideService.searchSlides(search);
  }
}
