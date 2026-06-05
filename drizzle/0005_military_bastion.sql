CREATE TABLE `resolution_dashboard_ratios` (
	`id` text PRIMARY KEY NOT NULL,
	`dashboard_id` text NOT NULL,
	`ratio_config_id` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`dashboard_id`) REFERENCES `resolution_dashboards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ratio_config_id`) REFERENCES `ratio_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resolution_dashboard_ratios_dashboard_idx` ON `resolution_dashboard_ratios` (`dashboard_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `resolution_dashboard_ratios_pair_idx` ON `resolution_dashboard_ratios` (`dashboard_id`,`ratio_config_id`);--> statement-breakpoint
-- Backfill: attach every existing ratio to every existing dashboard so that
-- dashboards keep showing the same ratio cards they did before this table
-- existed. New attachments are managed per-dashboard from the edit form.
INSERT INTO `resolution_dashboard_ratios` (`id`, `dashboard_id`, `ratio_config_id`, `display_order`)
SELECT lower(hex(randomblob(16))), d.`id`, r.`id`, r.`display_order`
FROM `resolution_dashboards` d CROSS JOIN `ratio_configs` r;