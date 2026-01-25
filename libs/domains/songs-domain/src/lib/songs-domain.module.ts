import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SongsService } from './songs.service';
import { SongsController } from './songs.controller';
import { ExportController } from './export.controller';

@Module({
  imports: [HttpModule],
  controllers: [SongsController, ExportController],
  providers: [SongsService],
  exports: [],
})
export class SongsDomainModule {}
