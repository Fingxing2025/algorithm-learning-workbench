ALTER TABLE `problems` ADD `workspace_id` text REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade;
--> statement-breakpoint
UPDATE `problems`
SET `workspace_id` = COALESCE(
  (
    SELECT `workspaces`.`id`
    FROM `workspaces`
    INNER JOIN `app_state`
      ON `app_state`.`key` = 'active_workspace_id'
      AND `app_state`.`value` = `workspaces`.`id`
    LIMIT 1
  ),
  (SELECT `id` FROM `workspaces` ORDER BY `created_at`, `id` LIMIT 1)
)
WHERE `workspace_id` IS NULL;
--> statement-breakpoint
CREATE INDEX `problems_workspace_updated_id_index`
  ON `problems` (`workspace_id`, `updated_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE TRIGGER `problems_workspace_required_insert`
BEFORE INSERT ON `problems`
WHEN NEW.`workspace_id` IS NULL
BEGIN
  SELECT RAISE(ABORT, 'problems.workspace_id is required');
END;
--> statement-breakpoint
CREATE TRIGGER `template_problem_relations_same_workspace_insert`
BEFORE INSERT ON `template_problem_relations`
WHEN (
  SELECT `workspace_id` FROM `problems` WHERE `id` = NEW.`problem_id`
) <> (
  SELECT `workspace_id` FROM `templates` WHERE `id` = NEW.`template_id`
)
BEGIN
  SELECT RAISE(ABORT, 'problem and template must belong to the same workspace');
END;
--> statement-breakpoint
CREATE TRIGGER `template_problem_relations_same_workspace_update`
BEFORE UPDATE OF `problem_id`, `template_id` ON `template_problem_relations`
WHEN (
  SELECT `workspace_id` FROM `problems` WHERE `id` = NEW.`problem_id`
) <> (
  SELECT `workspace_id` FROM `templates` WHERE `id` = NEW.`template_id`
)
BEGIN
  SELECT RAISE(ABORT, 'problem and template must belong to the same workspace');
END;
--> statement-breakpoint
CREATE TRIGGER `problems_workspace_required_update`
BEFORE UPDATE OF `workspace_id` ON `problems`
WHEN NEW.`workspace_id` IS NULL
BEGIN
  SELECT RAISE(ABORT, 'problems.workspace_id is required');
END;
