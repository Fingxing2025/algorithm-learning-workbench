import { createHash, randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

import BetterSqlite3 from 'better-sqlite3'
import { dialog, shell, type BrowserWindow } from 'electron'

import {
  backupManifestSchema,
  type BackupExportResult,
  type BackupFileEntry,
  type BackupManifest,
  type BackupVerification,
  type BackupLifecycleInventory,
  type BackupLifecycleRequest,
  type CleanupPreview,
  type CleanupPreviewRequest,
  type DataDiagnostics,
  type DataIntegrityIssue,
  type DataManagementCounts,
  type DataStorageArea,
  type ExportBackupRequest,
  type RestoreBackupRequest,
  type RestoreBackupResult,
  type RestorePreview,
  type QuarantineCleanupRequest,
  type QuarantineCleanupResult,
  type InterruptedRecoveryPreview,
  type InterruptedRecoveryPreviewRequest,
  type QuarantineReleasePreview,
  type QuarantineReleasePreviewRequest,
  type RecoverInterruptedOperationRequest,
  type RecoverInterruptedOperationResult,
  type ReleaseQuarantineRequest,
  type ReleaseQuarantineResult,
  type RestoreOperationJournal,
  type UndoCleanupRequest,
  type UndoCleanupResult,
} from '@core/contracts/data-management'

import packageJson from '../../../package.json'
import type { AppDatabase } from '../database/database'
import { PublicError } from '../errors/public-error'
import {
  isPathInsideRoot,
  resolveAuthorizedFile,
  resolveAuthorizedRoot,
} from '../security/path-guard'
import { DataLifecycleService, RESTORE_COMMIT_MARKER_PREFIX } from './data-lifecycle-service'

const DATABASE_FILE = 'algorithm-workbench.sqlite'
const BACKUP_EXTENSION = '.awb-backup'
const MANIFEST_PATH = 'manifest.json'
const CHECKSUMS_PATH = 'checksums.sha256'
const COMPLETED_PATH = 'COMPLETED'
const DATA_DIRECTORY = 'data'
const SQLITE_SNAPSHOT_PATH = 'data/sqlite/algorithm-workbench.sqlite'
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024
const RESTORABLE_USER_DATA_DIRECTORIES = [
  'problem-images',
  'file-plan-backups',
  'batch-import-backups',
] as const
const RESTORE_TABLES = [
  'app_migrations',
  'app_state',
  'workspaces',
  'templates',
  'template_metadata',
  'problems',
  'problem_images',
  'template_problem_relations',
  'ai_provider_profiles',
  'ai_task_routes',
  'file_change_plans',
  'file_change_executions',
] as const

type CountKey = keyof DataManagementCounts
type RestorableUserDataDirectory = (typeof RESTORABLE_USER_DATA_DIRECTORIES)[number]

interface DirectorySwap {
  directoryName: RestorableUserDataDirectory
  originalPath: string
  restoredPath: string
  targetPath: string
}

const zeroCounts: DataManagementCounts = {
  aiProviderProfiles: 0,
  aiTaskRoutes: 0,
  batchImportBackupDirectories: 0,
  fileChangeExecutions: 0,
  fileChangePlans: 0,
  filePlanBackupDirectories: 0,
  problemImages: 0,
  problemImageFiles: 0,
  problems: 0,
  templateMetadata: 0,
  templateProblemRelations: 0,
  templates: 0,
  workspaces: 0,
}

export class DataManagementService {
  private readonly lifecycleService: DataLifecycleService

  constructor(
    private readonly database: AppDatabase,
    private readonly userDataPath: string,
  ) {
    this.lifecycleService = new DataLifecycleService(
      database,
      userDataPath,
      packagePath => this.verifyBackupPath(packagePath),
      path => shell.trashItem(path),
    )
  }

  async diagnose(): Promise<DataDiagnostics> {
    const counts = await this.collectCounts()
    const database = this.checkDatabase(this.database.client)
    const issues: DataIntegrityIssue[] = []
    if (database.quickCheck !== 'ok') {
      issues.push({ count: 1, kind: 'database-quick-check', severity: 'error' })
    }
    if (!database.foreignKeyOk) {
      issues.push({ count: 1, kind: 'database-foreign-key', severity: 'error' })
    }
    const imageDiagnostics = await this.inspectProblemImages()
    issues.push(...imageDiagnostics)
    issues.push(...(await this.inspectBackupDirectories()))
    issues.push(...(await this.inspectTemporaryFiles()))

    return {
      checkedAt: new Date().toISOString(),
      counts,
      database,
      issues,
      storage: await this.collectStorage(),
    }
  }

  async exportBackup(
    request: ExportBackupRequest,
    parentWindow?: BrowserWindow,
  ): Promise<BackupExportResult | null> {
    const result = parentWindow
      ? await dialog.showSaveDialog(parentWindow, this.exportDialogOptions())
      : await dialog.showSaveDialog(this.exportDialogOptions())
    if (result.canceled || !result.filePath) {
      return null
    }

    const finalPath = await this.normalizeBackupTarget(result.filePath)
    const finalParent = dirname(finalPath)
    const temporaryPath = join(finalParent, `.${basename(finalPath)}.${randomUUID()}.tmp`)
    try {
      await this.assertPathDoesNotExist(finalPath)
      await mkdir(temporaryPath, { recursive: false })
      const manifest = await this.writeBackupPackage(temporaryPath, request)
      const verification = await this.verifyBackupPath(temporaryPath, { requireExtension: false })
      if (!verification.ok) {
        throw new PublicError('UNKNOWN', '备份包验证失败，导出已取消。')
      }
      await rename(temporaryPath, finalPath)
      const publishedVerification = await this.verifyBackupPath(finalPath)
      if (!publishedVerification.ok) {
        throw new PublicError('UNKNOWN', '备份发布后验证失败，请重新导出。')
      }
      return { manifest, packagePath: finalPath, verification: publishedVerification }
    } catch (error) {
      await rm(temporaryPath, { force: true, recursive: true }).catch(() => undefined)
      if (error instanceof PublicError) throw error
      throw new PublicError('UNKNOWN', '导出备份失败，临时文件已清理。')
    }
  }

  async verifyBackup(parentWindow?: BrowserWindow): Promise<BackupVerification | null> {
    const selectedPath = await this.chooseBackupPackage(parentWindow)
    if (!selectedPath) return null
    return this.verifyBackupPath(selectedPath)
  }

  async previewRestore(parentWindow?: BrowserWindow): Promise<RestorePreview | null> {
    const selectedPath = await this.chooseBackupPackage(parentWindow)
    if (!selectedPath) return null
    const verification = await this.verifyBackupPath(selectedPath)
    const conflicts: string[] = []
    if (!verification.ok) {
      conflicts.push('备份包校验未通过，禁止恢复。')
    }
    if (verification.manifest?.formatVersion !== 'v1') {
      conflicts.push('备份包版本不兼容。')
    }
    const currentCounts = await this.collectCounts()
    return {
      canRestore: conflicts.length === 0 && verification.ok,
      conflicts,
      currentCounts,
      manifest: verification.manifest,
      verification,
    }
  }

  async restoreBackup(request: RestoreBackupRequest): Promise<RestoreBackupResult> {
    const backupPath = resolve(request.packagePath)
    const verification = await this.verifyBackupPath(backupPath)
    if (!verification.ok || !verification.manifest) {
      throw new PublicError('INVALID_REQUEST', '备份包校验未通过，禁止恢复。')
    }
    if (verification.manifest.formatVersion !== 'v1') {
      throw new PublicError('INVALID_REQUEST', '备份包版本不兼容，无法恢复。')
    }
    if (request.templateSourceStrategy !== 'skip') {
      throw new PublicError('INVALID_REQUEST', '当前版本只支持跳过模板源码恢复。')
    }

    const preflightBackupPath = await this.createPreflightBackup()
    const restoreId = randomUUID()
    const stagingRoot = join(this.userDataPath, `.restore-${restoreId}.tmp`)
    const swaps: DirectorySwap[] = []
    let databaseCommitted = false
    let preserveInterruptedState = false
    try {
      await mkdir(stagingRoot, { recursive: false })
      await this.prepareRestoredDirectories(backupPath, stagingRoot)
      const journal = await this.createRestoreJournal(
        stagingRoot,
        restoreId,
        basename(preflightBackupPath),
      )
      await this.lifecycleService.writeRestoreJournal(stagingRoot, journal)
      await this.applyRestoredDirectories(stagingRoot, swaps)
      if (process.env.E2E_RESTORE_FAIL_STAGE === 'after-file-swap') {
        throw new PublicError('UNKNOWN', '模拟恢复失败，已回滚到操作前状态。')
      }
      if (process.env.E2E_RESTORE_INTERRUPT_STAGE === 'after-file-swap') {
        preserveInterruptedState = true
        throw new PublicError('UNKNOWN', '模拟恢复异常中断，已保留恢复日志。')
      }
      await this.restoreDatabaseFromSnapshot(join(backupPath, SQLITE_SNAPSHOT_PATH), {
        committedAt: new Date().toISOString(),
        formatVersion: 'v1',
        restoreId,
        rollbackBackupName: basename(preflightBackupPath),
      })
      databaseCommitted = true
      if (process.env.E2E_RESTORE_INTERRUPT_STAGE === 'after-database-commit') {
        preserveInterruptedState = true
        throw new PublicError('UNKNOWN', '模拟恢复已提交但收尾中断，已保留恢复日志。')
      }
      await rm(stagingRoot, { force: true, recursive: true })
      this.lifecycleService.clearCommittedRestoreMarker(restoreId)
      const diagnostics = await this.diagnose()
      return {
        preflightBackupPath,
        providerSecretsNeedReentry: verification.manifest.counts.aiProviderProfiles > 0,
        restoredCounts: diagnostics.counts,
        skippedTemplateSources: verification.manifest.includeTemplateSources,
      }
    } catch (error) {
      databaseCommitted ||= this.lifecycleService.hasCommittedRestoreMarker(restoreId)
      if (databaseCommitted || preserveInterruptedState) {
        if (error instanceof PublicError) throw error
        throw new PublicError(
          'UNKNOWN',
          databaseCommitted
            ? '恢复已提交，但收尾未完成，请在数据管理页处理异常操作。'
            : '恢复异常中断，已保留可验证恢复日志。',
        )
      }
      const rollbackOk = await this.rollbackRestoredDirectories(swaps)
      if (!rollbackOk) {
        throw new PublicError('UNKNOWN', '恢复失败且自动回滚未完成，请在数据管理页处理异常操作。')
      }
      await rm(stagingRoot, { force: true, recursive: true }).catch(() => undefined)
      if (error instanceof PublicError) throw error
      throw new PublicError('UNKNOWN', '恢复失败，当前数据已回滚到操作前状态。')
    }
  }

  inspectBackupLifecycle(request: BackupLifecycleRequest): Promise<BackupLifecycleInventory> {
    return this.lifecycleService.inspect(request)
  }

  previewCleanup(request: CleanupPreviewRequest): Promise<CleanupPreview> {
    return this.lifecycleService.preview(request)
  }

  quarantineCleanup(request: QuarantineCleanupRequest): Promise<QuarantineCleanupResult> {
    return this.lifecycleService.quarantine(request)
  }

  undoCleanup(request: UndoCleanupRequest): Promise<UndoCleanupResult> {
    return this.lifecycleService.undo(request)
  }

  previewInterruptedRecovery(
    request: InterruptedRecoveryPreviewRequest,
  ): Promise<InterruptedRecoveryPreview> {
    return this.lifecycleService.previewInterruptedRecovery(request)
  }

  recoverInterruptedOperation(
    request: RecoverInterruptedOperationRequest,
  ): Promise<RecoverInterruptedOperationResult> {
    return this.lifecycleService.recoverInterruptedOperation(request)
  }

  previewQuarantineRelease(
    request: QuarantineReleasePreviewRequest,
  ): Promise<QuarantineReleasePreview> {
    return this.lifecycleService.previewQuarantineRelease(request)
  }

  releaseQuarantine(request: ReleaseQuarantineRequest): Promise<ReleaseQuarantineResult> {
    return this.lifecycleService.releaseQuarantine(request)
  }

  private exportDialogOptions(): Electron.SaveDialogOptions {
    return {
      buttonLabel: '导出备份',
      defaultPath: `algorithm-workbench-${new Date().toISOString().slice(0, 10)}${BACKUP_EXTENSION}`,
      filters: [{ extensions: ['awb-backup'], name: 'Algorithm Workbench Backup' }],
      title: '导出 V2 数据备份',
    }
  }

  private async chooseBackupPackage(parentWindow?: BrowserWindow): Promise<string | null> {
    const options: Electron.OpenDialogOptions = {
      buttonLabel: '选择备份',
      properties: ['openDirectory'],
      title: '选择 V2 备份包',
    }
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return resolve(result.filePaths[0])
  }

  private async normalizeBackupTarget(inputPath: string): Promise<string> {
    const resolved = resolve(inputPath)
    const parent = await realpath(dirname(resolved))
    const normalized = join(parent, basename(resolved))
    if (!normalized.endsWith(BACKUP_EXTENSION)) {
      return `${normalized}${BACKUP_EXTENSION}`
    }
    return normalized
  }

  private async assertPathDoesNotExist(path: string): Promise<void> {
    const exists = await stat(path)
      .then(() => true)
      .catch(() => false)
    if (exists) {
      throw new PublicError('INVALID_REQUEST', '目标备份包已存在，请选择新的导出位置。')
    }
  }

  private async writeBackupPackage(
    packagePath: string,
    request: ExportBackupRequest,
  ): Promise<BackupManifest> {
    await mkdir(join(packagePath, DATA_DIRECTORY), { recursive: true })
    await this.writeSqliteSnapshot(join(packagePath, SQLITE_SNAPSHOT_PATH))
    await this.copyUserDataDirectory(packagePath, 'problem-images')
    await this.copyUserDataDirectory(packagePath, 'file-plan-backups')
    await this.copyUserDataDirectory(packagePath, 'batch-import-backups')
    if (request.includeTemplateSources) {
      await this.copyTemplateSources(packagePath)
    }
    await writeFile(join(packagePath, COMPLETED_PATH), `${new Date().toISOString()}\n`, {
      flag: 'wx',
    })

    const diagnostics = await this.diagnose()
    const snapshot = new BetterSqlite3(join(packagePath, SQLITE_SNAPSHOT_PATH), { readonly: true })
    const sqliteCheck = this.checkDatabase(snapshot)
    snapshot.close()
    const manifest: BackupManifest = backupManifestSchema.parse({
      appVersion: packageJson.version,
      completed: true,
      counts: diagnostics.counts,
      createdAt: new Date().toISOString(),
      diagnostics,
      files: await this.collectPackageFileEntries(packagePath),
      formatVersion: 'v1',
      includeTemplateSources: request.includeTemplateSources,
      packageId: randomUUID(),
      privacy: {
        excluded: [
          'api-keys',
          'electron-cache',
          'local-storage',
          'session-storage',
          'template-sources-by-default',
        ],
        providerSecrets: 'omitted',
      },
      sqlite: {
        foreignKeyOk: sqliteCheck.foreignKeyOk,
        quickCheck: sqliteCheck.quickCheck,
        sanitizedProviderSecrets: true,
      },
    })
    await writeFile(join(packagePath, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: 'wx',
    })
    await writeFile(
      join(packagePath, CHECKSUMS_PATH),
      await this.formatChecksums(packagePath, manifest.files),
      { flag: 'wx' },
    )
    return manifest
  }

  private async createPreflightBackup(): Promise<string> {
    const backupRoot = join(this.userDataPath, 'restore-preflight-backups')
    await mkdir(backupRoot, { recursive: true })
    const finalPath = join(
      backupRoot,
      `preflight-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}${BACKUP_EXTENSION}`,
    )
    const temporaryPath = join(backupRoot, `.${basename(finalPath)}.tmp`)
    try {
      await mkdir(temporaryPath, { recursive: false })
      await this.writeBackupPackage(temporaryPath, { includeTemplateSources: false })
      const verification = await this.verifyBackupPath(temporaryPath, { requireExtension: false })
      if (!verification.ok) {
        throw new PublicError('UNKNOWN', '恢复前自动备份验证失败，恢复已取消。')
      }
      await rename(temporaryPath, finalPath)
      const publishedVerification = await this.verifyBackupPath(finalPath)
      if (!publishedVerification.ok) {
        throw new PublicError('UNKNOWN', '恢复前自动备份发布后验证失败，恢复已取消。')
      }
      return finalPath
    } catch (error) {
      await rm(temporaryPath, { force: true, recursive: true }).catch(() => undefined)
      if (error instanceof PublicError) throw error
      throw new PublicError('UNKNOWN', '恢复前自动备份失败，恢复已取消。')
    }
  }

  private async prepareRestoredDirectories(backupPath: string, stagingRoot: string): Promise<void> {
    const restoredRoot = join(stagingRoot, 'restored')
    await mkdir(restoredRoot, { recursive: true })
    for (const directoryName of RESTORABLE_USER_DATA_DIRECTORIES) {
      const source = join(backupPath, DATA_DIRECTORY, directoryName)
      if (!(await this.pathExists(source))) continue
      await cp(source, join(restoredRoot, directoryName), {
        dereference: false,
        errorOnExist: true,
        force: false,
        recursive: true,
      })
    }
  }

  private async createRestoreJournal(
    stagingRoot: string,
    restoreId: string,
    rollbackBackupName: string,
  ): Promise<RestoreOperationJournal> {
    const swaps: RestoreOperationJournal['swaps'] = []
    for (const directoryName of RESTORABLE_USER_DATA_DIRECTORIES) {
      const originalPath = join(this.userDataPath, directoryName)
      const restoredPath = join(stagingRoot, 'restored', directoryName)
      const hadOriginal = await this.pathExists(originalPath)
      const hadRestoredCopy = await this.pathExists(restoredPath)
      const originalInspection = hadOriginal
        ? await this.lifecycleService.inspectPathForJournal(originalPath)
        : null
      const restoredInspection = hadRestoredCopy
        ? await this.lifecycleService.inspectPathForJournal(restoredPath)
        : null
      if (originalInspection?.hasSymbolicLink || restoredInspection?.hasSymbolicLink) {
        throw new PublicError('INVALID_REQUEST', '恢复目录包含符号链接，操作已取消。')
      }
      swaps.push({
        directoryName,
        hadOriginal,
        hadRestoredCopy,
        originalFingerprint: originalInspection?.fingerprint ?? null,
        restoredFingerprint: restoredInspection?.fingerprint ?? null,
      })
    }
    return {
      createdAt: new Date().toISOString(),
      formatVersion: 'v1',
      restoreId,
      rollbackBackupName,
      swaps,
    }
  }

  private async applyRestoredDirectories(
    stagingRoot: string,
    swaps: DirectorySwap[],
  ): Promise<void> {
    const originalRoot = join(stagingRoot, 'original')
    await mkdir(originalRoot, { recursive: true })
    for (const directoryName of RESTORABLE_USER_DATA_DIRECTORIES) {
      const targetPath = join(this.userDataPath, directoryName)
      const originalPath = join(originalRoot, directoryName)
      const restoredPath = join(stagingRoot, 'restored', directoryName)
      if (await this.pathExists(targetPath)) {
        await rename(targetPath, originalPath)
      }
      swaps.push({ directoryName, originalPath, restoredPath, targetPath })
      if (await this.pathExists(restoredPath)) {
        await rename(restoredPath, targetPath)
      }
    }
  }

  private async rollbackRestoredDirectories(swaps: DirectorySwap[]): Promise<boolean> {
    for (const swap of [...swaps].reverse()) {
      try {
        if (await this.pathExists(swap.originalPath)) {
          if (await this.pathExists(swap.targetPath)) {
            if (await this.pathExists(swap.restoredPath)) return false
            await rename(swap.targetPath, swap.restoredPath)
          }
          await rename(swap.originalPath, swap.targetPath)
        } else if (await this.pathExists(swap.targetPath)) {
          if (await this.pathExists(swap.restoredPath)) return false
          await rename(swap.targetPath, swap.restoredPath)
        }
      } catch {
        return false
      }
    }
    return true
  }

  private async restoreDatabaseFromSnapshot(
    snapshotPath: string,
    marker: {
      committedAt: string
      formatVersion: 'v1'
      restoreId: string
      rollbackBackupName: string
    },
  ): Promise<void> {
    const snapshot = new BetterSqlite3(snapshotPath, { readonly: true })
    try {
      const snapshotCheck = this.checkDatabase(snapshot)
      if (snapshotCheck.quickCheck !== 'ok' || !snapshotCheck.foreignKeyOk) {
        throw new PublicError('INVALID_REQUEST', '备份 SQLite 校验未通过，禁止恢复。')
      }
      const currentColumns = new Map(
        RESTORE_TABLES.map(table => [table, this.getTableColumns(this.database.client, table)]),
      )
      const snapshotColumns = new Map(
        RESTORE_TABLES.map(table => [table, this.getTableColumns(snapshot, table)]),
      )
      for (const table of RESTORE_TABLES) {
        const current = currentColumns.get(table) ?? []
        const backup = snapshotColumns.get(table) ?? []
        if (
          current.length === 0 ||
          backup.length === 0 ||
          current.join('\0') !== backup.join('\0')
        ) {
          throw new PublicError('INVALID_REQUEST', '备份数据库结构与当前版本不兼容，无法恢复。')
        }
      }
    } finally {
      snapshot.close()
    }

    let attached = false
    this.database.client.pragma('foreign_keys = OFF')
    try {
      this.database.client.prepare('ATTACH DATABASE ? AS restore_src').run(snapshotPath)
      attached = true
      const restoreTransaction = this.database.client.transaction(() => {
        for (const table of [...RESTORE_TABLES].reverse()) {
          this.database.client.prepare(`DELETE FROM ${table}`).run()
        }
        for (const table of RESTORE_TABLES) {
          const columns = this.getTableColumns(this.database.client, table)
          const columnList = columns.map(column => `"${column}"`).join(', ')
          this.database.client
            .prepare(
              `INSERT INTO ${table} (${columnList}) SELECT ${columnList} FROM restore_src.${table}`,
            )
            .run()
        }
        const restoredCheck = this.checkDatabase(this.database.client)
        if (restoredCheck.quickCheck !== 'ok' || !restoredCheck.foreignKeyOk) {
          throw new PublicError('UNKNOWN', '恢复后的 SQLite 校验失败，当前数据已回滚。')
        }
        this.database.client
          .prepare('INSERT INTO app_state (key, value) VALUES (?, ?)')
          .run(`${RESTORE_COMMIT_MARKER_PREFIX}${marker.restoreId}`, JSON.stringify(marker))
      })
      restoreTransaction()
    } catch (error) {
      if (error instanceof PublicError) throw error
      throw new PublicError('UNKNOWN', 'SQLite 恢复失败，当前数据已回滚。')
    } finally {
      if (attached) {
        try {
          this.database.client.prepare('DETACH DATABASE restore_src').run()
        } catch {
          // Best-effort cleanup; the active connection is still protected by the transaction above.
        }
      }
      this.database.client.pragma('foreign_keys = ON')
    }
  }

  private getTableColumns(client: BetterSqlite3.Database, table: string): string[] {
    return (
      client.prepare(`PRAGMA table_info(${table})`).all() as Array<{
        name: string
      }>
    ).map(column => column.name)
  }

  private async writeSqliteSnapshot(snapshotPath: string): Promise<void> {
    await mkdir(dirname(snapshotPath), { recursive: true })
    this.database.client.pragma('wal_checkpoint(PASSIVE)')
    await this.database.client.backup(snapshotPath)
    const snapshot = new BetterSqlite3(snapshotPath)
    try {
      snapshot.pragma('foreign_keys = ON')
      snapshot.prepare('UPDATE ai_provider_profiles SET secret_ref = NULL').run()
      snapshot
        .prepare('DELETE FROM app_state WHERE key LIKE ?')
        .run(`${RESTORE_COMMIT_MARKER_PREFIX}%`)
      snapshot.pragma('wal_checkpoint(TRUNCATE)')
      const check = this.checkDatabase(snapshot)
      if (check.quickCheck !== 'ok' || !check.foreignKeyOk) {
        throw new PublicError('UNKNOWN', 'SQLite 快照校验失败，导出已取消。')
      }
    } finally {
      snapshot.close()
    }
  }

  private checkDatabase(client: BetterSqlite3.Database): DataDiagnostics['database'] {
    const quickCheck =
      (client.prepare('PRAGMA quick_check').pluck().get() as string | undefined) ?? 'unknown'
    const foreignRows = client.prepare('PRAGMA foreign_key_check').all()
    return {
      foreignKeyOk: foreignRows.length === 0,
      quickCheck,
      walPresent: this.fileExists(join(this.userDataPath, `${DATABASE_FILE}-wal`)),
    }
  }

  private async collectCounts(): Promise<DataManagementCounts> {
    const counts = { ...zeroCounts }
    const tableMap: Array<[CountKey, string]> = [
      ['aiProviderProfiles', 'ai_provider_profiles'],
      ['aiTaskRoutes', 'ai_task_routes'],
      ['fileChangeExecutions', 'file_change_executions'],
      ['fileChangePlans', 'file_change_plans'],
      ['problemImages', 'problem_images'],
      ['problems', 'problems'],
      ['templateMetadata', 'template_metadata'],
      ['templateProblemRelations', 'template_problem_relations'],
      ['workspaces', 'workspaces'],
    ]
    for (const [key, table] of tableMap) {
      counts[key] = this.database.client
        .prepare(`SELECT count(*) FROM ${table}`)
        .pluck()
        .get() as number
    }
    counts.templates = this.database.client
      .prepare(
        "SELECT count(*) FROM templates WHERE available = 1 AND workspace_id = (SELECT value FROM app_state WHERE key = 'active_workspace_id')",
      )
      .pluck()
      .get() as number
    counts.problemImageFiles = await this.countFiles(join(this.userDataPath, 'problem-images'))
    counts.filePlanBackupDirectories = await this.countDirectories(
      join(this.userDataPath, 'file-plan-backups'),
    )
    counts.batchImportBackupDirectories = await this.countDirectories(
      join(this.userDataPath, 'batch-import-backups'),
    )
    return counts
  }

  private async inspectProblemImages(): Promise<DataIntegrityIssue[]> {
    const records = this.database.client
      .prepare('SELECT relative_path AS relativePath FROM problem_images')
      .all() as Array<{ relativePath: string }>
    const recordPaths = new Set(records.map(record => record.relativePath))
    const issues: DataIntegrityIssue[] = []
    let missing = 0
    for (const record of records) {
      if (!this.fileExists(join(this.userDataPath, record.relativePath))) missing += 1
    }
    if (missing > 0) issues.push({ count: missing, kind: 'image-file-missing', severity: 'error' })

    const imageRoot = join(this.userDataPath, 'problem-images')
    const files = await this.listRelativeFiles(imageRoot)
    const orphanCount = files.filter(
      path =>
        !path.startsWith('.trash/') &&
        !path.includes('/.trash/') &&
        !recordPaths.has(`problem-images/${path}`),
    ).length
    if (orphanCount > 0) {
      issues.push({ count: orphanCount, kind: 'orphan-image-file', severity: 'warning' })
    }
    const trashCount = files.filter(path => path.startsWith('.trash/')).length
    if (trashCount > 0) {
      issues.push({ count: trashCount, kind: 'residual-trash', severity: 'info' })
    }
    return issues
  }

  private async inspectBackupDirectories(): Promise<DataIntegrityIssue[]> {
    const issues: DataIntegrityIssue[] = []
    const executionRecords = this.database.client
      .prepare('SELECT backup_directory AS backupDirectory, status FROM file_change_executions')
      .all() as Array<{ backupDirectory: string; status: string }>
    const recorded = new Set(executionRecords.map(row => row.backupDirectory))
    const missingAppliedBackups = executionRecords.filter(row => {
      if (row.status !== 'applied') return false
      const backupPath = resolve(this.userDataPath, row.backupDirectory)
      return (
        !isPathInsideRoot(this.userDataPath, backupPath) || !this.fileExistsOrDirectory(backupPath)
      )
    }).length
    if (missingAppliedBackups > 0) {
      issues.push({
        count: missingAppliedBackups,
        kind: 'file-execution-backup-missing',
        severity: 'error',
      })
    }
    const filePlanBackups = await this.listDirectoryNames(
      join(this.userDataPath, 'file-plan-backups'),
    )
    const unrecordedFilePlan = filePlanBackups.filter(
      name => !recorded.has(`file-plan-backups/${name}`),
    ).length
    if (unrecordedFilePlan > 0) {
      issues.push({
        count: unrecordedFilePlan,
        kind: 'file-plan-backup-without-record',
        severity: 'warning',
      })
    }
    const batchBackups = await this.listDirectoryNames(
      join(this.userDataPath, 'batch-import-backups'),
    )
    if (batchBackups.length > 0) {
      issues.push({
        count: batchBackups.length,
        kind: 'batch-backup-without-record',
        severity: 'info',
      })
    }
    return issues
  }

  private async inspectTemporaryFiles(): Promise<DataIntegrityIssue[]> {
    const entries = await readdir(this.userDataPath, { withFileTypes: true }).catch(() => [])
    const count = entries.filter(
      entry => entry.name.endsWith('.tmp') || entry.name.includes('.awb-backup.'),
    ).length
    return count > 0 ? [{ count, kind: 'temporary-file', severity: 'warning' }] : []
  }

  private async collectStorage(): Promise<DataStorageArea[]> {
    return [
      { key: 'user-data-total', bytes: await this.pathSize(this.userDataPath) },
      { key: 'database', bytes: await this.pathSize(join(this.userDataPath, DATABASE_FILE)) },
      {
        key: 'problem-images',
        bytes: await this.pathSize(join(this.userDataPath, 'problem-images')),
      },
      {
        key: 'file-plan-backups',
        bytes: await this.pathSize(join(this.userDataPath, 'file-plan-backups')),
      },
      {
        key: 'batch-import-backups',
        bytes: await this.pathSize(join(this.userDataPath, 'batch-import-backups')),
      },
      {
        key: 'data-management-quarantine',
        bytes: await this.pathSize(join(this.userDataPath, 'data-management-quarantine')),
      },
      {
        key: 'restore-preflight-backups',
        bytes: await this.pathSize(join(this.userDataPath, 'restore-preflight-backups')),
      },
      { key: 'temporary-backups', bytes: await this.temporaryBackupSize() },
      { key: 'secrets-excluded', bytes: await this.pathSize(join(this.userDataPath, 'secrets')) },
      {
        key: 'electron-cache',
        bytes:
          (await this.pathSize(join(this.userDataPath, 'Cache'))) +
          (await this.pathSize(join(this.userDataPath, 'Code Cache'))) +
          (await this.pathSize(join(this.userDataPath, 'GPUCache'))),
      },
    ]
  }

  private async copyUserDataDirectory(packagePath: string, directoryName: string): Promise<void> {
    const source = join(this.userDataPath, directoryName)
    if (!(await this.pathExists(source))) return
    await cp(source, join(packagePath, DATA_DIRECTORY, directoryName), {
      dereference: false,
      errorOnExist: true,
      force: false,
      recursive: true,
    })
  }

  private async copyTemplateSources(packagePath: string): Promise<void> {
    const workspaces = this.database.client
      .prepare('SELECT id, root_path AS rootPath FROM workspaces')
      .all() as Array<{ id: string; rootPath: string }>
    const templates = this.database.client
      .prepare(
        'SELECT workspace_id AS workspaceId, relative_path AS relativePath FROM templates WHERE available = 1',
      )
      .all() as Array<{ relativePath: string; workspaceId: string }>
    for (const workspace of workspaces) {
      const root = await resolveAuthorizedRoot(workspace.rootPath).catch(() => null)
      if (!root) continue
      for (const template of templates.filter(item => item.workspaceId === workspace.id)) {
        const source = await resolveAuthorizedFile(root, template.relativePath).catch(() => null)
        if (!source) continue
        const target = join(
          packagePath,
          DATA_DIRECTORY,
          'template-sources',
          workspace.id,
          template.relativePath,
        )
        await mkdir(dirname(target), { recursive: true })
        await cp(source.absolutePath, target, { errorOnExist: true, force: false })
      }
    }
  }

  private async verifyBackupPath(
    packagePath: string,
    options: { requireExtension?: boolean } = {},
  ): Promise<BackupVerification> {
    const errors: string[] = []
    let manifest: BackupManifest | null = null
    const resolvedPackage = resolve(packagePath)
    try {
      const stats = await lstat(resolvedPackage)
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        errors.push('备份包不是普通目录。')
      }
      if (options.requireExtension !== false && !resolvedPackage.endsWith(BACKUP_EXTENSION)) {
        errors.push('备份包扩展名不受支持。')
      }
      if (!(await this.pathExists(join(resolvedPackage, COMPLETED_PATH)))) {
        errors.push('备份包缺少完成标记。')
      }
      const manifestStats = await stat(join(resolvedPackage, MANIFEST_PATH))
      if (manifestStats.size > MAX_MANIFEST_BYTES) {
        errors.push('manifest 过大。')
      } else {
        manifest = backupManifestSchema.parse(
          JSON.parse(await readFile(join(resolvedPackage, MANIFEST_PATH), 'utf8')),
        )
      }
      if (manifest) {
        const checksumText = await readFile(join(resolvedPackage, CHECKSUMS_PATH), 'utf8')
        const expectedChecksums = await this.formatChecksums(resolvedPackage, manifest.files)
        if (checksumText !== expectedChecksums) {
          errors.push('checksums.sha256 与 manifest 不一致。')
        }
        for (const file of manifest.files) {
          const absolutePath = resolve(resolvedPackage, file.path)
          if (!isPathInsideRoot(resolvedPackage, absolutePath)) {
            errors.push('manifest 包含越界路径。')
            continue
          }
          const fileStats = await stat(absolutePath).catch(() => null)
          if (!fileStats?.isFile()) {
            errors.push(`缺少文件：${file.path}`)
            continue
          }
          if (fileStats.size !== file.bytes) {
            errors.push(`文件大小不匹配：${file.path}`)
          }
          const sha256 = await this.sha256File(absolutePath)
          if (sha256 !== file.sha256) {
            errors.push(`文件哈希不匹配：${file.path}`)
          }
        }
        const snapshot = new BetterSqlite3(join(resolvedPackage, SQLITE_SNAPSHOT_PATH), {
          readonly: true,
        })
        try {
          const sqliteCheck = this.checkDatabase(snapshot)
          if (sqliteCheck.quickCheck !== 'ok') errors.push('SQLite quick_check 未通过。')
          if (!sqliteCheck.foreignKeyOk) errors.push('SQLite 外键校验未通过。')
          const secretRefs = snapshot
            .prepare('SELECT count(*) FROM ai_provider_profiles WHERE secret_ref IS NOT NULL')
            .pluck()
            .get() as number
          if (secretRefs > 0) errors.push('备份快照包含 Provider 密钥引用。')
          const restoreMarkers = snapshot
            .prepare('SELECT count(*) FROM app_state WHERE key LIKE ?')
            .pluck()
            .get(`${RESTORE_COMMIT_MARKER_PREFIX}%`) as number
          if (restoreMarkers > 0) errors.push('备份快照包含恢复事务临时标记。')
        } finally {
          snapshot.close()
        }
      }
    } catch (error) {
      if (error instanceof SyntaxError) errors.push('manifest JSON 无法解析。')
      else errors.push('备份包结构无效。')
    }
    return {
      checkedAt: new Date().toISOString(),
      errors: [...new Set(errors)].slice(0, 100),
      manifest,
      ok: errors.length === 0 && Boolean(manifest),
      packagePath: resolvedPackage,
    }
  }

  private async collectPackageFileEntries(packagePath: string): Promise<BackupFileEntry[]> {
    const paths = [
      ...(await this.listRelativeFiles(join(packagePath, DATA_DIRECTORY))).map(
        path => `${DATA_DIRECTORY}/${path}`,
      ),
      COMPLETED_PATH,
    ].sort()
    return Promise.all(
      paths.map(async path => {
        const absolutePath = join(packagePath, ...path.split('/'))
        const stats = await stat(absolutePath)
        return { bytes: stats.size, path, sha256: await this.sha256File(absolutePath) }
      }),
    )
  }

  private async formatChecksums(packagePath: string, files: BackupFileEntry[]): Promise<string> {
    const manifestHash = await this.sha256File(join(packagePath, MANIFEST_PATH))
    return [
      `${manifestHash}  ${MANIFEST_PATH}\n`,
      ...files.map(file => `${file.sha256}  ${file.path}\n`),
    ].join('')
  }

  private async listRelativeFiles(root: string): Promise<string[]> {
    const files: string[] = []
    const walk = async (directory: string) => {
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        const absolute = join(directory, entry.name)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) await walk(absolute)
        if (entry.isFile()) files.push(relative(root, absolute).split(sep).join('/'))
      }
    }
    await walk(root)
    return files.sort()
  }

  private async listDirectoryNames(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    return entries
      .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
      .map(entry => entry.name)
  }

  private async countFiles(root: string): Promise<number> {
    return (await this.listRelativeFiles(root)).length
  }

  private async countDirectories(root: string): Promise<number> {
    return (await this.listDirectoryNames(root)).length
  }

  private async temporaryBackupSize(): Promise<number> {
    const entries = await readdir(this.userDataPath, { withFileTypes: true }).catch(() => [])
    let total = 0
    for (const entry of entries) {
      if (entry.name.endsWith('.tmp') || entry.name.includes('.awb-backup.')) {
        total += await this.pathSize(join(this.userDataPath, entry.name))
      }
    }
    return total
  }

  private async pathSize(path: string): Promise<number> {
    const stats = await lstat(path).catch(() => null)
    if (!stats || stats.isSymbolicLink()) return 0
    if (stats.isFile()) return stats.size
    if (!stats.isDirectory()) return 0
    const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
    let total = 0
    for (const entry of entries) total += await this.pathSize(join(path, entry.name))
    return total
  }

  private async sha256File(path: string): Promise<string> {
    return createHash('sha256')
      .update(await readFile(path))
      .digest('hex')
  }

  private async pathExists(path: string): Promise<boolean> {
    return stat(path)
      .then(() => true)
      .catch(() => false)
  }

  private fileExists(path: string): boolean {
    try {
      return statSync(path).isFile()
    } catch {
      return false
    }
  }

  private fileExistsOrDirectory(path: string): boolean {
    try {
      const stats = statSync(path)
      return stats.isFile() || stats.isDirectory()
    } catch {
      return false
    }
  }
}
