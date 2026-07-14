CREATE TABLE `template_metadata` (
  `template_id` text PRIMARY KEY NOT NULL,
  `tags_json` text DEFAULT '[]' NOT NULL,
  `time_complexity` text,
  `space_complexity` text,
  `solves` text DEFAULT '' NOT NULL,
  `constraints_text` text DEFAULT '' NOT NULL,
  `prerequisites` text DEFAULT '' NOT NULL,
  `common_mistakes` text DEFAULT '' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`template_id`) REFERENCES `templates` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `file_change_plans` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `provider_name` text NOT NULL,
  `model` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `operations_json` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `file_change_plans_workspace_id_index` ON `file_change_plans` (`workspace_id`);
--> statement-breakpoint
CREATE TABLE `file_change_executions` (
  `id` text PRIMARY KEY NOT NULL,
  `plan_id` text NOT NULL,
  `operations_json` text NOT NULL,
  `backup_directory` text NOT NULL,
  `status` text DEFAULT 'applied' NOT NULL,
  `created_at` text NOT NULL,
  `rolled_back_at` text,
  FOREIGN KEY (`plan_id`) REFERENCES `file_change_plans` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `file_change_executions_plan_id_index` ON `file_change_executions` (`plan_id`);
