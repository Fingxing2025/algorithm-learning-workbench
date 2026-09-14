import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const aiProviderProfiles = sqliteTable(
  'ai_provider_profiles',
  {
    baseUrl: text('base_url').notNull(),
    capabilitiesJson: text('capabilities_json').notNull(),
    createdAt: text('created_at').notNull(),
    customHeadersJson: text('custom_headers_json').notNull().default('{}'),
    id: text('id').primaryKey(),
    model: text('model').notNull(),
    name: text('name').notNull(),
    protocol: text('protocol').notNull(),
    secretRef: text('secret_ref'),
    timeoutMs: integer('timeout_ms').notNull().default(30_000),
    updatedAt: text('updated_at').notNull(),
  },
  table => [index('ai_provider_profiles_updated_at_index').on(table.updatedAt)],
)

export const aiTaskRoutes = sqliteTable(
  'ai_task_routes',
  {
    providerId: text('provider_id')
      .notNull()
      .references(() => aiProviderProfiles.id, { onDelete: 'cascade' }),
    task: text('task').primaryKey(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [index('ai_task_routes_provider_id_index').on(table.providerId)],
)

export const workspaces = sqliteTable(
  'workspaces',
  {
    caseConflictCount: integer('case_conflict_count').notNull().default(0),
    createdAt: text('created_at').notNull(),
    id: text('id').primaryKey(),
    issuesJson: text('issues_json').notNull().default('[]'),
    name: text('name').notNull(),
    rootPath: text('root_path').notNull(),
    scanStatsJson: text('scan_stats_json').notNull().default('{}'),
    scanTruncated: integer('scan_truncated', { mode: 'boolean' }).notNull().default(false),
    scannedAt: text('scanned_at'),
    skippedSymlinkCount: integer('skipped_symlink_count').notNull().default(0),
    templateCount: integer('template_count').notNull().default(0),
    unsupportedFileCount: integer('unsupported_file_count').notNull().default(0),
  },
  table => [uniqueIndex('workspaces_root_path_unique').on(table.rootPath)],
)

/**
 * Durable state for a dynamic batch-template import.  The source tree lives
 * in the Main-owned staging directory; these rows intentionally keep only
 * bounded metadata, hashes and redacted errors so a renderer can never use
 * the database as an arbitrary file-system handle.
 */
export const batchTemplateStagingSessions = sqliteTable(
  'batch_template_staging_sessions',
  {
    baseTreeHash: text('base_tree_hash').notNull(),
    baseWorkspaceVersion: text('base_workspace_version').notNull(),
    createdAt: text('created_at').notNull(),
    currentIndex: integer('current_index').notNull().default(0),
    error: text('error'),
    id: text('id').primaryKey(),
    outputLanguage: text('output_language').notNull(),
    processedCount: integer('processed_count').notNull().default(0),
    rootRelativePath: text('root_relative_path').notNull(),
    stagingVersion: integer('staging_version').notNull().default(0),
    status: text('status').notNull().default('processing'),
    totalCount: integer('total_count').notNull(),
    updatedAt: text('updated_at').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
  },
  table => [
    index('batch_template_staging_sessions_workspace_status_index').on(
      table.workspaceId,
      table.status,
      table.updatedAt,
      table.id,
    ),
  ],
)

export const batchTemplateStagingItems = sqliteTable(
  'batch_template_staging_items',
  {
    classificationJson: text('classification_json'),
    displayPath: text('display_path').notNull(),
    error: text('error'),
    fileName: text('file_name').notNull(),
    ordinal: integer('ordinal').notNull(),
    sourceEncoding: text('source_encoding').notNull(),
    sourceHash: text('source_hash').notNull(),
    sourceId: text('source_id').notNull(),
    sourceRelativePath: text('source_relative_path').notNull(),
    stagingId: text('staging_id')
      .notNull()
      .references(() => batchTemplateStagingSessions.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    targetRelativePath: text('target_relative_path'),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    primaryKey({ columns: [table.stagingId, table.sourceId] }),
    uniqueIndex('batch_template_staging_items_staging_ordinal_unique').on(
      table.stagingId,
      table.ordinal,
    ),
    index('batch_template_staging_items_staging_status_ordinal_index').on(
      table.stagingId,
      table.status,
      table.ordinal,
      table.sourceId,
    ),
  ],
)

// Short aliases keep call sites readable while retaining the explicit table
// name used by the migration and backup tooling.
export const batchTemplateStaging = batchTemplateStagingSessions
export const batchTemplateStagingItem = batchTemplateStagingItems

export const templates = sqliteTable(
  'templates',
  {
    available: integer('available', { mode: 'boolean' }).notNull().default(true),
    changeToken: text('change_token'),
    contentHash: text('content_hash'),
    extension: text('extension').notNull(),
    fileName: text('file_name').notNull(),
    id: text('id').primaryKey(),
    fileIdentity: text('file_identity'),
    indexVersion: integer('index_version').notNull().default(0),
    language: text('language').notNull(),
    modifiedAt: text('modified_at').notNull(),
    name: text('name').notNull(),
    normalizedContentHash: text('normalized_content_hash'),
    relativePath: text('relative_path').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    similaritySignatureJson: text('similarity_signature_json'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
  },
  table => [
    uniqueIndex('templates_workspace_path_unique').on(table.workspaceId, table.relativePath),
    index('templates_workspace_id_index').on(table.workspaceId),
    index('templates_workspace_available_path_index').on(
      table.workspaceId,
      table.available,
      table.relativePath,
      table.id,
    ),
    index('templates_workspace_content_hash_index').on(
      table.workspaceId,
      table.available,
      table.contentHash,
    ),
  ],
)

export const templateMetadata = sqliteTable('template_metadata', {
  /** @deprecated Retained for old workspace/backup compatibility; never exposed in new contracts. */
  commonMistakes: text('common_mistakes').notNull().default(''),
  /** @deprecated Retained for old workspace/backup compatibility; never exposed in new contracts. */
  constraints: text('constraints_text').notNull().default(''),
  notes: text('notes').notNull().default(''),
  /** @deprecated Retained for old workspace/backup compatibility; never exposed in new contracts. */
  prerequisites: text('prerequisites').notNull().default(''),
  solves: text('solves').notNull().default(''),
  spaceComplexity: text('space_complexity'),
  tagsJson: text('tags_json').notNull().default('[]'),
  templateId: text('template_id')
    .primaryKey()
    .references(() => templates.id, { onDelete: 'cascade' }),
  timeComplexity: text('time_complexity'),
  updatedAt: text('updated_at').notNull(),
})

export const fileChangePlans = sqliteTable(
  'file_change_plans',
  {
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull(),
    id: text('id').primaryKey(),
    model: text('model').notNull(),
    operationsJson: text('operations_json').notNull(),
    providerName: text('provider_name').notNull(),
    status: text('status').notNull().default('draft'),
    updatedAt: text('updated_at').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
  },
  table => [
    index('file_change_plans_workspace_id_index').on(table.workspaceId),
    index('file_change_plans_workspace_created_index').on(
      table.workspaceId,
      table.archivedAt,
      table.createdAt,
      table.id,
    ),
  ],
)

export const fileChangeExecutions = sqliteTable(
  'file_change_executions',
  {
    backupDirectory: text('backup_directory').notNull(),
    createdAt: text('created_at').notNull(),
    id: text('id').primaryKey(),
    operationsJson: text('operations_json').notNull(),
    planId: text('plan_id')
      .notNull()
      .references(() => fileChangePlans.id, { onDelete: 'cascade' }),
    rolledBackAt: text('rolled_back_at'),
    status: text('status').notNull().default('applied'),
  },
  table => [
    index('file_change_executions_plan_id_index').on(table.planId),
    index('file_change_executions_created_id_index').on(table.createdAt, table.id),
  ],
)

export const problems = sqliteTable(
  'problems',
  {
    aiSummary: text('ai_summary').notNull().default(''),
    analysisJson: text('analysis_json')
      .notNull()
      .default(
        '{"inputDescription":"","outputDescription":"","constraints":[],"examples":[],"algorithmSignals":[],"edgeCases":[]}',
      ),
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
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
  },
  table => [
    index('problems_updated_at_index').on(table.updatedAt),
    index('problems_updated_id_index').on(table.updatedAt, table.id),
    index('problems_workspace_updated_id_index').on(table.workspaceId, table.updatedAt, table.id),
  ],
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
  aiProviderProfiles,
  aiTaskRoutes,
  appState,
  batchTemplateStagingItems,
  batchTemplateStagingSessions,
  fileChangeExecutions,
  fileChangePlans,
  problemImages,
  problems,
  templateProblemRelations,
  templates,
  templateMetadata,
  workspaces,
}
