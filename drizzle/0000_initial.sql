CREATE TABLE `workspaces` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `root_path` text NOT NULL,
  `created_at` text NOT NULL,
  `scanned_at` text,
  `template_count` integer DEFAULT 0 NOT NULL,
  `unsupported_file_count` integer DEFAULT 0 NOT NULL,
  `skipped_symlink_count` integer DEFAULT 0 NOT NULL,
  `case_conflict_count` integer DEFAULT 0 NOT NULL,
  `scan_truncated` integer DEFAULT false NOT NULL,
  `issues_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_root_path_unique` ON `workspaces` (`root_path`);
--> statement-breakpoint
CREATE TABLE `templates` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `relative_path` text NOT NULL,
  `file_name` text NOT NULL,
  `name` text NOT NULL,
  `extension` text NOT NULL,
  `language` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `modified_at` text NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `templates_workspace_path_unique` ON `templates` (`workspace_id`,`relative_path`);
--> statement-breakpoint
CREATE INDEX `templates_workspace_id_index` ON `templates` (`workspace_id`);
--> statement-breakpoint
CREATE TABLE `app_state` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL
);
