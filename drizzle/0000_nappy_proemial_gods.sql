CREATE TABLE `custom_status_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`custom_status_id` text NOT NULL,
	`jira_status_name` text NOT NULL,
	FOREIGN KEY (`custom_status_id`) REFERENCES `custom_statuses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_status_mappings_unique` ON `custom_status_mappings` (`custom_status_id`,`jira_status_name`);--> statement-breakpoint
CREATE TABLE `custom_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#3B82F6' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dashboard_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`dashboard_id` text NOT NULL,
	`server_id` text NOT NULL,
	`source_type` text NOT NULL,
	`jql` text,
	`issue_urls` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `jira_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dashboard_sources_dashboard_idx` ON `dashboard_sources` (`dashboard_id`);--> statement-breakpoint
CREATE TABLE `dashboards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`visible_columns` text DEFAULT '["key","status","summary","latestComment","note"]' NOT NULL,
	`column_order` text DEFAULT '["key","status","summary","latestComment","note"]' NOT NULL,
	`refresh_interval_sec` integer DEFAULT 300 NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issue_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`dashboard_id` text NOT NULL,
	`server_id` text NOT NULL,
	`issue_key` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `jira_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issue_notes_unique` ON `issue_notes` (`dashboard_id`,`server_id`,`issue_key`);--> statement-breakpoint
CREATE TABLE `jira_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`auth_type` text DEFAULT 'pat' NOT NULL,
	`encrypted_credentials` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `status_colors` (
	`status_name` text PRIMARY KEY NOT NULL,
	`color` text NOT NULL
);
