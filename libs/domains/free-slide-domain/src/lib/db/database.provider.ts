import { Provider } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { runMigrations } from './migrate';
import { getDbPath } from '@lyri-cast/common-workers';

export const DB_PROVIDER_TOKEN = 'DB_PROVIDER';

export const databaseProvider: Provider = {
  provide: DB_PROVIDER_TOKEN,
  useFactory: async () => {
    const { dbPath, isNewDb } = getDbPath({
      dbName: 'free-slides.sqlite',
      copyFromSourceInProd: true,
    });

    const isPackaged = process.env.IS_PACKAGED === 'true';

    // Run migrations for new databases or in development
    if (isNewDb || !isPackaged) {
      runMigrations(dbPath);
    }

    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    return drizzle(sqlite, { schema });
  },
};
