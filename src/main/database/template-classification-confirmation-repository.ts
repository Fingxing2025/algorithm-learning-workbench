import type BetterSqlite3 from 'better-sqlite3'
import { z } from 'zod'

import {
  confirmStagingClassificationReviewRequestSchema,
  confirmTemplateClassificationInputSchema,
  releaseTemplateClassificationInputSchema,
  stagingClassificationReviewBindingSchema,
  templateClassificationConfirmationSchema,
  type ConfirmStagingClassificationReviewRequest,
  type ConfirmTemplateClassificationInput,
  type ReleaseTemplateClassificationInput,
  type StagingClassificationReviewBinding,
  type TemplateClassificationConfirmation,
} from '@core/contracts/template-classification-confirmation'

import type { AppDatabase } from './database'
import {
  createClassificationFingerprint,
  createClassificationTargetFingerprint,
} from '../services/template-classification-fingerprint'

type ConfirmStagingClassificationReviewInput = ConfirmStagingClassificationReviewRequest & {
  workspaceId: string
}

const confirmStagingClassificationReviewInputSchema =
  confirmStagingClassificationReviewRequestSchema
    .extend({ workspaceId: z.string().uuid() })
    .strict()

interface ConfirmationRow {
  categoryId: string
  categoryPathJson: string
  classificationFingerprint: string
  confirmedAt: string
  confirmedRelativePath: string
  decisionSnapshotJson: string
  pathSemantics: string
  revision: number
  sourceHash: string
  status: string
  taxonomyFingerprint: string
  taxonomyVersion: number
  templateId: string
  updatedAt: string
}

interface StagingReviewRow {
  classificationJson: string | null
  reviewClassificationFingerprint: string | null
  reviewDecisionJson: string | null
  reviewRevision: number
  reviewSourceHash: string | null
  reviewStatus: string
  reviewTargetFingerprint: string | null
  reviewTaxonomyFingerprint: string | null
  reviewedAt: string | null
  sourceHash: string
  targetRelativePath: string | null
}

export interface ConfirmedStagingReview {
  binding: StagingClassificationReviewBinding
  reviewRevision: number
  reviewedAt: string
}

