import { z } from 'zod'

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/)
const categoryIdSchema = z.string().regex(/^[a-z][a-z0-9.-]+$/)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

const categorySchema = z
  .object({
    categoryId: categoryIdSchema,
    family: identifierSchema,
  })
  .strict()

const singleLabelSchema = z
  .object({
    ambiguity: z.enum(['low', 'high']),
    kind: z.literal('single'),
    primaryCategoryId: categoryIdSchema,
  })
  .strict()

const compositeLabelSchema = z
  .object({
    ambiguity: z.literal('high'),
    componentCategoryIds: z.array(categoryIdSchema).min(2).max(4),
    kind: z.literal('composite'),
  })
  .strict()

const unknownLabelSchema = z
  .object({
    ambiguity: z.literal('high'),
    kind: z.literal('unknown'),
  })
  .strict()

export const evaluationSampleSchema = z
  .object({
    baseImplementationId: identifierSchema,
    batchId: identifierSchema,
    family: identifierSchema,
    fileName: z.string().min(1).max(160),
    gold: z.discriminatedUnion('kind', [
      singleLabelSchema,
      compositeLabelSchema,
      unknownLabelSchema,
    ]),
    pairedSampleId: identifierSchema.nullable(),
    sampleId: identifierSchema,
    sourcePath: z.string().regex(/^sources\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.cpp$/),
    sourceSha256: sha256Schema,
    split: z.enum(['development', 'holdout']),
    variant: z.enum([
      'canonical',
      'renamed',
      'misleading-name',
      'misleading-comment',
      'long-middle',
      'batch-repeat',
    ]),
  })
  .strict()

export const classificationEvaluationDatasetSchema = z
  .object({
    baseImplementationCount: z.number().int().positive(),
    categories: z.array(categorySchema).min(1),
    createdAt: z.string().datetime({ offset: true }),
    datasetId: identifierSchema,
    description: z.string().min(1).max(2_000),
    labelStatus: z.literal('provisional-ai-drafted-unreviewed'),
    sampleCount: z.number().int().positive(),
    samples: z.array(evaluationSampleSchema).min(1),
    schemaVersion: z.literal(1),
    taxonomyVersion: z.number().int().positive(),
  })
  .strict()

const classifyPredictionSchema = z
  .object({
    batchId: identifierSchema,
    categoryId: categoryIdSchema,
    confidence: z.number().min(0).max(1),
    decision: z.literal('classify'),
    sampleId: identifierSchema,
    sourceSha256: sha256Schema,
  })
  .strict()

const reviewPredictionSchema = z
  .object({
    batchId: identifierSchema,
    categoryId: z.null(),
    confidence: z.number().min(0).max(1),
    decision: z.literal('review'),
    sampleId: identifierSchema,
    sourceSha256: sha256Schema,
  })
  .strict()

export const classificationPredictionSchema = z.discriminatedUnion('decision', [
  classifyPredictionSchema,
  reviewPredictionSchema,
])

const realProviderRunSchema = z
  .object({
    classificationServiceVersion: z.string().min(1).max(120),
    completedAt: z.string().datetime({ offset: true }),
    mode: z.literal('real-provider'),
    model: z.string().min(1).max(200),
    promptVersion: z.string().min(1).max(120),
    provider: z.string().min(1).max(200),
    runId: identifierSchema,
  })
  .strict()

const mockRunSchema = z
  .object({
    classificationServiceVersion: z.string().min(1).max(120),
    completedAt: z.string().datetime({ offset: true }),
    mode: z.literal('mock'),
    model: z.null(),
    promptVersion: z.string().min(1).max(120),
    provider: z.null(),
    runId: identifierSchema,
  })
  .strict()

export const classificationPredictionExportSchema = z
  .object({
    datasetId: identifierSchema,
    predictions: z.array(classificationPredictionSchema).min(1),
    run: z.discriminatedUnion('mode', [realProviderRunSchema, mockRunSchema]),
    schemaVersion: z.literal(1),
    taxonomyVersion: z.number().int().positive(),
  })
  .strict()

export const classificationServiceInputSchema = z
  .object({
    batchId: identifierSchema,
    content: z.string().min(1),
    fileName: z.string().min(1).max(160),
    sampleId: identifierSchema,
    sourceSha256: sha256Schema,
  })
  .strict()

