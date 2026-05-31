CREATE TABLE `resolution_dashboard_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`dashboard_id` text NOT NULL,
	`server_id` text NOT NULL,
	`label` text NOT NULL,
	`jql` text NOT NULL,
	`color` text DEFAULT '#3B82F6' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`dashboard_id`) REFERENCES `resolution_dashboards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `jira_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resolution_dashboard_sources_dashboard_idx` ON `resolution_dashboard_sources` (`dashboard_id`);--> statement-breakpoint
CREATE TABLE `resolution_dashboards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`window_days` integer DEFAULT 90 NOT NULL,
	`time_bucket` text DEFAULT 'week' NOT NULL,
	`histogram_bucket_hours` integer DEFAULT 24 NOT NULL,
	`refresh_interval_sec` integer DEFAULT 600 NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
