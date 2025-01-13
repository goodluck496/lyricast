import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SongsModule } from './songs/songs.module';
import { BibleModule } from './bible/bible.module';

@Module({
  imports: [SongsModule, BibleModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
