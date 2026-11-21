CREATE TABLE "user_meta" (
	"user_id" integer NOT NULL,
	"meta_key" text NOT NULL,
	"meta_value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_meta_pk" PRIMARY KEY("user_id","meta_key")
);
--> statement-breakpoint
ALTER TABLE "bibles" ADD COLUMN "owner_email" text;--> statement-breakpoint
ALTER TABLE "catalogs" ADD COLUMN "owner_email" text;--> statement-breakpoint
ALTER TABLE "song_books" ADD COLUMN "owner_email" text;--> statement-breakpoint
ALTER TABLE "user_meta" ADD CONSTRAINT "user_meta_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;