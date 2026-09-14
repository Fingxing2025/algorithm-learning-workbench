import { z } from 'zod'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const categoryIdSchema = z.string().regex(/^[a-z][a-z0-9.-]+$/)
const categoryPathSchema = z.array(z.string().trim().min(1).max(80)).min(2).max(5)
const relativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine(value => !value.startsWith('/') && !value.includes('\\'), '必须使用受控相对路径。')
  .refine(value => !/^[A-Za-z]:\//u.test(value), '必须使用受控相对路径。')
  .refine(
    value => !value.split('/').some(part => !part || part === '.' || part === '..'),
    '相对路径无效。',
  )

const confirmedSourceEvidenceSchema = z
  .object({
    claim: z.string().trim().min(1).max(500),
    containsImplementation: z.boolean().optional(),
    endLine: z.number().int().positive(),
    quote: z.string().min(1).max(2_000),
    startLine: z.number().int().positive(),
    verified: z.boolean(),
  })
  .strict()

const confirmedSourceCoverageSchema = z
  .object({
    complete: z.boolean(),
    coveredLines: z.number().int().nonnegative(),
    omittedLines: z.number().int().nonnegative(),
    ranges: z
      .array(
        z
          .object({
            endLine: z.number().int().positive(),
            startLine: z.number().int().positive(),
          })
          .strict(),
      )
      .max(256),
    totalLines: z.number().int().nonnegative(),
  })
  .strict()

const confirmedProposalVersionSchema = z
  .object({
    algorithmFamily: z.string().max(120),
    categoryId: categoryIdSchema.nullable(),
    categoryPath: z.array(z.string().trim().min(1).max(80)).max(5),
    confidence: z.number().min(0).max(1),
    primaryTechnique: z.string().max(120),
    source: z.enum(['global-summary', 'detailed-source']),
    sourceCoverage: confirmedSourceCoverageSchema,
    sourceEvidence: z.array(confirmedSourceEvidenceSchema).max(8),
    sourceLanguage: z.string().max(40).nullable(),
    spaceComplexity: z.string().max(240).nullable(),
    timeComplexity: z.string().max(240).nullable(),
    variant: z.string().max(120).nullable(),
    version: z.number().int().positive(),
  })
  .strict()

/**
 * Bounded evidence retained with the user's decision. It deliberately mirrors
 * only the stable evidence fields from TemplateClassification, rather than the
 * provider diagnostics or editable template metadata.
 */
export const confirmedClassificationSnapshotSchema = z
  .object({
    algorithmFamily: z.string().max(120).nullable(),
    categoryId: categoryIdSchema,
    categoryPath: categoryPathSchema,
    primaryTechnique: z.string().max(120).nullable(),
    proposalHistory: z.array(confirmedProposalVersionSchema).max(4),
    reviewReasons: z.array(z.string().trim().min(1).max(80)).max(24),
    sourceCoverage: confirmedSourceCoverageSchema.nullable(),
    sourceEvidence: z.array(confirmedSourceEvidenceSchema).max(8),
    variant: z.string().max(120).nullable(),
  })
  .strict()
export type ConfirmedClassificationSnapshot = z.infer<typeof confirmedClassificationSnapshotSchema>

export const classificationPathSemanticsSchema = z.enum(['canonical', 'manual'])
export type ClassificationPathSemantics = z.infer<typeof classificationPathSemanticsSchema>

export const storedClassificationConfirmationStatusSchema = z.enum(['confirmed', 'released'])
export type StoredClassificationConfirmationStatus = z.infer<
  typeof storedClassificationConfirmationStatusSchema
>

export const templateClassificationConfirmationSchema = z
  .object({
    categoryId: categoryIdSchema,
    categoryPath: categoryPathSchema,
    classificationFingerprint: sha256Schema,
    confirmedAt: z.string().datetime(),
    confirmedRelativePath: relativePathSchema,
    decisionSnapshot: confirmedClassificationSnapshotSchema,
    pathSemantics: classificationPathSemanticsSchema,
    revision: z.number().int().positive(),
    sourceHash: sha256Schema,
    status: storedClassificationConfirmationStatusSchema,
    taxonomyFingerprint: sha256Schema,
    taxonomyVersion: z.number().int().positive(),
    templateId: z.string().min(1).max(160),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type TemplateClassificationConfirmation = z.infer<
  typeof templateClassificationConfirmationSchema
>

export const confirmTemplateClassificationInputSchema = z
  .object({
    categoryId: categoryIdSchema,
    categoryPath: categoryPathSchema,
    confirmed: z.literal(true),
    confirmedRelativePath: relativePathSchema,
    decisionSnapshot: confirmedClassificationSnapshotSchema,
    expectedRevision: z.number().int().positive().nullable(),
    pathSemantics: classificationPathSemanticsSchema,
    sourceHash: sha256Schema,
    taxonomyFingerprint: sha256Schema,
    taxonomyVersion: z.number().int().positive(),
    templateId: z.string().min(1).max(160),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decisionSnapshot.categoryId !== value.categoryId) {
      context.addIssue({
        code: 'custom',
        message: '确认快照与分类 ID 不一致。',
        path: ['decisionSnapshot', 'categoryId'],
      })
    }
    if (value.decisionSnapshot.categoryPath.join('/') !== value.categoryPath.join('/')) {
      context.addIssue({
        code: 'custom',
        message: '确认快照与分类路径不一致。',
        path: ['decisionSnapshot', 'categoryPath'],
      })
    }
  })
export type ConfirmTemplateClassificationInput = z.infer<
  typeof confirmTemplateClassificationInputSchema
>

export const releaseTemplateClassificationInputSchema = z
  .object({
    confirmed: z.literal(true),
    expectedRevision: z.number().int().positive(),
    templateId: z.string().min(1).max(160),
  })
  .strict()
export type ReleaseTemplateClassificationInput = z.infer<
  typeof releaseTemplateClassificationInputSchema
>

export const stagingClassificationReviewBindingSchema = z
  .object({
    classificationFingerprint: sha256Schema,
    decisionSnapshot: confirmedClassificationSnapshotSchema,
    sourceHash: sha256Schema,
    targetFingerprint: sha256Schema,
    taxonomyFingerprint: sha256Schema,
  })
  .strict()
export type StagingClassificationReviewBinding = z.infer<
  typeof stagingClassificationReviewBindingSchema
>

/** Renderer-facing request. Main resolves the active workspace itself. */
export const confirmStagingClassificationReviewRequestSchema = z
  .object({
    binding: stagingClassificationReviewBindingSchema,
    confirmed: z.literal(true),
    expectedReviewRevision: z.number().int().nonnegative(),
    expectedStagingVersion: z.number().int().nonnegative(),
    sourceId: z.string().uuid(),
    stagingId: z.string().uuid(),
  })
  .strict()
export type ConfirmStagingClassificationReviewRequest = z.infer<
  typeof confirmStagingClassificationReviewRequestSchema
>
