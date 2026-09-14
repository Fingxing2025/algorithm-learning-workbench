import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import type {
  ConfirmedClassificationSnapshot,
  ConfirmTemplateClassificationInput,
} from '@core/contracts/template-classification-confirmation'
import { deriveStagingClassificationReviewState } from '@core/domain/template-classification-confirmation'

import migration from '../../../drizzle/0010_template_classification_confirmations.sql?raw'
import type { AppDatabase } from './database'
import { TemplateClassificationConfirmationRepository } from './template-classification-confirmation-repository'
import {
  createClassificationFingerprint,
  createClassificationTargetFingerprint,
} from '../services/template-classification-fingerprint'

const workspaceId = '40000000-0000-4000-8000-000000000001'
const stagingId = '40000000-0000-4000-8000-000000000002'
const firstSourceId = '40000000-0000-4000-8000-000000000003'
const secondSourceId = '40000000-0000-4000-8000-000000000004'
const firstTemplateId = 'a'.repeat(64)
const secondTemplateId = 'b'.repeat(64)
const sourceHash = 'c'.repeat(64)
const taxonomyFingerprint = 'd'.repeat(64)
const classification = {
  categoryId: 'data-structure.fenwick',
  categoryPath: ['数据结构', '树状数组', 'Fenwick 树'],
  needsReview: true,
}
const targetPath = '数据结构/树状数组/Fenwick 树/fenwick.cpp'
const decisionSnapshot: ConfirmedClassificationSnapshot = {
  algorithmFamily: '树状数组',
  categoryId: 'data-structure.fenwick',
  categoryPath: classification.categoryPath,
  primaryTechnique: '前缀和',
  proposalHistory: [],
  reviewReasons: ['partial-source-coverage'],
  sourceCoverage: null,
  sourceEvidence: [],
  variant: '单点修改',
}

const databases: BetterSqlite3.Database[] = []

