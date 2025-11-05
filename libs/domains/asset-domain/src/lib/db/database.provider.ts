import { Provider } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrate';

export const DB_PROVIDER_TOKEN = 'ASSET_DB_PROVIDER';

export const databaseProvider: Provider = {
  provide: DB_PROVIDER_TOKEN,
  useFactory: async () => {
    const dbName = 'assets.sqlite';
    const assetsDirName = 'user-assets';

    // Read paths and flags from environment variables set by the main process
    const isPackaged = process.env.IS_PACKAGED === 'true';
    const userDataPath = process.env.USER_DATA_PATH;
    const sourceDataPath = process.env.SOURCE_DATA_PATH;

    if (!sourceDataPath || !userDataPath) {
      throw new Error('Database paths are not configured. Required environment variables are missing.');
    }

    let dbPath: string;
    let assetsPath: string;

    if (isPackaged) {
      // PRODUCTION LOGIC
      const destinationDbPath = path.join(userDataPath, 'databases', dbName);
      assetsPath = path.join(userDataPath, assetsDirName);

      if (!fs.existsSync(destinationDbPath)) {
        // In production, we start with an empty database.
        // The assets directory will be created if it doesn't exist.
        const destinationDir = path.dirname(destinationDbPath);
        if (!fs.existsSync(destinationDir)) {
          fs.mkdirSync(destinationDir, { recursive: true });
        }
      }
      dbPath = destinationDbPath;
    } else {
      // DEVELOPMENT LOGIC
      // sourceDataPath is the project root in dev mode.
      dbPath = path.resolve(sourceDataPath, 'data', dbName);
      assetsPath = path.resolve(sourceDataPath, 'data', assetsDirName);
    }

    // Ensure database and asset directories exist
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    if (!fs.existsSync(assetsPath)) {
      fs.mkdirSync(assetsPath, { recursive: true });
    }

    // Run migrations only in development mode
    if(!isPackaged) {
      runMigrations(dbPath);
    }

    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    return drizzle(sqlite, { schema });
  },
};
