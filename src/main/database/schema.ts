import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const workspaces = sqliteTable(
  'workspaces',
  {
    caseConflictCount: integer('case_conflict_count').notNull().default(0),
    createdAt: text('created_at').notNull(),
    id: text('id').primaryKey(),
    issuesJson: text('issues_json').notNull().default('[]'),
    name: text('name').notNull(),
    rootPath: text('root_path').notNull(),
    scanTruncated: integer('scan_truncated', { mode: 'boolean' }).notNull().default(false),
    scannedAt: text('scanned_at'),
    skippedSymlinkCount: integer('skipped_symlink_count').notNull().default(0),
    templateCount: integer('template_count').notNull().default(0),
    unsupportedFileCount: integer('unsupported_file_count').notNull().default(0),
  },
  table => [uniqueIndex('workspaces_root_path_unique').on(table.rootPath)],
)

export const templates = sqliteTable(
  'templates',
  {
    available: integer('available', { mode: 'boolean' }).notNull().default(true),
    extension: text('extension').notNull(),
    fileName: text('file_name').notNull(),
    id: text('id').primaryKey(),
    language: text('language').notNull(),
    modifiedAt: text('modified_at').notNull(),
    name: text('name').notNull(),
    relativePath: text('relative_path').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
  },
  table => [
    uniqueIndex('templates_workspace_path_unique').on(table.workspaceId, table.relativePath),
    index('templates_workspace_id_index').on(table.workspaceId),
  ],
)

export const problems = sqliteTable(
  'problems',
  {
    createdAt: text('created_at').notNull(),
    difficulty: text('difficulty'),
    id: text('id').primaryKey(),
    notes: text('notes').notNull().default(''),
    platform: text('platform'),
    problemCode: text('problem_code'),
    statement: text('statement').notNull().default(''),
    status: text('status').notNull().default('unattempted'),
    tagsJson: text('tags_json').notNull().default('[]'),
    title: text('title').notNull(),
    updatedAt: text('updated_at').notNull(),
    url: text('url'),
  },
  table => [index('problems_updated_at_index').on(table.updatedAt)],
)

export const problemImages = sqliteTable(
  'problem_images',
  {
    createdAt: text('created_at').notNull(),
    id: text('id').primaryKey(),
    mediaType: text('media_type').notNull(),
    originalName: text('original_name').notNull(),
    problemId: text('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    relativePath: text('relative_path').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
  },
  table => [
    uniqueIndex('problem_images_relative_path_unique').on(table.relativePath),
    index('problem_images_problem_id_index').on(table.problemId),
  ],
)

export const templateProblemRelations = sqliteTable(
  'template_problem_relations',
  {
    createdAt: text('created_at').notNull(),
    note: text('note').notNull().default(''),
    problemId: text('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    relationType: text('relation_type').notNull(),
    source: text('source').notNull().default('manual'),
    templateId: text('template_id')
      .notNull()
      .references(() => templates.id, { onDelete: 'cascade' }),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    primaryKey({ columns: [table.problemId, table.templateId] }),
    index('template_problem_relations_template_id_index').on(table.templateId),
  ],
)

export const appState = sqliteTable('app_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const databaseSchema = {
  appState,
  problemImages,
  problems,
  templateProblemRelations,
  templates,
  workspaces,
}
