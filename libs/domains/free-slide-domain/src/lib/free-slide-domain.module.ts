import { Module } from '@nestjs/common';
import { FreeSlideController } from './free-slide.controller';
import { FreeSlideService } from './free-slide.service';
import { databaseProvider } from './db/database.provider';

@Module({
  controllers: [FreeSlideController],
  providers: [databaseProvider, FreeSlideService],
  exports: [databaseProvider, FreeSlideService],
})
export class FreeSlideDomainModule {}
