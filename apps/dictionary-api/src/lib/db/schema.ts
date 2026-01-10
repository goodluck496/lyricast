import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Общие справочники
export const catalogTypeEnum = pgEnum('catalog_type', ['songs', 'bible', 'program', 'generic']);

export const catalogs = pgTable(
  'catalogs',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull(), // уникальный код/slug
    type: catalogTypeEnum('type').notNull(),
    title: text('title').notNull(),
    version: integer('version').notNull().default(1),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    codeUnique: uniqueIndex('catalogs_code_unique').on(table.code),
  }),
);

export const catalogMeta = pgTable(
  'catalog_meta',
  {
    catalogId: integer('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    metaKey: text('meta_key').notNull(),
    metaValue: text('meta_value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ name: 'catalog_meta_pk', columns: [table.catalogId, table.metaKey] }),
  }),
);

export const datasetMeta = pgTable('dataset_meta', {
  id: integer('id').notNull().primaryKey().$default(() => 1),
  schemaVersion: integer('schema_version').notNull(),
  version: text('version').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Авторизация
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    allowed: boolean('allowed').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
  }),
);

export const devices = pgTable(
  'devices',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAgentHash: text('user_agent_hash').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    isBlocked: boolean('is_blocked').notNull().default(false),
  },
  (table) => ({
    userDeviceUnique: uniqueIndex('devices_user_hash_unique').on(table.userId, table.userAgentHash),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: integer('device_id').references(() => devices.id, { onDelete: 'set null' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex('sessions_token_unique').on(table.token),
  }),
);

// Песенные каталоги
export const songBooks = pgTable(
  'song_books',
  {
    id: serial('id').primaryKey(),
    catalogId: integer('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    fileKey: text('file_key').notNull().unique('song_books_file_key_unique_v3'),
    humanName: text('human_name').notNull(),

    headerNumber: text('header_number').notNull(),
    headerTitle: text('header_title').notNull(),
    headerAuthor: text('header_author').notNull(),
    headerUpdatedAt: timestamp('header_updated_at', { withTimezone: true }).notNull(),
    headerBookKey: text('header_book_key').notNull(),
    headerDisabled: boolean('header_disabled').notNull().default(false),

    version: integer('version').notNull().default(1),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    catalogFileKeyUnique: uniqueIndex('song_books_catalog_file_key_unique').on(
      table.catalogId,
      table.fileKey,
    ),
  }),
);

export const songs = pgTable(
  'songs',
  {
    id: serial('id').primaryKey(),
    songBookId: integer('song_book_id')
      .notNull()
      .references(() => songBooks.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    songKey: text('song_key').notNull().default(''),
    keySignature: text('key_signature').notNull().default(''),
    author: text('author').notNull().default(''),
    ref: text('ref'),
    category: text('category'),
  },
  (table) => ({
    songUnique: uniqueIndex('songs_book_number_unique').on(table.songBookId, table.number),
  }),
);

export const songMeta = pgTable(
  'song_meta',
  {
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    value: text('value').notNull(),
  },
  (table) => ({
    pk: primaryKey({ name: 'song_meta_pk', columns: [table.songId, table.idx] }),
  }),
);

export const lyrics = pgTable(
  'lyrics',
  {
    id: serial('id').primaryKey(),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    uniqId: text('uniq_id').notNull(),
    sectionTitle: text('section_title').notNull(),
    type: text('type').notNull(),
    splitLinesCount: integer('split_lines_count').notNull().default(0),
    sortIndex: integer('sort_index').notNull().default(0),
  },
  (table) => ({
    uniqPerSong: uniqueIndex('lyrics_song_uniq_unique').on(table.songId, table.uniqId),
  }),
);

export const lyricLines = pgTable(
  'lyric_lines',
  {
    id: serial('id').primaryKey(),
    lyricId: integer('lyric_id')
      .notNull()
      .references(() => lyrics.id, { onDelete: 'cascade' }),
    rangeIndex: text('range_index'),
    lineIndex: integer('line_index').notNull(),
    globalSongIndex: integer('global_song_index'),
    text: text('text').notNull(),
    repeatCount: integer('repeat_count').notNull().default(1),
  },
  (table) => ({
    lineUnique: uniqueIndex('lyric_lines_line_unique').on(table.lyricId, table.lineIndex),
  }),
);

export const songBookMeta = pgTable(
  'song_book_meta',
  {
    fileKey: text('file_key')
      .notNull()
      .references(() => songBooks.fileKey, { onDelete: 'cascade' }),
    metaKey: text('meta_key').notNull(),
    metaValue: text('meta_value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ name: 'song_book_meta_pk', columns: [table.fileKey, table.metaKey] }),
  }),
);

// Расширение: программы/библии можно добавить в отдельных файлах, но базовые таблицы для каталогов уже есть.
