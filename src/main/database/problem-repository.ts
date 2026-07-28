import { randomUUID } from 'node:crypto'

import { and, desc, eq, inArray, like, lt, or, sql } from 'drizzle-orm'

import {
  emptyProblemAnalysisStructure,
  problemAnalysisStructureSchema,
  problemImageSchema,
  problemSchema,
  problemStatusSchema,
  problemTemplateRelationSchema,
  relationSourceSchema,
  relationTypeSchema,
  type CreateProblemRequest,
  type Problem,
  type ProblemPage,
  type ProblemPageRequest,
  type ProblemImage,
  type TemplateProblemPage,
  type TemplateProblemPageRequest,
  type UpdateProblemRequest,
  type UpsertProblemRelationRequest,
} from '@core/contracts/problem'
import type { CommitProblemAnalysisRequest } from '@core/contracts/problem-analysis'

import type { AppDatabase } from './database'
import { problemImages, problems, templateProblemRelations, templates } from './schema'
import { PublicError } from '../errors/public-error'

export type ProblemImageRecord = typeof problemImages.$inferSelect
type ProblemRecord = typeof problems.$inferSelect

interface ProblemCursor {
  id: string
  updatedAt: string
}

export interface NewProblemImage {
  id: string
  mediaType: ProblemImage['mediaType']
  originalName: string
  relativePath: string
  sizeBytes: number
}

export interface TemplateProblemUsage {
  platforms: string[]
  problemCount: number
}

function parseTags(tagsJson: string): string[] {
  try {
    const result = problemSchema.shape.tags.safeParse(JSON.parse(tagsJson))
    return result.success ? result.data : []
  } catch {
    return []
  }
}

function toProblemValues(fields: CreateProblemRequest | UpdateProblemRequest) {
  return {
    aiSummary: fields.aiSummary,
    analysisJson: JSON.stringify(fields.analysis),
    difficulty: fields.difficulty,
    notes: fields.notes,
    platform: fields.platform,
    problemCode: fields.problemCode,
    statement: fields.statement,
    status: fields.status,
    tagsJson: JSON.stringify(fields.tags),
    title: fields.title,
    url: fields.url,
  }
}

function decodeProblemCursor(value: string | null): ProblemCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<ProblemCursor>
    if (
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        parsed.id,
      ) ||
      typeof parsed.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.updatedAt))
    ) {
      throw new Error('invalid cursor')
    }
    return { id: parsed.id, updatedAt: parsed.updatedAt }
  } catch {
    throw new PublicError('INVALID_REQUEST', '题目分页位置已失效，请从第一批重新加载。')
  }
}

function encodeProblemCursor(record: Pick<ProblemRecord, 'id' | 'updatedAt'>): string {
  return Buffer.from(JSON.stringify({ id: record.id, updatedAt: record.updatedAt })).toString(
    'base64url',
  )
}

export class ProblemRepository {
  constructor(private readonly database: AppDatabase) {}

  addImages(workspaceId: string, problemId: string, imageRows: NewProblemImage[]): void {
    const createdAt = new Date().toISOString()
    this.database.orm.transaction(transaction => {
      const owned = transaction
        .select({ id: problems.id })
        .from(problems)
        .where(and(eq(problems.id, problemId), eq(problems.workspaceId, workspaceId)))
        .get()
      if (!owned) {
        throw new PublicError('PROBLEM_NOT_FOUND', '题目卡片不存在或已经被移除。')
      }
      transaction
        .insert(problemImages)
        .values(imageRows.map(image => ({ ...image, createdAt, problemId })))
        .run()
      transaction
        .update(problems)
        .set({ updatedAt: createdAt })
        .where(and(eq(problems.id, problemId), eq(problems.workspaceId, workspaceId)))
        .run()
    })
  }

  countImages(workspaceId: string, problemId: string): number {
    return this.database.orm
      .select({ id: problemImages.id })
      .from(problemImages)
      .innerJoin(problems, eq(problemImages.problemId, problems.id))
      .where(and(eq(problemImages.problemId, problemId), eq(problems.workspaceId, workspaceId)))
      .all().length
  }

  createProblem(workspaceId: string, fields: CreateProblemRequest): Problem {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    this.database.orm
      .insert(problems)
      .values({
        ...toProblemValues(fields),
        createdAt: timestamp,
        id,
        updatedAt: timestamp,
        workspaceId,
      })
      .run()
    return this.requireProblem(workspaceId, id)
  }

