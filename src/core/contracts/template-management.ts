import { z } from 'zod'

import { workspaceSnapshotSchema } from './workspace'

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
  .object({ content: z.string().max(2 * 1024 * 1024), fileName: z.string().min(1).max(255) })
  .strict()
export type TemplateImportSource = z.infer<typeof templateImportSourceSchema>

export const templateMetadataLanguageSchema = z.enum(['zh-CN', 'en']).default('zh-CN')
export type TemplateMetadataLanguage = z.infer<typeof templateMetadataLanguageSchema>

export const classifyTemplateRequestSchema = z
  .object({
    content: z
      .string()
      .min(1)
      .max(2 * 1024 * 1024),
    fileName: z.string().max(255),
    outputLanguage: templateMetadataLanguageSchema,
  })
  .strict()
export type ClassifyTemplateRequest = z.infer<typeof classifyTemplateRequestSchema>

export const templateClassificationSchema = z
  .object({
    metadata: templateMetadataFieldsSchema,
    model: z.string().min(1).max(160),
    providerName: z.string().min(1).max(80),
    suggestedRelativePath: relativePathSchema,
  })
  .strict()
export type TemplateClassification = z.infer<typeof templateClassificationSchema>

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

export const workspaceAuditIssueSchema = z
  .object({
    detail: z.string().max(500),
    id: z.string().uuid(),
    kind: z.enum([
      'duplicate-content',
      'empty-file',
      'invalid-name',
      'missing-metadata',
      'stale-relation',
    ]),
    paths: z.array(relativePathSchema).min(1).max(20),
    severity: z.enum(['info', 'warning']),
  })
  .strict()
export const workspaceAuditSchema = z
  .object({
    generatedAt: z.string().datetime(),
    issues: z.array(workspaceAuditIssueSchema).max(500),
    templateCount: z.number().int().nonnegative(),
  })
  .strict()
export type WorkspaceAudit = z.infer<typeof workspaceAuditSchema>

const planOperationBase = {
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
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
    })
    .strict(),
])
export type FileChangeOperation = z.infer<typeof fileChangeOperationSchema>

export const fileChangePlanSchema = z
  .object({
    createdAt: z.string().datetime(),
    id: z.string().uuid(),
    model: z.string().min(1).max(160),
    operations: z.array(fileChangeOperationSchema).max(100),
    providerName: z.string().min(1).max(80),
    status: z.enum(['draft', 'cancelled', 'applied']),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type FileChangePlan = z.infer<typeof fileChangePlanSchema>
export const fileChangePlanListSchema = z.array(fileChangePlanSchema).max(100)

export const fileChangePlanRequestSchema = z.object({ planId: z.string().uuid() }).strict()
export const applyFileChangePlanRequestSchema = fileChangePlanRequestSchema
  .extend({ operationIds: z.array(z.string().uuid()).min(1).max(100) })
  .strict()
export const fileChangeExecutionSchema = z
  .object({
    canRollback: z.boolean(),
    createdAt: z.string().datetime(),
    id: z.string().uuid(),
    operationCount: z.number().int().positive(),
    planId: z.string().uuid(),
    rolledBackAt: z.string().datetime().nullable(),
    status: z.enum(['applied', 'rolled-back']),
  })
  .strict()
export type FileChangeExecution = z.infer<typeof fileChangeExecutionSchema>
export const fileChangeExecutionListSchema = z.array(fileChangeExecutionSchema).max(100)
export const rollbackFileChangeExecutionRequestSchema = z
  .object({ executionId: z.string().uuid() })
  .strict()
export const fileChangeMutationResultSchema = z
  .object({ execution: fileChangeExecutionSchema.nullable(), workspace: workspaceSnapshotSchema })
  .strict()
export type FileChangeMutationResult = z.infer<typeof fileChangeMutationResultSchema>

export const modelTemplateClassificationSchema = z
  .object({
    commonMistakes: z.string().max(10_000).optional(),
    constraints: z.string().max(10_000).optional(),
    prerequisites: z.string().max(10_000).optional(),
    solves: z.string().max(10_000).optional(),
    spaceComplexity: z.string().max(120).nullable().optional(),
    suggestedRelativePath: relativePathSchema,
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

export const modelFileChangePlanSchema = z
  .object({
    operations: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({
            kind: z.literal('move'),
            reason: z.string().max(500),
            targetPath: relativePathSchema,
            templateId: templateIdSchema,
          }),
          z.object({
            kind: z.literal('delete'),
            reason: z.string().max(500),
            templateId: templateIdSchema,
          }),
          z.object({
            kind: z.literal('update-metadata'),
            metadata: modelTemplateMetadataPatchSchema,
            reason: z.string().max(500),
            templateId: templateIdSchema,
          }),
        ]),
      )
      .max(100),
  })
  .strict()
