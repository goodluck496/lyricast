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
    const assetsDirName = 'user-assets';

    const { dbPath } = getDbPath({
      dbName,
      copyFromSourceInProd: true,
    });

    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');

    const userDataPath = process.env.USER_DATA_PATH;
    const sourceDataPath = process.env.SOURCE_DATA_PATH;

    if (!sourceDataPath || !userDataPath) {
      throw new Error(
        'Database paths are not configured. Required environment variables are missing.'
      );
    }

    let assetsPath: string;

    if (process.env.IS_PACKAGED === 'true') {
      assetsPath = path.join(userDataPath, assetsDirName);
    } else {
      assetsPath = path.resolve(sourceDataPath, 'data', assetsDirName);
    }

    if (!fs.existsSync(assetsPath)) {
      fs.mkdirSync(assetsPath, { recursive: true });
    }

    return drizzle(sqlite, { schema });
  },
};
