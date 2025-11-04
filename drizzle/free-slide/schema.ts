import { sqliteTable, AnySQLiteColumn, text, integer, foreignKey } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const presentations = sqliteTable("presentations", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export const slides = sqliteTable("slides", {
	id: text().primaryKey().notNull(),
	content: text().notNull(),
	index: integer().notNull(),
	presentationId: text("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" } ),
});

