import { Module } from '@nestjs/common';
import { SongUsageDomainController } from './song-usage-domain.controller';
import { SongUsageDomainService } from './song-usage-domain.service';
import { databaseProvider } from './db/database.provider';

@Module({
  controllers: [SongUsageDomainController],
  providers: [databaseProvider, SongUsageDomainService],
})
export class SongUsageDomainModule {}