export const classificationServiceInputExportSchema = z
  .object({
    datasetId: identifierSchema,
    inputs: z.array(classificationServiceInputSchema).min(1),
    schemaVersion: z.literal(1),
    taxonomyVersion: z.number().int().positive(),
  })
  .strict()

export const classificationServiceResultSchema = z
  .object({
    batchId: identifierSchema,
    categoryId: categoryIdSchema.nullable(),
    confidence: z.number().min(0).max(1),
    needsReview: z.boolean(),
    sampleId: identifierSchema,
    sourceSha256: sha256Schema,
  })
  .strict()

export type ClassificationEvaluationDataset = z.infer<typeof classificationEvaluationDatasetSchema>
export type EvaluationSample = z.infer<typeof evaluationSampleSchema>
export type ClassificationPrediction = z.infer<typeof classificationPredictionSchema>
export type ClassificationPredictionExport = z.infer<typeof classificationPredictionExportSchema>
export type ClassificationServiceInputExport = z.infer<
  typeof classificationServiceInputExportSchema
>
export type ClassificationServiceResult = z.infer<typeof classificationServiceResultSchema>
export type RealProviderEvaluationRun = z.infer<typeof realProviderRunSchema>

export interface SourceValidationOptions {
  sha256: (content: string) => string
  sources: ReadonlyMap<string, string>
}

export class ClassificationEvaluationError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`Classification evaluation input is invalid:\n- ${issues.join('\n- ')}`)
    this.name = 'ClassificationEvaluationError'
    this.issues = issues
  }
}

const duplicates = (values: string[]): string[] => {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated].sort()
}

const stripCppComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/\/\/[^\n\r]*/gu, ' ')

const CPP_KEYWORDS = new Set([
  'alignas',
  'alignof',
  'and',
  'auto',
  'bool',
  'break',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'constexpr',
  'continue',
  'default',
  'delete',
  'do',
  'double',
  'else',
  'enum',
  'explicit',
  'false',
  'float',
  'for',
  'friend',
  'if',
  'inline',
  'int',
  'long',
  'namespace',
  'new',
  'noexcept',
  'nullptr',
  'operator',
  'or',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'signed',
  'sizeof',
  'static',
  'struct',
  'switch',
  'template',
  'this',
  'throw',
  'true',
  'try',
  'typedef',
  'typename',
  'union',
  'unsigned',
  'using',
  'virtual',
  'void',
  'volatile',
  'while',
])

const sourceFingerprintTokens = (source: string): string[] => {
  const tokens = stripCppComments(source).match(/[A-Za-z_]\w*|\d+(?:\.\d+)?|\S/gu) ?? []
  return tokens.map(token => {
    if (/^\d/u.test(token)) return 'NUM'
    if (/^[A-Za-z_]/u.test(token) && !CPP_KEYWORDS.has(token)) return 'IDENT'
    return token
  })
}

const shingles = (tokens: string[], width = 7): Set<string> => {
  if (tokens.length < width) return new Set([tokens.join(' ')])
  const result = new Set<string>()
  for (let index = 0; index <= tokens.length - width; index += 1) {
    result.add(tokens.slice(index, index + width).join(' '))
  }
  return result
}

