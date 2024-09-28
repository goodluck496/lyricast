import { Module } from '@nestjs/common';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { ParseSongsService } from './parse-songs.service';

@Module({
  controllers: [SongsController],
  providers: [SongsService, ParseSongsService],
})
export class SongsModule {
  constructor(parseSongsService: ParseSongsService) {
    parseSongsService.convertSourceToJson();
  }

}
