import { z } from 'zod'

import {
  templateSourceEncodingSchema,
  templateSummarySchema,
  workspaceSnapshotSchema,
} from './workspace'
import {
  aiOutputLanguageSchema,
  aiRequestIdSchema,
  aiRequestPreviewSchema,
  workspaceCatalogPreviewSchema,
} from './ai-request'

const templateIdSchema = z.string().regex(/^[a-f0-9]{64}$/)
const relativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine(path => !path.startsWith('/') && !path.startsWith('\\'), '必须使用工作区相对路径。')

export const templateMetadataFieldsSchema = z
  .object({
    commonMistakes: z.string().max(10_000),
    constraints: z.string().max(10_000),
    notes: z.string().max(100_000),
    prerequisites: z.string().max(10_000),
    solves: z.string().max(10_000),
    spaceComplexity: z.string().trim().max(120).nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    timeComplexity: z.string().trim().max(120).nullable(),
  })
  .strict()
export type TemplateMetadataFields = z.infer<typeof templateMetadataFieldsSchema>

export const templateMetadataSchema = templateMetadataFieldsSchema
  .extend({ templateId: templateIdSchema, updatedAt: z.string().datetime() })
  .strict()
export type TemplateMetadata = z.infer<typeof templateMetadataSchema>

export const templateMetadataRequestSchema = z.object({ templateId: templateIdSchema }).strict()
export const updateTemplateMetadataRequestSchema = templateMetadataFieldsSchema
  .extend({ templateId: templateIdSchema })
  .strict()
export type UpdateTemplateMetadataRequest = z.infer<typeof updateTemplateMetadataRequestSchema>

export const templateImportSourceSchema = z
  .object({
    content: z.string().max(2 * 1024 * 1024),
    fileName: z.string().min(1).max(255),
    sourceEncoding: templateSourceEncodingSchema,
  })
  .strict()
export type TemplateImportSource = z.infer<typeof templateImportSourceSchema>

export const batchTemplateImportSourceSchema = templateImportSourceSchema
  .extend({
    content: z
      .string()
      .min(1)
      .max(2 * 1024 * 1024),
    displayPath: relativePathSchema,
    id: z.string().uuid(),
  })
  .strict()
export type BatchTemplateImportSource = z.infer<typeof batchTemplateImportSourceSchema>
export const batchTemplateImportSourceListSchema = z.array(batchTemplateImportSourceSchema).max(100)

export const inspectBatchTemplateImportRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            relativePath: relativePathSchema,
            sourceId: z.string().uuid(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
export type InspectBatchTemplateImportRequest = z.infer<
  typeof inspectBatchTemplateImportRequestSchema
>
export const batchTemplateImportConflictSchema = z
  .object({
    actualRelativePath: relativePathSchema.nullable(),
    canOverwrite: z.boolean(),
    existingFileState: z.string().max(300).nullable(),
    kind: z.enum([
      'batch-duplicate',
      'case-conflict',
      'existing-directory',
      'existing-file',
      'existing-special',
    ]),
    relativePath: relativePathSchema,
    sourceId: z.string().uuid(),
  })
  .strict()
export type BatchTemplateImportConflict = z.infer<typeof batchTemplateImportConflictSchema>
export const inspectBatchTemplateImportResultSchema = z
  .object({ conflicts: z.array(batchTemplateImportConflictSchema).max(200) })
  .strict()
export type InspectBatchTemplateImportResult = z.infer<
  typeof inspectBatchTemplateImportResultSchema
>

export const templateMetadataLanguageSchema = z.enum(['zh-CN', 'en']).default('zh-CN')
export type TemplateMetadataLanguage = z.infer<typeof templateMetadataLanguageSchema>

const templateDraftFileNameSchema = z
  .string()
  .max(255)
  .refine(value => {
    const normalized = value.trim()
    return (
      !normalized || (normalized !== '.' && normalized !== '..' && !/[\\/\0]/u.test(normalized))
    )
  }, '文件名不能包含路径分隔符。')

export const previewTemplateClassificationRequestSchema = z
  .object({
    content: z
      .string()
      .min(1)
      .max(2 * 1024 * 1024),
    fileName: templateDraftFileNameSchema,
    metadata: templateMetadataFieldsSchema,
    outputLanguage: templateMetadataLanguageSchema,
  })
  .strict()
export type PreviewTemplateClassificationRequest = z.infer<
  typeof previewTemplateClassificationRequestSchema
>
export const classifyTemplateRequestSchema = previewTemplateClassificationRequestSchema.extend({
  requestId: aiRequestIdSchema,
})
export type ClassifyTemplateRequest = z.infer<typeof classifyTemplateRequestSchema>
export const previewTemplateClassificationResultSchema = aiRequestPreviewSchema.extend({
  outputLanguage: aiOutputLanguageSchema,
})

export const previewBatchTemplateClassificationRequestSchema = z
  .object({
    outputLanguage: templateMetadataLanguageSchema,
    sources: z.array(batchTemplateImportSourceSchema).min(1).max(100),
  })
  .strict()
export type PreviewBatchTemplateClassificationRequest = z.infer<
  typeof previewBatchTemplateClassificationRequestSchema
>
export const previewBatchTemplateClassificationResultSchema = aiRequestPreviewSchema.extend({
  outputLanguage: aiOutputLanguageSchema,
})

export const templateClassificationSchema = z
  .object({
    alternatives: z
      .array(
        z
          .object({
            confidence: z.number().min(0).max(1),
            reason: z.string().max(1_000),
            targetDirectory: z.string().max(4096),
          })
          .strict(),
      )
      .max(3),
    categoryPath: z.array(z.string().trim().min(1).max(80)).min(2).max(5),
    classificationReason: z.string().max(2_000),
    confidence: z.number().min(0).max(1),
    diagnostic: z
      .object({
        outputTokenBudgets: z.array(z.number().int().positive()).max(20),
        providerCallCount: z.number().int().nonnegative(),
        stageTimings: z
          .array(
            z
              .object({
                elapsedMs: z.number().int().nonnegative(),
                requestCount: z.number().int().positive(),
                stage: z.enum([
                  'initial-generation',
                  'schema-fallback',
                  'structure-repair',
                  'semantic-retry',
                ]),
              })
              .strict(),
          )
          .max(8),
        totalElapsedMs: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    metadata: templateMetadataFieldsSchema,
    model: z.string().min(1).max(160),
    placement: z
      .object({
        existingParentPath: z.string().max(4096),
        mode: z.enum(['existing-directory', 'create-subdirectory', 'create-category-chain']),
        newDirectories: z.array(z.string().trim().min(1).max(80)).max(5),
        reason: z.string().max(2_000),
        targetDirectory: z.string().max(4096),
      })
      .strict(),
    providerName: z.string().min(1).max(80),
    suggestedRelativePath: relativePathSchema,
  })
  .strict()
export type TemplateClassification = z.infer<typeof templateClassificationSchema>

export const completableTemplateMetadataFieldSchema = z.enum([
  'commonMistakes',
  'constraints',
  'prerequisites',
  'solves',
  'spaceComplexity',
  'tags',
  'timeComplexity',
])
export type CompletableTemplateMetadataField = z.infer<
  typeof completableTemplateMetadataFieldSchema
>

const uniqueTemplateIdsSchema = z
  .array(templateIdSchema)
  .min(1)
  .max(20)
  .refine(ids => new Set(ids).size === ids.length, '模板 ID 不能重复。')

export const previewExistingTemplateMetadataCompletionRequestSchema = z
  .object({
    outputLanguage: templateMetadataLanguageSchema,
    templateIds: uniqueTemplateIdsSchema,
  })
  .strict()
export type PreviewExistingTemplateMetadataCompletionRequest = z.infer<
  typeof previewExistingTemplateMetadataCompletionRequestSchema
>
export const existingTemplateMetadataCompletionPreviewSchema = aiRequestPreviewSchema
  .extend({
    expiresAt: z.string().datetime(),
    previewId: z.string().uuid(),
    templateCount: z.number().int().min(1).max(20),
  })
  .strict()
export type ExistingTemplateMetadataCompletionPreview = z.infer<
  typeof existingTemplateMetadataCompletionPreviewSchema
>

export const generateExistingTemplateMetadataCompletionRequestSchema = z
  .object({ previewId: z.string().uuid(), requestId: aiRequestIdSchema })
  .strict()
export type GenerateExistingTemplateMetadataCompletionRequest = z.infer<
  typeof generateExistingTemplateMetadataCompletionRequestSchema
>

export const modelExistingTemplateMetadataCompletionSchema = z
  .object({
    commonMistakes: z.string().max(10_000),
    constraints: z.string().max(10_000),
    prerequisites: z.string().max(10_000),
    solves: z.string().max(10_000),
    spaceComplexity: z.string().trim().max(120).nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    timeComplexity: z.string().trim().max(120).nullable(),
  })
  .strict()

export const existingTemplateMetadataCompletionItemSchema = z
  .object({
    changedFields: z.array(completableTemplateMetadataFieldSchema).max(7),
    previousMetadata: templateMetadataFieldsSchema,
    proposedMetadata: templateMetadataFieldsSchema,
    template: templateSummarySchema,
  })
  .strict()
export type ExistingTemplateMetadataCompletionItem = z.infer<
  typeof existingTemplateMetadataCompletionItemSchema
>
export const existingTemplateMetadataCompletionDraftSchema = z
  .object({
    draftId: z.string().uuid(),
    expiresAt: z.string().datetime(),
    items: z.array(existingTemplateMetadataCompletionItemSchema).min(1).max(20),
    model: z.string().min(1).max(160),
    outputLanguage: templateMetadataLanguageSchema,
    providerName: z.string().min(1).max(80),
  })
  .strict()
export type ExistingTemplateMetadataCompletionDraft = z.infer<
  typeof existingTemplateMetadataCompletionDraftSchema
>

export const applyExistingTemplateMetadataCompletionRequestSchema = z
  .object({
    confirmed: z.literal(true),
    draftId: z.string().uuid(),
    selections: z
      .array(
        z
          .object({
            fields: z
              .array(completableTemplateMetadataFieldSchema)
              .min(1)
              .max(7)
              .refine(fields => new Set(fields).size === fields.length, '补全字段不能重复。'),
            templateId: templateIdSchema,
          })
          .strict(),
      )
      .min(1)
      .max(20)
      .refine(
        selections =>
          new Set(selections.map(selection => selection.templateId)).size === selections.length,
        '补全模板不能重复。',
      ),
  })
  .strict()
export type ApplyExistingTemplateMetadataCompletionRequest = z.infer<
  typeof applyExistingTemplateMetadataCompletionRequestSchema
>
export const applyExistingTemplateMetadataCompletionResultSchema = z
  .object({
    metadata: z.array(templateMetadataSchema).min(1).max(20),
    updatedFieldCount: z.number().int().positive(),
    updatedTemplateCount: z.number().int().positive(),
  })
  .strict()
export type ApplyExistingTemplateMetadataCompletionResult = z.infer<
  typeof applyExistingTemplateMetadataCompletionResultSchema
>

export const importTemplateRequestSchema = z
  .object({
    content: z.string().max(2 * 1024 * 1024),
    metadata: templateMetadataFieldsSchema.nullable(),
    relativePath: relativePathSchema,
  })
  .strict()
export type ImportTemplateRequest = z.infer<typeof importTemplateRequestSchema>

export const importTemplateResultSchema = z
  .object({ templateId: templateIdSchema, workspace: workspaceSnapshotSchema })
  .strict()
export type ImportTemplateResult = z.infer<typeof importTemplateResultSchema>

export const batchImportTemplateRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            content: z
              .string()
              .min(1)
              .max(2 * 1024 * 1024),
            conflictAction: z.enum(['create', 'overwrite']),
            expectedExistingFileState: z.string().max(300).nullable(),
            metadata: templateMetadataFieldsSchema.nullable(),
            relativePath: relativePathSchema,
            sourceId: z.string().uuid(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    requestId: aiRequestIdSchema.optional(),
  })
  .strict()
export type BatchImportTemplateRequest = z.infer<typeof batchImportTemplateRequestSchema>
export const batchImportTemplateResultSchema = z
  .object({
    imported: z
      .array(
        z
          .object({
            relativePath: relativePathSchema,
            sourceId: z.string().uuid(),
            templateId: templateIdSchema,
          })
          .strict(),
      )
      .min(1)
      .max(100),
    workspace: workspaceSnapshotSchema,
  })
  .strict()
export type BatchImportTemplateResult = z.infer<typeof batchImportTemplateResultSchema>

export const workspaceAuditIssueSchema = z
  .object({
    detail: z.string().max(500),
    id: z.string().uuid(),
    kind: z.enum([
      'duplicate-content',
      'similar-content',
      'empty-file',
      'invalid-name',
      'path-inconsistency',
      'missing-metadata',
      'stale-relation',
    ]),
    paths: z.array(relativePathSchema).min(1).max(20),
    pathCount: z.number().int().positive().optional(),
    pathsTruncated: z.boolean().optional(),
    severity: z.enum(['info', 'warning']),
  })
  .strict()
export const workspaceAuditSchema = z
  .object({
    generatedAt: z.string().datetime(),
    issues: z.array(workspaceAuditIssueSchema).max(500),
    nextAction: z.string().max(240).nullable(),
    processedCount: z.number().int().nonnegative(),
    templateCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative().nullable(),
    truncated: z.boolean(),
    truncatedReason: z.string().max(500).nullable(),
  })
  .strict()
export type WorkspaceAudit = z.infer<typeof workspaceAuditSchema>

export const filePlanOperationSourceSchema = z.enum(['ai', 'local-audit', 'manual'])
export const filePlanRiskSchema = z.enum(['low', 'medium', 'high'])
export const filePlanPreconditionSchema = z
  .object({
    metadataUpdatedAt: z.string().datetime().nullable(),
    sourceModifiedAt: z.string().datetime(),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceSizeBytes: z.number().int().nonnegative(),
    targetExpectedAbsent: z.boolean(),
  })
  .strict()

const planOperationBase = {
  alternatives: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
  applicability: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  evidence: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
  id: z.string().uuid(),
  precondition: filePlanPreconditionSchema.nullable().default(null),
  reason: z.string().trim().min(1).max(500),
  risk: filePlanRiskSchema.default('medium'),
  selectedByDefault: z.boolean().default(false),
  source: filePlanOperationSourceSchema.default('ai'),
  sourcePath: relativePathSchema,
  templateId: templateIdSchema,
}
export const fileChangeOperationSchema = z.discriminatedUnion('kind', [
  z
    .object({ ...planOperationBase, kind: z.literal('move'), targetPath: relativePathSchema })
    .strict(),
  z.object({ ...planOperationBase, kind: z.literal('delete') }).strict(),
  z
    .object({
      ...planOperationBase,
      kind: z.literal('update-metadata'),
      metadata: templateMetadataFieldsSchema,
      previousMetadata: templateMetadataFieldsSchema,
    })
    .strict(),
])
export type FileChangeOperation = z.infer<typeof fileChangeOperationSchema>
export type FileChangeOperationInput = z.input<typeof fileChangeOperationSchema>

export const filePlanDiagnosticSchema = z
  .object({
    adaptiveSplitCount: z.number().int().nonnegative().default(0),
    auditIssueCount: z.number().int().nonnegative(),
    candidateTemplateCount: z.number().int().nonnegative(),
    contextTruncated: z.boolean(),
    effectiveBatchCount: z.number().int().nonnegative().default(0),
    inputHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .default(null),
    initialBatchCount: z.number().int().nonnegative().default(0),
    languageFallbackBatchCount: z.number().int().nonnegative().default(0),
    notesIncludedCount: z.number().int().nonnegative(),
    previewId: z.string().uuid().nullable().default(null),
    requestId: z.string().uuid().nullable(),
    schemaVersion: z.literal(2),
    sourceReadFailureCount: z.number().int().nonnegative().default(0),
  })
  .strict()

export const fileChangePlanSchema = z
  .object({
    contextVersion: z.string().max(64).nullable().default(null),
    createdAt: z.string().datetime(),
    diagnostic: filePlanDiagnosticSchema.default({
      adaptiveSplitCount: 0,
      auditIssueCount: 0,
      candidateTemplateCount: 0,
      contextTruncated: false,
      effectiveBatchCount: 0,
      inputHash: null,
      initialBatchCount: 0,
      languageFallbackBatchCount: 0,
      notesIncludedCount: 0,
      previewId: null,
      requestId: null,
      schemaVersion: 2,
      sourceReadFailureCount: 0,
    }),
    id: z.string().uuid(),
    model: z.string().min(1).max(160),
    operations: z.array(fileChangeOperationSchema).max(100),
    outputLanguage: aiOutputLanguageSchema.default('zh-CN'),
    providerName: z.string().min(1).max(80),
    status: z.enum(['draft', 'cancelled', 'applied']),
    summary: z.string().max(4_000).default(''),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type FileChangePlan = z.infer<typeof fileChangePlanSchema>
export const fileChangePlanListSchema = z.array(fileChangePlanSchema).max(100)

export const fileHistoryPageRequestSchema = z
  .object({
    cursor: z
      .string()
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable()
      .default(null),
    limit: z.number().int().min(20).max(100).default(50),
  })
  .strict()
export type FileHistoryPageRequest = z.infer<typeof fileHistoryPageRequestSchema>

const fileHistoryPageInfoSchema = z
  .object({
    nextAction: z.string().max(240).nullable(),
    nextCursor: z
      .string()
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable(),
    processedCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    truncatedReason: z.string().max(500).nullable(),
  })
  .strict()

export const fileChangePlanPageSchema = fileHistoryPageInfoSchema
  .extend({
    draftCount: z.number().int().nonnegative(),
    items: z.array(fileChangePlanSchema).max(100),
  })
  .strict()
export type FileChangePlanPage = z.infer<typeof fileChangePlanPageSchema>

export const fileChangePlanPayloadSchema = z
  .object({
    contextVersion: z.string().max(64).nullable(),
    diagnostic: filePlanDiagnosticSchema,
    operations: z.array(fileChangeOperationSchema).max(100),
    outputLanguage: aiOutputLanguageSchema,
    schemaVersion: z.literal(2),
    summary: z.string().max(4_000),
  })
  .strict()
export type FileChangePlanPayload = z.infer<typeof fileChangePlanPayloadSchema>

export function parseStoredFileChangePlanPayload(stored: unknown): FileChangePlanPayload | null {
  const versionedPayload = fileChangePlanPayloadSchema.safeParse(stored)
  return versionedPayload.success ? versionedPayload.data : null
}

export const previewFilePlanRequestSchema = z
  .object({
    includeNotes: z.boolean().default(false),
    outputLanguage: aiOutputLanguageSchema,
    requestId: aiRequestIdSchema,
  })
  .strict()
export type PreviewFilePlanRequest = z.infer<typeof previewFilePlanRequestSchema>
export const filePlanGenerationRequestSchema = z
  .object({ previewId: z.string().uuid(), requestId: aiRequestIdSchema.optional() })
  .strict()
export type FilePlanGenerationRequest = z.infer<typeof filePlanGenerationRequestSchema>
export const filePlanInputPreviewSchema = z
  .object({
    auditIssueCount: z.number().int().nonnegative(),
    batchCount: z.number().int().positive(),
    candidateMetadataOmitted: z.boolean(),
    candidateSourceOmitted: z.boolean(),
    candidateTemplateCount: z.number().int().nonnegative(),
    detailedCandidateCount: z.number().int().nonnegative(),
    expiresAt: z.string().datetime(),
    inputCharacters: z.number().int().nonnegative(),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    largestBatchInputCharacters: z.number().int().nonnegative(),
    maxCandidatesPerBatch: z.number().int().positive(),
    maxOutputTokensPerBatch: z.number().int().positive(),
    metadataCharacters: z.number().int().nonnegative(),
    notesCharacters: z.number().int().nonnegative(),
    notesIncludedCount: z.number().int().nonnegative(),
    previewId: z.string().uuid(),
    sourceCharacters: z.number().int().nonnegative(),
    sourceReadFailureCount: z.number().int().nonnegative(),
    sourceSnippetCount: z.number().int().nonnegative(),
    totalBatchInputCharacters: z.number().int().nonnegative(),
  })
  .strict()
export type FilePlanInputPreview = z.infer<typeof filePlanInputPreviewSchema>
export const previewFilePlanResultSchema = aiRequestPreviewSchema.extend({
  filePlan: filePlanInputPreviewSchema,
  workspaceCatalog: workspaceCatalogPreviewSchema,
})
export type FilePlanRequestPreview = z.infer<typeof previewFilePlanResultSchema>
export const cancelFilePlanGenerationRequestSchema = z
  .object({ requestId: aiRequestIdSchema })
  .strict()
export const exportFilePlanDiagnosticRequestSchema = z
  .object({ planId: z.string().uuid().nullable() })
  .strict()

export const fileChangePlanRequestSchema = z.object({ planId: z.string().uuid() }).strict()
const uniqueFileHistoryIdsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(100)
  .refine(ids => new Set(ids).size === ids.length, '历史记录 ID 不能重复。')

export const previewDeleteFilePlansRequestSchema = z
  .object({ planIds: uniqueFileHistoryIdsSchema })
  .strict()
export type PreviewDeleteFilePlansRequest = z.infer<typeof previewDeleteFilePlansRequestSchema>

export const deleteFilePlansRequestSchema = z
  .object({
    confirmed: z.literal(true),
    previewId: z.string().uuid(),
    requestId: aiRequestIdSchema.optional(),
  })
  .strict()
export type DeleteFilePlansRequest = z.infer<typeof deleteFilePlansRequestSchema>

export const previewTemplateRelocationRequestSchema = z
  .object({ targetRelativePath: relativePathSchema, templateId: templateIdSchema })
  .strict()
export type PreviewTemplateRelocationRequest = z.infer<
  typeof previewTemplateRelocationRequestSchema
>
export const templateRelocationPreviewSchema = z
  .object({
    affectedMetadata: z.boolean(),
    affectedRelationCount: z.number().int().nonnegative(),
    changeKind: z.enum(['move', 'rename', 'rename-and-move']),
    expiresAt: z.string().datetime(),
    previewId: z.string().uuid(),
    sourceRelativePath: relativePathSchema,
    targetRelativePath: relativePathSchema,
    templateId: templateIdSchema,
  })
  .strict()
export type TemplateRelocationPreview = z.infer<typeof templateRelocationPreviewSchema>
export const applyTemplateRelocationRequestSchema = z
  .object({ confirmed: z.literal(true), previewId: z.string().uuid() })
  .strict()
export type ApplyTemplateRelocationRequest = z.infer<typeof applyTemplateRelocationRequestSchema>
export const applyFileChangePlanRequestSchema = fileChangePlanRequestSchema
  .extend({
    operationIds: z.array(z.string().uuid()).min(1).max(100),
    requestId: aiRequestIdSchema.optional(),
  })
  .strict()
export const fileChangeExecutionSchema = z
  .object({
    canRollback: z.boolean(),
    createdAt: z.string().datetime(),
    id: z.string().uuid(),
    operationCount: z.number().int().positive(),
    planId: z.string().uuid(),
    rollbackIssue: z.enum(['backup-invalid', 'backup-missing']).nullable().optional(),
    rolledBackAt: z.string().datetime().nullable(),
    status: z.enum(['applied', 'rolled-back']),
  })
  .strict()
export type FileChangeExecution = z.infer<typeof fileChangeExecutionSchema>
export const fileChangeExecutionListSchema = z.array(fileChangeExecutionSchema).max(100)
export const fileChangeExecutionPageSchema = fileHistoryPageInfoSchema
  .extend({ items: z.array(fileChangeExecutionSchema).max(100) })
  .strict()
export type FileChangeExecutionPage = z.infer<typeof fileChangeExecutionPageSchema>
export const rollbackFileChangeExecutionRequestSchema = z
  .object({ executionId: z.string().uuid(), requestId: aiRequestIdSchema.optional() })
  .strict()
export const previewDeleteFileExecutionsRequestSchema = z
  .object({ executionIds: uniqueFileHistoryIdsSchema })
  .strict()
export type PreviewDeleteFileExecutionsRequest = z.infer<
  typeof previewDeleteFileExecutionsRequestSchema
>
export const deleteFileExecutionsRequestSchema = z
  .object({
    confirmed: z.literal(true),
    previewId: z.string().uuid(),
    requestId: aiRequestIdSchema.optional(),
  })
  .strict()
export type DeleteFileExecutionsRequest = z.infer<typeof deleteFileExecutionsRequestSchema>

export const fileHistoryDeletionPreviewSchema = z
  .object({
    appliedExecutionCount: z.number().int().nonnegative(),
    appliedPlanCount: z.number().int().nonnegative(),
    backupDirectoryCount: z.number().int().nonnegative(),
    cancelledPlanCount: z.number().int().nonnegative(),
    executionCount: z.number().int().nonnegative(),
    expiresAt: z.string().datetime(),
    kind: z.enum(['executions', 'plans']),
    missingBackupDirectoryCount: z.number().int().nonnegative(),
    planCount: z.number().int().nonnegative(),
    previewId: z.string().uuid(),
    recordIds: z.array(z.string().uuid()).min(1).max(100),
    rolledBackExecutionCount: z.number().int().nonnegative(),
    rolledBackPlanCount: z.number().int().nonnegative(),
  })
  .strict()
export type FileHistoryDeletionPreview = z.infer<typeof fileHistoryDeletionPreviewSchema>

export const fileHistoryDeletionResultSchema = z
  .object({
    cleanupPending: z.boolean(),
    deletedAt: z.string().datetime(),
    deletedBackupDirectoryCount: z.number().int().nonnegative(),
    deletedExecutionCount: z.number().int().nonnegative(),
    deletedPlanCount: z.number().int().nonnegative(),
    kind: z.enum(['executions', 'plans']),
    missingBackupDirectoryCount: z.number().int().nonnegative(),
    recordIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict()
export type FileHistoryDeletionResult = z.infer<typeof fileHistoryDeletionResultSchema>
export const deleteFileExecutionsResultSchema = fileHistoryDeletionResultSchema
export const deleteFilePlansResultSchema = fileHistoryDeletionResultSchema
export type DeleteFileExecutionsResult = FileHistoryDeletionResult
export type DeleteFilePlansResult = FileHistoryDeletionResult

export const invalidFileExecutionReasonSchema = z.enum([
  'backup-missing',
  'backup-reference-invalid',
  'backup-path-symbolic-link',
  'backup-path-not-directory',
  'backup-path-unreadable',
])
export type InvalidFileExecutionReason = z.infer<typeof invalidFileExecutionReasonSchema>

export const invalidFileExecutionItemSchema = z
  .object({
    createdAt: z.string().datetime(),
    deletable: z.boolean(),
    id: z.string().uuid(),
    operationCount: z.number().int().nonnegative().nullable(),
    reason: invalidFileExecutionReasonSchema,
    workspaceId: z.string().uuid(),
    workspaceName: z.string().min(1).max(255),
  })
  .strict()
export type InvalidFileExecutionItem = z.infer<typeof invalidFileExecutionItemSchema>

export const invalidFileExecutionPageRequestSchema = fileHistoryPageRequestSchema
export type InvalidFileExecutionPageRequest = z.infer<typeof invalidFileExecutionPageRequestSchema>
export const invalidFileExecutionPageSchema = fileHistoryPageInfoSchema
  .extend({ items: z.array(invalidFileExecutionItemSchema).max(100) })
  .strict()
export type InvalidFileExecutionPage = z.infer<typeof invalidFileExecutionPageSchema>

export const previewDeleteInvalidFileExecutionsRequestSchema = z
  .object({ executionIds: uniqueFileHistoryIdsSchema })
  .strict()
export type PreviewDeleteInvalidFileExecutionsRequest = z.infer<
  typeof previewDeleteInvalidFileExecutionsRequestSchema
>
export const invalidFileExecutionDeletionPreviewSchema = z
  .object({
    executionCount: z.number().int().positive(),
    expiresAt: z.string().datetime(),
    items: z
      .array(invalidFileExecutionItemSchema)
      .min(1)
      .max(100)
      .refine(
        items => items.every(item => item.deletable && item.reason === 'backup-missing'),
        '删除预览只能包含仍缺少受管备份的可清理记录。',
      ),
    previewId: z.string().uuid(),
    recordIds: z.array(z.string().uuid()).min(1).max(100),
    workspaceCount: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    const itemIds = value.items.map(item => item.id)
    if (
      value.executionCount !== value.items.length ||
      value.recordIds.length !== value.items.length ||
      new Set(value.recordIds).size !== value.recordIds.length ||
      itemIds.some((id, index) => id !== value.recordIds[index]) ||
      value.workspaceCount !== new Set(value.items.map(item => item.workspaceId)).size
    ) {
      context.addIssue({ code: 'custom', message: '失效执行记录预览摘要不一致。' })
    }
  })
export type InvalidFileExecutionDeletionPreview = z.infer<
  typeof invalidFileExecutionDeletionPreviewSchema
>
export const deleteInvalidFileExecutionsRequestSchema = z
  .object({
    confirmed: z.literal(true),
    previewId: z.string().uuid(),
    requestId: aiRequestIdSchema.optional(),
  })
  .strict()
export type DeleteInvalidFileExecutionsRequest = z.infer<
  typeof deleteInvalidFileExecutionsRequestSchema
>
export const deleteInvalidFileExecutionsResultSchema = z
  .object({
    deletedAt: z.string().datetime(),
    deletedExecutionCount: z.number().int().positive(),
    recordIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict()
  .refine(value => value.deletedExecutionCount === value.recordIds.length, {
    message: '失效执行记录删除结果数量不一致。',
  })
export type DeleteInvalidFileExecutionsResult = z.infer<
  typeof deleteInvalidFileExecutionsResultSchema
>
export const fileChangeMutationResultSchema = z
  .object({ execution: fileChangeExecutionSchema.nullable(), workspace: workspaceSnapshotSchema })
  .strict()
export type FileChangeMutationResult = z.infer<typeof fileChangeMutationResultSchema>

export const modelTemplateClassificationSchema = z
  .object({
    alternatives: z
      .array(
        z.object({
          confidence: z.number().min(0).max(1),
          reason: z.string().max(1_000),
          targetDirectory: z.string().max(4096),
        }),
      )
      .max(3)
      .optional(),
    categoryPath: z.array(z.string().trim().min(1).max(80)).min(2).max(5),
    classificationReason: z.string().max(2_000),
    commonMistakes: z.string().max(10_000).optional(),
    confidence: z.number().min(0).max(1),
    constraints: z.string().max(10_000).optional(),
    prerequisites: z.string().max(10_000).optional(),
    solves: z.string().max(10_000).optional(),
    spaceComplexity: z.string().max(120).nullable().optional(),
    fileName: z.string().trim().min(1).max(255),
    placement: z.object({
      existingParentPath: z.string().max(4096),
      mode: z.enum(['existing-directory', 'create-subdirectory', 'create-category-chain']),
      newDirectories: z.array(z.string().trim().min(1).max(80)).max(5),
      reason: z.string().max(2_000),
      targetDirectory: z.string().max(4096),
    }),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    timeComplexity: z.string().max(120).nullable().optional(),
  })
  .strict()

const modelTemplateMetadataPatchSchema = z.object({
  commonMistakes: z.string().max(10_000).optional(),
  constraints: z.string().max(10_000).optional(),
  notes: z.string().max(100_000).optional(),
  prerequisites: z.string().max(10_000).optional(),
  solves: z.string().max(10_000).optional(),
  spaceComplexity: z.string().trim().max(120).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  timeComplexity: z.string().trim().max(120).nullable().optional(),
})

const modelFilePlanSuggestionBase = {
  alternatives: z.array(z.string().trim().min(1).max(500)).max(5),
  applicability: z.array(z.string().trim().min(1).max(500)).max(10),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().trim().min(1).max(500)).max(12),
  reason: z.string().trim().min(1).max(500),
  risk: filePlanRiskSchema,
  templateId: templateIdSchema,
}

export const modelFileChangePlanSchema = z
  .object({
    operations: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({
            ...modelFilePlanSuggestionBase,
            kind: z.literal('move'),
            targetPath: relativePathSchema,
          }),
          z.object({
            ...modelFilePlanSuggestionBase,
            kind: z.literal('delete'),
          }),
          z.object({
            ...modelFilePlanSuggestionBase,
            kind: z.literal('update-metadata'),
            metadata: modelTemplateMetadataPatchSchema,
          }),
        ]),
      )
      .max(100),
    summary: z.string().max(4_000),
  })
  .strict()
