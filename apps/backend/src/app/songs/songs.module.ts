import { Module } from '@nestjs/common';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { ParseSongsService } from './parse-songs.service';
import { ParseSongsFromJsonService } from './parse-songs-from-json.service';

@Module({
  controllers: [SongsController],
  providers: [SongsService, ParseSongsService, ParseSongsFromJsonService],
  exports: [SongsService],
})
export class SongsModule {
  constructor(
    parseSongsService: ParseSongsService,
    parseSongsFromJSonService: ParseSongsFromJsonService,
    songsService: SongsService
  ) {
    try {
      parseSongsService.convertSourceToJson();
      parseSongsFromJSonService.convertSourceToJson();
      songsService.isReady = true;
    } catch (err) {
      console.error(err);
    }
  }
}
