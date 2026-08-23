CREATE TABLE `ai_provider_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `protocol` text NOT NULL,
  `base_url` text NOT NULL,
  `model` text NOT NULL,
  `capabilities_json` text NOT NULL,
  `custom_headers_json` text DEFAULT '{}' NOT NULL,
  `timeout_ms` integer DEFAULT 30000 NOT NULL,
  `secret_ref` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_provider_profiles_updated_at_index` ON `ai_provider_profiles` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `ai_task_routes` (
  `task` text PRIMARY KEY NOT NULL,
  `provider_id` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`provider_id`) REFERENCES `ai_provider_profiles` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_task_routes_provider_id_index` ON `ai_task_routes` (`provider_id`);