  deleteProblem(workspaceId: string, problemId: string): boolean {
    return this.database.orm.transaction(transaction => {
      const owned = transaction
        .select({ id: problems.id })
        .from(problems)
        .where(and(eq(problems.id, problemId), eq(problems.workspaceId, workspaceId)))
        .get()
      if (!owned) return false
      transaction
        .delete(templateProblemRelations)
        .where(eq(templateProblemRelations.problemId, problemId))
        .run()
      transaction.delete(problemImages).where(eq(problemImages.problemId, problemId)).run()
      return (
        transaction
          .delete(problems)
          .where(and(eq(problems.id, problemId), eq(problems.workspaceId, workspaceId)))
          .run().changes > 0
      )
    })
  }

  createAnalyzedProblem(
    workspaceId: string,
    id: string,
    fields: CreateProblemRequest,
    imageRows: NewProblemImage[],
    relations: CommitProblemAnalysisRequest['relations'],
  ): Problem {
    const timestamp = new Date().toISOString()
    this.database.orm.transaction(transaction => {
      if (relations.length > 0) {
        const requestedTemplateIds = [...new Set(relations.map(relation => relation.templateId))]
        const availableTemplateIds = transaction
          .select({ id: templates.id })
          .from(templates)
          .where(
            and(
              inArray(templates.id, requestedTemplateIds),
              eq(templates.workspaceId, workspaceId),
              eq(templates.available, true),
            ),
          )
          .all()
        if (availableTemplateIds.length !== requestedTemplateIds.length) {
          throw new PublicError('TEMPLATE_NOT_FOUND', '候选模板已不可用，请重新分析或取消该关联。')
        }
      }
      transaction
        .insert(problems)
        .values({
          ...toProblemValues(fields),
          createdAt: timestamp,
          id,
          updatedAt: timestamp,
          workspaceId,
        })
        .run()
      if (imageRows.length > 0) {
        transaction
          .insert(problemImages)
          .values(imageRows.map(image => ({ ...image, createdAt: timestamp, problemId: id })))
          .run()
      }
      if (relations.length > 0) {
        transaction
          .insert(templateProblemRelations)
          .values(
            relations.map(relation => ({
              createdAt: timestamp,
              note: relation.note,
              problemId: id,
              relationType: relation.relationType,
              source: 'ai',
              templateId: relation.templateId,
              updatedAt: timestamp,
            })),
          )
          .run()
      }
    })
    return this.requireProblem(workspaceId, id)
  }

  getImage(
    workspaceId: string,
    imageId: string,
    problemId?: string,
  ): ProblemImageRecord | undefined {
    const condition = problemId
      ? and(eq(problemImages.id, imageId), eq(problemImages.problemId, problemId))
      : eq(problemImages.id, imageId)
    return this.database.orm
      .select({ image: problemImages })
      .from(problemImages)
      .innerJoin(problems, eq(problemImages.problemId, problems.id))
      .where(and(condition, eq(problems.workspaceId, workspaceId)))
      .get()?.image
  }

  getProblem(workspaceId: string, problemId: string): Problem | undefined {
    const row = this.database.orm
      .select()
      .from(problems)
      .where(and(eq(problems.id, problemId), eq(problems.workspaceId, workspaceId)))
      .get()
    return row ? this.hydrateProblems(workspaceId, [row])[0] : undefined
  }

  isTemplateAvailable(workspaceId: string, templateId: string): boolean {
    return Boolean(
      this.database.orm
        .select({ id: templates.id })
        .from(templates)
        .where(
          and(
            eq(templates.id, templateId),
            eq(templates.workspaceId, workspaceId),
            eq(templates.available, true),
          ),
        )
        .get(),
    )
  }

  listProblems(workspaceId: string): Problem[] {
    const problemRows = this.database.orm
      .select()
      .from(problems)
      .where(eq(problems.workspaceId, workspaceId))
      .orderBy(desc(problems.updatedAt))
      .all()
    return this.hydrateProblems(workspaceId, problemRows)
  }

  listTemplateUsage(workspaceId: string): Map<string, TemplateProblemUsage> {
    const rows = this.database.orm
      .select({
        count: sql<number>`count(*)`,
        platform: problems.platform,
        templateId: templateProblemRelations.templateId,
      })
      .from(templateProblemRelations)
      .innerJoin(problems, eq(templateProblemRelations.problemId, problems.id))
      .innerJoin(templates, eq(templateProblemRelations.templateId, templates.id))
      .where(and(eq(templates.workspaceId, workspaceId), eq(problems.workspaceId, workspaceId)))
      .groupBy(templateProblemRelations.templateId, problems.platform)
      .all()
    const usage = new Map<string, { platforms: Set<string>; problemCount: number }>()
    for (const row of rows) {
      const current = usage.get(row.templateId) ?? {
        platforms: new Set<string>(),
        problemCount: 0,
      }
      current.problemCount += Number(row.count)
      if (row.platform) current.platforms.add(row.platform)
      usage.set(row.templateId, current)
    }
    return new Map(
      [...usage].map(([templateId, value]) => [
        templateId,
        { platforms: [...value.platforms].sort(), problemCount: value.problemCount },
      ]),
    )
  }

