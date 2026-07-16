import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

import {
  backupLifecycleInventorySchema,
  cleanupOperationJournalSchema,
  cleanupPreviewSchema,
  cleanupQuarantineManifestSchema,
  interruptedRecoveryPreviewSchema,
  quarantineCleanupResultSchema,
  quarantineReleasePreviewSchema,
  recoverInterruptedOperationResultSchema,
  releaseQuarantineResultSchema,
  restoreCommitMarkerSchema,
  restoreOperationJournalSchema,
  undoCleanupResultSchema,
  type BackupLifecycleArea,
  type BackupLifecycleInventory,
  type BackupLifecycleRequest,
  type BackupRetentionPolicy,
  type BackupVerification,
  type CleanupCandidate,
  type CleanupCandidateCategory,
  type CleanupCandidateReason,
  type CleanupOperationJournal,
  type CleanupPreview,
  type CleanupPreviewRequest,
  type CleanupQuarantineManifest,
  type CleanupQuarantineOperation,
  type InterruptedDataOperation,
  type InterruptedRecoveryPreview,
  type InterruptedRecoveryPreviewRequest,
  type QuarantineCleanupRequest,
  type QuarantineCleanupResult,
  type QuarantineReleasePreview,
  type QuarantineReleasePreviewRequest,
  type RecoverInterruptedOperationRequest,
  type RecoverInterruptedOperationResult,
  type ReleaseQuarantineRequest,
  type ReleaseQuarantineResult,
  type RestoreCommitMarker,
  type RestoreOperationJournal,
  type UndoCleanupRequest,
  type UndoCleanupResult,
} from '@core/contracts/data-management'

import type { AppDatabase } from '../database/database'
import { PublicError } from '../errors/public-error'
import { isPathInsideRoot } from '../security/path-guard'

const COMPLETED_PATH = 'COMPLETED'
const CLEANUP_JOURNAL_PATH = 'cleanup-journal.json'
const MANIFEST_PATH = 'manifest.json'
const QUARANTINE_DIRECTORY = 'data-management-quarantine'
const RESTORE_JOURNAL_PATH = 'restore-journal.json'
export const RESTORE_COMMIT_MARKER_PREFIX = 'data_restore_commit:'
const MAX_MANAGED_ITEMS = 2_000
const RETENTION_DAYS: Record<Exclude<BackupRetentionPolicy, 'forever'>, number> = {
  '7-days': 7,
  '30-days': 30,
  '90-days': 90,
}

interface TreeInspection {
  bytes: number
  createdAt: string
  fingerprint: string
  hasSymbolicLink: boolean
}

interface InternalCleanupCandidate extends CleanupCandidate {
  absolutePath: string
  fingerprint: string
  relativePath: string
}

interface MovedItem {
  source: string
  target: string
}

interface QuarantineRecord {
  manifest: CleanupQuarantineManifest
  operation: CleanupQuarantineOperation
  root: string
}

interface InterruptedOperationRecord {
  cleanupJournal: CleanupOperationJournal | null
  marker: RestoreCommitMarker | null
  operation: InterruptedDataOperation
  restoreJournal: RestoreOperationJournal | null
  root: string | null
}

type VerifyBackupPath = (packagePath: string) => Promise<BackupVerification>

function toPortablePath(value: string): string {
  return value.split(sep).join('/')
}

export class DataLifecycleService {
  constructor(
    private readonly database: AppDatabase,
    private readonly userDataPath: string,
    private readonly verifyBackupPath: VerifyBackupPath,
    private readonly releaseQuarantinePath: (path: string) => Promise<void> = async () => {
      throw new PublicError('UNKNOWN', '系统废纸篓当前不可用。')
    },
  ) {}

  async inspect(request: BackupLifecycleRequest): Promise<BackupLifecycleInventory> {
    const candidates = await this.collectCandidates(request.retentionPolicy)
    const quarantineRecords = await this.listQuarantineRecords()
    const interruptedRecords = await this.collectInterruptedOperationRecords(quarantineRecords)
    const interruptedOperations = interruptedRecords.map(record => record.operation)
    const quarantineOperations = quarantineRecords.map(record => record.operation)
    const areas: BackupLifecycleArea[] = [
      this.buildArea('restore-preflight-backups', candidates, 'restore-preflight-backup'),
      this.buildArea('file-plan-backups', candidates, 'file-plan-backup'),
      this.buildArea('batch-import-backups', candidates, 'batch-import-backup'),
      this.buildArea('problem-image-trash', candidates, 'problem-image-trash'),
      {
        bytes: quarantineOperations.reduce((total, item) => total + item.bytes, 0),
        itemCount: quarantineOperations.reduce((total, item) => total + item.itemCount, 0),
        key: 'data-management-quarantine',
        quarantinableBytes: 0,
        quarantinableCount: 0,
      },
      {
        bytes: interruptedOperations.reduce((total, item) => total + item.bytes, 0),
        itemCount: interruptedOperations.length,
        key: 'interrupted-operations',
        quarantinableBytes: 0,
        quarantinableCount: 0,
      },
    ]
    return backupLifecycleInventorySchema.parse({
      areas,
      candidates: candidates.map(candidate => this.toPublicCandidate(candidate)),
      checkedAt: new Date().toISOString(),
      interruptedOperationCount: interruptedOperations.length,
      interruptedOperations,
      quarantineOperations,
      quarantinableBytes: candidates
        .filter(candidate => candidate.canQuarantine)
        .reduce((total, candidate) => total + candidate.bytes, 0),
      retentionPolicy: request.retentionPolicy,
      schemaVersion: 1,
      totalManagedBytes: areas.reduce((total, area) => total + area.bytes, 0),
    })
  }

  async preview(request: CleanupPreviewRequest): Promise<CleanupPreview> {
    const inventory = await this.inspect({ retentionPolicy: request.retentionPolicy })
    const candidatesById = new Map(inventory.candidates.map(candidate => [candidate.id, candidate]))
    const selected: CleanupCandidate[] = []
    const errors: CleanupPreview['errors'] = []
    for (const candidateId of new Set(request.candidateIds)) {
      const candidate = candidatesById.get(candidateId)
      if (!candidate) {
        errors.push('candidate-not-found')
        continue
      }
      selected.push(candidate)
      if (!candidate.canQuarantine) errors.push('candidate-protected')
    }
    return cleanupPreviewSchema.parse({
      canExecute: selected.length > 0 && errors.length === 0,
      candidates: selected,
      checkedAt: new Date().toISOString(),
      errors,
      totalBytes: selected.reduce((total, candidate) => total + candidate.bytes, 0),
    })
  }

