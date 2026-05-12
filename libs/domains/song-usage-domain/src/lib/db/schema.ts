import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const songUsageEvents = sqliteTable('song_usage_events', {
  id: text('id').primaryKey(),
  songBookKey: text('song_book_key').notNull(),
  songNumber: integer('song_number').notNull(),
  songTitle: text('song_title').notNull().default(''),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  durationMs: integer('duration_ms'),
  splitPartsCount: integer('split_parts_count'),
  appearanceSchemaVersion: integer('appearance_schema_version').notNull().default(1),
  appearanceSnapshot: text('appearance_snapshot').notNull().default(''),
});

export const songDisplaySettings = sqliteTable('song_display_settings', {
  songKey: text('song_key').primaryKey(),
  songBookKey: text('song_book_key').notNull(),
  songNumber: integer('song_number').notNull(),
  appearanceSchemaVersion: integer('appearance_schema_version').notNull(),
  appearanceJson: text('appearance_json').notNull(),
  splitPartsCount: integer('split_parts_count'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type SongUsageEvent = typeof songUsageEvents.$inferSelect;
export type NewSongUsageEvent = typeof songUsageEvents.$inferInsert;
export type SongDisplaySettings = typeof songDisplaySettings.$inferSelect;
export type NewSongDisplaySettings = typeof songDisplaySettings.$inferInsert;
