-- Durable user classification decisions. Staleness is derived at read time;
-- reads never rewrite this table.
CREATE TABLE `template_classification_confirmations` (
  `template_id` text PRIMARY KEY NOT NULL,
  `category_id` text NOT NULL,
  `category_path_json` text NOT NULL,
  `confirmed_relative_path` text NOT NULL,
  `path_semantics` text NOT NULL,
  `source_hash` text NOT NULL,
  `taxonomy_version` integer NOT NULL,
  `taxonomy_fingerprint` text NOT NULL,
  `classification_fingerprint` text NOT NULL,
  `decision_snapshot_json` text NOT NULL,
  `status` text DEFAULT 'confirmed' NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `confirmed_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`category_id` GLOB '[a-z]*'),
  CHECK (`path_semantics` IN ('canonical', 'manual')),
  CHECK (length(`source_hash`) = 64),
  CHECK (`taxonomy_version` > 0),
  CHECK (length(`taxonomy_fingerprint`) = 64),
  CHECK (length(`classification_fingerprint`) = 64),
  CHECK (`status` IN ('confirmed', 'released')),
  CHECK (`revision` > 0)
);
--> statement-breakpoint
CREATE INDEX `template_classification_confirmations_status_updated_index`
  ON `template_classification_confirmations` (`status`, `updated_at` DESC, `template_id`);
--> statement-breakpoint
CREATE INDEX `template_classification_confirmations_category_index`
  ON `template_classification_confirmations` (`category_id`, `template_id`);
--> statement-breakpoint
-- Migration 0009 is immutable. Per-item review bindings are added here so a
-- Main-enforced review survives restart without coupling validity to the
-- session-wide stagingVersion.
ALTER TABLE `batch_template_staging_items`
  ADD `review_status` text DEFAULT 'pending' NOT NULL
  CHECK (`review_status` IN ('pending', 'confirmed'));
--> statement-breakpoint
ALTER TABLE `batch_template_staging_items` ADD `review_decision_json` text;
--> statement-breakpoint
ALTER TABLE `batch_template_staging_items` ADD `review_source_hash` text;
--> statement-breakpoint
ALTER TABLE `batch_template_staging_items` ADD `review_classification_fingerprint` text;
--> statement-breakpoint
ALTER TABLE `batch_template_staging_items` ADD `review_target_fingerprint` text;
--> statement-breakpoint
ALTER TABLE `batch_template_staging_items` ADD `review_taxonomy_fingerprint` text;
--> statement-breakpoint
ALTER TABLE `batch_template_staging_items`
  ADD `review_revision` integer DEFAULT 0 NOT NULL CHECK (`review_revision` >= 0);
--> statement-breakpoint
ALTER TABLE `batch_template_staging_items` ADD `reviewed_at` text;
