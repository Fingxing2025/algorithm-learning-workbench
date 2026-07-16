import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

import {
  backupLifecycleInventorySchema,
  cleanupPreviewSchema,
  cleanupQuarantineManifestSchema,
  quarantineCleanupResultSchema,
  undoCleanupResultSchema,
  type BackupLifecycleArea,
  type BackupLifecycleInventory,
  type BackupLifecycleRequest,
  type BackupRetentionPolicy,
  type BackupVerification,
  type CleanupCandidate,
  type CleanupCandidateCategory,
  type CleanupCandidateReason,
  type CleanupPreview,
  type CleanupPreviewRequest,
  type CleanupQuarantineManifest,
  type CleanupQuarantineOperation,
  type QuarantineCleanupRequest,
  type QuarantineCleanupResult,
  type UndoCleanupRequest,
  type UndoCleanupResult,
} from '@core/contracts/data-management'

import type { AppDatabase } from '../database/database'
import { PublicError } from '../errors/public-error'
import { isPathInsideRoot } from '../security/path-guard'

const COMPLETED_PATH = 'COMPLETED'
const MANIFEST_PATH = 'manifest.json'
const QUARANTINE_DIRECTORY = 'data-management-quarantine'
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

type VerifyBackupPath = (packagePath: string) => Promise<BackupVerification>

function toPortablePath(value: string): string {
  return value.split(sep).join('/')
}

export class DataLifecycleService {
  constructor(
    private readonly database: AppDatabase,
    private readonly userDataPath: string,
    private readonly verifyBackupPath: VerifyBackupPath,
  ) {}

  async inspect(request: BackupLifecycleRequest): Promise<BackupLifecycleInventory> {
    const candidates = await this.collectCandidates(request.retentionPolicy)
    const quarantineRecords = await this.listQuarantineRecords()
    const interrupted = await this.inspectInterruptedOperations(quarantineRecords)
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
        bytes: interrupted.bytes,
        itemCount: interrupted.count,
        key: 'interrupted-operations',
        quarantinableBytes: 0,
        quarantinableCount: 0,
      },
    ]
    return backupLifecycleInventorySchema.parse({
      areas,
      candidates: candidates.map(candidate => this.toPublicCandidate(candidate)),
      checkedAt: new Date().toISOString(),
      interruptedOperationCount: interrupted.count,
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
    try {
      await mkdir(quarantineRoot, { recursive: true })
      await this.assertMissing(stagingRoot)
      await this.assertMissing(finalRoot)
      await mkdir(stagingRoot, { recursive: false })
      const sortedCandidates = [...currentCandidates].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
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
      }

      const createdAt = new Date().toISOString()
      const manifest = cleanupQuarantineManifestSchema.parse({
        completed: true,
        createdAt,
        formatVersion: 'v1',
        items: sortedCandidates.map(candidate => ({
          bytes: candidate.bytes,
          candidateId: candidate.id,
          category: candidate.category,
          fingerprint: candidate.fingerprint,
          originalRelativePath: candidate.relativePath,
        })),
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
      if (!published) {
        const rollbackOk = await this.rollbackMoves(moved)
        await rm(stagingRoot, { force: true, recursive: true }).catch(() => undefined)
        if (!rollbackOk) {
          throw new PublicError('UNKNOWN', '清理失败且自动回滚未完成，请在数据管理页检查异常残留。')
        }
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

  private async inspectInterruptedOperations(
    validQuarantineRecords: QuarantineRecord[],
  ): Promise<{ bytes: number; count: number }> {
    const paths: string[] = []
    const userDataEntries = await readdir(this.userDataPath, { withFileTypes: true }).catch(
      () => [],
    )
    for (const entry of userDataEntries) {
      if (
        entry.name.endsWith('.tmp') ||
        entry.name.startsWith('.restore-') ||
        entry.name.includes('.awb-backup.')
      ) {
        paths.push(join(this.userDataPath, entry.name))
      }
    }
    const preflightRoot = join(this.userDataPath, 'restore-preflight-backups')
    const preflightEntries = await readdir(preflightRoot, { withFileTypes: true }).catch(() => [])
    for (const entry of preflightEntries) {
      if (entry.name.endsWith('.tmp')) paths.push(join(preflightRoot, entry.name))
    }
    const quarantineRoot = join(this.userDataPath, QUARANTINE_DIRECTORY)
    const quarantineEntries = await readdir(quarantineRoot, { withFileTypes: true }).catch(() => [])
    const validIds = new Set(validQuarantineRecords.map(record => record.operation.id))
    for (const entry of quarantineEntries) {
      if (!validIds.has(entry.name)) paths.push(join(quarantineRoot, entry.name))
    }
    const uniquePaths = [...new Set(paths)]
    const sizes = await Promise.all(uniquePaths.map(path => this.pathSize(path)))
    return { bytes: sizes.reduce((total, bytes) => total + bytes, 0), count: uniquePaths.length }
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
        records.push(`file\0${portableRelativePath}\0${stats.size}\0${stats.mtimeMs}`)
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
