import { describe, expect, it } from 'vitest'

import {
  confirmStagingClassificationReviewRequestSchema,
  confirmTemplateClassificationInputSchema,
  type ConfirmedClassificationSnapshot,
  type StagingClassificationReviewBinding,
  type TemplateClassificationConfirmation,
} from '../contracts/template-classification-confirmation'
import {
  deriveClassificationConfirmationState,
  deriveStagingClassificationReviewState,
} from './template-classification-confirmation'

const hash = (character: string) => character.repeat(64)
const categoryPath = ['数据结构', '树状数组', 'Fenwick 树']
const decisionSnapshot: ConfirmedClassificationSnapshot = {
  algorithmFamily: '树状数组',
  categoryId: 'data-structure.fenwick',
  categoryPath,
  primaryTechnique: '前缀和',
  proposalHistory: [],
  reviewReasons: ['partial-source-coverage'],
  sourceCoverage: null,
  sourceEvidence: [],
  variant: '单点修改',
}

const confirmation: TemplateClassificationConfirmation = {
  categoryId: 'data-structure.fenwick',
  categoryPath,
  classificationFingerprint: hash('d'),
  confirmedAt: '2026-09-14T08:00:00.000Z',
  confirmedRelativePath: '数据结构/树状数组/Fenwick 树/fenwick.cpp',
  decisionSnapshot,
  pathSemantics: 'canonical',
  revision: 1,
  sourceHash: hash('a'),
  status: 'confirmed',
  taxonomyFingerprint: hash('b'),
  taxonomyVersion: 2,
  templateId: hash('c'),
  updatedAt: '2026-09-14T08:00:00.000Z',
}

describe('template classification confirmation contracts and states', () => {
  it('rejects arbitrary paths and inconsistent classification snapshots', () => {
    const input = {
      categoryId: confirmation.categoryId,
      categoryPath,
      confirmed: true,
      confirmedRelativePath: '../outside.cpp',
      decisionSnapshot: { ...decisionSnapshot, categoryId: 'graph.mst' },
      expectedRevision: null,
      pathSemantics: 'canonical',
      sourceHash: confirmation.sourceHash,
      taxonomyFingerprint: confirmation.taxonomyFingerprint,
      taxonomyVersion: 2,
      templateId: confirmation.templateId,
      workspaceId: '40000000-0000-4000-8000-000000000001',
    }

    expect(confirmTemplateClassificationInputSchema.safeParse(input).success).toBe(false)
  })

  it('does not let the Renderer select a workspace for staging review', () => {
    expect(
      confirmStagingClassificationReviewRequestSchema.safeParse({
        binding: {
          classificationFingerprint: hash('a'),
          decisionSnapshot,
          sourceHash: hash('b'),
          targetFingerprint: hash('c'),
          taxonomyFingerprint: hash('d'),
        },
        confirmed: true,
        expectedReviewRevision: 0,
        expectedStagingVersion: 0,
        sourceId: '40000000-0000-4000-8000-000000000001',
        stagingId: '40000000-0000-4000-8000-000000000002',
        workspaceId: '40000000-0000-4000-8000-000000000003',
      }).success,
    ).toBe(false)
  })

  it('derives stale states without mutating the stored confirmation', () => {
    const before = structuredClone(confirmation)
    expect(
      deriveClassificationConfirmationState(confirmation, {
        relativePath: confirmation.confirmedRelativePath,
        sourceHash: confirmation.sourceHash,
        taxonomyFingerprint: confirmation.taxonomyFingerprint,
        taxonomyVersion: 2,
      }),
    ).toEqual({ reasons: [], state: 'confirmed' })
    expect(
      deriveClassificationConfirmationState(confirmation, {
        relativePath: '数据结构/树状数组/Fenwick 树/renamed.cpp',
        sourceHash: hash('e'),
        taxonomyFingerprint: hash('f'),
        taxonomyVersion: 3,
      }),
    ).toEqual({
      reasons: ['source-changed', 'taxonomy-changed', 'path-changed'],
      state: 'stale-source',
    })
    expect(confirmation).toEqual(before)
  })

  it('treats a released confirmation as released even after source changes', () => {
    expect(
      deriveClassificationConfirmationState(
        { ...confirmation, status: 'released' },
        {
          relativePath: 'moved.cpp',
          sourceHash: hash('e'),
          taxonomyFingerprint: hash('f'),
          taxonomyVersion: 3,
        },
      ),
    ).toEqual({ reasons: [], state: 'released' })
  })

  it('binds staging review to item fingerprints, never to global stagingVersion', () => {
    const binding: StagingClassificationReviewBinding = {
      classificationFingerprint: hash('a'),
      decisionSnapshot,
      sourceHash: hash('b'),
      targetFingerprint: hash('c'),
      taxonomyFingerprint: hash('d'),
    }
    const current = {
      classificationFingerprint: hash('a'),
      needsReview: true,
      sourceHash: hash('b'),
      targetFingerprint: hash('c'),
      taxonomyFingerprint: hash('d'),
    }
    expect(deriveStagingClassificationReviewState(binding, current)).toBe('confirmed')
    expect(
      deriveStagingClassificationReviewState(binding, {
        ...current,
        targetFingerprint: hash('e'),
      }),
    ).toBe('stale-target')
    expect(deriveStagingClassificationReviewState(null, { ...current, needsReview: false })).toBe(
      'not-required',
    )
  })
})
