import { Module } from '@nestjs/common';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { ParseSongsService } from './parse-songs.service';
import {ParseSongsFromJsonService} from "./parse-songs-from-json.service";

@Module({
  controllers: [SongsController],
  providers: [SongsService, ParseSongsService, ParseSongsFromJsonService],
})
export class SongsModule {
  constructor(parseSongsService: ParseSongsService, parseSongsFromJSonService: ParseSongsFromJsonService ) {
    parseSongsService.convertSourceToJson();
    parseSongsFromJSonService.convertSourceToJson();
  }
}
