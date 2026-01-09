import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SongsService } from './songs.service';
import { SongsController } from './songs.controller';

@Module({
  imports: [HttpModule],
  controllers: [SongsController],
  providers: [SongsService],
  exports: [],
})
export class SongsDomainModule {}
