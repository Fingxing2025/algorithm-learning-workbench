// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabaseAtPath } from './database'
import {
  BatchTemplateStagingRepository,
  type CreateBatchTemplateStagingInput,
} from './batch-template-staging-repository'
import { batchTemplateStagingItems, batchTemplateStagingSessions, workspaces } from './schema'

const workspaceId = '40000000-0000-4000-8000-000000000101'
const otherWorkspaceId = '40000000-0000-4000-8000-000000000102'
const stagingId = '40000000-0000-4000-8000-000000000103'
const sourceId = '40000000-0000-4000-8000-000000000104'
const otherSourceId = '40000000-0000-4000-8000-000000000105'
const treeHash = 'a'.repeat(64)
const workspaceVersion = 'b'.repeat(64)
const sourceHash = 'c'.repeat(64)

function source(
  overrides: Partial<CreateBatchTemplateStagingInput['items'][number]> = {},
): CreateBatchTemplateStagingInput['items'][number] {
  return {
    displayPath: '图论/最短路.cpp',
    fileName: '最短路.cpp',
    ordinal: 0,
    sourceEncoding: 'utf-8',
    sourceHash,
    sourceId,
    sourceRelativePath: '图论/最短路.cpp',
    ...overrides,
  }
}

function createInput(
  overrides: Partial<CreateBatchTemplateStagingInput> = {},
): CreateBatchTemplateStagingInput {
  return {
    baseTreeHash: treeHash,
    baseWorkspaceVersion: workspaceVersion,
    id: stagingId,
    items: [source()],
    outputLanguage: 'zh-CN',
    workspaceId,
    ...overrides,
  }
}

