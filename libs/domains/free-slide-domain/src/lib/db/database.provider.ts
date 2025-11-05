import { Provider } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrate';

export const DB_PROVIDER_TOKEN = 'DB_PROVIDER';

export const databaseProvider: Provider = {
  provide: DB_PROVIDER_TOKEN,
  useFactory: async () => {
    const dbName = 'free-slides.sqlite';

    // Read paths and flags from environment variables set by the main process
    const isPackaged = process.env.IS_PACKAGED === 'true';
    const userDataPath = process.env.USER_DATA_PATH;
    const sourceDataPath = process.env.SOURCE_DATA_PATH;

    if (!sourceDataPath || !userDataPath) {
      throw new Error('Database paths are not configured. Required environment variables are missing.');
    }

    let dbPath: string;

    if (isPackaged) {
      // PRODUCTION LOGIC
      const destinationDbPath = path.join(userDataPath, 'databases', dbName);

      if (!fs.existsSync(destinationDbPath)) {
        // The config copies 'data' to 'assets/databases' inside the resources folder.
        const sourceDbPathFull = path.join(sourceDataPath, 'assets', 'databases', dbName);

        if (fs.existsSync(sourceDbPathFull)) {
          const destinationDir = path.dirname(destinationDbPath);
          if (!fs.existsSync(destinationDir)) {
            fs.mkdirSync(destinationDir, { recursive: true });
          }
          fs.copyFileSync(sourceDbPathFull, destinationDbPath);
        }
      }
      dbPath = destinationDbPath;
    } else {
      // DEVELOPMENT LOGIC
      // sourceDataPath is the project root in dev mode.
      dbPath = path.resolve(sourceDataPath, 'data', dbName);
    }

    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if(!isPackaged) {
      runMigrations(dbPath);
    }

    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    return drizzle(sqlite, { schema });
  },
};
