ALTER TABLE `problems` ADD `ai_summary` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `problems` ADD `analysis_json` text DEFAULT '{"inputDescription":"","outputDescription":"","constraints":[],"examples":[],"algorithmSignals":[],"edgeCases":[]}' NOT NULL;
