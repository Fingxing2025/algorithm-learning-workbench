import { z } from 'zod'

const problemIdSchema = z.string().uuid()
const templateIdSchema = z.string().regex(/^[a-f0-9]{64}$/)

export const problemStatusSchema = z.enum(['unattempted', 'attempted', 'solved'])
export const relationTypeSchema = z.enum(['used', 'recommended', 'alternative'])
export const relationSourceSchema = z.enum(['manual', 'ai'])

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable()

const problemUrlSchema = nullableText(2048).refine(value => {
  if (value === null) {
    return true
  }
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}, '题目链接必须使用 http 或 https。')

export const problemFieldsSchema = z
  .object({
    difficulty: nullableText(40),
    notes: z.string().max(100_000),
    platform: nullableText(80),
    problemCode: nullableText(80),
    statement: z.string().max(100_000),
    status: problemStatusSchema,
    tags: z
      .array(z.string().trim().min(1).max(40))
      .max(20)
      .transform(tags => [...new Set(tags)]),
    title: z.string().trim().min(1).max(200),
    url: problemUrlSchema,
  })
  .strict()

export const problemImageSchema = z
  .object({
    createdAt: z.string().datetime(),
    id: z.string().uuid(),
    mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    originalName: z.string().min(1).max(255),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict()

export const problemTemplateRelationSchema = z
  .object({
    available: z.boolean(),
    createdAt: z.string().datetime(),
    language: z.string().min(1).max(32),
    note: z.string().max(500),
    relationType: relationTypeSchema,
    source: relationSourceSchema,
    templateId: templateIdSchema,
    templateName: z.string().min(1).max(255),
    templatePath: z.string().min(1).max(4096),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const problemSchema = problemFieldsSchema
  .extend({
    createdAt: z.string().datetime(),
    id: problemIdSchema,
    images: z.array(problemImageSchema).max(12),
    relations: z.array(problemTemplateRelationSchema),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const createProblemRequestSchema = problemFieldsSchema
export const updateProblemRequestSchema = problemFieldsSchema
  .extend({ id: problemIdSchema })
  .strict()

export const problemRequestSchema = z.object({ problemId: problemIdSchema }).strict()

export const upsertProblemRelationRequestSchema = z
  .object({
    note: z.string().trim().max(500),
    problemId: problemIdSchema,
    relationType: relationTypeSchema,
    templateId: templateIdSchema,
  })
  .strict()

export const removeProblemRelationRequestSchema = z
  .object({ problemId: problemIdSchema, templateId: templateIdSchema })
  .strict()

export const problemImageRequestSchema = z.object({ imageId: z.string().uuid() }).strict()

export const removeProblemImageRequestSchema = z
  .object({ imageId: z.string().uuid(), problemId: problemIdSchema })
  .strict()

export const problemImageDataSchema = z
  .object({
    dataUrl: z
      .string()
      .max(12 * 1024 * 1024)
      .regex(/^data:image\/(?:jpeg|png|webp);base64,/),
    imageId: z.string().uuid(),
  })
  .strict()

export const problemListSchema = z.array(problemSchema).max(100_000)

export type CreateProblemRequest = z.infer<typeof createProblemRequestSchema>
export type Problem = z.infer<typeof problemSchema>
export type ProblemFields = z.infer<typeof problemFieldsSchema>
export type ProblemImage = z.infer<typeof problemImageSchema>
export type ProblemImageData = z.infer<typeof problemImageDataSchema>
export type ProblemStatus = z.infer<typeof problemStatusSchema>
export type ProblemTemplateRelation = z.infer<typeof problemTemplateRelationSchema>
export type RelationType = z.infer<typeof relationTypeSchema>
export type RemoveProblemImageRequest = z.infer<typeof removeProblemImageRequestSchema>
export type RemoveProblemRelationRequest = z.infer<typeof removeProblemRelationRequestSchema>
export type UpdateProblemRequest = z.infer<typeof updateProblemRequestSchema>
export type UpsertProblemRelationRequest = z.infer<typeof upsertProblemRelationRequestSchema>
