CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`original_name` text NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