  listProblemsByTemplate(
    workspaceId: string,
    request: TemplateProblemPageRequest,
  ): TemplateProblemPage {
    const cursor = decodeProblemCursor(request.cursor)
    const conditions = [
      eq(templateProblemRelations.templateId, request.templateId),
      eq(templates.workspaceId, workspaceId),
      eq(problems.workspaceId, workspaceId),
    ]
    if (cursor) {
      conditions.push(
        or(
          lt(problems.updatedAt, cursor.updatedAt),
          and(eq(problems.updatedAt, cursor.updatedAt), lt(problems.id, cursor.id)),
        )!,
      )
    }
    const rows = this.database.orm
      .select({
        id: problems.id,
        relationType: templateProblemRelations.relationType,
        title: problems.title,
        updatedAt: problems.updatedAt,
      })
      .from(templateProblemRelations)
      .innerJoin(problems, eq(templateProblemRelations.problemId, problems.id))
      .innerJoin(templates, eq(templateProblemRelations.templateId, templates.id))
      .where(and(...conditions))
      .orderBy(desc(problems.updatedAt), desc(problems.id))
      .limit(request.limit + 1)
      .all()
    const hasMore = rows.length > request.limit
    const pageRows = hasMore ? rows.slice(0, request.limit) : rows
    const totalCount = Number(
      this.database.orm
        .select({ count: sql<number>`count(*)` })
        .from(templateProblemRelations)
        .innerJoin(problems, eq(templateProblemRelations.problemId, problems.id))
        .innerJoin(templates, eq(templateProblemRelations.templateId, templates.id))
        .where(
          and(
            eq(templateProblemRelations.templateId, request.templateId),
            eq(templates.workspaceId, workspaceId),
            eq(problems.workspaceId, workspaceId),
          ),
        )
        .get()?.count ?? 0,
    )
    return {
      items: pageRows.map(row => ({
        id: row.id,
        relationType: relationTypeSchema.parse(row.relationType),
        title: row.title,
        updatedAt: row.updatedAt,
      })),
      nextAction: hasMore ? '继续加载下一批关联题目。' : null,
      nextCursor: hasMore && pageRows.length > 0 ? encodeProblemCursor(pageRows.at(-1)!) : null,
      processedCount: pageRows.length,
      totalCount,
      truncated: hasMore,
      truncatedReason: hasMore ? '关联题目按最近修改时间分批加载。' : null,
    }
  }

  listProblemsPage(workspaceId: string, request: ProblemPageRequest): ProblemPage {
    const cursor = decodeProblemCursor(request.cursor)
    const conditions = [eq(problems.workspaceId, workspaceId)]
    if (cursor) {
      conditions.push(
        or(
          lt(problems.updatedAt, cursor.updatedAt),
          and(eq(problems.updatedAt, cursor.updatedAt), lt(problems.id, cursor.id)),
        )!,
      )
    }
    if (request.query) {
      const pattern = `%${request.query}%`
      conditions.push(
        or(
          like(problems.title, pattern),
          like(problems.platform, pattern),
          like(problems.problemCode, pattern),
          like(problems.difficulty, pattern),
          like(problems.tagsJson, pattern),
        )!,
      )
    }
    const condition = and(...conditions)
    const rows = this.database.orm
      .select()
      .from(problems)
      .where(condition)
      .orderBy(desc(problems.updatedAt), desc(problems.id))
      .limit(request.limit + 1)
      .all()
    const hasMore = rows.length > request.limit
    const pageRows = hasMore ? rows.slice(0, request.limit) : rows
    const matchedCount = Number(
      this.database.orm
        .select({ count: sql<number>`count(*)` })
        .from(problems)
        .where(
          and(
            eq(problems.workspaceId, workspaceId),
            request.query
              ? or(
                  like(problems.title, `%${request.query}%`),
                  like(problems.platform, `%${request.query}%`),
                  like(problems.problemCode, `%${request.query}%`),
                  like(problems.difficulty, `%${request.query}%`),
                  like(problems.tagsJson, `%${request.query}%`),
                )
              : undefined,
          ),
        )
        .get()?.count ?? 0,
    )
    const totalCount = Number(
      this.database.orm
        .select({ count: sql<number>`count(*)` })
        .from(problems)
        .where(eq(problems.workspaceId, workspaceId))
        .get()?.count ?? 0,
    )
    const totalRelationCount = Number(
      this.database.orm
        .select({ count: sql<number>`count(*)` })
        .from(templateProblemRelations)
        .innerJoin(problems, eq(templateProblemRelations.problemId, problems.id))
        .where(eq(problems.workspaceId, workspaceId))
        .get()?.count ?? 0,
    )
    return {
      items: this.hydrateProblems(workspaceId, pageRows),
      matchedCount,
      nextAction: hasMore ? '继续加载下一批题目。' : null,
      nextCursor: hasMore && pageRows.length > 0 ? encodeProblemCursor(pageRows.at(-1)!) : null,
      processedCount: pageRows.length,
      totalCount,
      totalRelationCount,
      truncated: hasMore,
      truncatedReason: hasMore ? '结果按最近修改时间分批加载，当前只显示已加载部分。' : null,
    }
  }

