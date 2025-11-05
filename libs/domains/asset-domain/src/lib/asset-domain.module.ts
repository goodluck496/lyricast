import { Module } from '@nestjs/common';
import { AssetDomainController } from './asset-domain.controller';
import { AssetDomainService } from './asset-domain.service';
import { databaseProvider } from './db/database.provider';

@Module({
  controllers: [AssetDomainController],
  providers: [databaseProvider, AssetDomainService],
  exports: [databaseProvider, AssetDomainService],
})
export class AssetDomainModule {}
