CREATE TYPE "public"."catalog_type" AS ENUM('songs', 'bible', 'program', 'generic');--> statement-breakpoint
CREATE TABLE "catalog_meta" (
	"catalog_id" integer NOT NULL,
	"meta_key" text NOT NULL,
	"meta_value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_meta_pk" PRIMARY KEY("catalog_id","meta_key")
);
--> statement-breakpoint
CREATE TABLE "catalogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" "catalog_type" NOT NULL,
	"title" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_meta" (
	"id" integer PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_agent_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lyric_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"lyric_id" integer NOT NULL,
	"range_index" text,
	"line_index" integer NOT NULL,
	"global_song_index" integer,
	"text" text NOT NULL,
	"repeat_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lyrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"song_id" integer NOT NULL,
	"uniq_id" text NOT NULL,
	"section_title" text NOT NULL,
	"type" text NOT NULL,
	"split_lines_count" integer DEFAULT 0 NOT NULL,
	"sort_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"device_id" integer,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_book_meta" (
	"file_key" text NOT NULL,
	"meta_key" text NOT NULL,
	"meta_value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_book_meta_pk" PRIMARY KEY("file_key","meta_key")
);
--> statement-breakpoint
CREATE TABLE "song_books" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalog_id" integer NOT NULL,
	"file_key" text NOT NULL,
	"human_name" text NOT NULL,
	"header_number" text NOT NULL,
	"header_title" text NOT NULL,
	"header_author" text NOT NULL,
	"header_updated_at" timestamp with time zone NOT NULL,
	"header_book_key" text NOT NULL,
	"header_disabled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_books_file_key_unique_v3" UNIQUE("file_key")
);
--> statement-breakpoint
CREATE TABLE "song_meta" (
	"song_id" integer NOT NULL,
	"idx" integer NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "song_meta_pk" PRIMARY KEY("song_id","idx")
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" serial PRIMARY KEY NOT NULL,
	"song_book_id" integer NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"song_key" text DEFAULT '' NOT NULL,
	"key_signature" text DEFAULT '' NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"ref" text,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"allowed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_meta" ADD CONSTRAINT "catalog_meta_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lyric_lines" ADD CONSTRAINT "lyric_lines_lyric_id_lyrics_id_fk" FOREIGN KEY ("lyric_id") REFERENCES "public"."lyrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lyrics" ADD CONSTRAINT "lyrics_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_book_meta" ADD CONSTRAINT "song_book_meta_file_key_song_books_file_key_fk" FOREIGN KEY ("file_key") REFERENCES "public"."song_books"("file_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_books" ADD CONSTRAINT "song_books_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_meta" ADD CONSTRAINT "song_meta_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_song_book_id_song_books_id_fk" FOREIGN KEY ("song_book_id") REFERENCES "public"."song_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalogs_code_unique" ON "catalogs" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_user_hash_unique" ON "devices" USING btree ("user_id","user_agent_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "lyric_lines_line_unique" ON "lyric_lines" USING btree ("lyric_id","line_index");--> statement-breakpoint
CREATE UNIQUE INDEX "lyrics_song_uniq_unique" ON "lyrics" USING btree ("song_id","uniq_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "song_books_catalog_file_key_unique" ON "song_books" USING btree ("catalog_id","file_key");--> statement-breakpoint
CREATE UNIQUE INDEX "songs_book_number_unique" ON "songs" USING btree ("song_book_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");