const jaccard = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 && right.size === 0) return 1
  let intersection = 0
  for (const item of left) if (right.has(item)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

export function validateClassificationEvaluationDataset(
  input: unknown,
  sourceOptions?: SourceValidationOptions,
): ClassificationEvaluationDataset {
  const dataset = classificationEvaluationDatasetSchema.parse(input)
  const issues: string[] = []
  const categoryIds = dataset.categories.map(category => category.categoryId)
  const categorySet = new Set(categoryIds)
  const categoryById = new Map(dataset.categories.map(category => [category.categoryId, category]))
  const sampleIds = dataset.samples.map(sample => sample.sampleId)
  const sourcePaths = dataset.samples.map(sample => sample.sourcePath)
  const baseIds = new Set(dataset.samples.map(sample => sample.baseImplementationId))

  for (const duplicate of duplicates(categoryIds)) issues.push(`duplicate categoryId: ${duplicate}`)
  for (const duplicate of duplicates(sampleIds)) issues.push(`duplicate sampleId: ${duplicate}`)
  for (const duplicate of duplicates(sourcePaths)) issues.push(`duplicate sourcePath: ${duplicate}`)
  if (dataset.sampleCount !== dataset.samples.length) {
    issues.push(`sampleCount declares ${dataset.sampleCount}, found ${dataset.samples.length}`)
  }
  if (dataset.baseImplementationCount !== baseIds.size) {
    issues.push(
      `baseImplementationCount declares ${dataset.baseImplementationCount}, found ${baseIds.size}`,
    )
  }

  const splitByBase = new Map<string, Set<string>>()
  const samplesByBase = new Map<string, EvaluationSample[]>()
  for (const sample of dataset.samples) {
    const splits = splitByBase.get(sample.baseImplementationId) ?? new Set<string>()
    splits.add(sample.split)
    splitByBase.set(sample.baseImplementationId, splits)
    const group = samplesByBase.get(sample.baseImplementationId) ?? []
    group.push(sample)
    samplesByBase.set(sample.baseImplementationId, group)

    if (sample.gold.kind === 'single' && !categorySet.has(sample.gold.primaryCategoryId)) {
      issues.push(
        `${sample.sampleId} references unknown gold category ${sample.gold.primaryCategoryId}`,
      )
    }
    if (sample.gold.kind === 'single') {
      const category = categoryById.get(sample.gold.primaryCategoryId)
      if (category && category.family !== sample.family) {
        issues.push(`${sample.sampleId} family ${sample.family} does not match ${category.family}`)
      }
    }
    if (sample.gold.kind === 'composite') {
      if (sample.family !== 'composite') {
        issues.push(`${sample.sampleId} composite sample must use family composite`)
      }
      for (const duplicate of duplicates(sample.gold.componentCategoryIds)) {
        issues.push(`${sample.sampleId} repeats composite category ${duplicate}`)
      }
      for (const categoryId of sample.gold.componentCategoryIds) {
        if (!categorySet.has(categoryId)) {
          issues.push(`${sample.sampleId} references unknown composite category ${categoryId}`)
        }
      }
    }
    if (sample.gold.kind === 'unknown' && sample.family !== 'unknown') {
      issues.push(`${sample.sampleId} unknown sample must use family unknown`)
    }
  }

  for (const [baseImplementationId, splits] of splitByBase) {
    if (splits.size > 1) {
      issues.push(`${baseImplementationId} leaks across splits: ${[...splits].sort().join(', ')}`)
    }
  }

  for (const [baseImplementationId, samples] of samplesByBase) {
    const canonical = samples.filter(sample => sample.variant === 'canonical')
    if (canonical.length !== 1) {
      issues.push(`${baseImplementationId} must have exactly one canonical sample`)
      continue
    }
    for (const duplicate of duplicates(samples.map(sample => sample.batchId))) {
      issues.push(`${baseImplementationId} repeats variant batchId ${duplicate}`)
    }
    const canonicalGold = JSON.stringify(canonical[0]!.gold)
    for (const sample of samples) {
      if (sample.family !== canonical[0]!.family || JSON.stringify(sample.gold) !== canonicalGold) {
        issues.push(`${sample.sampleId} does not preserve the canonical family/gold label`)
      }
      if (sample.variant === 'canonical' && sample.pairedSampleId !== null) {
        issues.push(`${sample.sampleId} canonical sample cannot declare pairedSampleId`)
      }
      if (sample.variant === 'batch-repeat') {
        if (sample.pairedSampleId !== canonical[0]!.sampleId) {
          issues.push(`${sample.sampleId} must pair with ${canonical[0]!.sampleId}`)
        }
        if (sample.batchId === canonical[0]!.batchId) {
          issues.push(`${sample.sampleId} batch repeat must use a different batchId`)
        }
        if (
          sample.sourceSha256 !== canonical[0]!.sourceSha256 ||
          sample.fileName !== canonical[0]!.fileName
        ) {
          issues.push(`${sample.sampleId} batch repeat must preserve canonical source and fileName`)
        }
      } else if (
        sample.variant !== 'canonical' &&
        sample.pairedSampleId !== canonical[0]!.sampleId
      ) {
        issues.push(
          `${sample.sampleId} naming perturbation must pair with ${canonical[0]!.sampleId}`,
        )
      }
    }
  }

  if (sourceOptions) {
    for (const sample of dataset.samples) {
      const source = sourceOptions.sources.get(sample.sourcePath)
      if (source === undefined) {
        issues.push(`missing source: ${sample.sourcePath}`)
        continue
      }
      const actualHash = sourceOptions.sha256(source)
      if (actualHash !== sample.sourceSha256) {
        issues.push(`${sample.sampleId} sourceSha256 mismatch`)
      }
    }

    const canonicalSamples = dataset.samples.filter(sample => sample.variant === 'canonical')
    const fingerprints = new Map<string, Set<string>>()
    for (const sample of canonicalSamples) {
      const source = sourceOptions.sources.get(sample.sourcePath)
      if (source !== undefined) {
        fingerprints.set(sample.sampleId, shingles(sourceFingerprintTokens(source)))
      }
    }
    for (let leftIndex = 0; leftIndex < canonicalSamples.length; leftIndex += 1) {
      const left = canonicalSamples[leftIndex]!
      for (let rightIndex = leftIndex + 1; rightIndex < canonicalSamples.length; rightIndex += 1) {
        const right = canonicalSamples[rightIndex]!
        if (left.split === right.split) continue
        const leftFingerprint = fingerprints.get(left.sampleId)
        const rightFingerprint = fingerprints.get(right.sampleId)
        if (!leftFingerprint || !rightFingerprint) continue
        const similarity = jaccard(leftFingerprint, rightFingerprint)
        if (similarity >= 0.9) {
          issues.push(
            `near-duplicate leakage ${left.baseImplementationId} -> ${right.baseImplementationId} (${similarity.toFixed(3)})`,
          )
        }
      }
    }
  }

  if (issues.length > 0) throw new ClassificationEvaluationError(issues)
  return dataset
}

export function validateClassificationPredictionExport(
  dataset: ClassificationEvaluationDataset,
  input: unknown,
): ClassificationPredictionExport {
  const predictionExport = classificationPredictionExportSchema.parse(input)
  const issues: string[] = []
  if (predictionExport.datasetId !== dataset.datasetId) {
    issues.push(
      `prediction datasetId ${predictionExport.datasetId} does not match ${dataset.datasetId}`,
    )
  }
  if (predictionExport.taxonomyVersion !== dataset.taxonomyVersion) {
    issues.push(
      `prediction taxonomyVersion ${predictionExport.taxonomyVersion} does not match ${dataset.taxonomyVersion}`,
    )
  }
  const sampleById = new Map(dataset.samples.map(sample => [sample.sampleId, sample]))
  const knownCategoryIds = new Set(dataset.categories.map(category => category.categoryId))
  const predictedSampleIds = predictionExport.predictions.map(prediction => prediction.sampleId)
  for (const duplicate of duplicates(predictedSampleIds)) {
    issues.push(`duplicate prediction sampleId: ${duplicate}`)
  }
  for (const prediction of predictionExport.predictions) {
    const sample = sampleById.get(prediction.sampleId)
    if (!sample) {
      issues.push(`unknown prediction sampleId: ${prediction.sampleId}`)
      continue
    }
    if (prediction.batchId !== sample.batchId) {
      issues.push(
        `${prediction.sampleId} batchId ${prediction.batchId} does not match ${sample.batchId}`,
      )
    }
    if (prediction.sourceSha256 !== sample.sourceSha256) {
      issues.push(`${prediction.sampleId} sourceSha256 does not match the dataset`)
    }
    if (prediction.decision === 'classify' && !knownCategoryIds.has(prediction.categoryId)) {
      issues.push(`${prediction.sampleId} uses unknown categoryId ${prediction.categoryId}`)
    }
  }
  const predictionSet = new Set(predictedSampleIds)
  for (const sample of dataset.samples) {
    if (!predictionSet.has(sample.sampleId)) issues.push(`missing prediction: ${sample.sampleId}`)
  }
  if (issues.length > 0) throw new ClassificationEvaluationError(issues)
  return predictionExport
}

export interface ProportionMetric {
  estimate: number | null
  successes: number
  total: number
  wilson95: { lower: number; upper: number } | null
}

const proportion = (successes: number, total: number, includeWilson: boolean): ProportionMetric => {
  if (total === 0) return { estimate: null, successes, total, wilson95: null }
  const estimate = successes / total
  if (!includeWilson) return { estimate, successes, total, wilson95: null }
  const z = 1.959963984540054
  const denominator = 1 + (z * z) / total
  const center = (estimate + (z * z) / (2 * total)) / denominator
  const margin =
    (z / denominator) *
    Math.sqrt((estimate * (1 - estimate)) / total + (z * z) / (4 * total * total))
  return {
    estimate,
    successes,
    total,
    wilson95: {
      lower: Math.max(0, center - margin),
      upper: Math.min(1, center + margin),
    },
  }
}

const predictionOutcome = (prediction: ClassificationPrediction): string =>
  prediction.decision === 'review' ? 'review' : `classify:${prediction.categoryId}`

const correctPrimary = (sample: EvaluationSample, prediction: ClassificationPrediction): boolean =>
  sample.gold.kind === 'single' &&
  prediction.decision === 'classify' &&
  prediction.categoryId === sample.gold.primaryCategoryId

export interface ClassificationEvaluationReport {
  dataset: {
    baseImplementationCount: number
    labelStatus: ClassificationEvaluationDataset['labelStatus']
    sampleCount: number
    splitCounts: Record<'development' | 'holdout', { baseImplementations: number; samples: number }>
  }
  datasetId: string
  intervalPolicy: {
    canonicalBaseMetrics: 'wilson95-base-level-units'
    variantMetrics: 'descriptive-correlated-variants-no-interval'
  }
  canonicalBaseMetrics: ClassificationMetricSet
  canonicalBaseMetricsBySplit: Record<'development' | 'holdout', ClassificationMetricSet>
  metrics: ClassificationMetricSet
  metricsBySplit: Record<'development' | 'holdout', ClassificationMetricSet>
  providerEvaluation: {
    model: string | null
    provider: string | null
    status: 'completed' | 'not-run'
  }
  run: ClassificationPredictionExport['run']
  schemaVersion: 1
}

export interface ClassificationMetricSet {
  batchStability: ProportionMetric
  compositeReviewRate: ProportionMetric
  erroneousHardClassificationRate: ProportionMetric
  goldLowAmbiguityClassificationCoverage: ProportionMetric
  goldLowAmbiguityClassificationPrecision: ProportionMetric
  lowAmbiguitySuggestionCoverage: ProportionMetric
  lowAmbiguitySuggestionPrecision: ProportionMetric
  namingPerturbationStability: ProportionMetric
  overallPrimaryAccuracy: ProportionMetric
  primaryAccuracyByFamily: Record<string, ProportionMetric>
  unknownReviewRate: ProportionMetric
}

const buildMetricSet = (
  samples: EvaluationSample[],
  predictionById: ReadonlyMap<string, ClassificationPrediction>,
  includeWilson: boolean,
): ClassificationMetricSet => {
  const sampleIds = new Set(samples.map(sample => sample.sampleId))
  const singleSamples = samples.filter(sample => sample.gold.kind === 'single')
  const goldLowAmbiguitySamples = singleSamples.filter(sample => sample.gold.ambiguity === 'low')
  const hardSuggestions = samples.filter(
    sample => predictionById.get(sample.sampleId)!.decision === 'classify',
  )
  const goldLowAmbiguityHardSuggestions = goldLowAmbiguitySamples.filter(
    sample => predictionById.get(sample.sampleId)!.decision === 'classify',
  )
  const compositeSamples = samples.filter(sample => sample.gold.kind === 'composite')
  const unknownSamples = samples.filter(sample => sample.gold.kind === 'unknown')
  const families = [...new Set(singleSamples.map(sample => sample.family))].sort()
  const primaryAccuracyByFamily = Object.fromEntries(
    families.map(family => {
      const familySamples = singleSamples.filter(sample => sample.family === family)
      return [
        family,
        proportion(
          familySamples.filter(sample =>
            correctPrimary(sample, predictionById.get(sample.sampleId)!),
          ).length,
          familySamples.length,
          includeWilson,
        ),
      ]
    }),
  )
  const namingPairs = samples
    .filter(
      sample =>
        ['renamed', 'misleading-name', 'misleading-comment', 'long-middle'].includes(
          sample.variant,
        ) && sampleIds.has(sample.pairedSampleId ?? ''),
    )
    .map(sample => [sample, predictionById.get(sample.pairedSampleId!)!] as const)
  const batchPairs = samples
    .filter(
      sample => sample.variant === 'batch-repeat' && sampleIds.has(sample.pairedSampleId ?? ''),
    )
    .map(sample => [sample, predictionById.get(sample.pairedSampleId!)!] as const)
  const hardErrors = hardSuggestions.filter(
    sample => !correctPrimary(sample, predictionById.get(sample.sampleId)!),
  ).length

  return {
    batchStability: proportion(
      batchPairs.filter(
        ([sample, paired]) =>
          predictionOutcome(predictionById.get(sample.sampleId)!) === predictionOutcome(paired),
      ).length,
      batchPairs.length,
      includeWilson,
    ),
    compositeReviewRate: proportion(
      compositeSamples.filter(sample => predictionById.get(sample.sampleId)!.decision === 'review')
        .length,
      compositeSamples.length,
      includeWilson,
    ),
    erroneousHardClassificationRate: proportion(hardErrors, samples.length, includeWilson),
    goldLowAmbiguityClassificationCoverage: proportion(
      goldLowAmbiguityHardSuggestions.length,
      goldLowAmbiguitySamples.length,
      includeWilson,
    ),
    goldLowAmbiguityClassificationPrecision: proportion(
      goldLowAmbiguityHardSuggestions.filter(sample =>
        correctPrimary(sample, predictionById.get(sample.sampleId)!),
      ).length,
      goldLowAmbiguityHardSuggestions.length,
      includeWilson,
    ),
    lowAmbiguitySuggestionCoverage: proportion(
      hardSuggestions.length,
      samples.length,
      includeWilson,
    ),
    lowAmbiguitySuggestionPrecision: proportion(
      hardSuggestions.filter(sample => correctPrimary(sample, predictionById.get(sample.sampleId)!))
        .length,
      hardSuggestions.length,
      includeWilson,
    ),
    namingPerturbationStability: proportion(
      namingPairs.filter(
        ([sample, paired]) =>
          predictionOutcome(predictionById.get(sample.sampleId)!) === predictionOutcome(paired),
      ).length,
      namingPairs.length,
      includeWilson,
    ),
    overallPrimaryAccuracy: proportion(
      singleSamples.filter(sample => correctPrimary(sample, predictionById.get(sample.sampleId)!))
        .length,
      singleSamples.length,
      includeWilson,
    ),
    primaryAccuracyByFamily,
    unknownReviewRate: proportion(
      unknownSamples.filter(sample => predictionById.get(sample.sampleId)!.decision === 'review')
        .length,
      unknownSamples.length,
      includeWilson,
    ),
  }
}

export function scoreClassificationPredictions(
  datasetInput: unknown,
  predictionInput: unknown,
): ClassificationEvaluationReport {
  const dataset = validateClassificationEvaluationDataset(datasetInput)
  const predictionExport = validateClassificationPredictionExport(dataset, predictionInput)
  const predictionById = new Map(
    predictionExport.predictions.map(prediction => [prediction.sampleId, prediction]),
  )
  const developmentSamples = dataset.samples.filter(sample => sample.split === 'development')
  const holdoutSamples = dataset.samples.filter(sample => sample.split === 'holdout')
  const canonicalSamples = dataset.samples.filter(sample => sample.variant === 'canonical')
  const developmentCanonicalSamples = canonicalSamples.filter(
    sample => sample.split === 'development',
  )
  const holdoutCanonicalSamples = canonicalSamples.filter(sample => sample.split === 'holdout')

  const developmentBases = new Set(
    dataset.samples
      .filter(sample => sample.split === 'development')
      .map(sample => sample.baseImplementationId),
  )
  const holdoutBases = new Set(
    dataset.samples
      .filter(sample => sample.split === 'holdout')
      .map(sample => sample.baseImplementationId),
  )

  return {
    dataset: {
      baseImplementationCount: dataset.baseImplementationCount,
      labelStatus: dataset.labelStatus,
      sampleCount: dataset.sampleCount,
      splitCounts: {
        development: {
          baseImplementations: developmentBases.size,
          samples: dataset.samples.filter(sample => sample.split === 'development').length,
        },
        holdout: {
          baseImplementations: holdoutBases.size,
          samples: dataset.samples.filter(sample => sample.split === 'holdout').length,
        },
      },
    },
    datasetId: dataset.datasetId,
    intervalPolicy: {
      canonicalBaseMetrics: 'wilson95-base-level-units',
      variantMetrics: 'descriptive-correlated-variants-no-interval',
    },
    canonicalBaseMetrics: buildMetricSet(canonicalSamples, predictionById, true),
    canonicalBaseMetricsBySplit: {
      development: buildMetricSet(developmentCanonicalSamples, predictionById, true),
      holdout: buildMetricSet(holdoutCanonicalSamples, predictionById, true),
    },
    metrics: buildMetricSet(dataset.samples, predictionById, false),
    metricsBySplit: {
      development: buildMetricSet(developmentSamples, predictionById, false),
      holdout: buildMetricSet(holdoutSamples, predictionById, false),
    },
    providerEvaluation: {
      model: predictionExport.run.model,
      provider: predictionExport.run.provider,
      status: predictionExport.run.mode === 'real-provider' ? 'completed' : 'not-run',
    },
    run: predictionExport.run,
    schemaVersion: 1,
  }
}

export function createClassificationServiceInputExport(
  datasetInput: unknown,
  sources: ReadonlyMap<string, string>,
): ClassificationServiceInputExport {
  const dataset = validateClassificationEvaluationDataset(datasetInput)
  return classificationServiceInputExportSchema.parse({
    datasetId: dataset.datasetId,
    inputs: [...dataset.samples]
      .sort(
        (left, right) =>
          left.batchId.localeCompare(right.batchId) || left.sampleId.localeCompare(right.sampleId),
      )
      .map(sample => {
        const content = sources.get(sample.sourcePath)
        if (content === undefined) {
          throw new ClassificationEvaluationError([`missing source: ${sample.sourcePath}`])
        }
        return {
          batchId: sample.batchId,
          content,
          fileName: sample.fileName,
          sampleId: sample.sampleId,
          sourceSha256: sample.sourceSha256,
        }
      }),
    schemaVersion: 1,
    taxonomyVersion: dataset.taxonomyVersion,
  })
}

export function createRealProviderPredictionExport(
  datasetInput: unknown,
  runInput: unknown,
  resultInput: unknown,
): ClassificationPredictionExport {
  const dataset = validateClassificationEvaluationDataset(datasetInput)
  const run = realProviderRunSchema.parse(runInput)
  const results = z.array(classificationServiceResultSchema).min(1).parse(resultInput)
  const knownCategoryIds = new Set(dataset.categories.map(category => category.categoryId))
  const unknownResult = results.find(
    result => result.categoryId !== null && !knownCategoryIds.has(result.categoryId),
  )
  if (unknownResult?.categoryId) {
    throw new ClassificationEvaluationError([
      `${unknownResult.sampleId} uses unknown categoryId ${unknownResult.categoryId}`,
    ])
  }
  const predictionExport = {
    datasetId: dataset.datasetId,
    predictions: results.map(result =>
      result.needsReview || result.categoryId === null
        ? {
            batchId: result.batchId,
            categoryId: null,
            confidence: result.confidence,
            decision: 'review' as const,
            sampleId: result.sampleId,
            sourceSha256: result.sourceSha256,
          }
        : {
            batchId: result.batchId,
            categoryId: result.categoryId,
            confidence: result.confidence,
            decision: 'classify' as const,
            sampleId: result.sampleId,
            sourceSha256: result.sourceSha256,
          },
    ),
    run,
    schemaVersion: 1 as const,
    taxonomyVersion: dataset.taxonomyVersion,
  }
  return validateClassificationPredictionExport(dataset, predictionExport)
}
