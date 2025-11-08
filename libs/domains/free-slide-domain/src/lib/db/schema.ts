import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const presentations = sqliteTable('presentations', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('Презентация'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const slides = sqliteTable('slides', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('Слайд 1'),
  content: text('content').notNull(),
  index: integer('index').notNull(),
  previewAssetId: text('preview_asset_id').notNull().default(''),
  presentationId: text('presentation_id').notNull().references(() => presentations.id, { onDelete: 'cascade' }),
});

export const presentationsRelations = relations(presentations, ({ many }) => ({
  slides: many(slides),
}));

export const slidesRelations = relations(slides, ({ one }) => ({
  presentation: one(presentations, {
    fields: [slides.presentationId],
    references: [presentations.id],
  }),
}));

export type Presentation = typeof presentations.$inferSelect;
export type NewPresentation = typeof presentations.$inferInsert;
export type Slide = typeof slides.$inferSelect;
export type NewSlide = typeof slides.$inferInsert;