export interface ConfirmStagingReviewResult extends ConfirmedStagingReview {
  stagingVersion: number
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${label} JSON is invalid`)
  }
}

function parseConfirmationRow(row: ConfirmationRow): TemplateClassificationConfirmation {
  const decisionSnapshot = parseJson(row.decisionSnapshotJson, 'classification decision')
  const parsed = templateClassificationConfirmationSchema.parse({
    categoryId: row.categoryId,
    categoryPath: parseJson(row.categoryPathJson, 'classification category path'),
    classificationFingerprint: row.classificationFingerprint,
    confirmedAt: row.confirmedAt,
    confirmedRelativePath: row.confirmedRelativePath,
    decisionSnapshot,
    pathSemantics: row.pathSemantics,
    revision: row.revision,
    sourceHash: row.sourceHash,
    status: row.status,
    taxonomyFingerprint: row.taxonomyFingerprint,
    taxonomyVersion: row.taxonomyVersion,
    templateId: row.templateId,
    updatedAt: row.updatedAt,
  })
  if (createClassificationFingerprint(decisionSnapshot) !== parsed.classificationFingerprint) {
    throw new Error('classification decision fingerprint does not match the stored snapshot')
  }
  if (
    parsed.decisionSnapshot.categoryId !== parsed.categoryId ||
    parsed.decisionSnapshot.categoryPath.join('/') !== parsed.categoryPath.join('/')
  ) {
    throw new Error('classification decision snapshot does not match its stored category')
  }
  return parsed
}

function parseStagingReviewRow(row: StagingReviewRow): ConfirmedStagingReview | null {
  if (row.reviewStatus === 'pending') return null
  if (
    row.reviewStatus !== 'confirmed' ||
    !row.reviewDecisionJson ||
    !row.reviewedAt ||
    !row.reviewSourceHash ||
    !row.reviewClassificationFingerprint ||
    !row.reviewTargetFingerprint ||
    !row.reviewTaxonomyFingerprint
  ) {
    throw new Error('staging classification review is incomplete')
  }
  const binding = stagingClassificationReviewBindingSchema.parse(
    parseJson(row.reviewDecisionJson, 'staging classification review'),
  )
  if (
    binding.sourceHash !== row.reviewSourceHash ||
    binding.classificationFingerprint !== row.reviewClassificationFingerprint ||
    binding.targetFingerprint !== row.reviewTargetFingerprint ||
    binding.taxonomyFingerprint !== row.reviewTaxonomyFingerprint
  ) {
    throw new Error('staging classification review bindings are inconsistent')
  }
  return {
    binding,
    reviewedAt: row.reviewedAt,
    reviewRevision: row.reviewRevision,
  }
}

/**
 * Persistence only. Workspace resolution, source reads, taxonomy resolution
 * and user-facing authorization remain Main service responsibilities.
 */
export class TemplateClassificationConfirmationRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  get(templateId: string): TemplateClassificationConfirmation | null {
    const row = this.database.client
      .prepare(
        `SELECT
          template_id AS templateId,
          category_id AS categoryId,
          category_path_json AS categoryPathJson,
          confirmed_relative_path AS confirmedRelativePath,
          path_semantics AS pathSemantics,
          source_hash AS sourceHash,
          taxonomy_version AS taxonomyVersion,
          taxonomy_fingerprint AS taxonomyFingerprint,
          classification_fingerprint AS classificationFingerprint,
          decision_snapshot_json AS decisionSnapshotJson,
          status,
          revision,
          confirmed_at AS confirmedAt,
          updated_at AS updatedAt
         FROM template_classification_confirmations
         WHERE template_id = ?`,
      )
      .get(templateId) as ConfirmationRow | undefined
    return row ? parseConfirmationRow(row) : null
  }

  confirm(rawInput: ConfirmTemplateClassificationInput): TemplateClassificationConfirmation | null {
    const input = confirmTemplateClassificationInputSchema.parse(rawInput)
    const timestamp = this.now()
    const categoryPathJson = JSON.stringify(input.categoryPath)
    const decisionSnapshotJson = JSON.stringify(input.decisionSnapshot)
    const classificationFingerprint = createClassificationFingerprint(input.decisionSnapshot)

    return this.database.client.transaction(() => {
      if (input.expectedRevision === null) {
        const inserted = this.database.client
          .prepare(
            `INSERT INTO template_classification_confirmations
              (template_id, category_id, category_path_json, confirmed_relative_path,
               path_semantics, source_hash, taxonomy_version, taxonomy_fingerprint,
               classification_fingerprint, decision_snapshot_json, status, revision,
               confirmed_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 1, ?, ?)
             ON CONFLICT(template_id) DO NOTHING`,
          )
          .run(
            input.templateId,
            input.categoryId,
            categoryPathJson,
            input.confirmedRelativePath,
            input.pathSemantics,
            input.sourceHash,
            input.taxonomyVersion,
            input.taxonomyFingerprint,
            classificationFingerprint,
            decisionSnapshotJson,
            timestamp,
            timestamp,
          )
        if (inserted.changes !== 1) return null
      } else {
        const updated = this.database.client
          .prepare(
            `UPDATE template_classification_confirmations
             SET category_id = ?, category_path_json = ?, confirmed_relative_path = ?,
                 path_semantics = ?, source_hash = ?, taxonomy_version = ?,
                 taxonomy_fingerprint = ?, classification_fingerprint = ?,
                 decision_snapshot_json = ?, status = 'confirmed', revision = revision + 1,
                 confirmed_at = ?, updated_at = ?
             WHERE template_id = ? AND revision = ?`,
          )
          .run(
            input.categoryId,
            categoryPathJson,
            input.confirmedRelativePath,
            input.pathSemantics,
            input.sourceHash,
            input.taxonomyVersion,
            input.taxonomyFingerprint,
            classificationFingerprint,
            decisionSnapshotJson,
            timestamp,
            timestamp,
            input.templateId,
            input.expectedRevision,
          )
        if (updated.changes !== 1) return null
      }
      return this.get(input.templateId)
    })()
  }

  release(rawInput: ReleaseTemplateClassificationInput): TemplateClassificationConfirmation | null {
    const input = releaseTemplateClassificationInputSchema.parse(rawInput)
    const timestamp = this.now()
    return this.database.client.transaction(() => {
      const updated = this.database.client
        .prepare(
          `UPDATE template_classification_confirmations
           SET status = 'released', revision = revision + 1, updated_at = ?
           WHERE template_id = ? AND revision = ?`,
        )
        .run(timestamp, input.templateId, input.expectedRevision)
      return updated.changes === 1 ? this.get(input.templateId) : null
    })()
  }

  /** Used only after the next template row already exists. Never overwrites a decision. */
  remapTemplateId(previousTemplateId: string, nextTemplateId: string): boolean {
    return this.database.client.transaction(() => {
      const previous = this.get(previousTemplateId)
      if (!previous) return true
      if (this.get(nextTemplateId)) return false
      const targetExists = this.database.client
        .prepare('SELECT 1 FROM templates WHERE id = ?')
        .get(nextTemplateId)
      if (!targetExists) return false
      const result = this.database.client
        .prepare(
          'UPDATE template_classification_confirmations SET template_id = ? WHERE template_id = ?',
        )
        .run(nextTemplateId, previousTemplateId)
      return result.changes === 1
    })()
  }

  getStagingReview(stagingId: string, sourceId: string): ConfirmedStagingReview | null {
    const row = this.database.client
      .prepare(
        `SELECT
          classification_json AS classificationJson,
          source_hash AS sourceHash,
          target_relative_path AS targetRelativePath,
          review_status AS reviewStatus,
          review_decision_json AS reviewDecisionJson,
          review_source_hash AS reviewSourceHash,
          review_classification_fingerprint AS reviewClassificationFingerprint,
          review_target_fingerprint AS reviewTargetFingerprint,
          review_taxonomy_fingerprint AS reviewTaxonomyFingerprint,
          review_revision AS reviewRevision,
          reviewed_at AS reviewedAt
         FROM batch_template_staging_items
         WHERE staging_id = ? AND source_id = ?`,
      )
      .get(stagingId, sourceId) as StagingReviewRow | undefined
    return row ? parseStagingReviewRow(row) : null
  }

  confirmStagingReview(
    rawInput: ConfirmStagingClassificationReviewInput,
  ): ConfirmStagingReviewResult | null {
    const input = confirmStagingClassificationReviewInputSchema.parse(rawInput)
    const timestamp = this.now()
    return this.database.client.transaction(() => {
      const session = this.database.client
        .prepare(
          `SELECT staging_version AS stagingVersion
           FROM batch_template_staging_sessions
           WHERE id = ? AND workspace_id = ?`,
        )
        .get(input.stagingId, input.workspaceId) as { stagingVersion: number } | undefined
      if (!session || session.stagingVersion !== input.expectedStagingVersion) return null

      const item = this.database.client
        .prepare(
          `SELECT
            classification_json AS classificationJson,
            source_hash AS sourceHash,
            target_relative_path AS targetRelativePath,
            review_status AS reviewStatus,
            review_decision_json AS reviewDecisionJson,
            review_source_hash AS reviewSourceHash,
            review_classification_fingerprint AS reviewClassificationFingerprint,
            review_target_fingerprint AS reviewTargetFingerprint,
            review_taxonomy_fingerprint AS reviewTaxonomyFingerprint,
            review_revision AS reviewRevision,
            reviewed_at AS reviewedAt
           FROM batch_template_staging_items
           WHERE staging_id = ? AND source_id = ?`,
        )
        .get(input.stagingId, input.sourceId) as StagingReviewRow | undefined
      if (
        !item ||
        item.reviewRevision !== input.expectedReviewRevision ||
        item.sourceHash !== input.binding.sourceHash ||
        !item.classificationJson ||
        createClassificationFingerprint(
          parseJson(item.classificationJson, 'staging classification'),
        ) !== input.binding.classificationFingerprint ||
        !item.targetRelativePath ||
        createClassificationTargetFingerprint(item.targetRelativePath) !==
          input.binding.targetFingerprint
      )
        return null

      const itemUpdate = this.database.client
        .prepare(
          `UPDATE batch_template_staging_items
           SET review_status = 'confirmed', review_decision_json = ?, review_source_hash = ?,
               review_classification_fingerprint = ?, review_target_fingerprint = ?,
               review_taxonomy_fingerprint = ?, review_revision = review_revision + 1,
               reviewed_at = ?, updated_at = ?
           WHERE staging_id = ? AND source_id = ? AND review_revision = ?`,
        )
        .run(
          JSON.stringify(input.binding),
          input.binding.sourceHash,
          input.binding.classificationFingerprint,
          input.binding.targetFingerprint,
          input.binding.taxonomyFingerprint,
          timestamp,
          timestamp,
          input.stagingId,
          input.sourceId,
          input.expectedReviewRevision,
        )
      if (itemUpdate.changes !== 1) return null
      const sessionUpdate = this.database.client
        .prepare(
          `UPDATE batch_template_staging_sessions
           SET staging_version = staging_version + 1, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND staging_version = ?`,
        )
        .run(timestamp, input.stagingId, input.workspaceId, input.expectedStagingVersion)
      if (sessionUpdate.changes !== 1) return null
      return {
        binding: input.binding,
        reviewedAt: timestamp,
        reviewRevision: input.expectedReviewRevision + 1,
        stagingVersion: input.expectedStagingVersion + 1,
      }
    })()
  }
}

export function tableHasClassificationConfirmations(client: BetterSqlite3.Database): boolean {
  return Boolean(
    client
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'template_classification_confirmations'",
      )
      .get(),
  )
}
