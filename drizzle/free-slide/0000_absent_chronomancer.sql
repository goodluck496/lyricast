CREATE TABLE `presentations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'Презентация' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slides` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Слайд 1' NOT NULL,
	`content` text NOT NULL,
	`index` integer NOT NULL,
	`preview_asset_id` text DEFAULT '' NOT NULL,
	`presentation_id` text NOT NULL,
	FOREIGN KEY (`presentation_id`) REFERENCES `presentations`(`id`) ON UPDATE no action ON DELETE cascade
);
