import type {
  StagingClassificationReviewBinding,
  TemplateClassificationConfirmation,
} from '../contracts/template-classification-confirmation'

export type ClassificationConfirmationStaleReason =
  'source-changed' | 'taxonomy-changed' | 'path-changed'

export type DerivedClassificationConfirmationState =
  | { reasons: []; state: 'confirmed' | 'released' }
  | {
      reasons: ClassificationConfirmationStaleReason[]
      state: 'stale-source' | 'stale-taxonomy' | 'path-changed'
    }

export interface CurrentClassificationConfirmationContext {
  relativePath: string
  sourceHash: string
  taxonomyFingerprint: string
  taxonomyVersion: number
}

/** Pure read-time derivation. Callers must never persist from this function. */
export function deriveClassificationConfirmationState(
  confirmation: TemplateClassificationConfirmation,
  current: CurrentClassificationConfirmationContext,
): DerivedClassificationConfirmationState {
  if (confirmation.status === 'released') return { reasons: [], state: 'released' }
  const reasons: ClassificationConfirmationStaleReason[] = []
  if (confirmation.sourceHash !== current.sourceHash) reasons.push('source-changed')
  if (
    confirmation.taxonomyVersion !== current.taxonomyVersion ||
    confirmation.taxonomyFingerprint !== current.taxonomyFingerprint
  )
    reasons.push('taxonomy-changed')
  if (confirmation.confirmedRelativePath !== current.relativePath) reasons.push('path-changed')
  if (reasons.includes('source-changed')) return { reasons, state: 'stale-source' }
  if (reasons.includes('taxonomy-changed')) return { reasons, state: 'stale-taxonomy' }
  if (reasons.includes('path-changed')) return { reasons, state: 'path-changed' }
  return { reasons: [], state: 'confirmed' }
}

export type DerivedStagingReviewState =
  | 'not-required'
  | 'pending'
  | 'confirmed'
  | 'stale-source'
  | 'stale-classification'
  | 'stale-target'
  | 'stale-taxonomy'

export interface CurrentStagingReviewContext {
  classificationFingerprint: string
  needsReview: boolean
  sourceHash: string
  targetFingerprint: string
  taxonomyFingerprint: string
}

/**
 * Item validity is intentionally independent of the session's global
 * stagingVersion. The global version is only a write CAS; unrelated item
 * confirmations must not invalidate one another.
 */
export function deriveStagingClassificationReviewState(
  binding: StagingClassificationReviewBinding | null,
  current: CurrentStagingReviewContext,
): DerivedStagingReviewState {
  if (!current.needsReview) return 'not-required'
  if (!binding) return 'pending'
  if (binding.sourceHash !== current.sourceHash) return 'stale-source'
  if (binding.classificationFingerprint !== current.classificationFingerprint)
    return 'stale-classification'
  if (binding.targetFingerprint !== current.targetFingerprint) return 'stale-target'
  if (binding.taxonomyFingerprint !== current.taxonomyFingerprint) return 'stale-taxonomy'
  return 'confirmed'
}
