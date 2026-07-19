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
  constructor(
    private readonly database: AppDatabase,
    private readonly archiveFailureAfter: number | null = null,
  ) {}

  archivePlans(
    workspaceId: string,
    planIds: string[],
  ): { archivedAt: string; planIds: string[] } | null {
    const archivedAt = new Date().toISOString()
    const environmentFailureAfter =
      process.env.NODE_ENV === 'test'
        ? Number.parseInt(process.env.E2E_PLAN_ARCHIVE_FAILURE_AFTER ?? '', 10)
        : Number.NaN
    const failureAfter =
      this.archiveFailureAfter ??
      (Number.isInteger(environmentFailureAfter) && environmentFailureAfter > 0
        ? environmentFailureAfter
        : null)
    const placeholders = planIds.map(() => '?').join(', ')
    const transaction = this.database.client.transaction(() => {
      const records = this.database.client
        .prepare(
          `SELECT id, status, archived_at AS archivedAt
           FROM file_change_plans
           WHERE workspace_id = ? AND id IN (${placeholders})`,
        )
        .all(workspaceId, ...planIds) as Array<{
        archivedAt: string | null
        id: string
        status: string
      }>
      if (
        records.length !== planIds.length ||
        records.some(
          record => record.archivedAt || !['applied', 'cancelled'].includes(record.status),
        )
      ) {
        return null
      }
      const archive = this.database.client.prepare(
        'UPDATE file_change_plans SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL',
      )
      for (let index = 0; index < planIds.length; index += 1) {
        const result = archive.run(archivedAt, archivedAt, planIds[index])
        if (result.changes !== 1) throw new Error('File plan archive state changed')
        if (failureAfter !== null && index + 1 === failureAfter) {
          throw new Error('Injected file plan archive failure')
        }
      }
      return { archivedAt, planIds }
    })
    return transaction()
  }

  countTemplateRelations(templateId: string): number {
    return this.database.client
      .prepare('SELECT count(*) FROM template_problem_relations WHERE template_id = ?')
      .pluck()
      .get(templateId) as number
  }

  deleteRolledBackExecutions(
    workspaceId: string,
    executionIds: string[],
  ): { deletedAt: string; deletedExecutionIds: string[] } | null {
    if (executionIds.length === 0) return null
    const deletedAt = new Date().toISOString()
    const placeholders = executionIds.map(() => '?').join(', ')
    const transaction = this.database.client.transaction(() => {
      const records = this.database.client
        .prepare(
          `SELECT e.id, e.status
           FROM file_change_executions e
           INNER JOIN file_change_plans p ON p.id = e.plan_id
           WHERE p.workspace_id = ? AND e.id IN (${placeholders})`,
        )
        .all(workspaceId, ...executionIds) as Array<{ id: string; status: string }>
      if (
        records.length !== executionIds.length ||
        records.some(record => record.status !== 'rolled-back')
      ) {
        return null
      }

      const remove = this.database.client.prepare(
        "DELETE FROM file_change_executions WHERE id = ? AND status = 'rolled-back'",
      )
      for (const executionId of executionIds) {
        const result = remove.run(executionId)
        if (result.changes !== 1) throw new Error('File execution delete state changed')
      }
      return { deletedAt, deletedExecutionIds: executionIds }
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
      commonMistakes: record.commonMistakes,
      constraints: record.constraints,
      notes: record.notes,
      prerequisites: record.prerequisites,
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
          commonMistakes: record.commonMistakes,
          constraints: record.constraints,
          notes: record.notes,
          prerequisites: record.prerequisites,
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
        auditIssueCount: 0,
        candidateTemplateCount: 0,
        contextTruncated: false,
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
        ...fields,
        tagsJson: JSON.stringify(fields.tags),
        templateId,
        updatedAt,
      })
      .onConflictDoUpdate({
        set: {
          ...fields,
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
          (template_id, tags_json, time_complexity, space_complexity, solves, constraints_text, prerequisites, common_mistakes, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(template_id) DO UPDATE SET
          tags_json = excluded.tags_json,
          time_complexity = excluded.time_complexity,
          space_complexity = excluded.space_complexity,
          solves = excluded.solves,
          constraints_text = excluded.constraints_text,
          prerequisites = excluded.prerequisites,
          common_mistakes = excluded.common_mistakes,
          notes = excluded.notes,
          updated_at = excluded.updated_at`,
      )
      .run(
        templateId,
        JSON.stringify(fields.tags),
        fields.timeComplexity,
        fields.spaceComplexity,
        fields.solves,
        fields.constraints,
        fields.prerequisites,
        fields.commonMistakes,
        fields.notes,
        updatedAt,
      )
  }
}
