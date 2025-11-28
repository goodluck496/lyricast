import { Provider } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { getDbPath } from '@lyri-cast/common-workers';

export const DB_PROVIDER_TOKEN = 'DB_PROVIDER';

export const databaseProvider: Provider = {
  provide: DB_PROVIDER_TOKEN,
  useFactory: async () => {
    const dbName = 'free-slide.sqlite';

    const { dbPath } = getDbPath({
      dbName,
    });

    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');

    return drizzle(sqlite, { schema });
  },
};
