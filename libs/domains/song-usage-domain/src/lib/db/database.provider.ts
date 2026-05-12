import { Provider } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database = require('better-sqlite3');
import * as schema from './schema';
import { getDbPath } from '@lyri-cast/common-workers';

export const DB_PROVIDER_TOKEN = 'SONG_USAGE_DB_PROVIDER';

export const databaseProvider: Provider = {
  provide: DB_PROVIDER_TOKEN,
  useFactory: async () => {
    const { dbPath } = getDbPath({ dbName: 'song-usage.sqlite' });
    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    ensureSchema(sqlite);

    return drizzle(sqlite, { schema });
  },
};

function ensureSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS song_usage_events (
      id TEXT PRIMARY KEY,
      song_book_key TEXT NOT NULL,
      song_number INTEGER NOT NULL,
      song_title TEXT NOT NULL DEFAULT '',
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_ms INTEGER,
      split_parts_count INTEGER,
      appearance_schema_version INTEGER NOT NULL DEFAULT 1,
      appearance_snapshot TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS song_usage_events_song_idx
      ON song_usage_events(song_book_key, song_number);

    CREATE INDEX IF NOT EXISTS song_usage_events_started_at_idx
      ON song_usage_events(started_at);

    CREATE TABLE IF NOT EXISTS song_display_settings (
      song_key TEXT PRIMARY KEY,
      song_book_key TEXT NOT NULL,
      song_number INTEGER NOT NULL,
      appearance_schema_version INTEGER NOT NULL,
      appearance_json TEXT NOT NULL,
      split_parts_count INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS song_display_settings_song_idx
      ON song_display_settings(song_book_key, song_number);
  `);
}
