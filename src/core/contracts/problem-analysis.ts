import { z } from 'zod'

import { problemFieldsSchema, relationTypeSchema } from './problem'
import { problemAnalysisStructureSchema } from './problem'
import { aiOutputLanguageSchema, aiRequestIdSchema, aiRequestPreviewSchema } from './ai-request'

const templateIdSchema = z.string().regex(/^[a-f0-9]{64}$/)

export const problemAnalysisImageSchema = z
  .object({
    dataUrl: z
      .string()
      .max(12 * 1024 * 1024)
      .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
    name: z.string().trim().min(1).max(255),
  })
  .strict()
export type ProblemAnalysisImage = z.infer<typeof problemAnalysisImageSchema>

export const problemAnalysisImagesSchema = z
  .array(problemAnalysisImageSchema)
  .max(6)
  .refine(
    images => images.reduce((total, image) => total + image.dataUrl.length, 0) <= 32 * 1024 * 1024,
    '题目分析图片合计不能超过 24 MiB。',
  )

const problemAnalysisInputFields = {
  images: problemAnalysisImagesSchema,
  outputLanguage: aiOutputLanguageSchema,
  text: z.string().trim().max(100_000),
}
const hasProblemInput = (request: { images: ProblemAnalysisImage[]; text: string }) =>
  request.text.length > 0 || request.images.length > 0

export const previewProblemAnalysisRequestSchema = z
  .object(problemAnalysisInputFields)
  .strict()
  .refine(hasProblemInput, '请输入题面或添加图片。')
export type PreviewProblemAnalysisRequest = z.infer<typeof previewProblemAnalysisRequestSchema>
export const analyzeProblemRequestSchema = z
  .object({ ...problemAnalysisInputFields, requestId: aiRequestIdSchema })
  .strict()
  .refine(hasProblemInput, '请输入题面或添加图片。')
export type AnalyzeProblemRequest = z.infer<typeof analyzeProblemRequestSchema>
export const previewProblemAnalysisResultSchema = aiRequestPreviewSchema

export const problemAnalysisCandidateSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    reason: z.string().trim().max(500),
    applicableWhen: z.array(z.string().trim().min(1).max(500)).max(20),
    evidence: z.array(z.string().trim().min(1).max(500)).max(20),
    matchedCapabilities: z.array(z.string().trim().min(1).max(500)).max(20),
    notApplicableWhen: z.array(z.string().trim().min(1).max(500)).max(20),
    relationType: relationTypeSchema,
    templateId: templateIdSchema,
    templateName: z.string().min(1).max(255),
    templatePath: z.string().min(1).max(4096),
    warnings: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .strict()
export type ProblemAnalysisCandidate = z.infer<typeof problemAnalysisCandidateSchema>

export const problemAnalysisDraftSchema = z
  .object({
    candidates: z.array(problemAnalysisCandidateSchema).max(8),
    fields: problemFieldsSchema,
    model: z.string().min(1).max(160),
    providerName: z.string().min(1).max(80),
  })
  .strict()
export type ProblemAnalysisDraft = z.infer<typeof problemAnalysisDraftSchema>

export const commitProblemAnalysisRequestSchema = z
  .object({
    fields: problemFieldsSchema,
    images: problemAnalysisImagesSchema,
    relations: z
      .array(
        z
          .object({
            note: z.string().trim().max(500),
            relationType: relationTypeSchema,
            templateId: templateIdSchema,
          })
          .strict(),
      )
      .max(8)
      .refine(
        relations =>
          new Set(relations.map(relation => relation.templateId)).size === relations.length,
        '候选模板不能重复。',
      ),
  })
  .strict()
export type CommitProblemAnalysisRequest = z.infer<typeof commitProblemAnalysisRequestSchema>

export const modelProblemAnalysisSchema = z
  .object({
    aiSummary: z.string().max(20_000),
    analysis: problemAnalysisStructureSchema,
    difficulty: z.string().max(40).nullable().optional(),
    notes: z.string().max(100_000).optional(),
    platform: z.string().max(80).nullable().optional(),
    problemCode: z.string().max(80).nullable().optional(),
    statement: z.string().max(100_000).optional(),
    status: z.enum(['unattempted', 'attempted', 'solved']).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    templateCandidates: z
      .array(
        z.object({
          confidence: z.number().min(0).max(1).optional(),
          applicableWhen: z.array(z.string().max(500)).max(20).optional(),
          evidence: z.array(z.string().max(500)).max(20).optional(),
          matchedCapabilities: z.array(z.string().max(500)).max(20).optional(),
          notApplicableWhen: z.array(z.string().max(500)).max(20).optional(),
          reason: z.string().max(500).optional(),
          templateId: templateIdSchema,
          warnings: z.array(z.string().max(500)).max(20).optional(),
        }),
      )
      .max(16)
      .optional(),
    title: z.string().trim().min(1).max(200),
    url: z.string().max(2048).nullable().optional(),
  })
  .strict()
export type ModelProblemAnalysis = z.infer<typeof modelProblemAnalysisSchema>

export const chooseProblemAnalysisImagesResultSchema = problemAnalysisImagesSchema
