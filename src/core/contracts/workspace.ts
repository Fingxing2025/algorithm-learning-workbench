import { z } from 'zod'

const templateIdSchema = z.string().regex(/^[a-f0-9]{64}$/)

export const scanIssueSchema = z
  .object({
    kind: z.enum(['case-conflict', 'depth-limit', 'scan-limit', 'unreadable']),
    message: z.string().min(1).max(240),
    relativePath: z.string().max(4096),
  })
  .strict()

export const scanSummarySchema = z
  .object({
    caseConflictCount: z.number().int().nonnegative(),
    issues: z.array(scanIssueSchema).max(50),
    skippedSymlinkCount: z.number().int().nonnegative(),
    templateCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    unsupportedFileCount: z.number().int().nonnegative(),
  })
  .strict()

export const templateSummarySchema = z
  .object({
    extension: z.string().min(1).max(16),
    fileName: z.string().min(1).max(255),
    id: templateIdSchema,
    language: z.string().min(1).max(32),
    modifiedAt: z.string().datetime(),
    name: z.string().min(1).max(255),
    relativePath: z.string().min(1).max(4096),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict()

export const templatePageRequestSchema = z
  .object({
    cursor: z
      .string()
      .max(8192)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable()
      .default(null),
    limit: z.number().int().min(20).max(500).default(200),
    query: z.string().trim().max(200).default(''),
  })
  .strict()

export const templatePageInfoSchema = z
  .object({
    nextAction: z.string().max(240).nullable(),
    nextCursor: z
      .string()
      .max(8192)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable(),
    processedCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    truncatedReason: z.string().max(500).nullable(),
  })
  .strict()

export const templatePageSchema = templatePageInfoSchema
  .extend({ items: z.array(templateSummarySchema).max(500) })
  .strict()

export const workspaceSnapshotSchema = z
  .object({
    available: z.boolean(),
    id: z.string().uuid(),
    name: z.string().min(1).max(255),
    rootPath: z.string().min(1).max(4096),
    scannedAt: z.string().datetime().nullable(),
    summary: scanSummarySchema,
    templatePage: templatePageInfoSchema,
    templates: z.array(templateSummarySchema).max(500),
  })
  .strict()

export const chooseWorkspaceRequestSchema = z
  .object({
    intent: z.enum(['create', 'open']),
  })
  .strict()

export const templateRequestSchema = z
  .object({
    templateId: templateIdSchema,
  })
  .strict()

export const templateActionRequestSchema = templateRequestSchema
  .extend({
    action: z.enum(['copy-relative-path', 'copy-source', 'reveal']),
  })
  .strict()

export const createTemplateRequestSchema = z
  .object({
    content: z.string().max(2 * 1024 * 1024),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[^/\\\0]+$/),
  })
  .strict()

export const templateSourceSchema = z
  .object({
    content: z.string(),
    id: templateIdSchema,
    language: z.string().min(1).max(32),
    relativePath: z.string().min(1).max(4096),
  })
  .strict()

export const previewTemplateSourceEditRequestSchema = z
  .object({
    content: z.string().max(2 * 1024 * 1024),
    templateId: templateIdSchema,
  })
  .strict()
export type PreviewTemplateSourceEditRequest = z.infer<
  typeof previewTemplateSourceEditRequestSchema
>

export const templateSourceEditDiffSchema = z
  .object({
    after: z.string().max(2 * 1024 * 1024),
    afterEndLine: z.number().int().nonnegative(),
    afterStartLine: z.number().int().positive(),
    before: z.string().max(2 * 1024 * 1024),
    beforeEndLine: z.number().int().nonnegative(),
    beforeStartLine: z.number().int().positive(),
  })
  .strict()
export type TemplateSourceEditDiff = z.infer<typeof templateSourceEditDiffSchema>

export const templateSourceEditPreviewSchema = z
  .object({
    diff: templateSourceEditDiffSchema,
    expiresAt: z.string().datetime(),
    originalSha256: z.string().regex(/^[a-f0-9]{64}$/),
    originalSizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(2 * 1024 * 1024),
    previewId: z.string().uuid(),
    relativePath: z.string().min(1).max(4096),
    templateId: templateIdSchema,
    updatedSizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(2 * 1024 * 1024),
  })
  .strict()
export type TemplateSourceEditPreview = z.infer<typeof templateSourceEditPreviewSchema>

export const applyTemplateSourceEditRequestSchema = z
  .object({ confirmed: z.literal(true), previewId: z.string().uuid() })
  .strict()
export type ApplyTemplateSourceEditRequest = z.infer<typeof applyTemplateSourceEditRequestSchema>

export const applyTemplateSourceEditResultSchema = z
  .object({
    backupCleanupPending: z.boolean(),
    source: templateSourceSchema,
    workspace: workspaceSnapshotSchema,
  })
  .strict()
export type ApplyTemplateSourceEditResult = z.infer<typeof applyTemplateSourceEditResultSchema>

export const createTemplateResultSchema = z
  .object({
    templateId: templateIdSchema,
    workspace: workspaceSnapshotSchema,
  })
  .strict()

export type ChooseWorkspaceRequest = z.infer<typeof chooseWorkspaceRequestSchema>
export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>
export type CreateTemplateResult = z.infer<typeof createTemplateResultSchema>
export type ScanIssue = z.infer<typeof scanIssueSchema>
export type ScanSummary = z.infer<typeof scanSummarySchema>
export type TemplateActionRequest = z.infer<typeof templateActionRequestSchema>
export type TemplatePage = z.infer<typeof templatePageSchema>
export type TemplatePageInfo = z.infer<typeof templatePageInfoSchema>
export type TemplatePageRequest = z.infer<typeof templatePageRequestSchema>
export type TemplateRequest = z.infer<typeof templateRequestSchema>
export type TemplateSource = z.infer<typeof templateSourceSchema>
export type TemplateSummary = z.infer<typeof templateSummarySchema>
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>
