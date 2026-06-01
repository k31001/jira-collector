CREATE TABLE `custom_facet_values` (
	`id` text PRIMARY KEY NOT NULL,
	`facet_id` text NOT NULL,
	`name` text NOT NULL,
	`jql` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`facet_id`) REFERENCES `custom_facets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `custom_facet_values_facet_idx` ON `custom_facet_values` (`facet_id`);--> statement-breakpoint
CREATE TABLE `custom_facets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
