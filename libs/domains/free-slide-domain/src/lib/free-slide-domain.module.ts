import { Module } from '@nestjs/common';
import { FreeSlideController } from './free-slide.controller';
import { FreeSlideService } from './free-slide.service';

@Module({
  controllers: [FreeSlideController],
  providers: [FreeSlideService],
  exports: [FreeSlideService],
})
export class FreeSlideDomainModule {}
