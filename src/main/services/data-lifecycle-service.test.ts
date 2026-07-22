import { randomUUID } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { BackupVerification } from '@core/contracts/data-management'

import type { AppDatabase } from '../database/database'
import { DataLifecycleService } from './data-lifecycle-service'

describe('DataLifecycleService', () => {
  let database: AppDatabase
  let executionRecords: Array<{ backupDirectory: string; status: string }>
  let restoreStateRows: Array<{ key: string; value: string }>
  let temporaryRoot: string
  let userDataPath: string
  let service: DataLifecycleService

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-lifecycle-'))
    userDataPath = join(temporaryRoot, 'user-data')
    await mkdir(userDataPath)
    executionRecords = []
    restoreStateRows = []
    database = {
      client: {
        prepare: (sql: string) => {
          if (sql.includes('file_change_executions')) return { all: () => executionRecords }
          if (sql.includes('SELECT value FROM app_state')) {
            return {
              get: (key: string) => restoreStateRows.find(row => row.key === key),
            }
          }
          if (sql.includes('SELECT key, value FROM app_state')) {
            return {
              all: (pattern: string) =>
                restoreStateRows.filter(row => row.key.startsWith(pattern.replace('%', ''))),
            }
          }
          if (sql.includes('DELETE FROM app_state')) {
            return {
              run: (key: string) => {
                restoreStateRows = restoreStateRows.filter(row => row.key !== key)
              },
            }
          }
          throw new Error(`Unexpected test SQL: ${sql}`)
        },
      },
    } as unknown as AppDatabase
    service = new DataLifecycleService(database, userDataPath, async packagePath =>
      fakeVerification(packagePath, packagePath.includes('valid')),
    )
  })

  afterEach(async () => {
    delete process.env.E2E_CLEANUP_FAIL_AFTER_MOVES
    delete process.env.E2E_CLEANUP_FAIL_AFTER_UNDO_MOVES
    delete process.env.E2E_CLEANUP_INTERRUPT_AFTER_MOVES
    delete process.env.E2E_RECOVERY_FAIL_AFTER_MOVES
    delete process.env.E2E_HISTORY_DELETE_FAIL_AFTER_MOVES
    delete process.env.E2E_HISTORY_DELETE_INTERRUPT_AFTER_COMMIT
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

  function insertRestoreMarker(restoreId: string, rollbackBackupName: string) {
    restoreStateRows.push({
      key: `data_restore_commit:${restoreId}`,
      value: JSON.stringify({
        committedAt: new Date().toISOString(),
        formatVersion: 'v1',
        restoreId,
        rollbackBackupName,
      }),
    })
  }

  function insertHistoryDeletionMarker(operationId: string) {
    restoreStateRows.push({
      key: `file_history_delete_commit:${operationId}`,
      value: JSON.stringify({
        committedAt: new Date().toISOString(),
        formatVersion: 'v1',
        operationId,
      }),
    })
  }

  async function createInterruptedRestore(
    options: { committed?: boolean; validBackup?: boolean } = {},
  ) {
    const restoreId = randomUUID()
    const rollbackBackupName =
      options.validBackup === false ? 'broken-preflight.awb-backup' : 'valid-preflight.awb-backup'
    await createManagedDirectory(`restore-preflight-backups/${rollbackBackupName}`)
    const targetRoot = join(userDataPath, 'batch-import-backups')
    await createManagedDirectory('batch-import-backups/original', 'original-state')
    const stagingRoot = join(userDataPath, `.restore-${restoreId}.tmp`)
    const restoredRoot = join(stagingRoot, 'restored', 'batch-import-backups')
    await mkdir(join(restoredRoot, 'restored'), { recursive: true })
    await writeFile(join(restoredRoot, 'restored', 'payload.bin'), 'restored-state')
    const originalInspection = await service.inspectPathForJournal(targetRoot)
    const restoredInspection = await service.inspectPathForJournal(restoredRoot)
    await service.writeRestoreJournal(stagingRoot, {
      createdAt: new Date().toISOString(),
      formatVersion: 'v1',
      restoreId,
      rollbackBackupName,
      swaps: [
        {
          directoryName: 'batch-import-backups',
          hadOriginal: true,
          hadRestoredCopy: true,
          originalFingerprint: originalInspection.fingerprint,
          restoredFingerprint: restoredInspection.fingerprint,
        },
      ],
    })
    const originalStagingRoot = join(stagingRoot, 'original')
    await mkdir(originalStagingRoot, { recursive: true })
    await rename(targetRoot, join(originalStagingRoot, 'batch-import-backups'))
    await rename(restoredRoot, targetRoot)
    if (options.committed) insertRestoreMarker(restoreId, rollbackBackupName)
    return { restoreId, rollbackBackupName, stagingRoot, targetRoot }
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

  it('recovers an interrupted cleanup from its journal', async () => {
    const first = await createManagedDirectory('batch-import-backups/first')
    const second = await createManagedDirectory('batch-import-backups/second')
    const candidateIds = (await service.inspect({ retentionPolicy: 'forever' })).candidates.map(
      candidate => candidate.id,
    )
    process.env.E2E_CLEANUP_INTERRUPT_AFTER_MOVES = '1'

    await expect(
      service.quarantine({
        candidateIds,
        confirmQuarantine: true,
        retentionPolicy: 'forever',
      }),
    ).rejects.toThrow('模拟清理异常中断')
    const interrupted = (await service.inspect({ retentionPolicy: 'forever' }))
      .interruptedOperations[0]!
    expect(interrupted).toMatchObject({
      action: 'rollback-cleanup',
      canRecover: true,
      reason: 'cleanup-journal-ready',
    })
    await expect(
      service.previewInterruptedRecovery({ operationId: interrupted.id }),
    ).resolves.toMatchObject({ canExecute: true, errors: [] })

    const recovered = await service.recoverInterruptedOperation({
      confirmRecovery: true,
      operationId: interrupted.id,
      retentionPolicy: 'forever',
    })
    expect(recovered.action).toBe('rollback-cleanup')
    expect(recovered.inventory.interruptedOperationCount).toBe(0)
    await expect(stat(first)).resolves.toBeTruthy()
    await expect(stat(second)).resolves.toBeTruthy()
  })

  it('stages managed history backups, restores them on database failure, and rejects symlinks', async () => {
    const firstId = randomUUID()
    const secondId = randomUUID()
    const firstRelative = `file-plan-backups/${firstId}`
    const secondRelative = `file-plan-backups/${secondId}`
    const first = await createManagedDirectory(firstRelative)
    const second = await createManagedDirectory(secondRelative)

    await expect(
      service.executeManagedHistoryDeletion([firstRelative, secondRelative], () => {
        throw new Error('injected database failure')
      }),
    ).rejects.toThrow('数据库记录与撤销备份均保持原状')
    await expect(stat(first)).resolves.toBeTruthy()
    await expect(stat(second)).resolves.toBeTruthy()

    const linkedId = randomUUID()
    const linkedRelative = `file-plan-backups/${linkedId}`
    await mkdir(join(userDataPath, 'file-plan-backups'), { recursive: true })
    await symlink(first, join(userDataPath, ...linkedRelative.split('/')))
    await expect(service.inspectManagedHistoryBackups([linkedRelative])).rejects.toThrow(
      '不是受管普通目录',
    )
  })

  it('restores staged backups when a filesystem move fails before the database transaction', async () => {
    const firstId = randomUUID()
    const secondId = randomUUID()
    const relativePaths = [`file-plan-backups/${firstId}`, `file-plan-backups/${secondId}`]
    for (const relativePath of relativePaths) await createManagedDirectory(relativePath)
    process.env.E2E_HISTORY_DELETE_FAIL_AFTER_MOVES = '1'
    let commitCalled = false

    await expect(
      service.executeManagedHistoryDeletion(relativePaths, () => {
        commitCalled = true
      }),
    ).rejects.toThrow('模拟历史删除暂存失败')
    expect(commitCalled).toBe(false)
    for (const relativePath of relativePaths) {
      await expect(stat(join(userDataPath, ...relativePath.split('/')))).resolves.toBeTruthy()
    }
  })

  it('completes committed history deletion after interruption and can clear a marker-only residue', async () => {
    const executionId = randomUUID()
    const relativePath = `file-plan-backups/${executionId}`
    const original = await createManagedDirectory(relativePath)
    process.env.E2E_HISTORY_DELETE_INTERRUPT_AFTER_COMMIT = '1'

    await expect(
      service.executeManagedHistoryDeletion([relativePath], operationId => {
        expect(operationId).not.toBeNull()
        insertHistoryDeletionMarker(operationId!)
      }),
    ).rejects.toThrow('模拟历史删除提交后异常中断')
    await expect(stat(original)).rejects.toThrow()
    let inventory = await service.inspect({ retentionPolicy: 'forever' })
    expect(inventory.interruptedOperations).toHaveLength(1)
    expect(inventory.interruptedOperations[0]).toMatchObject({
      action: 'complete-history-deletion',
      canRecover: true,
      reason: 'committed-history-deletion-ready',
    })
    await service.recoverInterruptedOperation({
      confirmRecovery: true,
      operationId: inventory.interruptedOperations[0]!.id,
      retentionPolicy: 'forever',
    })
    inventory = await service.inspect({ retentionPolicy: 'forever' })
    expect(inventory.interruptedOperationCount).toBe(0)
    expect(restoreStateRows).toEqual([])

    const markerOnlyId = randomUUID()
    insertHistoryDeletionMarker(markerOnlyId)
    const quarantineEntries = await readdir(join(userDataPath, 'data-management-quarantine')).catch(
      () => [],
    )
    expect(quarantineEntries).toEqual([])
    inventory = await service.inspect({ retentionPolicy: 'forever' })
    expect(inventory.interruptedOperations[0]).toMatchObject({
      action: 'clear-history-deletion-marker',
      canRecover: true,
    })
    await service.recoverInterruptedOperation({
      confirmRecovery: true,
      operationId: inventory.interruptedOperations[0]!.id,
      retentionPolicy: 'forever',
    })
    expect(restoreStateRows).toEqual([])
  })

  it('returns to a recoverable interrupted state when journal recovery fails', async () => {
    await createManagedDirectory('batch-import-backups/first')
    await createManagedDirectory('batch-import-backups/second')
    const candidateIds = (await service.inspect({ retentionPolicy: 'forever' })).candidates.map(
      candidate => candidate.id,
    )
    process.env.E2E_CLEANUP_INTERRUPT_AFTER_MOVES = '2'
    await expect(
      service.quarantine({
        candidateIds,
        confirmQuarantine: true,
        retentionPolicy: 'forever',
      }),
    ).rejects.toThrow('模拟清理异常中断')
    const before = (await service.inspect({ retentionPolicy: 'forever' })).interruptedOperations[0]!
    process.env.E2E_RECOVERY_FAIL_AFTER_MOVES = '1'

    await expect(
      service.recoverInterruptedOperation({
        confirmRecovery: true,
        operationId: before.id,
        retentionPolicy: 'forever',
      }),
    ).rejects.toThrow('模拟异常恢复失败')
    const after = await service.inspect({ retentionPolicy: 'forever' })
    expect(after.interruptedOperations).toHaveLength(1)
    expect(after.interruptedOperations[0]).toMatchObject({
      action: 'rollback-cleanup',
      canRecover: true,
    })
  })

  it('rolls an uncommitted restore back and completes a committed restore without mixing states', async () => {
    const uncommitted = await createInterruptedRestore()
    const interrupted = (
      await service.inspect({ retentionPolicy: 'forever' })
    ).interruptedOperations.find(item => item.kind === 'restore-operation')!
    expect(interrupted).toMatchObject({
      action: 'restore-preflight',
      canRecover: true,
      reason: 'restore-preflight-ready',
    })
    await service.recoverInterruptedOperation({
      confirmRecovery: true,
      operationId: interrupted.id,
      retentionPolicy: 'forever',
    })
    await expect(
      readFile(join(uncommitted.targetRoot, 'original', 'payload.bin'), 'utf8'),
    ).resolves.toBe('original-state')
    await expect(stat(uncommitted.stagingRoot)).rejects.toThrow()

    await rm(join(userDataPath, 'batch-import-backups'), { force: true, recursive: true })
    const committed = await createInterruptedRestore({ committed: true })
    const committedOperation = (
      await service.inspect({ retentionPolicy: 'forever' })
    ).interruptedOperations.find(item => item.kind === 'restore-operation')!
    expect(committedOperation).toMatchObject({
      action: 'complete-restore',
      canRecover: true,
      reason: 'committed-restore-ready',
    })
    await service.recoverInterruptedOperation({
      confirmRecovery: true,
      operationId: committedOperation.id,
      retentionPolicy: 'forever',
    })
    await expect(
      readFile(join(committed.targetRoot, 'restored', 'payload.bin'), 'utf8'),
    ).resolves.toBe('restored-state')
    await expect(stat(committed.stagingRoot)).rejects.toThrow()
    expect(restoreStateRows).toHaveLength(0)
  })

  it('classifies marker-only cleanup and protects invalid restore journals or preflight backups', async () => {
    const markerRestoreId = randomUUID()
    insertRestoreMarker(markerRestoreId, 'missing-preflight.awb-backup')
    const markerOperation = (
      await service.inspect({ retentionPolicy: 'forever' })
    ).interruptedOperations.find(item => item.kind === 'restore-marker')!
    expect(markerOperation).toMatchObject({
      action: 'clear-restore-marker',
      canRecover: true,
      reason: 'restore-marker-only',
    })
    await service.recoverInterruptedOperation({
      confirmRecovery: true,
      operationId: markerOperation.id,
      retentionPolicy: 'forever',
    })
    expect(restoreStateRows).toHaveLength(0)

    const invalidJournalId = randomUUID()
    const invalidJournalRoot = join(userDataPath, `.restore-${invalidJournalId}.tmp`)
    await mkdir(invalidJournalRoot)
    await writeFile(join(invalidJournalRoot, 'restore-journal.json'), '{invalid')
    const invalidJournal = (
      await service.inspect({ retentionPolicy: 'forever' })
    ).interruptedOperations.find(item => item.reason === 'journal-invalid')!
    expect(invalidJournal).toMatchObject({ action: 'none', canRecover: false })

    await rm(invalidJournalRoot, { force: true, recursive: true })
    const invalidPreflight = await createInterruptedRestore({ validBackup: false })
    const protectedOperation = (
      await service.inspect({ retentionPolicy: 'forever' })
    ).interruptedOperations.find(item => item.kind === 'restore-operation')!
    expect(protectedOperation).toMatchObject({
      action: 'restore-preflight',
      canRecover: false,
      reason: 'preflight-invalid',
    })
    await expect(
      service.previewInterruptedRecovery({ operationId: protectedOperation.id }),
    ).resolves.toMatchObject({ canExecute: false, errors: ['backup-invalid'] })
    await expect(stat(invalidPreflight.stagingRoot)).resolves.toBeTruthy()
  })

  it('rejects changed quarantine contents and releases a revalidated operation through the callback', async () => {
    const releasedPaths: string[] = []
    service = new DataLifecycleService(
      database,
      userDataPath,
      async packagePath => fakeVerification(packagePath, packagePath.includes('valid')),
      async path => {
        releasedPaths.push(path)
        await rm(path, { force: true, recursive: true })
      },
    )
    await createManagedDirectory('batch-import-backups/changed', 'fixture')
    let candidate = (await service.inspect({ retentionPolicy: 'forever' })).candidates[0]!
    const changedRecord = await service.quarantine({
      candidateIds: [candidate.id],
      confirmQuarantine: true,
      retentionPolicy: 'forever',
    })
    const changedPayload = join(
      userDataPath,
      'data-management-quarantine',
      changedRecord.operation.id,
      'items',
      'batch-import-backups',
      'changed',
      'payload.bin',
    )
    const originalStats = await stat(changedPayload)
    await writeFile(changedPayload, 'changed')
    await utimes(changedPayload, originalStats.atime, originalStats.mtime)
    await expect(
      service.previewQuarantineRelease({ operationId: changedRecord.operation.id }),
    ).resolves.toMatchObject({ canRelease: false, errors: ['operation-not-releasable'] })
    expect(releasedPaths).toHaveLength(0)

    await createManagedDirectory('batch-import-backups/releasable', 'safe')
    candidate = (await service.inspect({ retentionPolicy: 'forever' })).candidates[0]!
    const releasable = await service.quarantine({
      candidateIds: [candidate.id],
      confirmQuarantine: true,
      retentionPolicy: 'forever',
    })
    await expect(
      service.previewQuarantineRelease({ operationId: releasable.operation.id }),
    ).resolves.toMatchObject({ canRelease: true, errors: [] })
    const released = await service.releaseQuarantine({
      confirmMoveToTrash: true,
      operationId: releasable.operation.id,
      retentionPolicy: 'forever',
    })
    expect(released).toMatchObject({ releasedItemCount: 1 })
    expect(releasedPaths).toHaveLength(1)
    expect(JSON.stringify(released)).not.toContain(userDataPath)
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
