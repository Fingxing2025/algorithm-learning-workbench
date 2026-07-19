ALTER TABLE `workspaces` ADD `scan_stats_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `templates` ADD `content_hash` text;
--> statement-breakpoint
ALTER TABLE `templates` ADD `file_identity` text;
--> statement-breakpoint
ALTER TABLE `templates` ADD `change_token` text;
--> statement-breakpoint
ALTER TABLE `templates` ADD `normalized_content_hash` text;
--> statement-breakpoint
ALTER TABLE `templates` ADD `similarity_signature_json` text;
--> statement-breakpoint
ALTER TABLE `templates` ADD `index_version` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `templates_workspace_available_path_index`
  ON `templates` (`workspace_id`, `available`, `relative_path`, `id`);
--> statement-breakpoint
CREATE INDEX `templates_workspace_content_hash_index`
  ON `templates` (`workspace_id`, `available`, `content_hash`);
--> statement-breakpoint
CREATE INDEX `problems_updated_id_index` ON `problems` (`updated_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `file_change_plans_workspace_created_index`
  ON `file_change_plans` (`workspace_id`, `archived_at`, `created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `file_change_executions_created_id_index`
  ON `file_change_executions` (`created_at` DESC, `id` DESC);
