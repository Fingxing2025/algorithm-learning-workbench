/// <reference types="node" />

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ClassificationEvaluationError,
  createClassificationServiceInputExport,
  createRealProviderPredictionExport,
  scoreClassificationPredictions,
  validateClassificationEvaluationDataset,
  validateClassificationPredictionExport,
} from './classification-evaluation'

const fixtureRoot = resolve('tests/fixtures/classification-evaluation')
const manifest = JSON.parse(readFileSync(resolve(fixtureRoot, 'manifest.json'), 'utf8'))
const mockPredictions = JSON.parse(
  readFileSync(resolve(fixtureRoot, 'mock-perfect.predictions.json'), 'utf8'),
)
const sha256 = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex')

const loadSources = (dataset: typeof manifest): Map<string, string> =>
  new Map(
    dataset.samples.map((sample: { sourcePath: string }) => [
      sample.sourcePath,
      readFileSync(resolve(fixtureRoot, sample.sourcePath), 'utf8'),
    ]),
  )

describe('classification evaluation dataset', () => {
  it('validates 135 standalone-source samples while keeping 27 base implementations split', () => {
    const dataset = validateClassificationEvaluationDataset(manifest, {
      sha256,
      sources: loadSources(manifest),
    })
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

    expect(dataset.labelStatus).toBe('provisional-ai-drafted-unreviewed')
    expect(dataset.sampleCount).toBe(135)
    expect(dataset.baseImplementationCount).toBe(27)
    expect(developmentBases.size).toBe(16)
    expect(holdoutBases.size).toBe(11)
    expect([...developmentBases].some(baseId => holdoutBases.has(baseId))).toBe(false)
  })

  it('exports source-only classification inputs without leaking provisional gold labels', () => {
    const serviceInput = createClassificationServiceInputExport(manifest, loadSources(manifest))

    expect(serviceInput.inputs).toHaveLength(135)
    expect(serviceInput.taxonomyVersion).toBe(2)
    expect(serviceInput.inputs[0]).toEqual(
      expect.objectContaining({
        batchId: expect.any(String),
        content: expect.stringContaining('int main'),
        fileName: expect.stringMatching(/\.cpp$/u),
        sampleId: expect.any(String),
        sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    )
    expect(JSON.stringify(serviceInput)).not.toContain('primaryCategoryId')
    expect(JSON.stringify(serviceInput)).not.toContain('componentCategoryIds')
    expect(serviceInput.inputs.map(input => input.batchId)).toEqual(
      [...serviceInput.inputs.map(input => input.batchId)].sort(),
    )
    const batchesByBase = new Map<string, Set<string>>()
    for (const sample of manifest.samples) {
      const batches = batchesByBase.get(sample.baseImplementationId) ?? new Set<string>()
      batches.add(sample.batchId)
      batchesByBase.set(sample.baseImplementationId, batches)
    }
    expect([...batchesByBase.values()].every(batches => batches.size === 5)).toBe(true)
  })

  it('rejects a structural near-duplicate copied across development and holdout bases', () => {
    const changed = structuredClone(manifest)
    const sources = loadSources(manifest)
    const development = changed.samples.find(
      (sample: { split: string; variant: string }) =>
        sample.split === 'development' && sample.variant === 'canonical',
    )
    const holdout = changed.samples.find(
      (sample: { split: string; variant: string }) =>
        sample.split === 'holdout' && sample.variant === 'canonical',
    )
    const leakedSource = sources.get(development.sourcePath)!
    sources.set(holdout.sourcePath, leakedSource)
    holdout.sourceSha256 = sha256(leakedSource)

    expect(() => validateClassificationEvaluationDataset(changed, { sha256, sources })).toThrow(
      /near-duplicate leakage/u,
    )
  })

  it('rejects traversal-like source paths even for small derived datasets', () => {
    const changed = structuredClone(manifest)
    changed.sampleCount = 1
    changed.baseImplementationCount = 1
    changed.samples = [changed.samples[0]]
    changed.samples[0].sourcePath = 'sources/../outside.cpp'

    expect(() => validateClassificationEvaluationDataset(changed)).toThrow()
  })
})

describe('classification prediction scoring', () => {
  it('scores all requested metrics with sample sizes and Wilson intervals', () => {
    const report = scoreClassificationPredictions(manifest, mockPredictions)

    expect(report.providerEvaluation).toEqual({ model: null, provider: null, status: 'not-run' })
    expect(report.dataset.splitCounts).toEqual({
      development: { baseImplementations: 16, samples: 80 },
      holdout: { baseImplementations: 11, samples: 55 },
    })
    expect(report.metrics.overallPrimaryAccuracy.estimate).toBe(1)
    expect(report.metrics.lowAmbiguitySuggestionPrecision.estimate).toBe(1)
    expect(report.metrics.lowAmbiguitySuggestionCoverage.estimate).toBeCloseTo(115 / 135)
    expect(report.metrics.goldLowAmbiguityClassificationCoverage.estimate).toBe(1)
    expect(report.metrics.unknownReviewRate.estimate).toBe(1)
    expect(report.metrics.compositeReviewRate.estimate).toBe(1)
    expect(report.metrics.erroneousHardClassificationRate.estimate).toBe(0)
    expect(report.metrics.namingPerturbationStability.estimate).toBe(1)
    expect(report.metrics.batchStability.estimate).toBe(1)
    expect(report.metrics.overallPrimaryAccuracy.wilson95).toBeNull()
    expect(report.canonicalBaseMetrics.overallPrimaryAccuracy.total).toBe(23)
    expect(report.canonicalBaseMetrics.overallPrimaryAccuracy.wilson95?.lower).toBeGreaterThan(0.85)
    expect(report.metricsBySplit.development.overallPrimaryAccuracy.estimate).toBe(1)
    expect(report.metricsBySplit.holdout.overallPrimaryAccuracy.estimate).toBe(1)
    expect(
      report.canonicalBaseMetricsBySplit.development.overallPrimaryAccuracy.wilson95,
    ).not.toBeNull()
  })

  it.each([
    ['missing prediction', (input: typeof mockPredictions) => input.predictions.pop()],
    [
      'duplicate prediction sampleId',
      (input: typeof mockPredictions) => input.predictions.push(input.predictions[0]),
    ],
    [
      'unknown prediction sampleId',
      (input: typeof mockPredictions) => {
        input.predictions[0].sampleId = 'not-in-dataset'
      },
    ],
    [
      'unknown categoryId',
      (input: typeof mockPredictions) => {
        input.predictions[0].categoryId = 'invented.category'
      },
    ],
    [
      'sourceSha256 does not match',
      (input: typeof mockPredictions) => {
        input.predictions[0].sourceSha256 = '0'.repeat(64)
      },
    ],
    [
      'taxonomyVersion',
      (input: typeof mockPredictions) => {
        input.taxonomyVersion += 1
      },
    ],
  ])('rejects invalid prediction exports containing %s', (expected, mutate) => {
    const changed = structuredClone(mockPredictions)
    mutate(changed)

    expect(() =>
      validateClassificationPredictionExport(
        validateClassificationEvaluationDataset(manifest),
        changed,
      ),
    ).toThrow(expected)
  })

  it('uses explicit review decisions instead of treating expected labels as predictions', () => {
    const changed = structuredClone(mockPredictions)
    const single = changed.predictions.find(
      (prediction: { decision: string }) => prediction.decision === 'classify',
    )
    single.decision = 'review'
    single.categoryId = null
    single.confidence = 0.4

    const report = scoreClassificationPredictions(manifest, changed)
    expect(report.metrics.overallPrimaryAccuracy.successes).toBe(
      report.metrics.overallPrimaryAccuracy.total - 1,
    )
    expect(report.metrics.lowAmbiguitySuggestionCoverage.successes).toBe(
      report.metrics.overallPrimaryAccuracy.total - 1,
    )
  })

  it('converts explicit real ProviderAdapter results into a version-bound prediction export', () => {
    const serviceResults = mockPredictions.predictions.map(
      (prediction: {
        batchId: string
        categoryId: string | null
        confidence: number
        decision: string
        sampleId: string
        sourceSha256: string
      }) => ({
        batchId: prediction.batchId,
        categoryId: prediction.categoryId,
        confidence: prediction.confidence,
        needsReview: prediction.decision === 'review',
        sampleId: prediction.sampleId,
        sourceSha256: prediction.sourceSha256,
      }),
    )
    const predictionExport = createRealProviderPredictionExport(
      manifest,
      {
        classificationServiceVersion: 'classification-service-v3',
        completedAt: '2026-09-14T01:00:00.000Z',
        mode: 'real-provider',
        model: 'explicit-model-id',
        promptVersion: 'classification-prompt-v7',
        provider: 'explicit-provider-profile',
        runId: 'real-provider-run-001',
      },
      serviceResults,
    )

    expect(predictionExport.taxonomyVersion).toBe(2)
    expect(predictionExport.run.mode).toBe('real-provider')
    expect(predictionExport.predictions).toHaveLength(135)
  })

  it('rejects an unknown category returned by a ProviderAdapter even when it asks for review', () => {
    const serviceResult = {
      batchId: mockPredictions.predictions[0].batchId,
      categoryId: 'invented.category',
      confidence: 0.1,
      needsReview: true,
      sampleId: mockPredictions.predictions[0].sampleId,
      sourceSha256: mockPredictions.predictions[0].sourceSha256,
    }

    expect(() =>
      createRealProviderPredictionExport(
        manifest,
        {
          classificationServiceVersion: 'classification-service-v3',
          completedAt: '2026-09-14T01:00:00.000Z',
          mode: 'real-provider',
          model: 'explicit-model-id',
          promptVersion: 'classification-prompt-v7',
          provider: 'explicit-provider-profile',
          runId: 'real-provider-run-unknown-id',
        },
        [serviceResult],
      ),
    ).toThrow(/unknown categoryId/u)
  })

  it('surfaces contract issues as a dedicated error type', () => {
    expect(() =>
      validateClassificationPredictionExport(validateClassificationEvaluationDataset(manifest), {
        ...mockPredictions,
        predictions: [],
      }),
    ).toThrow()
    expect(new ClassificationEvaluationError(['example']).message).toContain(
      'Classification evaluation input is invalid',
    )
  })
})
