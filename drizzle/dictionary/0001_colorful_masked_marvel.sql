CREATE TABLE "bible_books" (
	"id" serial PRIMARY KEY NOT NULL,
	"bible_id" integer NOT NULL,
	"number" integer NOT NULL,
	"short_title" text NOT NULL,
	"full_title" text NOT NULL,
	"type" text NOT NULL,
	"chapter_count" integer DEFAULT 0 NOT NULL,
	"verse_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bible_chapters" (
	"id" serial PRIMARY KEY NOT NULL,
	"bible_book_id" integer NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"verse_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bible_meta" (
	"file_key" text NOT NULL,
	"meta_key" text NOT NULL,
	"meta_value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bible_meta_pk" PRIMARY KEY("file_key","meta_key")
);
--> statement-breakpoint
CREATE TABLE "bible_verses" (
	"id" serial PRIMARY KEY NOT NULL,
	"bible_chapter_id" integer NOT NULL,
	"number" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bibles" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalog_id" integer NOT NULL,
	"file_key" text NOT NULL,
	"human_name" text NOT NULL,
	"source_title" text NOT NULL,
	"lang" text NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_classic_book_order" boolean DEFAULT false NOT NULL,
	"bible_version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bibles_file_key_unique" UNIQUE("file_key")
);
--> statement-breakpoint
ALTER TABLE "bible_books" ADD CONSTRAINT "bible_books_bible_id_bibles_id_fk" FOREIGN KEY ("bible_id") REFERENCES "public"."bibles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_chapters" ADD CONSTRAINT "bible_chapters_bible_book_id_bible_books_id_fk" FOREIGN KEY ("bible_book_id") REFERENCES "public"."bible_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_meta" ADD CONSTRAINT "bible_meta_file_key_bibles_file_key_fk" FOREIGN KEY ("file_key") REFERENCES "public"."bibles"("file_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_verses" ADD CONSTRAINT "bible_verses_bible_chapter_id_bible_chapters_id_fk" FOREIGN KEY ("bible_chapter_id") REFERENCES "public"."bible_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bibles" ADD CONSTRAINT "bibles_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bible_books_bible_number_unique" ON "bible_books" USING btree ("bible_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "bible_chapters_book_number_unique" ON "bible_chapters" USING btree ("bible_book_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "bible_verses_chapter_number_unique" ON "bible_verses" USING btree ("bible_chapter_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "bibles_catalog_file_key_unique" ON "bibles" USING btree ("catalog_id","file_key");