describe('BatchTemplateStagingRepository', () => {
  let temporaryRoot: string
  let database: ReturnType<typeof createDatabaseAtPath>
  let repository: BatchTemplateStagingRepository

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-staging-repository-'))
    database = createDatabaseAtPath(join(temporaryRoot, 'workspace.sqlite'))
    database.orm
      .insert(workspaces)
      .values([
        {
          createdAt: '2026-09-03T00:00:00.000Z',
          id: workspaceId,
          name: '主工作区',
          rootPath: join(temporaryRoot, 'main'),
        },
        {
          createdAt: '2026-09-03T00:00:00.000Z',
          id: otherWorkspaceId,
          name: '其他工作区',
          rootPath: join(temporaryRoot, 'other'),
        },
      ])
      .run()
    repository = new BatchTemplateStagingRepository(database)
  })

  afterEach(async () => {
    database.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  })

  it('upgrades an existing V2 database without replacing existing workspace rows', () => {
    const before = database.client.prepare('SELECT * FROM workspaces ORDER BY id').all()
    database.client.exec(
      "DROP TABLE batch_template_staging_items; DROP TABLE batch_template_staging_sessions; DELETE FROM app_migrations WHERE id = '0009_batch_template_staging';",
    )
    const path = database.path!
    database.close()
    database = createDatabaseAtPath(path)
    repository = new BatchTemplateStagingRepository(database)
    expect(database.client.prepare('SELECT * FROM workspaces ORDER BY id').all()).toEqual(before)
    expect(database.client.pragma('foreign_key_check')).toEqual([])
    expect(repository.create(createInput()).items).toHaveLength(1)
    database.close()
    database = createDatabaseAtPath(path)
    expect(
      new BatchTemplateStagingRepository(database).get(workspaceId, stagingId)?.items,
    ).toHaveLength(1)
  })

  it('applies migration 0009 and creates both staging tables and indexes', () => {
    const migration = database.client
      .prepare('SELECT id FROM app_migrations WHERE id = ?')
      .get('0009_batch_template_staging') as { id: string } | undefined
    expect(migration?.id).toBe('0009_batch_template_staging')

    const tableNames = database.client
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN (?, ?)
         ORDER BY name`,
      )
      .all('batch_template_staging_items', 'batch_template_staging_sessions') as Array<{
      name: string
    }>
    expect(tableNames.map(row => row.name)).toEqual([
      'batch_template_staging_items',
      'batch_template_staging_sessions',
    ])
    const indexes = database.client
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'index' AND name LIKE 'batch_template_staging_%'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>
    expect(indexes.map(row => row.name)).toEqual([
      'batch_template_staging_items_staging_ordinal_unique',
      'batch_template_staging_items_staging_status_ordinal_index',
      'batch_template_staging_sessions_workspace_status_index',
    ])
  })

  it('creates session and initial items atomically and returns an aggregate', () => {
    const aggregate = repository.create(createInput())
    expect(aggregate.session).toMatchObject({
      baseTreeHash: treeHash,
      baseWorkspaceVersion: workspaceVersion,
      id: stagingId,
      stagingVersion: 0,
      status: 'processing',
      totalCount: 1,
      workspaceId,
    })
    expect(aggregate.items).toHaveLength(1)
    expect(aggregate.items[0]).toMatchObject({
      sourceHash,
      sourceId,
      status: 'pending',
    })
    expect(repository.get(workspaceId, stagingId)).toEqual(aggregate)
    expect(repository.list(workspaceId)).toHaveLength(1)
    expect(repository.listSessions(otherWorkspaceId)).toEqual([])

    const positional = repository.create(workspaceId, {
      baseTreeHash: treeHash,
      baseWorkspaceVersion: workspaceVersion,
      id: '40000000-0000-4000-8000-000000000108',
      items: [source({ sourceId: otherSourceId })],
      outputLanguage: 'zh-CN',
    })
    expect(positional.session.workspaceId).toBe(workspaceId)
  })

  it('rejects invalid counts, duplicate IDs/ordinals, and rolls back the session insert', () => {
    expect(() => repository.create(createInput({ totalCount: 2 }))).toThrow(
      '暂存总数与源码数量不一致',
    )
    expect(() =>
      repository.create(
        createInput({
          id: '40000000-0000-4000-8000-000000000106',
          items: [source(), source({ ordinal: 1 })],
          totalCount: 2,
        }),
      ),
    ).toThrow('源文件 ID')
    expect(() =>
      repository.create(
        createInput({
          id: '40000000-0000-4000-8000-000000000107',
          items: [source({ sourceId: sourceId, ordinal: 0 }), source({ sourceId: otherSourceId })],
          totalCount: 2,
        }),
      ),
    ).toThrow('暂存顺序不能重复')
    expect(repository.listSessions(workspaceId)).toEqual([])
  })

  it('rejects Windows drive-relative paths as non-workspace paths', () => {
    expect(() =>
      repository.create(
        createInput({
          items: [source({ displayPath: 'C:outside.cpp' })],
        }),
      ),
    ).toThrow('工作区相对路径')
    expect(() =>
      repository.create(
        createInput({
          items: [source({ sourceRelativePath: 'D:outside.cpp' })],
        }),
      ),
    ).toThrow('工作区相对路径')
  })

  it('increments the session version for real item mutations and makes repeats idempotent', () => {
    repository.create(createInput())
    const unchanged = repository.upsertItem({
      ...source(),
      stagingId,
      workspaceId,
      expectedVersion: 0,
      status: 'pending',
    })
    expect(unchanged?.sourceHash).toBe(sourceHash)
    expect(repository.getSession(workspaceId, stagingId)?.stagingVersion).toBe(0)

    const updated = repository.upsertItem({
      ...source({ targetRelativePath: '图论/最短路-导入.cpp', status: 'completed' }),
      stagingId,
      workspaceId,
      expectedVersion: 0,
    })
    expect(updated).toMatchObject({
      status: 'completed',
      targetRelativePath: '图论/最短路-导入.cpp',
    })
    expect(repository.getSession(workspaceId, stagingId)?.stagingVersion).toBe(1)
  })

  it('rejects stale versions and source drift without partial writes', () => {
    repository.create(createInput())
    const stale = repository.updateSession({
      currentIndex: 1,
      expectedVersion: 99,
      processedCount: 1,
      stagingId,
      status: 'ready',
      workspaceId,
    })
    expect(stale).toBeNull()
    expect(repository.getSession(workspaceId, stagingId)).toMatchObject({
      currentIndex: 0,
      processedCount: 0,
      stagingVersion: 0,
      status: 'processing',
    })

    const drift = repository.upsertItem({
      ...source({ sourceHash: 'd'.repeat(64), status: 'completed' }),
      stagingId,
      workspaceId,
      expectedVersion: 0,
    })
    expect(drift).toBeNull()
    expect(repository.getItem(workspaceId, stagingId, sourceId)).toMatchObject({
      sourceHash,
      status: 'pending',
    })
    expect(() =>
      repository.upsertItem({
        ...source({ sourceId: otherSourceId, sourceHash: 'e'.repeat(64) }),
        stagingId,
        workspaceId,
      }),
    ).toThrow('不属于此暂存批次')
  })

  it('validates status transitions and counter ranges', () => {
    repository.create(createInput())
    expect(
      repository.updateSession({
        currentIndex: 1,
        expectedVersion: 0,
        processedCount: 1,
        stagingId,
        status: 'ready',
        workspaceId,
      }),
    ).toMatchObject({ status: 'ready', stagingVersion: 1 })
    expect(() =>
      repository.updateSession({
        expectedVersion: 1,
        stagingId,
        status: 'applied',
        workspaceId,
      }),
    ).toThrow('不能从“ready”变更为“applied”')
    expect(() =>
      repository.updateSession({
        currentIndex: 2,
        expectedVersion: 1,
        stagingId,
        workspaceId,
      }),
    ).toThrow('当前暂存位置超出范围')
    expect(() =>
      repository.upsertItem({
        ...source({ status: 'invalid' as never }),
        stagingId,
        workspaceId,
        expectedVersion: 1,
      }),
    ).toThrow('暂存状态无效')
  })

  it('enforces workspace isolation and cascades item deletion', () => {
    repository.create(createInput())
    expect(repository.get(otherWorkspaceId, stagingId)).toBeNull()
    expect(repository.getItem(otherWorkspaceId, stagingId, sourceId)).toBeNull()
    expect(repository.listItems(otherWorkspaceId, stagingId)).toEqual([])
    expect(
      repository.updateSession({
        expectedVersion: 0,
        stagingId,
        status: 'ready',
        workspaceId: otherWorkspaceId,
      }),
    ).toBeNull()
    expect(repository.deleteSession(otherWorkspaceId, stagingId, 0)).toBe(false)
    expect(database.orm.select().from(batchTemplateStagingItems).all()).toHaveLength(1)

    expect(repository.deleteSession(workspaceId, stagingId, 0)).toBe(true)
    expect(database.orm.select().from(batchTemplateStagingSessions).all()).toEqual([])
    expect(database.orm.select().from(batchTemplateStagingItems).all()).toEqual([])
  })
})
