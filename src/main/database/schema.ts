import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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

export const appState = sqliteTable('app_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const databaseSchema = { appState, templates, workspaces }