  async quarantine(request: QuarantineCleanupRequest): Promise<QuarantineCleanupResult> {
    const preview = await this.preview(request)
    if (!preview.canExecute) {
      throw new PublicError('INVALID_REQUEST', '清理候选已变化或包含受保护项目，请重新预览。')
    }
    const candidateIds = new Set(request.candidateIds)
    const currentCandidates = (await this.collectCandidates(request.retentionPolicy)).filter(
      candidate => candidateIds.has(candidate.id),
    )
    if (
      currentCandidates.length !== candidateIds.size ||
      currentCandidates.some(candidate => !candidate.canQuarantine)
    ) {
      throw new PublicError('INVALID_REQUEST', '清理候选已变化，请重新诊断和预览。')
    }

    const operationId = randomUUID()
    const quarantineRoot = join(this.userDataPath, QUARANTINE_DIRECTORY)
    const stagingRoot = join(quarantineRoot, `.cleanup-${operationId}.tmp`)
    const finalRoot = join(quarantineRoot, operationId)
    const moved: MovedItem[] = []
    let published = false
    let preserveInterruptedState = false
    try {
      await mkdir(quarantineRoot, { recursive: true })
      await this.assertMissing(stagingRoot)
      await this.assertMissing(finalRoot)
      await mkdir(stagingRoot, { recursive: false })
      const sortedCandidates = [...currentCandidates].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
      )
      const createdAt = new Date().toISOString()
      const journalItems = sortedCandidates.map(candidate => ({
        bytes: candidate.bytes,
        candidateId: candidate.id,
        category: candidate.category,
        fingerprint: candidate.fingerprint,
        originalRelativePath: candidate.relativePath,
      }))
      await this.writeJsonAtomic(
        join(stagingRoot, CLEANUP_JOURNAL_PATH),
        cleanupOperationJournalSchema.parse({
          createdAt,
          formatVersion: 'v1',
          items: journalItems,
          operationId,
        }),
      )
      for (const candidate of sortedCandidates) {
        const current = await this.inspectTree(candidate.absolutePath)
        const currentId = this.candidateId(candidate.category, candidate.relativePath, current)
        if (
          current.hasSymbolicLink ||
          current.fingerprint !== candidate.fingerprint ||
          currentId !== candidate.id
        ) {
          throw new PublicError('INVALID_REQUEST', '清理候选在确认后发生变化，操作已取消。')
        }
        const target = this.resolveInside(
          join(stagingRoot, 'items'),
          candidate.relativePath,
          '隔离目标路径无效。',
        )
        await mkdir(dirname(target), { recursive: true })
        await rename(candidate.absolutePath, target)
        moved.push({ source: candidate.absolutePath, target })
        if (this.shouldInjectFailure('E2E_CLEANUP_FAIL_AFTER_MOVES', moved.length)) {
          throw new PublicError('UNKNOWN', '模拟清理失败，已回滚到操作前状态。')
        }
        if (this.shouldInjectFailure('E2E_CLEANUP_INTERRUPT_AFTER_MOVES', moved.length)) {
          preserveInterruptedState = true
          throw new PublicError('UNKNOWN', '模拟清理异常中断，已保留恢复日志。')
        }
      }

      const manifest = cleanupQuarantineManifestSchema.parse({
        completed: true,
        createdAt,
        formatVersion: 'v1',
        items: journalItems,
        operationId,
      })
      await writeFile(join(stagingRoot, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`, {
        flag: 'wx',
      })
      await writeFile(join(stagingRoot, COMPLETED_PATH), `${createdAt}\n`, { flag: 'wx' })
      await rename(stagingRoot, finalRoot)
      published = true
      const operation: CleanupQuarantineOperation = {
        bytes: manifest.items.reduce((total, item) => total + item.bytes, 0),
        canUndo: true,
        createdAt,
        id: operationId,
        itemCount: manifest.items.length,
      }
      return quarantineCleanupResultSchema.parse({
        inventory: await this.inspect({ retentionPolicy: request.retentionPolicy }),
        operation,
        quarantinedCount: manifest.items.length,
      })
    } catch (error) {
      if (preserveInterruptedState) {
        if (error instanceof PublicError) throw error
        throw new PublicError('UNKNOWN', '模拟清理异常中断，已保留恢复日志。')
      }
      if (!published) {
        const rollbackOk = await this.rollbackMoves(moved)
        if (!rollbackOk) {
          throw new PublicError('UNKNOWN', '清理失败且自动回滚未完成，请在数据管理页检查异常残留。')
        }
        await rm(stagingRoot, { force: true, recursive: true }).catch(() => undefined)
      }
      if (error instanceof PublicError) throw error
      throw new PublicError(
        'UNKNOWN',
        published ? '隔离已完成，但清单刷新失败，请重新诊断。' : '清理失败，已回滚到操作前状态。',
      )
    }
  }

  async undo(request: UndoCleanupRequest): Promise<UndoCleanupResult> {
    const record = await this.readQuarantineRecord(request.operationId)
    if (!record || !record.operation.canUndo) {
      throw new PublicError('INVALID_REQUEST', '隔离记录不存在、已变化或当前无法撤销。')
    }
    const moved: MovedItem[] = []
    try {
      const items = await Promise.all(
        record.manifest.items.map(async item => {
          const target = this.resolveManagedRelativePath(item.originalRelativePath)
          const source = this.resolveInside(
            join(record.root, 'items'),
            item.originalRelativePath,
            '隔离记录路径无效。',
          )
          if (await this.pathExists(target)) {
            throw new PublicError('INVALID_REQUEST', '原位置已有新文件，撤销已取消以避免覆盖。')
          }
          const inspection = await this.inspectTree(source)
          if (inspection.hasSymbolicLink || inspection.fingerprint !== item.fingerprint) {
            throw new PublicError('INVALID_REQUEST', '隔离内容已变化，撤销已取消。')
          }
          return { source, target }
        }),
      )
      for (const item of items) {
        await mkdir(dirname(item.target), { recursive: true })
        await rename(item.source, item.target)
        moved.push({ source: item.source, target: item.target })
        if (this.shouldInjectFailure('E2E_CLEANUP_FAIL_AFTER_UNDO_MOVES', moved.length)) {
          throw new PublicError('UNKNOWN', '模拟撤销失败，已回滚到隔离状态。')
        }
      }
      await rm(record.root, { force: false, recursive: true })
      return undoCleanupResultSchema.parse({
        inventory: await this.inspect({ retentionPolicy: request.retentionPolicy }),
        operationId: request.operationId,
        restoredBytes: record.operation.bytes,
        restoredCount: record.operation.itemCount,
      })
    } catch (error) {
      const rollbackOk = await this.rollbackMoves(moved)
      if (!rollbackOk) {
        throw new PublicError('UNKNOWN', '撤销失败且自动回滚未完成，请在数据管理页检查异常残留。')
      }
      if (error instanceof PublicError) throw error
      throw new PublicError('UNKNOWN', '撤销失败，项目仍保留在隔离区。')
    }
  }

  async previewInterruptedRecovery(
    request: InterruptedRecoveryPreviewRequest,
  ): Promise<InterruptedRecoveryPreview> {
    const records = await this.collectInterruptedOperationRecords(
      await this.listQuarantineRecords(),
    )
    const record = records.find(item => item.operation.id === request.operationId) ?? null
    const errors: InterruptedRecoveryPreview['errors'] = []
    if (!record) errors.push('operation-not-found')
    else if (!record.operation.canRecover || record.operation.action === 'none') {
      errors.push(
        record.operation.reason === 'preflight-invalid' ? 'backup-invalid' : 'operation-protected',
      )
    }
    return interruptedRecoveryPreviewSchema.parse({
      canExecute: Boolean(record?.operation.canRecover) && errors.length === 0,
      checkedAt: new Date().toISOString(),
      errors,
      operation: record?.operation ?? null,
    })
  }

  async recoverInterruptedOperation(
    request: RecoverInterruptedOperationRequest,
  ): Promise<RecoverInterruptedOperationResult> {
    const records = await this.collectInterruptedOperationRecords(
      await this.listQuarantineRecords(),
    )
    const record = records.find(item => item.operation.id === request.operationId)
    if (!record || !record.operation.canRecover || record.operation.action === 'none') {
      throw new PublicError('INVALID_REQUEST', '异常操作已变化或当前不可恢复，请重新诊断。')
    }
    const action = record.operation.action
    if (action === 'rollback-cleanup') await this.rollbackInterruptedCleanup(record)
    else if (action === 'restore-preflight') await this.rollbackInterruptedRestore(record)
    else if (action === 'complete-restore') await this.completeCommittedRestore(record)
    else if (action === 'clear-restore-marker') await this.clearRestoreMarker(record)
    else throw new PublicError('INVALID_REQUEST', '异常操作当前没有可执行的恢复策略。')
    return recoverInterruptedOperationResultSchema.parse({
      action,
      inventory: await this.inspect({ retentionPolicy: request.retentionPolicy }),
      operationId: request.operationId,
    })
  }

  async previewQuarantineRelease(
    request: QuarantineReleasePreviewRequest,
  ): Promise<QuarantineReleasePreview> {
    const record = await this.readQuarantineRecord(request.operationId)
    const errors: QuarantineReleasePreview['errors'] = []
    if (!record) errors.push('operation-not-found')
    else if (!(await this.canReleaseManifest(record.root, record.manifest))) {
      errors.push('operation-not-releasable')
    }
    return quarantineReleasePreviewSchema.parse({
      canRelease: Boolean(record) && errors.length === 0,
      checkedAt: new Date().toISOString(),
      errors,
      operation: record?.operation ?? null,
    })
  }

  async releaseQuarantine(request: ReleaseQuarantineRequest): Promise<ReleaseQuarantineResult> {
    const preview = await this.previewQuarantineRelease(request)
    if (!preview.canRelease || !preview.operation) {
      throw new PublicError('INVALID_REQUEST', '隔离记录已变化或当前不能移入系统废纸篓。')
    }
    const record = await this.readQuarantineRecord(request.operationId)
    if (!record || !(await this.canReleaseManifest(record.root, record.manifest))) {
      throw new PublicError('INVALID_REQUEST', '隔离记录已变化，请重新预览。')
    }
    await this.releaseQuarantinePath(record.root)
    if (await this.pathExists(record.root)) {
      throw new PublicError('UNKNOWN', '系统废纸篓未接收隔离记录，原数据仍保留。')
    }
    return releaseQuarantineResultSchema.parse({
      inventory: await this.inspect({ retentionPolicy: request.retentionPolicy }),
      operationId: request.operationId,
      releasedBytes: record.operation.bytes,
      releasedItemCount: record.operation.itemCount,
    })
  }

  async inspectPathForJournal(path: string): Promise<{
    fingerprint: string
    hasSymbolicLink: boolean
  }> {
    const inspection = await this.inspectTree(path)
    return {
      fingerprint: inspection.fingerprint,
      hasSymbolicLink: inspection.hasSymbolicLink,
    }
  }

  async writeRestoreJournal(root: string, journal: RestoreOperationJournal): Promise<void> {
    const resolvedRoot = resolve(root)
    if (!isPathInsideRoot(this.userDataPath, resolvedRoot) || resolvedRoot === this.userDataPath) {
      throw new PublicError('PATH_NOT_AUTHORIZED', '恢复日志目录不在受控 userData 内。')
    }
    await this.writeJsonAtomic(
      join(resolvedRoot, RESTORE_JOURNAL_PATH),
      restoreOperationJournalSchema.parse(journal),
    )
  }

  clearCommittedRestoreMarker(restoreId: string): void {
    this.database.client
      .prepare('DELETE FROM app_state WHERE key = ?')
      .run(`${RESTORE_COMMIT_MARKER_PREFIX}${restoreId}`)
  }

  hasCommittedRestoreMarker(restoreId: string): boolean {
    return this.listRestoreCommitMarkers().get(restoreId)?.restoreId === restoreId
  }

  private async collectCandidates(
    retentionPolicy: BackupRetentionPolicy,
  ): Promise<InternalCleanupCandidate[]> {
    const [preflight, filePlans, batchImports, imageTrash] = await Promise.all([
      this.collectPreflightCandidates(retentionPolicy),
      this.collectFilePlanCandidates(),
      this.collectSimpleCandidates(
        'batch-import-backups',
        'batch-import-backup',
        'batch-import-without-record',
      ),
      this.collectSimpleCandidates(
        'problem-images/.trash',
        'problem-image-trash',
        'residual-image-trash',
      ),
    ])
    return [...preflight, ...filePlans, ...batchImports, ...imageTrash]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, MAX_MANAGED_ITEMS)
  }

  private async collectPreflightCandidates(
    retentionPolicy: BackupRetentionPolicy,
  ): Promise<InternalCleanupCandidate[]> {
    const root = join(this.userDataPath, 'restore-preflight-backups')
    const paths = (await this.listDirectManagedPaths(root)).filter(path =>
      path.endsWith('.awb-backup'),
    )
    const inspected = await Promise.all(
      paths.map(async absolutePath => {
        const inspection = await this.inspectTree(absolutePath)
        const verificationOk = inspection.hasSymbolicLink
          ? false
          : await this.verifyBackupPath(absolutePath)
              .then(result => result.ok)
              .catch(() => false)
        return { absolutePath, inspection, verificationOk }
      }),
    )
    const latestValidPath = inspected
      .filter(item => item.verificationOk)
      .sort((left, right) =>
        right.inspection.createdAt.localeCompare(left.inspection.createdAt),
      )[0]?.absolutePath

    return inspected.map(item => {
      let disposition: CleanupCandidate['disposition'] = 'review'
      let reason: CleanupCandidateReason = 'invalid-preflight-backup'
      if (item.inspection.hasSymbolicLink) {
        disposition = 'protected'
        reason = 'symlink-detected'
      } else if (item.verificationOk && item.absolutePath === latestValidPath) {
        disposition = 'protected'
        reason = 'latest-valid-preflight'
      } else if (item.verificationOk && retentionPolicy === 'forever') {
        disposition = 'protected'
        reason = 'retention-policy-forever'
      } else if (item.verificationOk && this.isOutsideRetention(item.inspection, retentionPolicy)) {
        disposition = 'suggested'
        reason = 'retention-expired'
      } else if (item.verificationOk) {
        disposition = 'protected'
        reason = 'within-retention-window'
      }
      return this.buildCandidate(
        item.absolutePath,
        'restore-preflight-backup',
        disposition,
        reason,
        item.inspection,
        item.verificationOk,
      )
    })
  }

  private async collectFilePlanCandidates(): Promise<InternalCleanupCandidate[]> {
    const records = this.database.client
      .prepare('SELECT backup_directory AS backupDirectory, status FROM file_change_executions')
      .all() as Array<{ backupDirectory: string; status: string }>
    const statusByDirectory = new Map(
      records.map(record => [record.backupDirectory, record.status]),
    )
    const root = join(this.userDataPath, 'file-plan-backups')
    const paths = await this.listDirectManagedPaths(root)
    return Promise.all(
      paths.map(async absolutePath => {
        const inspection = await this.inspectTree(absolutePath)
        const relativePath = toPortablePath(relative(this.userDataPath, absolutePath))
        const status = statusByDirectory.get(relativePath)
        let disposition: CleanupCandidate['disposition'] = 'review'
        let reason: CleanupCandidateReason = 'unrecorded-file-plan-backup'
        if (inspection.hasSymbolicLink) {
          disposition = 'protected'
          reason = 'symlink-detected'
        } else if (status === 'applied') {
          disposition = 'protected'
          reason = 'applied-file-execution'
        } else if (status === 'rolled-back') {
          disposition = 'suggested'
          reason = 'rolled-back-file-execution'
        }
        return this.buildCandidate(
          absolutePath,
          'file-plan-backup',
          disposition,
          reason,
          inspection,
          null,
        )
      }),
    )
  }

  private async collectSimpleCandidates(
    rootRelativePath: string,
    category: CleanupCandidateCategory,
    defaultReason: CleanupCandidateReason,
  ): Promise<InternalCleanupCandidate[]> {
    const paths = await this.listDirectManagedPaths(
      join(this.userDataPath, ...rootRelativePath.split('/')),
    )
    return Promise.all(
      paths.map(async absolutePath => {
        const inspection = await this.inspectTree(absolutePath)
        return this.buildCandidate(
          absolutePath,
          category,
          inspection.hasSymbolicLink ? 'protected' : 'review',
          inspection.hasSymbolicLink ? 'symlink-detected' : defaultReason,
          inspection,
          null,
        )
      }),
    )
  }

  private buildCandidate(
    absolutePath: string,
    category: CleanupCandidateCategory,
    disposition: CleanupCandidate['disposition'],
    reason: CleanupCandidateReason,
    inspection: TreeInspection,
    verificationOk: boolean | null,
  ): InternalCleanupCandidate {
    const relativePath = toPortablePath(relative(this.userDataPath, absolutePath))
    return {
      absolutePath,
      bytes: inspection.bytes,
      canQuarantine: disposition !== 'protected' && !inspection.hasSymbolicLink,
      category,
      createdAt: inspection.createdAt,
      disposition,
      fingerprint: inspection.fingerprint,
      id: this.candidateId(category, relativePath, inspection),
      reason,
      relativePath,
      verificationOk,
    }
  }

  private candidateId(
    category: CleanupCandidateCategory,
    relativePath: string,
    inspection: TreeInspection,
  ): string {
    return createHash('sha256')
      .update('cleanup-candidate-v1\0')
      .update(category)
      .update('\0')
      .update(relativePath)
      .update('\0')
      .update(inspection.fingerprint)
      .digest('hex')
  }

  private isOutsideRetention(
    inspection: TreeInspection,
    retentionPolicy: BackupRetentionPolicy,
  ): boolean {
    if (retentionPolicy === 'forever') return false
    const cutoff = Date.now() - RETENTION_DAYS[retentionPolicy] * 24 * 60 * 60 * 1_000
    return new Date(inspection.createdAt).getTime() < cutoff
  }

  private buildArea(
    key: BackupLifecycleArea['key'],
    candidates: InternalCleanupCandidate[],
    category: CleanupCandidateCategory,
  ): BackupLifecycleArea {
    const matching = candidates.filter(candidate => candidate.category === category)
    const quarantinable = matching.filter(candidate => candidate.canQuarantine)
    return {
      bytes: matching.reduce((total, candidate) => total + candidate.bytes, 0),
      itemCount: matching.length,
      key,
      quarantinableBytes: quarantinable.reduce((total, candidate) => total + candidate.bytes, 0),
      quarantinableCount: quarantinable.length,
    }
  }

  private toPublicCandidate(candidate: InternalCleanupCandidate): CleanupCandidate {
    return {
      bytes: candidate.bytes,
      canQuarantine: candidate.canQuarantine,
      category: candidate.category,
      createdAt: candidate.createdAt,
      disposition: candidate.disposition,
      id: candidate.id,
      reason: candidate.reason,
      verificationOk: candidate.verificationOk,
    }
  }

  private async listQuarantineRecords(): Promise<QuarantineRecord[]> {
    const root = join(this.userDataPath, QUARANTINE_DIRECTORY)
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    const records = await Promise.all(
      entries
        .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
        .map(entry => this.readQuarantineRecord(entry.name)),
    )
    return records
      .filter((record): record is QuarantineRecord => Boolean(record))
      .sort((left, right) => right.operation.createdAt.localeCompare(left.operation.createdAt))
      .slice(0, 100)
  }

  private async readQuarantineRecord(operationId: string): Promise<QuarantineRecord | null> {
    if (!/^[0-9a-f-]{36}$/i.test(operationId)) return null
    const root = this.resolveInside(
      join(this.userDataPath, QUARANTINE_DIRECTORY),
      operationId,
      '隔离记录路径无效。',
    )
    try {
      const rootStats = await lstat(root)
      if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) return null
      const completedStats = await lstat(join(root, COMPLETED_PATH))
      if (!completedStats.isFile() || completedStats.isSymbolicLink()) return null
      const manifestStats = await stat(join(root, MANIFEST_PATH))
      if (!manifestStats.isFile() || manifestStats.size > 2 * 1024 * 1024) return null
      const manifest = cleanupQuarantineManifestSchema.parse(
        JSON.parse(await readFile(join(root, MANIFEST_PATH), 'utf8')),
      )
      if (manifest.operationId !== operationId) return null
      const canUndo = await this.canUndoManifest(root, manifest)
      return {
        manifest,
        operation: {
          bytes: manifest.items.reduce((total, item) => total + item.bytes, 0),
          canUndo,
          createdAt: manifest.createdAt,
          id: manifest.operationId,
          itemCount: manifest.items.length,
        },
        root,
      }
    } catch {
      return null
    }
  }

  private async canUndoManifest(
    root: string,
    manifest: CleanupQuarantineManifest,
  ): Promise<boolean> {
    for (const item of manifest.items) {
      try {
        const original = this.resolveManagedRelativePath(item.originalRelativePath)
        const quarantined = this.resolveInside(
          join(root, 'items'),
          item.originalRelativePath,
          '隔离记录路径无效。',
        )
        if ((await this.pathExists(original)) || !(await this.pathExists(quarantined))) return false
      } catch {
        return false
      }
    }
    return true
  }

  private async collectInterruptedOperationRecords(
    validQuarantineRecords: QuarantineRecord[],
  ): Promise<InterruptedOperationRecord[]> {
    const records: InterruptedOperationRecord[] = []
    const markers = this.listRestoreCommitMarkers()
    const seenRestoreIds = new Set<string>()
    const userDataEntries = await readdir(this.userDataPath, { withFileTypes: true }).catch(
      () => [],
    )
    for (const entry of userDataEntries) {
      if (
        !entry.name.endsWith('.tmp') &&
        !entry.name.startsWith('.restore-') &&
        !entry.name.includes('.awb-backup.')
      ) {
        continue
      }
      const path = join(this.userDataPath, entry.name)
      const restoreMatch = entry.name.match(
        /^\.restore-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.tmp$/i,
      )
      if (restoreMatch?.[1]) {
        seenRestoreIds.add(restoreMatch[1])
        records.push(await this.buildInterruptedRestoreRecord(path, restoreMatch[1], markers))
      } else {
        records.push(await this.buildUnknownInterruptedRecord(path))
      }
    }

    const preflightRoot = join(this.userDataPath, 'restore-preflight-backups')
    const preflightEntries = await readdir(preflightRoot, { withFileTypes: true }).catch(() => [])
    for (const entry of preflightEntries) {
      if (entry.name.endsWith('.tmp')) {
        records.push(await this.buildUnknownInterruptedRecord(join(preflightRoot, entry.name)))
      }
    }

    const quarantineRoot = join(this.userDataPath, QUARANTINE_DIRECTORY)
    const quarantineEntries = await readdir(quarantineRoot, { withFileTypes: true }).catch(() => [])
    const validIds = new Set(validQuarantineRecords.map(record => record.operation.id))
    for (const entry of quarantineEntries) {
      if (validIds.has(entry.name)) continue
      const path = join(quarantineRoot, entry.name)
      const cleanupMatch = entry.name.match(
        /^\.cleanup-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.tmp$/i,
      )
      records.push(
        cleanupMatch?.[1]
          ? await this.buildInterruptedCleanupRecord(path, cleanupMatch[1])
          : await this.buildUnknownInterruptedRecord(path),
      )
    }

    for (const [restoreId, marker] of markers) {
      if (seenRestoreIds.has(restoreId)) continue
      const markerFingerprint = createHash('sha256')
        .update(JSON.stringify(marker ?? { restoreId }))
        .digest('hex')
      records.push({
        cleanupJournal: null,
        marker,
        operation: {
          action: marker ? 'clear-restore-marker' : 'none',
          bytes: 0,
          canRecover: Boolean(marker),
          createdAt: marker?.committedAt ?? new Date(0).toISOString(),
          id: this.interruptedOperationId('restore-marker', restoreId, markerFingerprint),
          kind: 'restore-marker',
          reason: marker ? 'restore-marker-only' : 'journal-invalid',
        },
        restoreJournal: null,
        root: null,
      })
    }

    return records
      .sort((left, right) => right.operation.createdAt.localeCompare(left.operation.createdAt))
      .slice(0, 100)
  }

  private async buildInterruptedRestoreRecord(
    root: string,
    restoreId: string,
    markers: Map<string, RestoreCommitMarker | null>,
  ): Promise<InterruptedOperationRecord> {
    const inspection = await this.inspectTree(root).catch(() => null)
    const journal = await this.readRestoreJournal(root, restoreId)
    const marker = markers.get(restoreId) ?? null
    const backupName = marker?.rollbackBackupName ?? journal?.rollbackBackupName ?? null
    const backupOk = backupName ? await this.verifyRollbackBackup(backupName) : false
    const markerConflict = Boolean(
      marker && journal && marker.rollbackBackupName !== journal.rollbackBackupName,
    )
    let action: InterruptedDataOperation['action'] = 'none'
    let reason: InterruptedDataOperation['reason'] = 'journal-invalid'
    let canRecover = false
    if (inspection?.hasSymbolicLink || markerConflict) {
      reason = 'state-conflict'
    } else if (marker) {
      action = 'complete-restore'
      reason = backupOk ? 'committed-restore-ready' : 'preflight-invalid'
      canRecover = backupOk
    } else if (journal) {
      action = 'restore-preflight'
      const stateOk = await this.canRollbackInterruptedRestore(root, journal)
      reason = !backupOk
        ? 'preflight-invalid'
        : stateOk
          ? 'restore-preflight-ready'
          : 'state-conflict'
      canRecover = backupOk && stateOk
    }
    const fingerprint = inspection?.fingerprint ?? createHash('sha256').update(root).digest('hex')
    return {
      cleanupJournal: null,
      marker,
      operation: {
        action,
        bytes: inspection?.bytes ?? 0,
        canRecover,
        createdAt:
          journal?.createdAt ??
          marker?.committedAt ??
          inspection?.createdAt ??
          new Date(0).toISOString(),
        id: this.interruptedOperationId('restore-operation', restoreId, fingerprint),
        kind: 'restore-operation',
        reason,
      },
      restoreJournal: journal,
      root,
    }
  }

  private async buildInterruptedCleanupRecord(
    root: string,
    operationId: string,
  ): Promise<InterruptedOperationRecord> {
    const inspection = await this.inspectTree(root).catch(() => null)
    const journal = await this.readCleanupJournal(root, operationId)
    const stateOk = journal ? await this.canRollbackInterruptedCleanup(root, journal) : false
    const canRecover = Boolean(journal && stateOk && !inspection?.hasSymbolicLink)
    return {
      cleanupJournal: journal,
      marker: null,
      operation: {
        action: canRecover ? 'rollback-cleanup' : 'none',
        bytes: inspection?.bytes ?? 0,
        canRecover,
        createdAt: journal?.createdAt ?? inspection?.createdAt ?? new Date(0).toISOString(),
        id: this.interruptedOperationId(
          'cleanup-operation',
          operationId,
          inspection?.fingerprint ?? createHash('sha256').update(root).digest('hex'),
        ),
        kind: 'cleanup-operation',
        reason: !journal
          ? 'journal-invalid'
          : canRecover
            ? 'cleanup-journal-ready'
            : 'state-conflict',
      },
      restoreJournal: null,
      root,
    }
  }

  private async buildUnknownInterruptedRecord(root: string): Promise<InterruptedOperationRecord> {
    const inspection = await this.inspectTree(root).catch(() => null)
    const fingerprint = inspection?.fingerprint ?? createHash('sha256').update(root).digest('hex')
    return {
      cleanupJournal: null,
      marker: null,
      operation: {
        action: 'none',
        bytes: inspection?.bytes ?? 0,
        canRecover: false,
        createdAt: inspection?.createdAt ?? new Date(0).toISOString(),
        id: this.interruptedOperationId('unknown', 'unknown', fingerprint),
        kind: 'unknown',
        reason: 'unknown-temporary-item',
      },
      restoreJournal: null,
      root,
    }
  }

  private listRestoreCommitMarkers(): Map<string, RestoreCommitMarker | null> {
    const rows = this.database.client
      .prepare('SELECT key, value FROM app_state WHERE key LIKE ?')
      .all(`${RESTORE_COMMIT_MARKER_PREFIX}%`) as Array<{ key: string; value: string }>
    return new Map(
      rows.map(row => {
        const restoreId = row.key.slice(RESTORE_COMMIT_MARKER_PREFIX.length)
        try {
          const marker = restoreCommitMarkerSchema.parse(JSON.parse(row.value))
          return [restoreId, marker.restoreId === restoreId ? marker : null]
        } catch {
          return [restoreId, null]
        }
      }),
    )
  }

  private async readRestoreJournal(
    root: string,
    restoreId: string,
  ): Promise<RestoreOperationJournal | null> {
    try {
      const journal = restoreOperationJournalSchema.parse(
        JSON.parse(await readFile(join(root, RESTORE_JOURNAL_PATH), 'utf8')),
      )
      return journal.restoreId === restoreId ? journal : null
    } catch {
      return null
    }
  }

  private async readCleanupJournal(
    root: string,
    operationId: string,
  ): Promise<CleanupOperationJournal | null> {
    try {
      const journal = cleanupOperationJournalSchema.parse(
        JSON.parse(await readFile(join(root, CLEANUP_JOURNAL_PATH), 'utf8')),
      )
      return journal.operationId === operationId ? journal : null
    } catch {
      return null
    }
  }

  private async verifyRollbackBackup(backupName: string): Promise<boolean> {
    const backupPath = this.resolveInside(
      join(this.userDataPath, 'restore-preflight-backups'),
      backupName,
      '恢复预备份路径无效。',
    )
    return this.verifyBackupPath(backupPath)
      .then(result => result.ok)
      .catch(() => false)
  }

  private interruptedOperationId(
    kind: InterruptedDataOperation['kind'],
    operationId: string,
    fingerprint: string,
  ): string {
    return createHash('sha256')
      .update('interrupted-operation-v1\0')
      .update(kind)
      .update('\0')
      .update(operationId)
      .update('\0')
      .update(fingerprint)
      .digest('hex')
  }

  private async canRollbackInterruptedRestore(
    root: string,
    journal: RestoreOperationJournal,
  ): Promise<boolean> {
    for (const swap of journal.swaps) {
      const target = join(this.userDataPath, swap.directoryName)
      const original = join(root, 'original', swap.directoryName)
      const restored = join(root, 'restored', swap.directoryName)
      const targetExists = await this.pathExists(target)
      const originalExists = await this.pathExists(original)
      const restoredExists = await this.pathExists(restored)
      if (swap.hadOriginal) {
        if (!swap.originalFingerprint) return false
        if (originalExists) {
          if (!(await this.pathMatchesFingerprint(original, swap.originalFingerprint))) return false
          if (swap.hadRestoredCopy) {
            if (!swap.restoredFingerprint || targetExists === restoredExists) return false
            const restoredPath = targetExists ? target : restored
            if (!(await this.pathMatchesFingerprint(restoredPath, swap.restoredFingerprint))) {
              return false
            }
          } else if (targetExists || restoredExists) return false
        } else {
          if (
            !targetExists ||
            !(await this.pathMatchesFingerprint(target, swap.originalFingerprint))
          ) {
            return false
          }
          if (swap.hadRestoredCopy) {
            if (
              !swap.restoredFingerprint ||
              !restoredExists ||
              !(await this.pathMatchesFingerprint(restored, swap.restoredFingerprint))
            ) {
              return false
            }
          } else if (restoredExists) return false
        }
      } else {
        if (originalExists || swap.originalFingerprint) return false
        if (swap.hadRestoredCopy) {
          if (!swap.restoredFingerprint || targetExists === restoredExists) return false
          const restoredPath = targetExists ? target : restored
          if (!(await this.pathMatchesFingerprint(restoredPath, swap.restoredFingerprint))) {
            return false
          }
        } else if (targetExists || restoredExists || swap.restoredFingerprint) return false
      }
    }
    return true
  }

  private async canRollbackInterruptedCleanup(
    root: string,
    journal: CleanupOperationJournal,
  ): Promise<boolean> {
    for (const item of journal.items) {
      try {
        const original = this.resolveManagedRelativePath(item.originalRelativePath)
        const staged = this.resolveInside(
          join(root, 'items'),
          item.originalRelativePath,
          '清理恢复路径无效。',
        )
        const originalExists = await this.pathExists(original)
        const stagedExists = await this.pathExists(staged)
        if (originalExists === stagedExists) return false
        if (
          !(await this.pathMatchesFingerprint(originalExists ? original : staged, item.fingerprint))
        ) {
          return false
        }
      } catch {
        return false
      }
    }
    return true
  }

  private async rollbackInterruptedCleanup(record: InterruptedOperationRecord): Promise<void> {
    if (!record.root || !record.cleanupJournal) {
      throw new PublicError('INVALID_REQUEST', '清理恢复日志不可用。')
    }
    if (!(await this.canRollbackInterruptedCleanup(record.root, record.cleanupJournal))) {
      throw new PublicError('INVALID_REQUEST', '清理中断状态已变化，恢复已取消。')
    }
    const moved: MovedItem[] = []
    try {
      for (const item of record.cleanupJournal.items) {
        const original = this.resolveManagedRelativePath(item.originalRelativePath)
        const staged = this.resolveInside(
          join(record.root, 'items'),
          item.originalRelativePath,
          '清理恢复路径无效。',
        )
        if (!(await this.pathExists(staged))) continue
        await mkdir(dirname(original), { recursive: true })
        await rename(staged, original)
        moved.push({ source: staged, target: original })
        if (this.shouldInjectFailure('E2E_RECOVERY_FAIL_AFTER_MOVES', moved.length)) {
          throw new PublicError('UNKNOWN', '模拟异常恢复失败，已保持中断前状态。')
        }
      }
    } catch (error) {
      const rollbackOk = await this.rollbackMoves(moved)
      if (!rollbackOk) {
        throw new PublicError('UNKNOWN', '异常恢复失败且回滚未完成，请停止操作并保留现场。')
      }
      if (error instanceof PublicError) throw error
      throw new PublicError('UNKNOWN', '异常恢复失败，已保持中断前状态。')
    }
    await rm(record.root, { force: true, recursive: true })
  }

  private async rollbackInterruptedRestore(record: InterruptedOperationRecord): Promise<void> {
    if (!record.root || !record.restoreJournal) {
      throw new PublicError('INVALID_REQUEST', '恢复日志不可用。')
    }
    if (!(await this.canRollbackInterruptedRestore(record.root, record.restoreJournal))) {
      throw new PublicError('INVALID_REQUEST', '恢复中断状态已变化，操作已取消。')
    }
    const processed: Array<{
      displaced: string | null
      original: string
      restoredOriginal: boolean
      target: string
    }> = []
    const displacedRoot = join(record.root, 'recovery-displaced')
    try {
      for (const swap of [...record.restoreJournal.swaps].reverse()) {
        const target = join(this.userDataPath, swap.directoryName)
        const original = join(record.root, 'original', swap.directoryName)
        const originalExists = await this.pathExists(original)
        let displaced: string | null = null
        if (originalExists) {
          if (await this.pathExists(target)) {
            displaced = join(displacedRoot, swap.directoryName)
            await mkdir(dirname(displaced), { recursive: true })
            await rename(target, displaced)
          }
          await rename(original, target)
          processed.push({ displaced, original, restoredOriginal: true, target })
        } else if (!swap.hadOriginal && (await this.pathExists(target))) {
          displaced = join(displacedRoot, swap.directoryName)
          await mkdir(dirname(displaced), { recursive: true })
          await rename(target, displaced)
          processed.push({ displaced, original, restoredOriginal: false, target })
        }
        if (this.shouldInjectFailure('E2E_RECOVERY_FAIL_AFTER_MOVES', processed.length)) {
          throw new PublicError('UNKNOWN', '模拟异常恢复失败，已保持中断前状态。')
        }
      }
    } catch (error) {
      let rollbackOk = true
      for (const item of [...processed].reverse()) {
        try {
          if (item.restoredOriginal && (await this.pathExists(item.target))) {
            await mkdir(dirname(item.original), { recursive: true })
            await rename(item.target, item.original)
          }
          if (item.displaced && (await this.pathExists(item.displaced))) {
            await rename(item.displaced, item.target)
          }
        } catch {
          rollbackOk = false
        }
      }
      if (!rollbackOk) {
        throw new PublicError('UNKNOWN', '异常恢复失败且回滚未完成，请停止操作并保留现场。')
      }
      if (error instanceof PublicError) throw error
      throw new PublicError('UNKNOWN', '异常恢复失败，已保持中断前状态。')
    }
    await rm(record.root, { force: true, recursive: true })
  }

  private async completeCommittedRestore(record: InterruptedOperationRecord): Promise<void> {
    if (!record.marker || !record.root) {
      throw new PublicError('INVALID_REQUEST', '已提交恢复记录不完整。')
    }
    await rm(record.root, { force: true, recursive: true })
    this.clearCommittedRestoreMarker(record.marker.restoreId)
  }

  private async clearRestoreMarker(record: InterruptedOperationRecord): Promise<void> {
    if (!record.marker || record.root) {
      throw new PublicError('INVALID_REQUEST', '恢复提交标记当前不能清理。')
    }
    this.clearCommittedRestoreMarker(record.marker.restoreId)
  }

  private async canReleaseManifest(
    root: string,
    manifest: CleanupQuarantineManifest,
  ): Promise<boolean> {
    const rootEntries = await readdir(root, { withFileTypes: true }).catch(() => [])
    if (
      rootEntries.length === 0 ||
      rootEntries.some(
        entry =>
          entry.isSymbolicLink() ||
          ![CLEANUP_JOURNAL_PATH, COMPLETED_PATH, MANIFEST_PATH, 'items'].includes(entry.name),
      )
    ) {
      return false
    }
    const itemRoots = manifest.items.map(item => item.originalRelativePath.replaceAll('\\', '/'))
    if (new Set(itemRoots).size !== itemRoots.length) return false
    const itemsRoot = join(root, 'items')
    const itemTreeCovered = async (directory: string, relativePath: string): Promise<boolean> => {
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => null)
      if (!entries) return false
      for (const entry of entries) {
        if (entry.isSymbolicLink()) return false
        const childRelativePath = toPortablePath(join(relativePath, entry.name))
        if (
          !itemRoots.some(
            itemRoot =>
              childRelativePath === itemRoot ||
              childRelativePath.startsWith(`${itemRoot}/`) ||
              itemRoot.startsWith(`${childRelativePath}/`),
          )
        ) {
          return false
        }
        if (
          entry.isDirectory() &&
          !(await itemTreeCovered(join(directory, entry.name), childRelativePath))
        ) {
          return false
        }
      }
      return true
    }
    if (!(await itemTreeCovered(itemsRoot, ''))) return false
    for (const item of manifest.items) {
      try {
        const source = this.resolveInside(
          join(root, 'items'),
          item.originalRelativePath,
          '隔离记录路径无效。',
        )
        if (!(await this.pathMatchesFingerprint(source, item.fingerprint))) return false
      } catch {
        return false
      }
    }
    return true
  }

  private async pathMatchesFingerprint(path: string, fingerprint: string): Promise<boolean> {
    const inspection = await this.inspectTree(path).catch(() => null)
    return Boolean(
      inspection && !inspection.hasSymbolicLink && inspection.fingerprint === fingerprint,
    )
  }

  private async writeJsonAtomic(path: string, value: unknown): Promise<void> {
    const temporaryPath = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
      await rename(temporaryPath, path)
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private async inspectTree(path: string): Promise<TreeInspection> {
    const rootStats = await lstat(path)
    const records: string[] = []
    let bytes = 0
    let hasSymbolicLink = false
    const walk = async (currentPath: string, currentRelativePath: string): Promise<void> => {
      const stats = await lstat(currentPath)
      const portableRelativePath = toPortablePath(currentRelativePath || '.')
      if (stats.isSymbolicLink()) {
        hasSymbolicLink = true
        records.push(`link\0${portableRelativePath}\0${stats.mtimeMs}`)
        return
      }
      if (stats.isFile()) {
        bytes += stats.size
        records.push(
          `file\0${portableRelativePath}\0${stats.size}\0${stats.mtimeMs}\0${await this.sha256File(currentPath)}`,
        )
        return
      }
      if (!stats.isDirectory()) {
        records.push(`other\0${portableRelativePath}\0${stats.mtimeMs}`)
        return
      }
      records.push(`directory\0${portableRelativePath}\0${stats.mtimeMs}`)
      const entries = await readdir(currentPath, { withFileTypes: true })
      entries.sort((left, right) => left.name.localeCompare(right.name))
      for (const entry of entries) {
        await walk(join(currentPath, entry.name), join(currentRelativePath, entry.name))
      }
    }
    await walk(path, '')
    return {
      bytes,
      createdAt: rootStats.mtime.toISOString(),
      fingerprint: createHash('sha256').update(records.join('\n')).digest('hex'),
      hasSymbolicLink,
    }
  }

  private async sha256File(path: string): Promise<string> {
    const hash = createHash('sha256')
    await new Promise<void>((resolveHash, rejectHash) => {
      const stream = createReadStream(path)
      stream.on('data', chunk => hash.update(chunk))
      stream.on('error', rejectHash)
      stream.on('end', resolveHash)
    })
    return hash.digest('hex')
  }

  private async listDirectManagedPaths(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    return entries
      .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
      .slice(0, MAX_MANAGED_ITEMS)
      .map(entry => join(root, entry.name))
  }

  private resolveManagedRelativePath(relativePath: string): string {
    const portable = relativePath.replaceAll('\\', '/')
    const allowed = [
      'restore-preflight-backups/',
      'file-plan-backups/',
      'batch-import-backups/',
      'problem-images/.trash/',
    ].some(prefix => portable.startsWith(prefix) && portable.length > prefix.length)
    if (!allowed) throw new PublicError('PATH_NOT_AUTHORIZED', '隔离记录不在允许的数据目录内。')
    return this.resolveInside(this.userDataPath, portable, '隔离记录路径无效。')
  }

  private resolveInside(root: string, relativePath: string, message: string): string {
    if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\0')) {
      throw new PublicError('PATH_NOT_AUTHORIZED', message)
    }
    const candidate = resolve(root, ...relativePath.replaceAll('\\', '/').split('/'))
    if (!isPathInsideRoot(root, candidate) || candidate === root) {
      throw new PublicError('PATH_NOT_AUTHORIZED', message)
    }
    return candidate
  }

  private async rollbackMoves(moved: MovedItem[]): Promise<boolean> {
    let success = true
    for (const item of [...moved].reverse()) {
      try {
        if (!(await this.pathExists(item.target)) || (await this.pathExists(item.source))) {
          success = false
          continue
        }
        await mkdir(dirname(item.source), { recursive: true })
        await rename(item.target, item.source)
      } catch {
        success = false
      }
    }
    return success
  }

  private shouldInjectFailure(environmentName: string, movedCount: number): boolean {
    const requestedCount = Number.parseInt(process.env[environmentName] ?? '', 10)
    return Number.isInteger(requestedCount) && requestedCount > 0 && movedCount === requestedCount
  }

  private async pathSize(path: string): Promise<number> {
    const stats = await lstat(path).catch(() => null)
    if (!stats || stats.isSymbolicLink()) return 0
    if (stats.isFile()) return stats.size
    if (!stats.isDirectory()) return 0
    const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
    const sizes = await Promise.all(entries.map(entry => this.pathSize(join(path, entry.name))))
    return sizes.reduce((total, bytes) => total + bytes, 0)
  }

  private async assertMissing(path: string): Promise<void> {
    if (await this.pathExists(path)) {
      throw new PublicError('INVALID_REQUEST', '隔离目标已存在，请重新诊断。')
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    return lstat(path)
      .then(() => true)
      .catch(() => false)
  }
}
