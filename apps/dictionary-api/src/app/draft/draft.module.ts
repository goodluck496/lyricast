import { Module } from '@nestjs/common';
import { SongsModule } from '../songs/songs.module';
import { DraftController } from './draft.controller';

@Module({
  imports: [SongsModule],
  controllers: [DraftController],
})
export class DraftModule {}
