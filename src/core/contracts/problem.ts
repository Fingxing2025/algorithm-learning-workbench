import { z } from 'zod'

const problemIdSchema = z.string().uuid()
const templateIdSchema = z.string().regex(/^[a-f0-9]{64}$/)

export const problemStatusSchema = z.enum(['unattempted', 'attempted', 'solved'])
export const relationTypeSchema = z.enum(['used', 'recommended', 'alternative'])
export const relationSourceSchema = z.enum(['manual', 'ai'])

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable()

export const problemAnalysisExampleSchema = z
  .object({
    explanation: z.string().max(10_000),
    input: z.string().max(20_000),
    output: z.string().max(20_000),
  })
  .strict()

export const problemAnalysisStructureSchema = z
  .object({
    algorithmSignals: z.array(z.string().trim().min(1).max(200)).max(30),
    constraints: z.array(z.string().trim().min(1).max(500)).max(50),
    edgeCases: z.array(z.string().trim().min(1).max(500)).max(30),
    examples: z.array(problemAnalysisExampleSchema).max(12),
    inputDescription: z.string().max(20_000),
    outputDescription: z.string().max(20_000),
  })
  .strict()
export type ProblemAnalysisStructure = z.infer<typeof problemAnalysisStructureSchema>
export const emptyProblemAnalysisStructure: ProblemAnalysisStructure = {
  algorithmSignals: [],
  constraints: [],
  edgeCases: [],
  examples: [],
  inputDescription: '',
  outputDescription: '',
}

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
    aiSummary: z.string().max(20_000),
    analysis: problemAnalysisStructureSchema,
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
export type ProblemRequest = z.infer<typeof problemRequestSchema>

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

export const problemPageRequestSchema = z
  .object({
    cursor: z
      .string()
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable()
      .default(null),
    limit: z.number().int().min(20).max(200).default(100),
    query: z.string().trim().max(200).default(''),
  })
  .strict()

export const problemPageSchema = z
  .object({
    items: z.array(problemSchema).max(200),
    matchedCount: z.number().int().nonnegative(),
    nextAction: z.string().max(240).nullable(),
    nextCursor: z
      .string()
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable(),
    processedCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
    totalRelationCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    truncatedReason: z.string().max(500).nullable(),
  })
  .strict()

export const templateProblemPageRequestSchema = z
  .object({
    cursor: z
      .string()
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable()
      .default(null),
    limit: z.number().int().min(20).max(200).default(100),
    templateId: templateIdSchema,
  })
  .strict()

export const templateProblemSummarySchema = z
  .object({
    id: problemIdSchema,
    relationType: relationTypeSchema,
    title: z.string().trim().min(1).max(200),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const templateProblemPageSchema = z
  .object({
    items: z.array(templateProblemSummarySchema).max(200),
    nextAction: z.string().max(240).nullable(),
    nextCursor: z
      .string()
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable(),
    processedCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    truncatedReason: z.string().max(500).nullable(),
  })
  .strict()

export type CreateProblemRequest = z.infer<typeof createProblemRequestSchema>
export type Problem = z.infer<typeof problemSchema>
export type ProblemPage = z.infer<typeof problemPageSchema>
export type ProblemPageRequest = z.infer<typeof problemPageRequestSchema>
export type TemplateProblemPage = z.infer<typeof templateProblemPageSchema>
export type TemplateProblemPageRequest = z.infer<typeof templateProblemPageRequestSchema>
export type TemplateProblemSummary = z.infer<typeof templateProblemSummarySchema>
export type ProblemFields = z.infer<typeof problemFieldsSchema>
export type ProblemImage = z.infer<typeof problemImageSchema>
export type ProblemImageData = z.infer<typeof problemImageDataSchema>
export type ProblemAnalysisExample = z.infer<typeof problemAnalysisExampleSchema>
export type ProblemStatus = z.infer<typeof problemStatusSchema>
export type ProblemTemplateRelation = z.infer<typeof problemTemplateRelationSchema>
export type RelationType = z.infer<typeof relationTypeSchema>
export type RemoveProblemImageRequest = z.infer<typeof removeProblemImageRequestSchema>
export type RemoveProblemRelationRequest = z.infer<typeof removeProblemRelationRequestSchema>
export type UpdateProblemRequest = z.infer<typeof updateProblemRequestSchema>
export type UpsertProblemRelationRequest = z.infer<typeof upsertProblemRelationRequestSchema>
