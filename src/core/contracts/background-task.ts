import { z } from 'zod'

import { workspaceAuditSchema } from './template-management'
import { workspaceSnapshotSchema } from './workspace'

export const backgroundTaskKindSchema = z.enum([
  'workspace-scan',
  'workspace-audit',
  'batch-operation',
])
export const backgroundTaskStateSchema = z.enum([
  'queued',
  'running',
  'cancelling',
  'completed',
  'cancelled',
  'failed',
])
export const backgroundTaskPhaseSchema = z.enum([
  'queued',
  'preparing',
  'discovering',
  'indexing',
  'publishing',
  'index-check',
  'duplicate-groups',
  'similarity',
  'validating',
  'requesting-ai',
  'processing',
  'backing-up',
  'writing',
  'verifying',
  'restoring',
  'cleaning',
  'finalizing',
])
export const backgroundTaskProgressSchema = z
  .object({
    phase: backgroundTaskPhaseSchema,
    processedCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative().nullable(),
    currentItem: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict()
export const backgroundTaskResultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('workspace-scan'),
      workspace: workspaceSnapshotSchema,
    })
    .strict(),
  z
    .object({
      audit: workspaceAuditSchema,
      kind: z.literal('workspace-audit'),
    })
    .strict(),
])
export const backgroundTaskStatusSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1).max(80),
        message: z.string().min(1).max(500),
      })
      .strict()
      .nullable(),
    finishedAt: z.string().datetime().nullable(),
    id: z.string().uuid(),
    kind: backgroundTaskKindSchema,
    progress: backgroundTaskProgressSchema,
    result: backgroundTaskResultSchema.nullable(),
    startedAt: z.string().datetime(),
    state: backgroundTaskStateSchema,
  })
  .strict()
export const startBackgroundTaskRequestSchema = z.object({ requestId: z.string().uuid() }).strict()
export const backgroundTaskRequestSchema = z.object({ taskId: z.string().uuid() }).strict()

export type BackgroundTaskKind = z.infer<typeof backgroundTaskKindSchema>
export type BackgroundTaskProgress = z.infer<typeof backgroundTaskProgressSchema>
export type BackgroundTaskResult = z.infer<typeof backgroundTaskResultSchema>
export type BackgroundTaskStatus = z.infer<typeof backgroundTaskStatusSchema>
export type StartBackgroundTaskRequest = z.infer<typeof startBackgroundTaskRequestSchema>
export type BackgroundTaskRequest = z.infer<typeof backgroundTaskRequestSchema>
