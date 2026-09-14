-- Durable state for dynamic batch template-import staging sessions.
-- The staging tree itself is managed by Main; SQLite stores only its
-- ownership, immutable base fingerprints, progress and redacted item metadata.
CREATE TABLE `batch_template_staging_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `status` text DEFAULT 'processing' NOT NULL,
  `output_language` text NOT NULL,
  `base_workspace_version` text NOT NULL,
  `base_tree_hash` text NOT NULL,
  `staging_version` integer DEFAULT 0 NOT NULL,
  `total_count` integer NOT NULL,
  `processed_count` integer DEFAULT 0 NOT NULL,
  `current_index` integer DEFAULT 0 NOT NULL,
  `error` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `root_relative_path` text NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`status` IN ('processing', 'failed', 'ready', 'applying', 'applied', 'discarded')),
  CHECK (`output_language` IN ('zh-CN', 'en')),
  CHECK (`staging_version` >= 0),
  CHECK (`total_count` BETWEEN 1 AND 100),
  CHECK (`processed_count` BETWEEN 0 AND `total_count`),
  CHECK (`current_index` BETWEEN 0 AND `total_count`)
);
--> statement-breakpoint
CREATE INDEX `batch_template_staging_sessions_workspace_status_index`
  ON `batch_template_staging_sessions` (`workspace_id`, `status`, `updated_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE TABLE `batch_template_staging_items` (
  `staging_id` text NOT NULL,
  `source_id` text NOT NULL,
  `ordinal` integer NOT NULL,
  `display_path` text NOT NULL,
  `file_name` text NOT NULL,
  `source_encoding` text NOT NULL,
  `source_relative_path` text NOT NULL,
  `target_relative_path` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `classification_json` text,
  `error` text,
  `source_hash` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`staging_id`, `source_id`),
  FOREIGN KEY (`staging_id`) REFERENCES `batch_template_staging_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`ordinal` BETWEEN 0 AND 99),
  CHECK (`source_encoding` IN ('utf-8', 'utf-8-bom', 'utf-16le-bom', 'utf-16be-bom', 'gb18030', 'gbk')),
  CHECK (`status` IN ('pending', 'processing', 'completed', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `batch_template_staging_items_staging_ordinal_unique`
  ON `batch_template_staging_items` (`staging_id`, `ordinal`);
--> statement-breakpoint
CREATE INDEX `batch_template_staging_items_staging_status_ordinal_index`
  ON `batch_template_staging_items` (`staging_id`, `status`, `ordinal`, `source_id`);
