import { Provider } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrate';
import { getDbPath } from '@lyri-cast/common-workers';

export const DB_PROVIDER_TOKEN = 'ASSET_DB_PROVIDER';

export const databaseProvider: Provider = {
  provide: DB_PROVIDER_TOKEN,
  useFactory: async () => {
    const dbName = 'assets.sqlite';

    const { dbPath } = getDbPath({
      dbName,
      copyFromSourceInProd: true,
    });

    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');

    // Гарантируем, что директория для user-assets существует в userData.
    const assetsEnvPath =
      process.env['USER_ASSETS_PATH'] || process.env['USER_DATA_PATH'];

    if (!assetsEnvPath) {
      throw new Error(
        'USER_ASSETS_PATH/USER_DATA_PATH is not configured for asset database.'
      );
    }

    const assetsPath = process.env['USER_ASSETS_PATH']
      ? assetsEnvPath
      : path.join(assetsEnvPath, 'user-assets');

    if (!fs.existsSync(assetsPath)) {
      fs.mkdirSync(assetsPath, { recursive: true });
    }

    return drizzle(sqlite, { schema });
  },
};
