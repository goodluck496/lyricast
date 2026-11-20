import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { BiblesController } from './bibles.controller';
import { BiblesService } from './bibles.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [BiblesController],
  providers: [BiblesService],
  exports: [BiblesService],
})
export class BiblesModule {}