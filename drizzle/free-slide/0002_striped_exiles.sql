PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_slides` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`index` integer NOT NULL,
	`preview_asset_id` text DEFAULT '' NOT NULL,
	`presentation_id` text NOT NULL,
	FOREIGN KEY (`presentation_id`) REFERENCES `presentations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_slides`("id", "content", "index", "preview_asset_id", "presentation_id") SELECT "id", "content", "index", "preview_asset_id", "presentation_id" FROM `slides`;--> statement-breakpoint
DROP TABLE `slides`;--> statement-breakpoint
ALTER TABLE `__new_slides` RENAME TO `slides`;--> statement-breakpoint
PRAGMA foreign_keys=ON;