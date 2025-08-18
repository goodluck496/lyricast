import { Module } from '@nestjs/common';
import { FreeSlideService } from './free-slide.service';
import { FreeSlideController } from './free-slide.controller';
import { environment } from '../../environments/environment';

@Module({
  controllers: [FreeSlideController],
  providers: [FreeSlideService],
  exports: [FreeSlideService],
})
export class FreeSlideModule {
  constructor(freeSLideService: FreeSlideService) {
    try {
      if (!environment.production) {

      }

      freeSLideService.isReady = true;
    } catch (err) {
      console.error(err);
    }
  }
}
