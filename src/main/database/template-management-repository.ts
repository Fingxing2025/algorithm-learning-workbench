import { randomUUID } from 'node:crypto'

import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'

import {
  templateMetadataFieldsSchema,
  type TemplateMetadata,
  type TemplateMetadataFields,
  fileChangeOperationSchema,
  fileChangePlanPayloadSchema,
  fileChangePlanSchema,
  parseStoredFileChangePlanPayload,
  type FileChangeExecution,
  type FileChangeExecutionPage,
  type FileHistoryPageRequest,
  type FileChangeOperationInput,
  type FileChangePlan,
  type FileChangePlanPage,
} from '@core/contracts/template-management'

import type { AppDatabase } from './database'
import { fileChangeExecutions, fileChangePlans, templateMetadata } from './schema'
import { PublicError } from '../errors/public-error'

interface FileHistoryCursor {
  createdAt: string
  id: string
}

export interface FileExecutionDeletionRecord {
  backupDirectory: string
  id: string
  planId: string
  status: 'applied' | 'rolled-back'
}

export interface FileExecutionIntegrityRecord {
  backupDirectory: string
  createdAt: string
  id: string
  operationsJson: string
  planId: string
  status: 'applied'
  workspaceId: string
  workspaceName: string
}

export interface InvalidFileExecutionDatabaseDeletionResult {
  deletedAt: string
  deletedExecutionCount: number
}

export interface FilePlanDeletionRecord {
  executions: FileExecutionDeletionRecord[]
  id: string
  status: 'applied' | 'cancelled'
}

export interface FileHistoryDatabaseDeletionResult {
  deletedAt: string
  deletedExecutionCount: number
  deletedPlanCount: number
}

const HISTORY_DELETION_COMMIT_MARKER_PREFIX = 'file_history_delete_commit:'

function decodeFileHistoryCursor(value: string | null): FileHistoryCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<FileHistoryCursor>
    if (
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        parsed.id,
      ) ||
      typeof parsed.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.createdAt))
    ) {
      throw new Error('invalid cursor')
    }
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    throw new PublicError('INVALID_REQUEST', '历史记录分页位置已失效，请从第一批重新加载。')
  }
}

