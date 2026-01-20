import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { drizzleProvider, postgresClientProvider } from './database.providers';

@Global()
@Module({
  providers: [postgresClientProvider, drizzleProvider, DatabaseService],
  exports: [DatabaseService, drizzleProvider, postgresClientProvider],
})
export class DatabaseModule {}
