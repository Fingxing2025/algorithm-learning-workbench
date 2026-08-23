ALTER TABLE `templates` ADD `available` integer DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE `problems` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `platform` text,
  `problem_code` text,
  `url` text,
  `difficulty` text,
  `tags_json` text DEFAULT '[]' NOT NULL,
  `statement` text DEFAULT '' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'unattempted' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `problems_updated_at_index` ON `problems` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `problem_images` (
  `id` text PRIMARY KEY NOT NULL,
  `problem_id` text NOT NULL,
  `relative_path` text NOT NULL,
  `original_name` text NOT NULL,
  `media_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`problem_id`) REFERENCES `problems` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `problem_images_relative_path_unique` ON `problem_images` (`relative_path`);
--> statement-breakpoint
CREATE INDEX `problem_images_problem_id_index` ON `problem_images` (`problem_id`);
--> statement-breakpoint
CREATE TABLE `template_problem_relations` (
  `problem_id` text NOT NULL,
  `template_id` text NOT NULL,
  `relation_type` text NOT NULL,
  `source` text DEFAULT 'manual' NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`problem_id`, `template_id`),
  FOREIGN KEY (`problem_id`) REFERENCES `problems` (`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`template_id`) REFERENCES `templates` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `template_problem_relations_template_id_index` ON `template_problem_relations` (`template_id`);