function encodeFileHistoryCursor(value: FileHistoryCursor): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function parseTags(value: string): string[] {
  try {
    const parsed = templateMetadataFieldsSchema.shape.tags.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

export class TemplateManagementRepository {
  constructor(private readonly database: AppDatabase) {}

  hasDraftPlan(workspaceId: string): boolean {
    return Boolean(
      this.database.orm
        .select({ id: fileChangePlans.id })
        .from(fileChangePlans)
        .where(
          and(eq(fileChangePlans.workspaceId, workspaceId), eq(fileChangePlans.status, 'draft')),
        )
        .limit(1)
        .get(),
    )
  }

  countTemplateRelations(templateId: string): number {
    return this.database.client
      .prepare('SELECT count(*) FROM template_problem_relations WHERE template_id = ?')
      .pluck()
      .get(templateId) as number
  }

  listStaleTemplateRelationPaths(workspaceId: string): string[] {
    return (
      this.database.client
        .prepare(
          `SELECT DISTINCT t.relative_path AS relativePath
           FROM template_problem_relations r
           INNER JOIN templates t ON t.id = r.template_id
           WHERE t.workspace_id = ? AND t.available = 0
           ORDER BY t.relative_path ASC`,
        )
        .all(workspaceId) as Array<{ relativePath: string }>
    ).map(row => row.relativePath)
  }

  inspectFileExecutionsForDeletion(
    workspaceId: string,
    executionIds: string[],
  ): FileExecutionDeletionRecord[] | null {
    if (executionIds.length === 0) return null
    const placeholders = executionIds.map(() => '?').join(', ')
    const records = this.database.client
      .prepare(
        `SELECT e.id, e.plan_id AS planId, e.status, e.backup_directory AS backupDirectory
         FROM file_change_executions e
         INNER JOIN file_change_plans p ON p.id = e.plan_id
         WHERE p.workspace_id = ? AND e.id IN (${placeholders})`,
      )
      .all(workspaceId, ...executionIds) as Array<{
      backupDirectory: string
      id: string
      planId: string
      status: string
    }>
    if (
      records.length !== executionIds.length ||
      records.some(record => record.status !== 'applied' && record.status !== 'rolled-back')
    ) {
      return null
    }
    return records
      .map(record => ({ ...record, status: record.status as 'applied' | 'rolled-back' }))
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  listAppliedFileExecutionIntegrityRecords(workspaceId: string): FileExecutionIntegrityRecord[] {
    return (
      this.database.client
        .prepare(
          `SELECT e.id, e.plan_id AS planId, e.operations_json AS operationsJson,
                  e.backup_directory AS backupDirectory, e.status, e.created_at AS createdAt,
                  p.workspace_id AS workspaceId, w.name AS workspaceName
           FROM file_change_executions e
           INNER JOIN file_change_plans p ON p.id = e.plan_id
           INNER JOIN workspaces w ON w.id = p.workspace_id
           WHERE e.status = 'applied' AND p.workspace_id = ?
           ORDER BY e.created_at DESC, e.id DESC`,
        )
        .all(workspaceId) as FileExecutionIntegrityRecord[]
    ).map(record => ({ ...record, status: 'applied' }))
  }

  inspectAppliedFileExecutionIntegrityRecords(
    workspaceId: string,
    executionIds: string[],
  ): FileExecutionIntegrityRecord[] | null {
    if (executionIds.length === 0 || new Set(executionIds).size !== executionIds.length) return null
    const placeholders = executionIds.map(() => '?').join(', ')
    const records = this.database.client
      .prepare(
        `SELECT e.id, e.plan_id AS planId, e.operations_json AS operationsJson,
                e.backup_directory AS backupDirectory, e.status, e.created_at AS createdAt,
                p.workspace_id AS workspaceId, w.name AS workspaceName
         FROM file_change_executions e
         INNER JOIN file_change_plans p ON p.id = e.plan_id
         INNER JOIN workspaces w ON w.id = p.workspace_id
         WHERE p.workspace_id = ? AND e.id IN (${placeholders})`,
      )
      .all(workspaceId, ...executionIds) as Array<
      Omit<FileExecutionIntegrityRecord, 'status'> & { status: string }
    >
    if (
      records.length !== executionIds.length ||
      records.some(record => record.status !== 'applied')
    ) {
      return null
    }
    return records
      .map(record => ({ ...record, status: 'applied' as const }))
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  deleteInvalidFileExecutions(
    workspaceId: string,
    expected: FileExecutionIntegrityRecord[],
  ): InvalidFileExecutionDatabaseDeletionResult | null {
    if (
      expected.length === 0 ||
      new Set(expected.map(record => record.id)).size !== expected.length
    ) {
      return null
    }
    const transaction = this.database.client.transaction(() => {
      const current = this.inspectAppliedFileExecutionIntegrityRecords(
        workspaceId,
        expected.map(record => record.id),
      )
      const normalizedExpected = [...expected].sort((left, right) =>
        left.id.localeCompare(right.id),
      )
      if (!current || JSON.stringify(current) !== JSON.stringify(normalizedExpected)) return null
      const remove = this.database.client.prepare('DELETE FROM file_change_executions WHERE id = ?')
      for (const record of normalizedExpected) {
        if (remove.run(record.id).changes !== 1) {
          throw new Error('Invalid file execution delete state changed')
        }
      }
      return {
        deletedAt: new Date().toISOString(),
        deletedExecutionCount: normalizedExpected.length,
      }
    })
    return transaction()
  }

  inspectFilePlansForDeletion(
    workspaceId: string,
    planIds: string[],
  ): FilePlanDeletionRecord[] | null {
    if (planIds.length === 0) return null
    const placeholders = planIds.map(() => '?').join(', ')
    const plans = this.database.client
      .prepare(
        `SELECT id, status
         FROM file_change_plans
         WHERE workspace_id = ? AND id IN (${placeholders})`,
      )
      .all(workspaceId, ...planIds) as Array<{
      id: string
      status: string
    }>
    if (
      plans.length !== planIds.length ||
      plans.some(plan => plan.status !== 'applied' && plan.status !== 'cancelled')
    ) {
      return null
    }
    const executions = this.database.client
      .prepare(
        `SELECT e.id, e.plan_id AS planId, e.status, e.backup_directory AS backupDirectory
         FROM file_change_executions e
         WHERE e.plan_id IN (${placeholders})`,
      )
      .all(...planIds) as Array<{
      backupDirectory: string
      id: string
      planId: string
      status: string
    }>
    if (executions.some(record => record.status !== 'applied' && record.status !== 'rolled-back')) {
      return null
    }
    const byPlan = new Map<string, FileExecutionDeletionRecord[]>()
    for (const record of executions) {
      const bucket = byPlan.get(record.planId) ?? []
      bucket.push({ ...record, status: record.status as 'applied' | 'rolled-back' })
      byPlan.set(record.planId, bucket)
    }
    return plans
      .map(plan => ({
        ...plan,
        executions: (byPlan.get(plan.id) ?? []).sort((left, right) =>
          left.id.localeCompare(right.id),
        ),
        status: plan.status as 'applied' | 'cancelled',
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  deleteFileExecutions(
    workspaceId: string,
    expected: FileExecutionDeletionRecord[],
    operationId: string | null,
  ): FileHistoryDatabaseDeletionResult | null {
    const transaction = this.database.client.transaction(() => {
      const current = this.inspectFileExecutionsForDeletion(
        workspaceId,
        expected.map(record => record.id),
      )
      if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return null
      const remove = this.database.client.prepare('DELETE FROM file_change_executions WHERE id = ?')
      for (const record of expected) {
        if (remove.run(record.id).changes !== 1)
          throw new Error('File execution delete state changed')
      }
      const deletedAt = new Date().toISOString()
      if (operationId) this.insertHistoryDeletionCommitMarker(operationId, deletedAt)
      return {
        deletedAt,
        deletedExecutionCount: expected.length,
        deletedPlanCount: 0,
      }
    })
    return transaction()
  }

  deleteFilePlans(
    workspaceId: string,
    expected: FilePlanDeletionRecord[],
    operationId: string | null,
  ): FileHistoryDatabaseDeletionResult | null {
    const transaction = this.database.client.transaction(() => {
      const current = this.inspectFilePlansForDeletion(
        workspaceId,
        expected.map(record => record.id),
      )
      if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return null
      const removeExecution = this.database.client.prepare(
        'DELETE FROM file_change_executions WHERE id = ?',
      )
      const removePlan = this.database.client.prepare('DELETE FROM file_change_plans WHERE id = ?')
      let deletedExecutionCount = 0
      for (const plan of expected) {
        for (const execution of plan.executions) {
          if (removeExecution.run(execution.id).changes !== 1) {
            throw new Error('File plan child execution delete state changed')
          }
          deletedExecutionCount += 1
        }
        if (removePlan.run(plan.id).changes !== 1) throw new Error('File plan delete state changed')
      }
      const deletedAt = new Date().toISOString()
      if (operationId) this.insertHistoryDeletionCommitMarker(operationId, deletedAt)
      return {
        deletedAt,
        deletedExecutionCount,
        deletedPlanCount: expected.length,
      }
    })
    return transaction()
  }

  getMetadata(templateId: string): TemplateMetadata | null {
    const record = this.database.orm
      .select()
      .from(templateMetadata)
      .where(eq(templateMetadata.templateId, templateId))
      .get()
    if (!record) return null
    return {
      notes: record.notes,
      solves: record.solves,
      spaceComplexity: record.spaceComplexity,
      tags: parseTags(record.tagsJson),
      templateId: record.templateId,
      timeComplexity: record.timeComplexity,
      updatedAt: record.updatedAt,
    }
  }

  hasMetadata(templateId: string): boolean {
    return Boolean(
      this.database.orm
        .select({ templateId: templateMetadata.templateId })
        .from(templateMetadata)
        .where(eq(templateMetadata.templateId, templateId))
        .get(),
    )
  }

  listMetadataMap(templateIds: readonly string[]): Map<string, TemplateMetadata> {
    const result = new Map<string, TemplateMetadata>()
    for (let start = 0; start < templateIds.length; start += 500) {
      const ids = templateIds.slice(start, start + 500)
      if (ids.length === 0) continue
      const records = this.database.orm
        .select()
        .from(templateMetadata)
        .where(inArray(templateMetadata.templateId, ids))
        .all()
      for (const record of records) {
        result.set(record.templateId, {
          notes: record.notes,
          solves: record.solves,
          spaceComplexity: record.spaceComplexity,
          tags: parseTags(record.tagsJson),
          templateId: record.templateId,
          timeComplexity: record.timeComplexity,
          updatedAt: record.updatedAt,
        })
      }
    }
    return result
  }

  cancelPlan(planId: string): FileChangePlan | null {
    const plan = this.getPlan(planId)
    if (!plan || plan.status !== 'draft') return null
    this.database.orm
      .update(fileChangePlans)
      .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .where(eq(fileChangePlans.id, planId))
      .run()
    return this.getPlan(planId)
  }

  createPlan(
    workspaceId: string,
    providerName: string,
    model: string,
    operations: FileChangeOperationInput[],
    options?: Partial<
      Pick<FileChangePlan, 'contextVersion' | 'diagnostic' | 'outputLanguage' | 'summary'>
    >,
  ): FileChangePlan {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    const payload = fileChangePlanPayloadSchema.parse({
      contextVersion: options?.contextVersion ?? null,
      diagnostic: options?.diagnostic ?? {
        adaptiveSplitCount: 0,
        auditIssueCount: 0,
        candidateTemplateCount: 0,
        contextTruncated: false,
        effectiveBatchCount: 0,
        initialBatchCount: 0,
        languageFallbackBatchCount: 0,
        notesIncludedCount: 0,
        requestId: null,
        schemaVersion: 2,
      },
      operations: fileChangeOperationSchema.array().max(100).parse(operations),
      outputLanguage: options?.outputLanguage ?? 'zh-CN',
      schemaVersion: 2,
      summary: options?.summary ?? '',
    })
    this.database.orm
      .insert(fileChangePlans)
      .values({
        createdAt: timestamp,
        id,
        model,
        operationsJson: JSON.stringify(payload),
        providerName,
        status: 'draft',
        updatedAt: timestamp,
        workspaceId,
      })
      .run()
    return this.getPlan(id)!
  }

  getPlan(planId: string): FileChangePlan | null {
    const record = this.database.orm
      .select()
      .from(fileChangePlans)
      .where(eq(fileChangePlans.id, planId))
      .get()
    if (!record) return null
    let stored: unknown
    try {
      stored = JSON.parse(record.operationsJson)
    } catch {
      return null
    }
    const payload = parseStoredFileChangePlanPayload(stored)
    if (!payload) return null
    const plan = fileChangePlanSchema.safeParse({
      contextVersion: payload.contextVersion,
      createdAt: record.createdAt,
      diagnostic: payload.diagnostic,
      id: record.id,
      model: record.model,
      operations: payload.operations,
      outputLanguage: payload.outputLanguage,
      providerName: record.providerName,
      status: record.status,
      summary: payload.summary,
      updatedAt: record.updatedAt,
    })
    return plan.success ? plan.data : null
  }

  getPlanWorkspaceId(planId: string): string | null {
    return (
      this.database.orm
        .select({ workspaceId: fileChangePlans.workspaceId })
        .from(fileChangePlans)
        .where(eq(fileChangePlans.id, planId))
        .get()?.workspaceId ?? null
    )
  }

  listPlans(workspaceId: string): FileChangePlan[] {
    return this.database.orm
      .select({ id: fileChangePlans.id })
      .from(fileChangePlans)
      .where(and(eq(fileChangePlans.workspaceId, workspaceId), isNull(fileChangePlans.archivedAt)))
      .orderBy(desc(fileChangePlans.createdAt))
      .limit(100)
      .all()
      .flatMap(record => {
        const plan = this.getPlan(record.id)
        return plan ? [plan] : []
      })
  }

  listPlansPage(workspaceId: string, request: FileHistoryPageRequest): FileChangePlanPage {
    const cursor = decodeFileHistoryCursor(request.cursor)
    const filters = [
      eq(fileChangePlans.workspaceId, workspaceId),
      isNull(fileChangePlans.archivedAt),
    ]
    if (cursor) {
      filters.push(
        or(
          lt(fileChangePlans.createdAt, cursor.createdAt),
          and(eq(fileChangePlans.createdAt, cursor.createdAt), lt(fileChangePlans.id, cursor.id)),
        )!,
      )
    }
    const rows = this.database.orm
      .select({ createdAt: fileChangePlans.createdAt, id: fileChangePlans.id })
      .from(fileChangePlans)
      .where(and(...filters))
      .orderBy(desc(fileChangePlans.createdAt), desc(fileChangePlans.id))
      .limit(request.limit + 1)
      .all()
    const hasMore = rows.length > request.limit
    const pageRows = hasMore ? rows.slice(0, request.limit) : rows
    const items = pageRows.flatMap(record => {
      const plan = this.getPlan(record.id)
      return plan ? [plan] : []
    })
    const totalCount = Number(
      this.database.orm
        .select({ count: sql<number>`count(*)` })
        .from(fileChangePlans)
        .where(
          and(eq(fileChangePlans.workspaceId, workspaceId), isNull(fileChangePlans.archivedAt)),
        )
        .get()?.count ?? 0,
    )
    const draftCount = Number(
      this.database.orm
        .select({ count: sql<number>`count(*)` })
        .from(fileChangePlans)
        .where(
          and(
            eq(fileChangePlans.workspaceId, workspaceId),
            isNull(fileChangePlans.archivedAt),
            eq(fileChangePlans.status, 'draft'),
          ),
        )
        .get()?.count ?? 0,
    )
    return {
      draftCount,
      items,
      nextAction: hasMore ? '继续加载下一批计划记录。' : null,
      nextCursor: hasMore && pageRows.length > 0 ? encodeFileHistoryCursor(pageRows.at(-1)!) : null,
      processedCount: items.length,
      totalCount,
      truncated: hasMore,
      truncatedReason: hasMore ? '计划记录按创建时间分批加载。' : null,
    }
  }

  listExecutions(workspaceId: string): FileChangeExecution[] {
    const records = this.database.client
      .prepare(
        `SELECT e.id, e.plan_id, e.operations_json, e.status, e.created_at, e.rolled_back_at
         FROM file_change_executions e
         INNER JOIN file_change_plans p ON p.id = e.plan_id
         WHERE p.workspace_id = ? ORDER BY e.created_at DESC LIMIT 100`,
      )
      .all(workspaceId) as Array<{
      created_at: string
      id: string
      operations_json: string
      plan_id: string
      rolled_back_at: string | null
      status: string
    }>
    return records.flatMap(record => {
      let operations: unknown[]
      try {
        operations = JSON.parse(record.operations_json) as unknown[]
      } catch {
        return []
      }
      if (record.status !== 'applied' && record.status !== 'rolled-back') return []
      return [
        {
          canRollback: record.status === 'applied',
          createdAt: record.created_at,
          id: record.id,
          operationCount: operations.length,
          planId: record.plan_id,
          rolledBackAt: record.rolled_back_at,
          status: record.status,
        },
      ]
    })
  }

  listExecutionsPage(
    workspaceId: string,
    request: FileHistoryPageRequest,
  ): FileChangeExecutionPage {
    const cursor = decodeFileHistoryCursor(request.cursor)
    const filters = [eq(fileChangePlans.workspaceId, workspaceId)]
    if (cursor) {
      filters.push(
        or(
          lt(fileChangeExecutions.createdAt, cursor.createdAt),
          and(
            eq(fileChangeExecutions.createdAt, cursor.createdAt),
            lt(fileChangeExecutions.id, cursor.id),
          ),
        )!,
      )
    }
    const rows = this.database.orm
      .select({
        createdAt: fileChangeExecutions.createdAt,
        id: fileChangeExecutions.id,
        operationsJson: fileChangeExecutions.operationsJson,
        planId: fileChangeExecutions.planId,
        rolledBackAt: fileChangeExecutions.rolledBackAt,
        status: fileChangeExecutions.status,
      })
      .from(fileChangeExecutions)
      .innerJoin(fileChangePlans, eq(fileChangeExecutions.planId, fileChangePlans.id))
      .where(and(...filters))
      .orderBy(desc(fileChangeExecutions.createdAt), desc(fileChangeExecutions.id))
      .limit(request.limit + 1)
      .all()
    const hasMore = rows.length > request.limit
    const pageRows = hasMore ? rows.slice(0, request.limit) : rows
    const items = pageRows.flatMap(record => {
      let operations: unknown[]
      try {
        operations = JSON.parse(record.operationsJson) as unknown[]
      } catch {
        return []
      }
      if (record.status !== 'applied' && record.status !== 'rolled-back') return []
      return [
        {
          canRollback: record.status === 'applied',
          createdAt: record.createdAt,
          id: record.id,
          operationCount: operations.length,
          planId: record.planId,
          rolledBackAt: record.rolledBackAt,
          status: record.status,
        } satisfies FileChangeExecution,
      ]
    })
    const totalCount = Number(
      this.database.orm
        .select({ count: sql<number>`count(*)` })
        .from(fileChangeExecutions)
        .innerJoin(fileChangePlans, eq(fileChangeExecutions.planId, fileChangePlans.id))
        .where(eq(fileChangePlans.workspaceId, workspaceId))
        .get()?.count ?? 0,
    )
    return {
      items,
      nextAction: hasMore ? '继续加载下一批执行记录。' : null,
      nextCursor: hasMore && pageRows.length > 0 ? encodeFileHistoryCursor(pageRows.at(-1)!) : null,
      processedCount: items.length,
      totalCount,
      truncated: hasMore,
      truncatedReason: hasMore ? '执行记录按创建时间分批加载。' : null,
    }
  }

  getExecutionRecord(executionId: string) {
    return this.database.orm
      .select()
      .from(fileChangeExecutions)
      .where(eq(fileChangeExecutions.id, executionId))
      .get()
  }

  finalizeExecution(args: {
    backupDirectory: string
    executionId: string
    metadataUpdates: Array<{ fields: TemplateMetadataFields; templateId: string }>
    operationsJson: string
    planId: string
    remaps: Array<{ nextId: string; previousId: string }>
  }): void {
    const timestamp = new Date().toISOString()
    this.database.client.transaction(() => {
      for (const remap of args.remaps) this.remapTemplateDataRaw(remap.previousId, remap.nextId)
      for (const update of args.metadataUpdates)
        this.upsertMetadataRaw(update.templateId, update.fields, timestamp)
      this.database.client
        .prepare(
          'INSERT INTO file_change_executions (id, plan_id, operations_json, backup_directory, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          args.executionId,
          args.planId,
          args.operationsJson,
          args.backupDirectory,
          'applied',
          timestamp,
        )
      this.database.client
        .prepare('UPDATE file_change_plans SET status = ?, updated_at = ? WHERE id = ?')
        .run('applied', timestamp, args.planId)
    })()
  }

  finalizeRollback(args: {
    executionId: string
    metadataRestores: Array<{ fields: TemplateMetadataFields | null; templateId: string }>
    remaps: Array<{ nextId: string; previousId: string }>
  }): void {
    const timestamp = new Date().toISOString()
    this.database.client.transaction(() => {
      for (const remap of args.remaps) this.remapTemplateDataRaw(remap.previousId, remap.nextId)
      for (const restore of args.metadataRestores) {
        if (restore.fields) this.upsertMetadataRaw(restore.templateId, restore.fields, timestamp)
        else
          this.database.client
            .prepare('DELETE FROM template_metadata WHERE template_id = ?')
            .run(restore.templateId)
      }
      this.database.client
        .prepare('UPDATE file_change_executions SET status = ?, rolled_back_at = ? WHERE id = ?')
        .run('rolled-back', timestamp, args.executionId)
    })()
  }

  upsertMetadata(templateId: string, fields: TemplateMetadataFields): TemplateMetadata {
    const updatedAt = new Date().toISOString()
    this.database.orm
      .insert(templateMetadata)
      .values({
        notes: fields.notes,
        solves: fields.solves,
        spaceComplexity: fields.spaceComplexity,
        timeComplexity: fields.timeComplexity,
        tagsJson: JSON.stringify(fields.tags),
        templateId,
        updatedAt,
      })
      .onConflictDoUpdate({
        set: {
          notes: fields.notes,
          solves: fields.solves,
          spaceComplexity: fields.spaceComplexity,
          timeComplexity: fields.timeComplexity,
          tagsJson: JSON.stringify(fields.tags),
          updatedAt,
        },
        target: templateMetadata.templateId,
      })
      .run()
    return this.getMetadata(templateId)!
  }

  upsertMetadataBatch(
    updates: Array<{ fields: TemplateMetadataFields; templateId: string }>,
  ): void {
    if (updates.length === 0) return
    const updatedAt = new Date().toISOString()
    this.database.client.transaction(() => {
      for (const update of updates) {
        this.upsertMetadataRaw(update.templateId, update.fields, updatedAt)
      }
    })()
  }

  private remapTemplateDataRaw(previousId: string, nextId: string): void {
    this.database.client
      .prepare(
        `INSERT INTO template_problem_relations
          (problem_id, template_id, relation_type, source, note, created_at, updated_at)
         SELECT problem_id, ?, relation_type, source, note, created_at, updated_at
         FROM template_problem_relations WHERE template_id = ?
         ON CONFLICT(problem_id, template_id) DO UPDATE SET
           relation_type = excluded.relation_type,
           source = excluded.source,
           note = excluded.note,
           updated_at = excluded.updated_at`,
      )
      .run(nextId, previousId)
    this.database.client
      .prepare('DELETE FROM template_problem_relations WHERE template_id = ?')
      .run(previousId)
    const metadata = this.database.client
      .prepare('SELECT * FROM template_metadata WHERE template_id = ?')
      .get(previousId) as Record<string, unknown> | undefined
    if (metadata) {
      this.database.client
        .prepare(
          `INSERT INTO template_metadata
            (template_id, tags_json, time_complexity, space_complexity, solves, constraints_text, prerequisites, common_mistakes, notes, updated_at)
           SELECT ?, tags_json, time_complexity, space_complexity, solves, constraints_text, prerequisites, common_mistakes, notes, updated_at
           FROM template_metadata WHERE template_id = ?
           ON CONFLICT(template_id) DO NOTHING`,
        )
        .run(nextId, previousId)
      this.database.client
        .prepare('DELETE FROM template_metadata WHERE template_id = ?')
        .run(previousId)
    }
  }

  private upsertMetadataRaw(
    templateId: string,
    fields: TemplateMetadataFields,
    updatedAt: string,
  ): void {
    this.database.client
      .prepare(
        `INSERT INTO template_metadata
          (template_id, tags_json, time_complexity, space_complexity, solves, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(template_id) DO UPDATE SET
          tags_json = excluded.tags_json,
          time_complexity = excluded.time_complexity,
          space_complexity = excluded.space_complexity,
          solves = excluded.solves,
          notes = excluded.notes,
          updated_at = excluded.updated_at`,
      )
      .run(
        templateId,
        JSON.stringify(fields.tags),
        fields.timeComplexity,
        fields.spaceComplexity,
        fields.solves,
        fields.notes,
        updatedAt,
      )
  }

  private insertHistoryDeletionCommitMarker(operationId: string, committedAt: string): void {
    this.database.client
      .prepare('INSERT INTO app_state (key, value) VALUES (?, ?)')
      .run(
        `${HISTORY_DELETION_COMMIT_MARKER_PREFIX}${operationId}`,
        JSON.stringify({ committedAt, formatVersion: 'v2', operationId }),
      )
  }
}
