CREATE TABLE `ratio_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`numerator_jql` text NOT NULL,
	`denominator_jql` text DEFAULT '' NOT NULL,
	`basis` text DEFAULT 'created' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `ratio_configs` (`id`, `name`, `numerator_jql`, `denominator_jql`, `basis`, `display_order`)
VALUES ('ratio_default_bug', '버그 유입 비율', 'issuetype = Bug', '', 'created', 0);