function createRepository() {
  const client = new BetterSqlite3(':memory:')
  databases.push(client)
  client.pragma('foreign_keys = ON')
  client.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE templates (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
    );
    CREATE TABLE batch_template_staging_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      staging_version INTEGER DEFAULT 0 NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE batch_template_staging_items (
      staging_id TEXT NOT NULL REFERENCES batch_template_staging_sessions(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      classification_json TEXT,
      source_hash TEXT NOT NULL,
      target_relative_path TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (staging_id, source_id)
    );
  `)
  client.exec(migration)
  client.prepare('INSERT INTO workspaces (id) VALUES (?)').run(workspaceId)
  client
    .prepare('INSERT INTO templates (id, workspace_id) VALUES (?, ?), (?, ?)')
    .run(firstTemplateId, workspaceId, secondTemplateId, workspaceId)
  client
    .prepare(
      'INSERT INTO batch_template_staging_sessions (id, workspace_id, staging_version, updated_at) VALUES (?, ?, 0, ?)',
    )
    .run(stagingId, workspaceId, '2026-09-14T08:00:00.000Z')
  const insertItem = client.prepare(
    `INSERT INTO batch_template_staging_items
      (staging_id, source_id, classification_json, source_hash, target_relative_path, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const sourceId of [firstSourceId, secondSourceId]) {
    insertItem.run(
      stagingId,
      sourceId,
      JSON.stringify(classification),
      sourceHash,
      targetPath,
      '2026-09-14T08:00:00.000Z',
    )
  }
  let tick = 0
  const repository = new TemplateClassificationConfirmationRepository(
    { client } as AppDatabase,
    () => `2026-09-14T08:00:0${tick++}.000Z`,
  )
  return { client, repository }
}

function confirmationInput(
  expectedRevision: number | null,
  templateId = firstTemplateId,
): ConfirmTemplateClassificationInput {
  return {
    categoryId: decisionSnapshot.categoryId,
    categoryPath: decisionSnapshot.categoryPath,
    confirmed: true,
    confirmedRelativePath: targetPath,
    decisionSnapshot,
    expectedRevision,
    pathSemantics: 'canonical',
    sourceHash,
    taxonomyFingerprint,
    taxonomyVersion: 2,
    templateId,
  }
}

function stagingBinding() {
  return {
    classificationFingerprint: createClassificationFingerprint(classification),
    decisionSnapshot,
    sourceHash,
    targetFingerprint: createClassificationTargetFingerprint(targetPath),
    taxonomyFingerprint,
  }
}

afterEach(() => {
  while (databases.length) databases.pop()!.close()
})

describe('TemplateClassificationConfirmationRepository', () => {
  it('persists confirmation, enforces revision CAS, and retains a released decision', () => {
    const { repository } = createRepository()

    const created = repository.confirm(confirmationInput(null))
    expect(created).toMatchObject({ revision: 1, status: 'confirmed' })
    expect(repository.confirm(confirmationInput(null))).toBeNull()
    expect(repository.confirm(confirmationInput(99))).toBeNull()

    const updated = repository.confirm({
      ...confirmationInput(1),
      confirmedRelativePath: '数据结构/树状数组/Fenwick 树/fenwick-renamed.cpp',
      pathSemantics: 'manual',
    })
    expect(updated).toMatchObject({ pathSemantics: 'manual', revision: 2, status: 'confirmed' })
    expect(
      repository.release({ confirmed: true, expectedRevision: 1, templateId: firstTemplateId }),
    ).toBeNull()
    expect(
      repository.release({ confirmed: true, expectedRevision: 2, templateId: firstTemplateId }),
    ).toMatchObject({ revision: 3, status: 'released' })
    expect(repository.get(firstTemplateId)?.decisionSnapshot).toEqual(decisionSnapshot)
  })

  it('remaps by stable template identity without overwriting another confirmation', () => {
    const { client, repository } = createRepository()
    expect(repository.confirm(confirmationInput(null))).not.toBeNull()
    const thirdTemplateId = 'e'.repeat(64)
    client
      .prepare('INSERT INTO templates (id, workspace_id) VALUES (?, ?)')
      .run(thirdTemplateId, workspaceId)

    expect(repository.remapTemplateId(firstTemplateId, thirdTemplateId)).toBe(true)
    expect(repository.get(firstTemplateId)).toBeNull()
    expect(repository.get(thirdTemplateId)?.templateId).toBe(thirdTemplateId)

    expect(repository.confirm(confirmationInput(null, secondTemplateId))).not.toBeNull()
    expect(repository.remapTemplateId(thirdTemplateId, secondTemplateId)).toBe(false)
    expect(repository.get(thirdTemplateId)).not.toBeNull()
  })

  it('uses the session version only as write CAS and preserves earlier item confirmations', () => {
    const { client, repository } = createRepository()
    const first = repository.confirmStagingReview({
      binding: stagingBinding(),
      confirmed: true,
      expectedReviewRevision: 0,
      expectedStagingVersion: 0,
      sourceId: firstSourceId,
      stagingId,
      workspaceId,
    })
    expect(first).toMatchObject({ reviewRevision: 1, stagingVersion: 1 })

    const second = repository.confirmStagingReview({
      binding: stagingBinding(),
      confirmed: true,
      expectedReviewRevision: 0,
      expectedStagingVersion: 1,
      sourceId: secondSourceId,
      stagingId,
      workspaceId,
    })
    expect(second).toMatchObject({ reviewRevision: 1, stagingVersion: 2 })

    const firstStored = repository.getStagingReview(stagingId, firstSourceId)
    expect(firstStored?.reviewRevision).toBe(1)
    expect(
      deriveStagingClassificationReviewState(firstStored?.binding ?? null, {
        classificationFingerprint: createClassificationFingerprint(classification),
        needsReview: true,
        sourceHash,
        targetFingerprint: createClassificationTargetFingerprint(targetPath),
        taxonomyFingerprint,
      }),
    ).toBe('confirmed')
    expect(
      client
        .prepare(
          'SELECT staging_version AS stagingVersion FROM batch_template_staging_sessions WHERE id = ?',
        )
        .get(stagingId),
    ).toEqual({ stagingVersion: 2 })
  })

  it('rejects stale session, item revision, source, classification, or target without writes', () => {
    const { client, repository } = createRepository()
    const totalChanges = () => Number(client.prepare('SELECT total_changes()').pluck().get())
    const before = totalChanges()
    const attempts = [
      { expectedStagingVersion: 9 },
      { expectedReviewRevision: 9 },
      { binding: { ...stagingBinding(), sourceHash: 'f'.repeat(64) } },
      { binding: { ...stagingBinding(), classificationFingerprint: 'f'.repeat(64) } },
      { binding: { ...stagingBinding(), targetFingerprint: 'f'.repeat(64) } },
    ]
    for (const override of attempts) {
      expect(
        repository.confirmStagingReview({
          binding: stagingBinding(),
          confirmed: true,
          expectedReviewRevision: 0,
          expectedStagingVersion: 0,
          sourceId: firstSourceId,
          stagingId,
          workspaceId,
          ...override,
        }),
      ).toBeNull()
    }
    expect(totalChanges()).toBe(before)
    expect(repository.getStagingReview(stagingId, firstSourceId)).toBeNull()
  })
})
