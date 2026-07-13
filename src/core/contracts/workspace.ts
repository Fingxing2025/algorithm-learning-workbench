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

export const workspaceSnapshotSchema = z
  .object({
    available: z.boolean(),
    id: z.string().uuid(),
    name: z.string().min(1).max(255),
    rootPath: z.string().min(1).max(4096),
    scannedAt: z.string().datetime().nullable(),
    summary: scanSummarySchema,
    templates: z.array(templateSummarySchema),
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
export type TemplateSource = z.infer<typeof templateSourceSchema>
export type TemplateSummary = z.infer<typeof templateSummarySchema>
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>
