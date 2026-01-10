import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { drizzleProvider, pgPoolProvider } from './database.providers';

@Global()
@Module({
  providers: [pgPoolProvider, drizzleProvider, DatabaseService],
  exports: [DatabaseService, drizzleProvider, pgPoolProvider],
})
export class DatabaseModule {}
