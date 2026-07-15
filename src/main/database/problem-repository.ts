import { randomUUID } from 'node:crypto'

import { and, desc, eq } from 'drizzle-orm'

import {
  problemImageSchema,
  problemSchema,
  problemStatusSchema,
  problemTemplateRelationSchema,
  relationSourceSchema,
  relationTypeSchema,
  type CreateProblemRequest,
  type Problem,
  type ProblemImage,
  type UpdateProblemRequest,
  type UpsertProblemRelationRequest,
} from '@core/contracts/problem'
import type { CommitProblemAnalysisRequest } from '@core/contracts/problem-analysis'

import type { AppDatabase } from './database'
import { problemImages, problems, templateProblemRelations, templates } from './schema'

export type ProblemImageRecord = typeof problemImages.$inferSelect

export interface NewProblemImage {
  id: string
  mediaType: ProblemImage['mediaType']
  originalName: string
  relativePath: string
  sizeBytes: number
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

export class ProblemRepository {
  constructor(private readonly database: AppDatabase) {}

  addImages(problemId: string, imageRows: NewProblemImage[]): void {
    const createdAt = new Date().toISOString()
    this.database.orm.transaction(transaction => {
      transaction
        .insert(problemImages)
        .values(imageRows.map(image => ({ ...image, createdAt, problemId })))
        .run()
      transaction
        .update(problems)
        .set({ updatedAt: createdAt })
        .where(eq(problems.id, problemId))
        .run()
    })
  }

  countImages(problemId: string): number {
    return this.database.orm
      .select({ id: problemImages.id })
      .from(problemImages)
      .where(eq(problemImages.problemId, problemId))
      .all().length
  }

  createProblem(fields: CreateProblemRequest): Problem {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    this.database.orm
      .insert(problems)
      .values({
        ...toProblemValues(fields),
        createdAt: timestamp,
        id,
        updatedAt: timestamp,
      })
      .run()
    return this.requireProblem(id)
  }

  deleteProblem(problemId: string): boolean {
    return this.database.orm.transaction(transaction => {
      transaction
        .delete(templateProblemRelations)
        .where(eq(templateProblemRelations.problemId, problemId))
        .run()
      transaction.delete(problemImages).where(eq(problemImages.problemId, problemId)).run()
      return transaction.delete(problems).where(eq(problems.id, problemId)).run().changes > 0
    })
  }

  createAnalyzedProblem(
    id: string,
    fields: CreateProblemRequest,
    imageRows: NewProblemImage[],
    relations: CommitProblemAnalysisRequest['relations'],
  ): Problem {
    const timestamp = new Date().toISOString()
    this.database.orm.transaction(transaction => {
      transaction
        .insert(problems)
        .values({ ...toProblemValues(fields), createdAt: timestamp, id, updatedAt: timestamp })
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
    return this.requireProblem(id)
  }

  getImage(imageId: string, problemId?: string): ProblemImageRecord | undefined {
    const condition = problemId
      ? and(eq(problemImages.id, imageId), eq(problemImages.problemId, problemId))
      : eq(problemImages.id, imageId)
    return this.database.orm.select().from(problemImages).where(condition).get()
  }

  getProblem(problemId: string): Problem | undefined {
    return this.listProblems().find(problem => problem.id === problemId)
  }

  isTemplateAvailable(templateId: string): boolean {
    return Boolean(
      this.database.orm
        .select({ id: templates.id })
        .from(templates)
        .where(and(eq(templates.id, templateId), eq(templates.available, true)))
        .get(),
    )
  }

  listProblems(): Problem[] {
    const problemRows = this.database.orm
      .select()
      .from(problems)
      .orderBy(desc(problems.updatedAt))
      .all()
    const imageRows = this.database.orm.select().from(problemImages).all()
    const relationRows = this.database.orm
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
      .all()

    return problemRows.map(row => {
      const parsedStatus = problemStatusSchema.safeParse(row.status)
      const imagesForProblem = imageRows.flatMap(image => {
        if (image.problemId !== row.id) {
          return []
        }
        const parsed = problemImageSchema.safeParse({
          createdAt: image.createdAt,
          id: image.id,
          mediaType: image.mediaType,
          originalName: image.originalName,
          sizeBytes: image.sizeBytes,
        })
        return parsed.success ? [parsed.data] : []
      })
      const relationsForProblem = relationRows.flatMap(relation => {
        if (relation.problemId !== row.id) {
          return []
        }
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

  problemExists(problemId: string): boolean {
    return Boolean(
      this.database.orm
        .select({ id: problems.id })
        .from(problems)
        .where(eq(problems.id, problemId))
        .get(),
    )
  }

  removeImage(imageId: string, problemId: string): boolean {
    const updatedAt = new Date().toISOString()
    const result = this.database.orm.transaction(transaction => {
      const deletion = transaction
        .delete(problemImages)
        .where(and(eq(problemImages.id, imageId), eq(problemImages.problemId, problemId)))
        .run()
      if (deletion.changes > 0) {
        transaction.update(problems).set({ updatedAt }).where(eq(problems.id, problemId)).run()
      }
      return deletion
    })
    return result.changes > 0
  }

  removeRelation(problemId: string, templateId: string): boolean {
    const timestamp = new Date().toISOString()
    const result = this.database.orm.transaction(transaction => {
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
          .where(eq(problems.id, problemId))
          .run()
      }
      return deletion
    })
    return result.changes > 0
  }

  requireProblem(problemId: string): Problem {
    const problem = this.getProblem(problemId)
    if (!problem) {
      throw new Error('Problem was not persisted')
    }
    return problem
  }

  updateProblem(request: UpdateProblemRequest): Problem | undefined {
    const updatedAt = new Date().toISOString()
    const result = this.database.orm
      .update(problems)
      .set({ ...toProblemValues(request), updatedAt })
      .where(eq(problems.id, request.id))
      .run()
    return result.changes > 0 ? this.getProblem(request.id) : undefined
  }

  upsertRelation(request: UpsertProblemRelationRequest): Problem {
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
        .where(eq(problems.id, request.problemId))
        .run()
    })
    return this.requireProblem(request.problemId)
  }
}
