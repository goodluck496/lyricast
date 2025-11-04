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
  useFactory:  async () => {
    const dbPath = path.resolve(process.cwd(), 'data', 'free-slides.sqlite');
    const dbDir = path.dirname(dbPath);

    // Убедимся, что директория существует
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    runMigrations(dbPath);

    const sqlite = new Database(dbPath);
    // Для включения WAL (Write-Ahead Logging) для лучшей производительности при конкурентном доступе
    sqlite.pragma('journal_mode = WAL');
    return drizzle(sqlite, { schema });
  },
};
