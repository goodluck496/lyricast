import { Controller, Get, HttpStatus } from '@nestjs/common';

import { AppService } from './app.service';
import { SongsService } from './songs/songs.service';
import { BibleByFilesService } from './bible/bible-by-files.service';
import { FreeSlideService } from './free-slide/free-slide.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly songService: SongsService,
    private readonly freeSlideService: FreeSlideService,
    private readonly bibleFilesService: BibleByFilesService
  ) {}

  @Get('ok')
  heartBeat() {
    return HttpStatus.OK;
  }

  @Get('ready')
  backendReady() {
    return [
      this.songService.isReady,
      this.bibleFilesService.isReady,
      this.freeSlideService.isReady,
    ].every((isReady) => isReady);
  }
}
