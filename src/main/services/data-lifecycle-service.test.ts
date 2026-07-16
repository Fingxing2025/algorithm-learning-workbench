import { mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { BackupVerification } from '@core/contracts/data-management'

import type { AppDatabase } from '../database/database'
import { DataLifecycleService } from './data-lifecycle-service'

describe('DataLifecycleService', () => {
  let database: AppDatabase
  let executionRecords: Array<{ backupDirectory: string; status: string }>
  let temporaryRoot: string
  let userDataPath: string
  let service: DataLifecycleService

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-lifecycle-'))
    userDataPath = join(temporaryRoot, 'user-data')
    await mkdir(userDataPath)
    executionRecords = []
    database = {
      client: {
        prepare: () => ({ all: () => executionRecords }),
      },
    } as unknown as AppDatabase
    service = new DataLifecycleService(database, userDataPath, async packagePath =>
      fakeVerification(packagePath, packagePath.includes('valid')),
    )
  })

  afterEach(async () => {
    delete process.env.E2E_CLEANUP_FAIL_AFTER_MOVES
    delete process.env.E2E_CLEANUP_FAIL_AFTER_UNDO_MOVES
    await rm(temporaryRoot, { force: true, recursive: true })
  })

  async function createManagedDirectory(relativePath: string, content = 'fixture') {
    const target = join(userDataPath, ...relativePath.split('/'))
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'payload.bin'), content)
    return target
  }

  function insertAppliedExecution(backupDirectory: string) {
    executionRecords.push({ backupDirectory, status: 'applied' })
  }

  it('classifies retention, protected rollback backups, review items, and symlinks', async () => {
    const oldPreflight = await createManagedDirectory(
      'restore-preflight-backups/old-valid.awb-backup',
    )
    const latestPreflight = await createManagedDirectory(
      'restore-preflight-backups/latest-valid.awb-backup',
    )
    const oldTime = new Date(Date.now() - 45 * 24 * 60 * 60 * 1_000)
    await utimes(oldPreflight, oldTime, oldTime)
    await createManagedDirectory('file-plan-backups/active-execution')
    await createManagedDirectory('file-plan-backups/unrecorded')
    await createManagedDirectory('batch-import-backups/unrecorded')
    await createManagedDirectory('problem-images/.trash/residual')
    await createManagedDirectory('.restore-interrupted.tmp/original')
    const outside = await createManagedDirectory('outside')
    await symlink(outside, join(userDataPath, 'batch-import-backups', 'linked'))
    insertAppliedExecution('file-plan-backups/active-execution')

    const inventory = await service.inspect({ retentionPolicy: '30-days' })
    const candidate = (reason: string) => inventory.candidates.find(item => item.reason === reason)

    expect(candidate('retention-expired')).toMatchObject({
      canQuarantine: true,
      disposition: 'suggested',
      verificationOk: true,
    })
    expect(candidate('latest-valid-preflight')).toMatchObject({
      canQuarantine: false,
      disposition: 'protected',
    })
    expect(candidate('applied-file-execution')).toMatchObject({
      canQuarantine: false,
      disposition: 'protected',
    })
    expect(candidate('unrecorded-file-plan-backup')).toMatchObject({
      canQuarantine: true,
      disposition: 'review',
    })
    expect(candidate('batch-import-without-record')).toMatchObject({ canQuarantine: true })
    expect(candidate('residual-image-trash')).toMatchObject({ canQuarantine: true })
    expect(candidate('symlink-detected')).toMatchObject({
      canQuarantine: false,
      disposition: 'protected',
    })
    expect(inventory.interruptedOperationCount).toBe(1)
    expect(inventory.areas.find(area => area.key === 'interrupted-operations')).toMatchObject({
      itemCount: 1,
      quarantinableCount: 0,
    })
    expect(JSON.stringify(inventory)).not.toContain(userDataPath)
    expect(await stat(latestPreflight)).toBeTruthy()

    const foreverInventory = await service.inspect({ retentionPolicy: 'forever' })
    expect(
      foreverInventory.candidates.find(item => item.reason === 'retention-policy-forever'),
    ).toMatchObject({ canQuarantine: false, disposition: 'protected' })
  })

  it('quarantines confirmed opaque candidates and restores them without exposing paths', async () => {
    const filePlan = await createManagedDirectory('file-plan-backups/unrecorded')
    const batch = await createManagedDirectory('batch-import-backups/unrecorded')
    const inventory = await service.inspect({ retentionPolicy: 'forever' })
    const candidateIds = inventory.candidates
      .filter(candidate => candidate.canQuarantine)
      .map(candidate => candidate.id)

    const preview = await service.preview({ candidateIds, retentionPolicy: 'forever' })
    expect(preview.canExecute).toBe(true)
    expect(JSON.stringify(preview)).not.toContain(userDataPath)

    const result = await service.quarantine({
      candidateIds,
      confirmQuarantine: true,
      retentionPolicy: 'forever',
    })
    await expect(stat(filePlan)).rejects.toThrow()
    await expect(stat(batch)).rejects.toThrow()
    expect(result.operation).toMatchObject({ canUndo: true, itemCount: 2 })
    const manifestText = await readFile(
      join(userDataPath, 'data-management-quarantine', result.operation.id, 'manifest.json'),
      'utf8',
    )
    expect(manifestText).not.toContain(temporaryRoot)

    const undone = await service.undo({
      confirmUndo: true,
      operationId: result.operation.id,
      retentionPolicy: 'forever',
    })
    expect(undone.restoredCount).toBe(2)
    await expect(stat(filePlan)).resolves.toBeTruthy()
    await expect(stat(batch)).resolves.toBeTruthy()
    await expect(
      stat(join(userDataPath, 'data-management-quarantine', result.operation.id)),
    ).rejects.toThrow()
  })

  it('rolls back every move when quarantine fails after the first item', async () => {
    const first = await createManagedDirectory('batch-import-backups/first')
    const second = await createManagedDirectory('batch-import-backups/second')
    const inventory = await service.inspect({ retentionPolicy: 'forever' })
    const candidateIds = inventory.candidates.map(candidate => candidate.id)
    process.env.E2E_CLEANUP_FAIL_AFTER_MOVES = '1'

    await expect(
      service.quarantine({
        candidateIds,
        confirmQuarantine: true,
        retentionPolicy: 'forever',
      }),
    ).rejects.toThrow('模拟清理失败，已回滚到操作前状态')
    await expect(stat(first)).resolves.toBeTruthy()
    await expect(stat(second)).resolves.toBeTruthy()
    const after = await service.inspect({ retentionPolicy: 'forever' })
    expect(after.quarantineOperations).toHaveLength(0)
    expect(after.interruptedOperationCount).toBe(0)
  })

  it('rejects forged and protected candidate ids before any mutation', async () => {
    await createManagedDirectory('restore-preflight-backups/latest-valid.awb-backup')
    const inventory = await service.inspect({ retentionPolicy: 'forever' })
    const protectedCandidate = inventory.candidates[0]!
    const forgedId = 'a'.repeat(64)

    await expect(
      service.preview({ candidateIds: [forgedId], retentionPolicy: 'forever' }),
    ).resolves.toMatchObject({ canExecute: false, errors: ['candidate-not-found'] })
    await expect(
      service.quarantine({
        candidateIds: [protectedCandidate.id],
        confirmQuarantine: true,
        retentionPolicy: 'forever',
      }),
    ).rejects.toThrow('受保护项目')
    expect((await service.inspect({ retentionPolicy: 'forever' })).candidates).toHaveLength(1)
  })

  it('refuses undo when a later item occupies the original location', async () => {
    const original = await createManagedDirectory('batch-import-backups/review')
    const inventory = await service.inspect({ retentionPolicy: 'forever' })
    const candidateId = inventory.candidates[0]!.id
    const result = await service.quarantine({
      candidateIds: [candidateId],
      confirmQuarantine: true,
      retentionPolicy: 'forever',
    })
    await mkdir(original, { recursive: true })
    await writeFile(join(original, 'later.bin'), 'later user data')

    await expect(
      service.undo({
        confirmUndo: true,
        operationId: result.operation.id,
        retentionPolicy: 'forever',
      }),
    ).rejects.toThrow('当前无法撤销')
    await expect(readFile(join(original, 'later.bin'), 'utf8')).resolves.toBe('later user data')
    await expect(
      stat(join(userDataPath, 'data-management-quarantine', result.operation.id)),
    ).resolves.toBeTruthy()
  })
})

function fakeVerification(packagePath: string, ok: boolean): BackupVerification {
  return {
    checkedAt: new Date().toISOString(),
    errors: ok ? [] : ['invalid'],
    manifest: null,
    ok,
    packagePath,
  }
}