  private hydrateProblems(workspaceId: string, problemRows: ProblemRecord[]): Problem[] {
    if (problemRows.length === 0) return []
    const imageRows: Array<typeof problemImages.$inferSelect> = []
    const relationRows: Array<{
      available: boolean
      createdAt: string
      language: string
      note: string
      problemId: string
      relationType: string
      source: string
      templateId: string
      templateName: string
      templatePath: string
      updatedAt: string
    }> = []
    for (let start = 0; start < problemRows.length; start += 500) {
      const ids = problemRows.slice(start, start + 500).map(row => row.id)
      imageRows.push(
        ...this.database.orm
          .select()
          .from(problemImages)
          .where(inArray(problemImages.problemId, ids))
          .all(),
      )
      relationRows.push(
        ...this.database.orm
          .select({
            available: templates.available,
            createdAt: templateProblemRelations.createdAt,
            language: templates.language,
            note: templateProblemRelations.note,
            problemId: templateProblemRelations.problemId,
            relationType: templateProblemRelations.relationType,
            source: templateProblemRelations.source,
            templateId: templates.id,
            templateName: templates.name,
            templatePath: templates.relativePath,
            updatedAt: templateProblemRelations.updatedAt,
          })
          .from(templateProblemRelations)
          .innerJoin(templates, eq(templateProblemRelations.templateId, templates.id))
          .where(
            and(
              inArray(templateProblemRelations.problemId, ids),
              eq(templates.workspaceId, workspaceId),
            ),
          )
          .all(),
      )
    }
    const imagesByProblem = new Map<string, typeof imageRows>()
    for (const image of imageRows) {
      const values = imagesByProblem.get(image.problemId) ?? []
      values.push(image)
      imagesByProblem.set(image.problemId, values)
    }
    const relationsByProblem = new Map<string, typeof relationRows>()
    for (const relation of relationRows) {
      const values = relationsByProblem.get(relation.problemId) ?? []
      values.push(relation)
      relationsByProblem.set(relation.problemId, values)
    }

    return problemRows.map(row => {
      let analysis: unknown
      try {
        analysis = JSON.parse(row.analysisJson)
      } catch {
        analysis = emptyProblemAnalysisStructure
      }
      const parsedAnalysis = problemAnalysisStructureSchema.safeParse(analysis)
      const parsedStatus = problemStatusSchema.safeParse(row.status)
      const imagesForProblem = (imagesByProblem.get(row.id) ?? []).flatMap(image => {
        const parsed = problemImageSchema.safeParse({
          createdAt: image.createdAt,
          id: image.id,
          mediaType: image.mediaType,
          originalName: image.originalName,
          sizeBytes: image.sizeBytes,
        })
        return parsed.success ? [parsed.data] : []
      })
      const relationsForProblem = (relationsByProblem.get(row.id) ?? []).flatMap(relation => {
        const relationType = relationTypeSchema.safeParse(relation.relationType)
        const source = relationSourceSchema.safeParse(relation.source)
        if (!relationType.success || !source.success) {
          return []
        }
        const parsed = problemTemplateRelationSchema.safeParse({
          available: relation.available,
          createdAt: relation.createdAt,
          language: relation.language,
          note: relation.note,
          relationType: relationType.data,
          source: source.data,
          templateId: relation.templateId,
          templateName: relation.templateName,
          templatePath: relation.templatePath,
          updatedAt: relation.updatedAt,
        })
        return parsed.success ? [parsed.data] : []
      })

      return problemSchema.parse({
        aiSummary: row.aiSummary,
        analysis: parsedAnalysis.success ? parsedAnalysis.data : emptyProblemAnalysisStructure,
        createdAt: row.createdAt,
        difficulty: row.difficulty,
        id: row.id,
        images: imagesForProblem,
        notes: row.notes,
        platform: row.platform,
        problemCode: row.problemCode,
        relations: relationsForProblem,
        statement: row.statement,
        status: parsedStatus.success ? parsedStatus.data : 'unattempted',
        tags: parseTags(row.tagsJson),
        title: row.title,
        updatedAt: row.updatedAt,
        url: row.url,
      })
    })
  }

