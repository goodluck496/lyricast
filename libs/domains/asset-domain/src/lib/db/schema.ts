import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(), // SHA-256 hash of the file
  originalName: text('original_name').notNull(),
  filePath: text('file_path').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(), // in bytes
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
