import { randomUUID } from 'node:crypto'

import { desc, eq } from 'drizzle-orm'

import {
  templateMetadataFieldsSchema,
  type TemplateMetadata,
  type TemplateMetadataFields,
  fileChangeOperationSchema,
  fileChangePlanPayloadSchema,
  fileChangePlanSchema,
  parseStoredFileChangePlanPayload,
  type FileChangeExecution,
  type FileChangeOperationInput,
  type FileChangePlan,
} from '@core/contracts/template-management'

import type { AppDatabase } from './database'
import { fileChangeExecutions, fileChangePlans, templateMetadata } from './schema'

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
    options?: Pick<FileChangePlan, 'contextVersion' | 'diagnostic' | 'outputLanguage' | 'summary'>,
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
      .where(eq(fileChangePlans.workspaceId, workspaceId))
      .orderBy(desc(fileChangePlans.createdAt))
      .limit(100)
      .all()
      .flatMap(record => {
        const plan = this.getPlan(record.id)
        return plan ? [plan] : []
      })
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