  problemExists(workspaceId: string, problemId: string): boolean {
    return Boolean(
      this.database.orm
        .select({ id: problems.id })
        .from(problems)
        .where(and(eq(problems.id, problemId), eq(problems.workspaceId, workspaceId)))
        .get(),
    )
  }

  removeImage(workspaceId: string, imageId: string, problemId: string): boolean {
    const updatedAt = new Date().toISOString()
    const result = this.database.orm.transaction(transaction => {
      const owned = transaction
        .select({ id: problems.id })
        .from(problems)
        .where(and(eq(problems.id, problemId), eq(problems.workspaceId, workspaceId)))
        .get()
      if (!owned) return { changes: 0 }
      const deletion = transaction
        .delete(problemImages)
        .where(and(eq(problemImages.id, imageId), eq(problemImages.problemId, problemId)))
        .run()
      if (deletion.changes > 0) {
        transaction
          .update(problems)
          .set({ updatedAt })
          .where(and(eq(problems.id, problemId), eq(problems.workspaceId, workspaceId)))
          .run()
      }
      return deletion
    })
    return result.changes > 0
  }

  removeRelation(workspaceId: string, problemId: string, templateId: string): boolean {
    const timestamp = new Date().toISOString()
    const result = this.database.orm.transaction(transaction => {
      const ownedProblem = transaction
        .select({ id: problems.id })
        .from(problems)
        .where(and(eq(problems.id, problemId), eq(problems.workspaceId, workspaceId)))
        .get()
      const ownedTemplate = transaction
        .select({ id: templates.id })
        .from(templates)
        .where(and(eq(templates.id, templateId), eq(templates.workspaceId, workspaceId)))
        .get()
      if (!ownedProblem || !ownedTemplate) return { changes: 0 }
      const deletion = transaction
        .delete(templateProblemRelations)
        .where(
          and(
            eq(templateProblemRelations.problemId, problemId),
            eq(templateProblemRelations.templateId, templateId),
          ),
        )
        .run()
      if (deletion.changes > 0) {
        transaction
          .update(problems)
          .set({ updatedAt: timestamp })
          .where(and(eq(problems.id, problemId), eq(problems.workspaceId, workspaceId)))
          .run()
      }
      return deletion
    })
    return result.changes > 0
  }

  requireProblem(workspaceId: string, problemId: string): Problem {
    const problem = this.getProblem(workspaceId, problemId)
    if (!problem) {
      throw new Error('Problem was not persisted')
    }
    return problem
  }

  updateProblem(workspaceId: string, request: UpdateProblemRequest): Problem | undefined {
    const updatedAt = new Date().toISOString()
    const result = this.database.orm
      .update(problems)
      .set({ ...toProblemValues(request), updatedAt })
      .where(and(eq(problems.id, request.id), eq(problems.workspaceId, workspaceId)))
      .run()
    return result.changes > 0 ? this.getProblem(workspaceId, request.id) : undefined
  }

  upsertRelation(workspaceId: string, request: UpsertProblemRelationRequest): Problem {
    if (
      !this.problemExists(workspaceId, request.problemId) ||
      !this.isTemplateAvailable(workspaceId, request.templateId)
    ) {
      throw new PublicError('INVALID_REQUEST', '题目与模板必须属于当前工作区。')
    }
    const timestamp = new Date().toISOString()
    this.database.orm.transaction(transaction => {
      transaction
        .insert(templateProblemRelations)
        .values({
          createdAt: timestamp,
          note: request.note,
          problemId: request.problemId,
          relationType: request.relationType,
          source: 'manual',
          templateId: request.templateId,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          set: {
            note: request.note,
            relationType: request.relationType,
            source: 'manual',
            updatedAt: timestamp,
          },
          target: [templateProblemRelations.problemId, templateProblemRelations.templateId],
        })
        .run()
      transaction
        .update(problems)
        .set({ updatedAt: timestamp })
        .where(and(eq(problems.id, request.problemId), eq(problems.workspaceId, workspaceId)))
        .run()
    })
    return this.requireProblem(workspaceId, request.problemId)
  }
}
