import { createHash, randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

import BetterSqlite3 from 'better-sqlite3'
import { dialog, shell, type BrowserWindow } from 'electron'

import {
  backupManifestSchema,
  type BackupExportResult,
  type BackupFileEntry,
  type BackupManifest,
  type BackupManifestV2,
  type BackupVerification,
  type BackupLifecycleInventory,
  type BackupLifecycleRequest,
  type BackupSelectionRequest,
  type PortableBackupWorkspace,
  type DataDiagnostics,
  type DataIntegrityIssue,
  type DataManagementCounts,
  type DataStorageArea,
  type ExportBackupRequest,
  type RestoreBackupRequest,
  type RestoreBackupResult,
  type RestorePreview,
  type InterruptedRecoveryPreview,
  type InterruptedRecoveryPreviewRequest,
  type RecoverInterruptedOperationRequest,
  type RecoverInterruptedOperationResult,
  type RestoreOperationJournal,
} from '@core/contracts/data-management'
import type { BackgroundTaskProgress } from '@core/contracts/background-task'
import {
  fileChangeOperationSchema,
  parseStoredFileChangePlanPayload,
} from '@core/contracts/template-management'

import packageJson from '../../../package.json'
import type { AppDatabase } from '../database/database'
import { TemplateManagementRepository } from '../database/template-management-repository'
import { WorkspaceRepository, type WorkspaceRecord } from '../database/workspace-repository'
import { PublicError } from '../errors/public-error'
import {
  isPathInsideRoot,
  resolveAuthorizedFile,
  resolveAuthorizedRoot,
} from '../security/path-guard'
import { DataLifecycleService, RESTORE_COMMIT_MARKER_PREFIX } from './data-lifecycle-service'
import { FileExecutionIntegrityService } from './file-execution-integrity-service'
import { createTemplateId } from './template-scanner'
import {
  assertPortableArchivePath,
  createPortableBackupArchive,
  extractPortableBackupArchive,
  PortableBackupArchiveError,
  portableArchiveCollisionKey,
  type PortableArchiveSource,
} from './portable-backup-archive'
import type { WorkspaceStorageManager } from './workspace-storage'

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

type RestorableUserDataDirectory = (typeof RESTORABLE_USER_DATA_DIRECTORIES)[number]

interface DirectorySwap {
  directoryName: RestorableUserDataDirectory
  originalPath: string
  restoredPath: string
  targetPath: string
}

interface MaterializedBackupPackage {
  cleanupRoot: string | null
  container: 'zip-v2'
  originalPath: string
  packageRoot: string
}

interface TemplateSourceSwap {
  currentRelativePaths: string[]
  fileCount: number
  newRoot: string
  oldRoot: string
  originalFiles: Array<{ relativePath: string; sha256: string }>
  restoredFiles: Array<{ relativePath: string; sha256: string }>
  targetRoot: string
  writtenRelativePaths: string[]
}

interface WorkspaceRestoreScope {
  currentExecutionIds: string[]
  currentProblemIds: string[]
  sourceExecutionIds: string[]
  sourceImageIds: string[]
  sourcePlanIds: string[]
  sourceProblemIds: string[]
  sourceTemplateFileCount: number
  sourceTemplateIds: string[]
  sourceWorkspaceId: string
  sourceWorkspaceName: string
  targetWorkspaceId: string
}

interface BackupWriteOptions {
  includeTemplateSources: true
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
  private readonly fileExecutionIntegrityService: FileExecutionIntegrityService
  private readonly lifecycleService: DataLifecycleService

  constructor(
    private readonly database: AppDatabase,
    private readonly userDataPath: string,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly workspaceStorage?: WorkspaceStorageManager,
  ) {
    this.fileExecutionIntegrityService = new FileExecutionIntegrityService(
      new TemplateManagementRepository(database),
      userDataPath,
      workspaceStorage,
    )
    this.lifecycleService = new DataLifecycleService(
      database,
      userDataPath,
      packagePath => this.verifyBackupPath(packagePath),
      path => shell.trashItem(path),
      workspaceStorage,
    )
  }

  getLifecycleService(): DataLifecycleService {
    return this.lifecycleService
  }

  getFileExecutionIntegrityService(): FileExecutionIntegrityService {
    return this.fileExecutionIntegrityService
  }

  async diagnose(): Promise<DataDiagnostics> {
    return this.diagnoseWorkspace(this.requireActiveWorkspace().id)
  }

  private async diagnoseWorkspace(workspaceId: string): Promise<DataDiagnostics> {
    const counts = await this.collectCounts(workspaceId)
    const database = this.checkDatabase(this.database.client)
    const issues: DataIntegrityIssue[] = []
    if (database.quickCheck !== 'ok') {
      issues.push({ count: 1, kind: 'database-quick-check', severity: 'error' })
    }
    if (!database.foreignKeyOk) {
      issues.push({ count: 1, kind: 'database-foreign-key', severity: 'error' })
    }
    const imageDiagnostics = await this.inspectProblemImages(workspaceId)
    issues.push(...imageDiagnostics)
    issues.push(...(await this.inspectBackupDirectories(workspaceId)))

    return {
      checkedAt: new Date().toISOString(),
      counts,
      database,
      issues,
      storage: await this.collectStorage(workspaceId),
    }
  }

  async exportBackup(
    request: ExportBackupRequest,
    parentWindow?: BrowserWindow,
    onProgress?: (progress: BackgroundTaskProgress) => void,
  ): Promise<BackupExportResult | null> {
    const workspace = this.requireActiveWorkspace()
    const result = parentWindow
      ? await dialog.showSaveDialog(parentWindow, this.exportDialogOptions())
      : await dialog.showSaveDialog(this.exportDialogOptions())
    if (result.canceled || !result.filePath) {
      return null
    }

    const finalPath = await this.normalizeBackupTarget(result.filePath)
    const finalParent = dirname(finalPath)
    const operationId = randomUUID()
    const stagingPath = join(finalParent, `.${basename(finalPath)}.${operationId}.staging.tmp`)
    const archivePath = join(finalParent, `.${basename(finalPath)}.${operationId}.archive.tmp`)
    try {
      onProgress?.({
        currentItem: '当前工作区数据',
        phase: 'backing-up',
        processedCount: 0,
        totalCount: null,
      })
      await this.assertPathDoesNotExist(finalPath)
      await mkdir(stagingPath, { recursive: false })
      const manifest = await this.writeBackupPackage(stagingPath, request, workspace)
      onProgress?.({
        currentItem: '可移植备份包',
        phase: 'writing',
        processedCount: manifest.files.length,
        totalCount: manifest.files.length,
      })
      await createPortableBackupArchive(
        archivePath,
        await this.collectPortableArchiveSources(stagingPath),
      )
      onProgress?.({
        currentItem: '临时备份包',
        phase: 'verifying',
        processedCount: 0,
        totalCount: manifest.files.length,
      })
      const verification = await this.verifyBackupPath(archivePath, { requireExtension: false })
      if (!verification.ok) {
        throw new PublicError('UNKNOWN', '备份包验证失败，导出已取消。')
      }
      if (this.requireActiveWorkspace().id !== workspace.id) {
        throw new PublicError('INVALID_REQUEST', '导出期间当前工作区已变化，请重新导出。')
      }
      await rename(archivePath, finalPath)
      await rm(stagingPath, { force: true, recursive: true })
      onProgress?.({
        currentItem: '已发布备份包',
        phase: 'verifying',
        processedCount: manifest.files.length,
        totalCount: manifest.files.length,
      })
      const publishedVerification = await this.verifyBackupPath(finalPath)
      if (!publishedVerification.ok) {
        throw new PublicError('UNKNOWN', '备份发布后验证失败，请重新导出。')
      }
      return { manifest, packagePath: finalPath, verification: publishedVerification }
    } catch (error) {
      await rm(stagingPath, { force: true, recursive: true }).catch(() => undefined)
      await rm(archivePath, { force: true }).catch(() => undefined)
      if (error instanceof PublicError) throw error
      if (error instanceof PortableBackupArchiveError) {
        throw new PublicError('INVALID_REQUEST', error.message)
      }
      throw new PublicError('UNKNOWN', '导出备份失败，临时文件已清理。')
    }
  }

  async verifyBackup(
    request: BackupSelectionRequest,
    parentWindow?: BrowserWindow,
  ): Promise<BackupVerification | null> {
    const selectedPath = await this.chooseBackupPackage(request, parentWindow)
    if (!selectedPath) return null
    return this.verifyBackupPath(selectedPath)
  }

  async previewRestore(
    request: BackupSelectionRequest,
    parentWindow?: BrowserWindow,
    onProgress?: (progress: BackgroundTaskProgress) => void,
  ): Promise<RestorePreview | null> {
    const workspace = this.requireActiveWorkspace()
    const selectedPath = await this.chooseBackupPackage(request, parentWindow)
    if (!selectedPath) return null
    onProgress?.({
      currentItem: '所选备份包',
      phase: 'verifying',
      processedCount: 0,
      totalCount: null,
    })
    const verification = await this.verifyBackupPath(selectedPath)
    const conflicts: string[] = []
    let sourceWorkspace: PortableBackupWorkspace | null = null
    if (!verification.ok) {
      conflicts.push('备份包校验未通过，禁止恢复。')
    } else {
      try {
        const scope = await this.inspectRestoreScopePath(
          selectedPath,
          workspace.id,
          verification.manifest,
        )
        sourceWorkspace = {
          id: scope.sourceWorkspaceId,
          name: scope.sourceWorkspaceName,
          templateFileCount: scope.sourceTemplateFileCount,
        }
        if (
          verification.manifest &&
          verification.manifest.workspaces[0]?.templateFileCount !== scope.sourceTemplateFileCount
        ) {
          conflicts.push('该备份不是包含完整模板源码的通用深拷贝备份，禁止恢复。')
        }
      } catch (error) {
        conflicts.push(
          error instanceof PublicError
            ? error.message
            : '备份不是单一工作区备份，不能恢复到当前工作区。',
        )
      }
    }
    const targetCounts = await this.collectCounts(workspace.id)
    onProgress?.({
      currentItem: null,
      phase: 'finalizing',
      processedCount: verification.manifest?.files.length ?? 0,
      totalCount: verification.manifest?.files.length ?? null,
    })
    return {
      canRestore: conflicts.length === 0 && verification.ok,
      conflicts,
      manifest: verification.manifest,
      sourceWorkspace,
      targetCounts,
      targetWorkspace: {
        id: workspace.id,
        name: workspace.name,
        templateFileCount: targetCounts.templates,
      },
      verification,
    }
  }

  async restoreBackup(
    request: RestoreBackupRequest,
    onProgress?: (progress: BackgroundTaskProgress) => void,
  ): Promise<RestoreBackupResult> {
    const targetWorkspace = this.requireActiveWorkspace()
    onProgress?.({
      currentItem: '备份包',
      phase: 'validating',
      processedCount: 0,
      totalCount: null,
    })
    const backupPath = resolve(request.packagePath)
    let materialized = await this.materializeBackupPackage(backupPath).catch(error => {
      if (error instanceof PublicError) throw error
      if (error instanceof PortableBackupArchiveError) {
        throw new PublicError('INVALID_REQUEST', error.message)
      }
      throw new PublicError('INVALID_REQUEST', '备份包结构无效，禁止恢复。')
    })
    const verification = await this.verifyMaterializedBackup(materialized)
    if (!verification.ok || !verification.manifest) {
      await this.cleanupMaterializedBackup(materialized)
      throw new PublicError('INVALID_REQUEST', '备份包校验未通过，禁止恢复。')
    }
    let restoreScope: WorkspaceRestoreScope
    try {
      restoreScope = this.inspectWorkspaceRestoreScope(
        join(materialized.packageRoot, SQLITE_SNAPSHOT_PATH),
        targetWorkspace.id,
      )
      this.assertManifestMatchesRestoreScope(verification.manifest, restoreScope)
    } catch (error) {
      await this.cleanupMaterializedBackup(materialized)
      throw error
    }
    if (
      request.expectedSourceWorkspaceId !== restoreScope.sourceWorkspaceId ||
      request.expectedTargetWorkspaceId !== targetWorkspace.id
    ) {
      await this.cleanupMaterializedBackup(materialized)
      throw new PublicError('INVALID_REQUEST', '备份来源或当前目标工作区已变化，请重新预览。')
    }
    if (this.requireActiveWorkspace().id !== targetWorkspace.id) {
      await this.cleanupMaterializedBackup(materialized)
      throw new PublicError('INVALID_REQUEST', '当前工作区已变化，请重新预览备份。')
    }
    materialized = await this.ensureMutableRestorePackage(materialized)

    onProgress?.({
      currentItem: '当前工作区操作前备份',
      phase: 'backing-up',
      processedCount: 0,
      totalCount: verification.manifest.files.length,
    })
    const preflightBackupPath = await this.createPreflightBackup().catch(async error => {
      await this.cleanupMaterializedBackup(materialized)
      throw error
    })
    const restoreId = randomUUID()
    const stagingRoot = join(this.getManagedDataRoot(), `.restore-${restoreId}.tmp`)
    const swaps: DirectorySwap[] = []
    let databaseCommitted = false
    let preserveInterruptedState = false
    let templateSourceSwap: TemplateSourceSwap | null = null
    try {
      await mkdir(stagingRoot, { recursive: false })
      onProgress?.({
        currentItem: '模板源码',
        phase: 'restoring',
        processedCount: 0,
        totalCount: verification.manifest.files.length,
      })
      templateSourceSwap = await this.stagePortableTemplateSources(
        materialized.packageRoot,
        stagingRoot,
        verification.manifest,
        targetWorkspace,
      )
      restoreScope = await this.remapRestorePackageToTarget(
        materialized.packageRoot,
        targetWorkspace,
        restoreScope,
      )
      await this.prepareRestoredDirectories(materialized.packageRoot, stagingRoot, restoreScope)
      const journal = await this.createRestoreJournal(
        stagingRoot,
        restoreId,
        basename(preflightBackupPath),
        templateSourceSwap,
      )
      await this.lifecycleService.writeRestoreJournal(stagingRoot, journal)
      if (templateSourceSwap) await this.applyTemplateSourceSwap(templateSourceSwap)
      await this.applyRestoredDirectories(stagingRoot, swaps)
      if (process.env.E2E_RESTORE_FAIL_STAGE === 'after-file-swap') {
        throw new PublicError('UNKNOWN', '模拟恢复失败，已回滚到操作前状态。')
      }
      if (process.env.E2E_RESTORE_INTERRUPT_STAGE === 'after-file-swap') {
        preserveInterruptedState = true
        throw new PublicError('UNKNOWN', '模拟恢复异常中断，已保留可验证恢复现场。')
      }
      await this.restoreDatabaseFromSnapshot(
        join(materialized.packageRoot, SQLITE_SNAPSHOT_PATH),
        {
          committedAt: new Date().toISOString(),
          formatVersion: 'v2',
          restoreId,
          rollbackBackupName: basename(preflightBackupPath),
        },
        targetWorkspace,
        restoreScope,
      )
      databaseCommitted = true
      this.workspaceRepository.syncWorkspaceSummaryFromDatabase(targetWorkspace.id)
      onProgress?.({
        currentItem: '当前工作区数据库',
        phase: 'finalizing',
        processedCount: verification.manifest.files.length,
        totalCount: verification.manifest.files.length,
      })
      if (process.env.E2E_RESTORE_INTERRUPT_STAGE === 'after-database-commit') {
        preserveInterruptedState = true
        throw new PublicError('UNKNOWN', '模拟恢复已提交但收尾中断，已保留恢复日志。')
      }
      await rm(stagingRoot, { force: true, recursive: true })
      this.lifecycleService.clearCommittedRestoreMarker(restoreId)
      await this.cleanupMaterializedBackup(materialized)
      const diagnostics = await this.diagnose()
      return {
        preflightBackupPath,
        providerSecretsNeedReentry: false,
        restoredCounts: diagnostics.counts,
        restoredTemplateSourceFiles: templateSourceSwap?.fileCount ?? 0,
      }
    } catch (error) {
      databaseCommitted ||= this.lifecycleService.hasCommittedRestoreMarker(restoreId)
      if (databaseCommitted || preserveInterruptedState) {
        await this.cleanupMaterializedBackup(materialized)
        if (error instanceof PublicError) throw error
        throw new PublicError(
          'UNKNOWN',
          databaseCommitted
            ? '恢复已提交，但收尾未完成，请在数据管理页处理异常操作。'
            : '恢复异常中断，已保留可验证恢复日志。',
        )
      }
      const rollbackOk = await this.rollbackRestoredDirectories(swaps)
      const templateRollbackOk = templateSourceSwap
        ? await this.rollbackTemplateSourceSwap(templateSourceSwap)
        : true
      if (!rollbackOk || !templateRollbackOk) {
        await this.cleanupMaterializedBackup(materialized)
        throw new PublicError('UNKNOWN', '恢复失败且自动回滚未完成，请在数据管理页处理异常操作。')
      }
      await rm(stagingRoot, { force: true, recursive: true }).catch(() => undefined)
      await this.cleanupMaterializedBackup(materialized)
      if (error instanceof PublicError) throw error
      throw new PublicError('UNKNOWN', '恢复失败，当前数据已回滚到操作前状态。')
    }
  }

  inspectBackupLifecycle(request: BackupLifecycleRequest): Promise<BackupLifecycleInventory> {
    return this.lifecycleService.inspect(request)
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

  private exportDialogOptions(): Electron.SaveDialogOptions {
    return {
      buttonLabel: '导出备份',
      defaultPath: `algorithm-workbench-${new Date().toISOString().slice(0, 10)}${BACKUP_EXTENSION}`,
      filters: [{ extensions: ['awb-backup'], name: 'Algorithm Workbench Backup' }],
      title: '导出 V2 数据备份',
    }
  }

  private async chooseBackupPackage(
    _request: BackupSelectionRequest,
    parentWindow?: BrowserWindow,
  ): Promise<string | null> {
    const options: Electron.OpenDialogOptions = {
      buttonLabel: '选择备份',
      filters: [{ extensions: ['awb-backup'], name: 'Algorithm Workbench Backup' }],
      properties: ['openFile'],
      title: '选择当前版本单文件备份',
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
    request: BackupWriteOptions,
    workspace: WorkspaceRecord,
  ): Promise<BackupManifestV2> {
    await mkdir(join(packagePath, DATA_DIRECTORY), { recursive: true })
    await this.writeSqliteSnapshot(join(packagePath, SQLITE_SNAPSHOT_PATH), workspace.id)
    await this.copyWorkspaceProblemImages(packagePath, workspace.id)
    await this.copyWorkspaceFilePlanBackups(packagePath, workspace.id)
    const activeStorage = this.workspaceStorage?.current
    if (activeStorage?.marker.workspaceId === workspace.id) {
      const markerTarget = join(packagePath, DATA_DIRECTORY, 'workspace', 'workspace.awb.json')
      await mkdir(dirname(markerTarget), { recursive: true })
      await cp(activeStorage.markerPath, markerTarget, { errorOnExist: true, force: false })
    }
    const workspaces = await this.describePortableWorkspaces(workspace.id)
    await this.copyTemplateSources(packagePath, workspaces)
    await writeFile(join(packagePath, COMPLETED_PATH), `${new Date().toISOString()}\n`, {
      flag: 'wx',
    })

    const diagnostics = await this.diagnoseWorkspace(workspace.id)
    const snapshot = new BetterSqlite3(join(packagePath, SQLITE_SNAPSHOT_PATH), { readonly: true })
    const sqliteCheck = this.checkDatabase(snapshot)
    snapshot.close()
    const manifestCommon = {
      appVersion: packageJson.version,
      completed: true,
      counts: diagnostics.counts,
      createdAt: new Date().toISOString(),
      diagnostics,
      files: await this.collectPackageFileEntries(packagePath),
      includeTemplateSources: request.includeTemplateSources,
      packageId: randomUUID(),
      privacy: {
        excluded: [
          'api-keys',
          'ai-provider-configurations',
          'electron-cache',
          'local-storage',
          'other-workspaces',
          'session-storage',
        ],
        providerSecrets: 'omitted',
      },
      sqlite: {
        foreignKeyOk: sqliteCheck.foreignKeyOk,
        quickCheck: sqliteCheck.quickCheck,
        sanitizedProviderSecrets: true,
      },
    }
    const manifest = backupManifestSchema.parse({
      ...manifestCommon,
      archive: {
        container: 'zip',
        entryNameEncoding: 'utf-8',
        pathNormalization: 'NFC',
        separator: '/',
      },
      createdOn: this.supportedPlatform(),
      formatVersion: 'v2',
      portability: {
        caseInsensitivePathSafe: true,
        sourceBytesPreserved: true,
        windowsPathSafe: true,
      },
      workspaces,
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
    const workspace = this.requireActiveWorkspace()
    const backupRoot = join(this.getManagedDataRoot(), 'restore-preflight-backups')
    await mkdir(backupRoot, { recursive: true })
    const finalPath = join(
      backupRoot,
      `preflight-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}${BACKUP_EXTENSION}`,
    )
    const operationId = randomUUID()
    const stagingPath = await mkdtemp(join(tmpdir(), 'awb-preflight-')).catch(() => {
      throw new PublicError('UNKNOWN', '恢复前自动备份失败，恢复已取消。')
    })
    const archivePath = join(backupRoot, `.${operationId}.archive.tmp`)
    try {
      await this.writeBackupPackage(stagingPath, { includeTemplateSources: true }, workspace)
      await createPortableBackupArchive(
        archivePath,
        await this.collectPortableArchiveSources(stagingPath),
      )
      const verification = await this.verifyBackupPath(archivePath, { requireExtension: false })
      if (!verification.ok) {
        throw new PublicError('UNKNOWN', '恢复前自动备份验证失败，恢复已取消。')
      }
      await rename(archivePath, finalPath)
      await rm(stagingPath, { force: true, recursive: true })
      const publishedVerification = await this.verifyBackupPath(finalPath)
      if (!publishedVerification.ok) {
        throw new PublicError('UNKNOWN', '恢复前自动备份发布后验证失败，恢复已取消。')
      }
      return finalPath
    } catch (error) {
      await rm(stagingPath, { force: true, recursive: true }).catch(() => undefined)
      await rm(archivePath, { force: true }).catch(() => undefined)
      if (error instanceof PublicError) throw error
      throw new PublicError('UNKNOWN', '恢复前自动备份失败，恢复已取消。')
    }
  }

  private async prepareRestoredDirectories(
    backupPath: string,
    stagingRoot: string,
    scope: WorkspaceRestoreScope,
  ): Promise<void> {
    const restoredRoot = join(stagingRoot, 'restored')
    await mkdir(restoredRoot, { recursive: true })
    for (const directoryName of RESTORABLE_USER_DATA_DIRECTORIES) {
      const current = this.getRestorableDirectoryPath(directoryName)
      const restored = join(restoredRoot, directoryName)
      if (await this.pathExists(current)) {
        await cp(current, restored, {
          dereference: false,
          errorOnExist: true,
          force: false,
          recursive: true,
        })
      }
      const currentIds =
        directoryName === 'problem-images'
          ? scope.currentProblemIds
          : directoryName === 'file-plan-backups'
            ? scope.currentExecutionIds
            : []
      for (const id of currentIds) {
        await rm(join(restored, id), { force: true, recursive: true })
      }

      const source = join(backupPath, DATA_DIRECTORY, directoryName)
      if (!(await this.pathExists(source))) continue
      if (directoryName === 'batch-import-backups') {
        throw new PublicError(
          'INVALID_REQUEST',
          '备份包含无法归属到当前工作区的批量临时备份，禁止恢复。',
        )
      }
      const allowedIds = new Set(
        directoryName === 'problem-images' ? scope.sourceProblemIds : scope.sourceExecutionIds,
      )
      const entries = await readdir(source, { withFileTypes: true })
      for (const entry of entries) {
        if (!allowedIds.has(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) {
          throw new PublicError(
            'INVALID_REQUEST',
            '备份文件目录包含不属于源工作区的内容，禁止恢复。',
          )
        }
        await mkdir(restored, { recursive: true })
        const target = join(restored, entry.name)
        if (await this.pathExists(target)) {
          throw new PublicError(
            'INVALID_REQUEST',
            '备份文件与其他工作区发生冲突，未修改当前工作区。',
          )
        }
        await cp(join(source, entry.name), target, {
          dereference: false,
          errorOnExist: true,
          force: false,
          recursive: true,
        })
      }
    }
  }

  private async createRestoreJournal(
    stagingRoot: string,
    restoreId: string,
    rollbackBackupName: string,
    templateSourceSwap: TemplateSourceSwap | null,
  ): Promise<RestoreOperationJournal> {
    const swaps: RestoreOperationJournal['swaps'] = []
    for (const directoryName of RESTORABLE_USER_DATA_DIRECTORIES) {
      const originalPath = this.getRestorableDirectoryPath(directoryName)
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
      formatVersion: 'v2',
      restoreId,
      rollbackBackupName,
      swaps,
      templateSwap: templateSourceSwap
        ? {
            originalFiles: templateSourceSwap.originalFiles,
            restoredFiles: templateSourceSwap.restoredFiles,
          }
        : null,
    }
  }

  private async applyRestoredDirectories(
    stagingRoot: string,
    swaps: DirectorySwap[],
  ): Promise<void> {
    const originalRoot = join(stagingRoot, 'original')
    await mkdir(originalRoot, { recursive: true })
    for (const directoryName of RESTORABLE_USER_DATA_DIRECTORIES) {
      const targetPath = this.getRestorableDirectoryPath(directoryName)
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

  private async stagePortableTemplateSources(
    packageRoot: string,
    stagingRoot: string,
    manifest: BackupManifestV2,
    targetWorkspace: WorkspaceRecord,
  ): Promise<TemplateSourceSwap> {
    if (manifest.workspaces.length !== 1) {
      throw new PublicError('INVALID_REQUEST', '通用备份必须只包含一个工作区。')
    }
    const sourceWorkspace = manifest.workspaces[0]!
    const files: Array<{ entry: BackupFileEntry; relativePath: string }> = []
    for (const entry of manifest.files) {
      const match = /^data\/template-sources\/([^/]+)\/(.+)$/u.exec(entry.path)
      if (!match) continue
      if (match[1] !== sourceWorkspace.id) {
        throw new PublicError('INVALID_REQUEST', '模板源码清单引用了未知工作区。')
      }
      const relativePath = assertPortableArchivePath(match[2]!)
      files.push({ entry, relativePath })
    }
    if (files.length !== sourceWorkspace.templateFileCount) {
      throw new PublicError('INVALID_REQUEST', '模板源码数量与工作区清单不一致。')
    }

    const targetRoot = await resolveAuthorizedRoot(targetWorkspace.rootPath)
    const currentRelativePaths = this.database.client
      .prepare(
        'SELECT relative_path FROM templates WHERE workspace_id = ? AND available = 1 ORDER BY relative_path',
      )
      .pluck()
      .all(targetWorkspace.id) as string[]
    const currentPathKeys = new Set(
      currentRelativePaths.map(path => path.normalize('NFC').toLocaleLowerCase('en-US')),
    )
    const originalFiles: TemplateSourceSwap['originalFiles'] = []
    for (const relativePath of currentRelativePaths) {
      const source = await resolveAuthorizedFile(targetRoot, relativePath).catch(() => null)
      if (!source) {
        throw new PublicError('FILE_UNAVAILABLE', `当前模板文件无法读取：${relativePath}`)
      }
      originalFiles.push({
        relativePath,
        sha256: await this.sha256File(source.absolutePath),
      })
    }
    const newRoot = join(stagingRoot, 'template-sources-new')
    const oldRoot = join(stagingRoot, 'template-sources-old')
    await mkdir(newRoot, { recursive: false })
    await mkdir(oldRoot, { recursive: false })
    try {
      for (const file of files) {
        const targetPath = join(targetRoot, ...file.relativePath.split('/'))
        if (!isPathInsideRoot(targetRoot, targetPath) || targetPath === targetRoot) {
          throw new PublicError('PATH_NOT_AUTHORIZED', '模板恢复路径越出当前工作区。')
        }
        const existing = await lstat(targetPath).catch(error => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
          throw error
        })
        const key = file.relativePath.normalize('NFC').toLocaleLowerCase('en-US')
        if (
          existing &&
          (!existing.isFile() || existing.isSymbolicLink() || !currentPathKeys.has(key))
        ) {
          throw new PublicError(
            'FILE_ALREADY_EXISTS',
            `当前工作区存在未受管路径冲突：${file.relativePath}`,
          )
        }
        const source = join(packageRoot, ...file.entry.path.split('/'))
        const staged = join(newRoot, ...file.relativePath.split('/'))
        await mkdir(dirname(staged), { recursive: true })
        await cp(source, staged, { errorOnExist: true, force: false })
        if ((await this.sha256File(staged)) !== file.entry.sha256) {
          throw new PublicError('UNKNOWN', '模板源码暂存后哈希校验失败。')
        }
      }
      return {
        currentRelativePaths,
        fileCount: files.length,
        newRoot,
        oldRoot,
        originalFiles,
        restoredFiles: files.map(file => ({
          relativePath: file.relativePath,
          sha256: file.entry.sha256,
        })),
        targetRoot,
        writtenRelativePaths: [],
      }
    } catch (error) {
      await rm(newRoot, { force: true, recursive: true }).catch(() => undefined)
      await rm(oldRoot, { force: true, recursive: true }).catch(() => undefined)
      throw error
    }
  }

  private async applyTemplateSourceSwap(swap: TemplateSourceSwap): Promise<void> {
    for (const relativePath of swap.currentRelativePaths) {
      const current = join(swap.targetRoot, ...relativePath.split('/'))
      const currentStats = await lstat(current).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      })
      if (!currentStats) continue
      if (!currentStats.isFile() || currentStats.isSymbolicLink()) {
        throw new PublicError('FILE_UNAVAILABLE', `当前模板路径状态无效：${relativePath}`)
      }
      const saved = join(swap.oldRoot, ...relativePath.split('/'))
      await mkdir(dirname(saved), { recursive: true })
      await rename(current, saved)
    }
    const copyNewFiles = async (directory: string, prefix = ''): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
        const source = join(directory, entry.name)
        if (entry.isDirectory()) {
          await copyNewFiles(source, relativePath)
          continue
        }
        if (!entry.isFile() || entry.isSymbolicLink()) {
          throw new PublicError('INVALID_REQUEST', '模板暂存目录包含无效条目。')
        }
        const target = join(swap.targetRoot, ...relativePath.split('/'))
        await mkdir(dirname(target), { recursive: true })
        await rename(source, target)
        swap.writtenRelativePaths.push(relativePath)
      }
    }
    await copyNewFiles(swap.newRoot)
  }

  private async rollbackTemplateSourceSwap(swap: TemplateSourceSwap): Promise<boolean> {
    try {
      for (const relativePath of [...swap.writtenRelativePaths].reverse()) {
        await rm(join(swap.targetRoot, ...relativePath.split('/')), { force: true })
      }
      const restoreOldFiles = async (directory: string, prefix = ''): Promise<void> => {
        const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
          const source = join(directory, entry.name)
          if (entry.isDirectory()) {
            await restoreOldFiles(source, relativePath)
            continue
          }
          const target = join(swap.targetRoot, ...relativePath.split('/'))
          await mkdir(dirname(target), { recursive: true })
          await rename(source, target)
        }
      }
      await restoreOldFiles(swap.oldRoot)
      return true
    } catch {
      return false
    }
  }

  private async restoreDatabaseFromSnapshot(
    snapshotPath: string,
    marker: {
      committedAt: string
      formatVersion: 'v2'
      restoreId: string
      rollbackBackupName: string
    },
    targetWorkspace: WorkspaceRecord,
    scope: WorkspaceRestoreScope,
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
        this.database.client
          .prepare(
            `DELETE FROM file_change_executions
             WHERE plan_id IN (SELECT id FROM file_change_plans WHERE workspace_id = ?)`,
          )
          .run(scope.targetWorkspaceId)
        this.database.client
          .prepare('DELETE FROM file_change_plans WHERE workspace_id = ?')
          .run(scope.targetWorkspaceId)
        this.database.client
          .prepare(
            `DELETE FROM template_problem_relations
             WHERE problem_id IN (SELECT id FROM problems WHERE workspace_id = ?)
                OR template_id IN (SELECT id FROM templates WHERE workspace_id = ?)`,
          )
          .run(scope.targetWorkspaceId, scope.targetWorkspaceId)
        this.database.client
          .prepare(
            'DELETE FROM problem_images WHERE problem_id IN (SELECT id FROM problems WHERE workspace_id = ?)',
          )
          .run(scope.targetWorkspaceId)
        this.database.client
          .prepare('DELETE FROM problems WHERE workspace_id = ?')
          .run(scope.targetWorkspaceId)
        this.database.client
          .prepare(
            'DELETE FROM template_metadata WHERE template_id IN (SELECT id FROM templates WHERE workspace_id = ?)',
          )
          .run(scope.targetWorkspaceId)
        this.database.client
          .prepare('DELETE FROM templates WHERE workspace_id = ?')
          .run(scope.targetWorkspaceId)
        this.database.client
          .prepare('DELETE FROM workspaces WHERE id = ?')
          .run(scope.targetWorkspaceId)

        const workspaceColumns = this.getTableColumns(this.database.client, 'workspaces')
        const workspaceColumnList = workspaceColumns.map(column => `"${column}"`).join(', ')
        const restoredRoot =
          this.workspaceStorage?.current?.marker.templateDirectory ?? targetWorkspace.rootPath
        const workspaceSelectList = workspaceColumns
          .map(column => (column === 'root_path' ? '?' : `"${column}"`))
          .join(', ')
        const workspaceInsert = this.database.client
          .prepare(
            `INSERT INTO workspaces (${workspaceColumnList})
             SELECT ${workspaceSelectList}
             FROM restore_src.workspaces
             WHERE id = ?`,
          )
          .run(restoredRoot, scope.sourceWorkspaceId)
        if (workspaceInsert.changes !== 1) {
          throw new PublicError('INVALID_REQUEST', '备份缺少唯一的源工作区，禁止恢复。')
        }

        const workspaceTables = [
          'templates',
          'template_metadata',
          'problems',
          'problem_images',
          'template_problem_relations',
          'file_change_plans',
          'file_change_executions',
        ] as const
        for (const table of workspaceTables) {
          const columns = this.getTableColumns(this.database.client, table)
          const columnList = columns.map(column => `"${column}"`).join(', ')
          this.database.client
            .prepare(
              `INSERT INTO ${table} (${columnList}) SELECT ${columnList} FROM restore_src.${table}`,
            )
            .run()
        }
        this.database.client
          .prepare(
            'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          )
          .run('active_workspace_id', scope.sourceWorkspaceId)
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

  private async writeSqliteSnapshot(snapshotPath: string, workspaceId: string): Promise<void> {
    await mkdir(dirname(snapshotPath), { recursive: true })
    this.database.client.pragma('wal_checkpoint(PASSIVE)')
    await this.database.client.backup(snapshotPath)
    const snapshot = new BetterSqlite3(snapshotPath)
    try {
      snapshot.pragma('foreign_keys = ON')
      snapshot.prepare('DELETE FROM problems WHERE workspace_id <> ?').run(workspaceId)
      snapshot.prepare('DELETE FROM workspaces WHERE id <> ?').run(workspaceId)
      snapshot.prepare('DELETE FROM ai_provider_profiles').run()
      snapshot.prepare('DELETE FROM ai_task_routes').run()
      snapshot.prepare('DELETE FROM app_state WHERE key <> ?').run('active_workspace_id')
      snapshot
        .prepare(
          'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        )
        .run('active_workspace_id', workspaceId)
      snapshot
        .prepare('DELETE FROM app_state WHERE key LIKE ?')
        .run(`${RESTORE_COMMIT_MARKER_PREFIX}%`)
      // Purge deleted rows from free pages so another workspace or Provider configuration cannot
      // remain recoverable as raw strings inside the portable SQLite file.
      snapshot.exec('VACUUM')
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
      walPresent: this.fileExists(
        `${this.database.path ?? join(this.getManagedDataRoot(), DATABASE_FILE)}-wal`,
      ),
    }
  }

  private async collectCounts(workspaceId: string): Promise<DataManagementCounts> {
    const counts = { ...zeroCounts }
    counts.workspaces = 1
    counts.templates = this.database.client
      .prepare('SELECT count(*) FROM templates WHERE available = 1 AND workspace_id = ?')
      .pluck()
      .get(workspaceId) as number
    counts.templateMetadata = this.database.client
      .prepare(
        `SELECT count(*)
         FROM template_metadata m
         INNER JOIN templates t ON t.id = m.template_id
         WHERE t.workspace_id = ?`,
      )
      .pluck()
      .get(workspaceId) as number
    counts.problems = this.database.client
      .prepare('SELECT count(*) FROM problems WHERE workspace_id = ?')
      .pluck()
      .get(workspaceId) as number
    counts.problemImages = this.database.client
      .prepare(
        `SELECT count(*)
         FROM problem_images i
         INNER JOIN problems p ON p.id = i.problem_id
         WHERE p.workspace_id = ?`,
      )
      .pluck()
      .get(workspaceId) as number
    counts.templateProblemRelations = this.database.client
      .prepare(
        `SELECT count(*)
         FROM template_problem_relations r
         INNER JOIN problems p ON p.id = r.problem_id
         INNER JOIN templates t ON t.id = r.template_id
         WHERE p.workspace_id = ? AND t.workspace_id = ?`,
      )
      .pluck()
      .get(workspaceId, workspaceId) as number
    counts.fileChangePlans = this.database.client
      .prepare('SELECT count(*) FROM file_change_plans WHERE workspace_id = ?')
      .pluck()
      .get(workspaceId) as number
    counts.fileChangeExecutions = this.database.client
      .prepare(
        `SELECT count(*)
         FROM file_change_executions e
         INNER JOIN file_change_plans p ON p.id = e.plan_id
         WHERE p.workspace_id = ?`,
      )
      .pluck()
      .get(workspaceId) as number
    const imagePaths = this.workspaceProblemImagePaths(workspaceId)
    counts.problemImageFiles = await this.countExistingRelativeFiles(imagePaths)
    const backupDirectories = this.workspaceFilePlanBackupDirectories(workspaceId)
    counts.filePlanBackupDirectories =
      await this.countExistingRelativeDirectories(backupDirectories)
    return counts
  }

  private async inspectProblemImages(workspaceId: string): Promise<DataIntegrityIssue[]> {
    const records = this.workspaceProblemImagePaths(workspaceId)
    const issues: DataIntegrityIssue[] = []
    let missing = 0
    for (const relativePath of records) {
      if (!this.fileExists(this.resolveWorkspaceDataRelative(relativePath))) missing += 1
    }
    if (missing > 0) issues.push({ count: missing, kind: 'image-file-missing', severity: 'error' })
    return issues
  }

  private async inspectBackupDirectories(workspaceId: string): Promise<DataIntegrityIssue[]> {
    const issues: DataIntegrityIssue[] = []
    const invalidAppliedBackups =
      await this.fileExecutionIntegrityService.countInvalidFileExecutions(workspaceId)
    if (invalidAppliedBackups > 0) {
      issues.push({
        count: invalidAppliedBackups,
        kind: 'file-execution-backup-missing',
        severity: 'error',
      })
    }
    return issues
  }

  private async collectStorage(workspaceId: string): Promise<DataStorageArea[]> {
    const imageBytes = await this.sumRelativePathSizes(this.workspaceProblemImagePaths(workspaceId))
    const backupBytes = await this.sumRelativePathSizes(
      this.workspaceFilePlanBackupDirectories(workspaceId),
    )
    return [
      { key: 'user-data-total', bytes: imageBytes + backupBytes },
      { key: 'problem-images', bytes: imageBytes },
      { key: 'file-plan-backups', bytes: backupBytes },
    ]
  }

  private async copyWorkspaceProblemImages(
    packagePath: string,
    workspaceId: string,
  ): Promise<void> {
    const records = this.database.client
      .prepare(
        `SELECT i.relative_path AS relativePath
         FROM problem_images i
         INNER JOIN problems p ON p.id = i.problem_id
         WHERE p.workspace_id = ?
         ORDER BY i.relative_path`,
      )
      .all(workspaceId) as Array<{ relativePath: string }>
    const imageRoot = this.getProblemImageRoot()
    for (const record of records) {
      const prefix = 'problem-images/'
      if (!record.relativePath.startsWith(prefix)) {
        throw new PublicError('INVALID_REQUEST', '当前工作区存在无效题目图片记录，备份已取消。')
      }
      const relativePath = record.relativePath.slice(prefix.length)
      if (!relativePath || relativePath.startsWith('.trash/')) {
        throw new PublicError('INVALID_REQUEST', '当前工作区存在无效题目图片记录，备份已取消。')
      }
      const source = await resolveAuthorizedFile(imageRoot, relativePath).catch(() => null)
      if (!source) {
        throw new PublicError('INVALID_REQUEST', '当前工作区存在无法读取的题目图片，备份已取消。')
      }
      const target = join(packagePath, DATA_DIRECTORY, 'problem-images', ...relativePath.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await cp(source.absolutePath, target, { errorOnExist: true, force: false })
    }
  }

  private async copyWorkspaceFilePlanBackups(
    packagePath: string,
    workspaceId: string,
  ): Promise<void> {
    const records = this.database.client
      .prepare(
        `SELECT e.id, e.backup_directory AS backupDirectory
         FROM file_change_executions e
         INNER JOIN file_change_plans p ON p.id = e.plan_id
         WHERE p.workspace_id = ?
         ORDER BY e.id`,
      )
      .all(workspaceId) as Array<{ backupDirectory: string; id: string }>
    for (const record of records) {
      if (record.backupDirectory !== `file-plan-backups/${record.id}`) continue
      const source = join(this.getManagedDataRoot(), 'file-plan-backups', record.id)
      const sourceStats = await lstat(source).catch(() => null)
      if (!sourceStats?.isDirectory() || sourceStats.isSymbolicLink()) continue
      await cp(source, join(packagePath, DATA_DIRECTORY, 'file-plan-backups', record.id), {
        dereference: false,
        errorOnExist: true,
        force: false,
        recursive: true,
      })
    }
  }

  private supportedPlatform(): BackupManifestV2['createdOn'] {
    if (process.platform === 'darwin' || process.platform === 'win32') return process.platform
    return 'linux'
  }

  private async describePortableWorkspaces(
    workspaceId: string,
  ): Promise<BackupManifestV2['workspaces']> {
    const workspaces = this.database.client
      .prepare('SELECT id, name FROM workspaces WHERE id = ?')
      .all(workspaceId) as Array<{ id: string; name: string }>
    const templateCounts = new Map(
      (
        this.database.client
          .prepare(
            'SELECT workspace_id AS workspaceId, count(*) AS templateFileCount FROM templates WHERE available = 1 AND workspace_id = ? GROUP BY workspace_id',
          )
          .all(workspaceId) as Array<{ templateFileCount: number; workspaceId: string }>
      ).map(row => [row.workspaceId, row.templateFileCount]),
    )
    return workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      templateFileCount: templateCounts.get(workspace.id) ?? 0,
    }))
  }

  private async copyTemplateSources(
    packagePath: string,
    workspaces: BackupManifestV2['workspaces'],
  ): Promise<void> {
    const activeWorkspace = this.requireActiveWorkspace()
    const workspaceRoots = new Map([[activeWorkspace.id, activeWorkspace.rootPath]])
    const templates = this.database.client
      .prepare(
        'SELECT workspace_id AS workspaceId, relative_path AS relativePath FROM templates WHERE available = 1 AND workspace_id = ?',
      )
      .all(workspaces[0]?.id ?? '') as Array<{ relativePath: string; workspaceId: string }>
    for (const workspace of workspaces) {
      const rootPath = workspaceRoots.get(workspace.id)
      const workspaceTemplates = templates.filter(item => item.workspaceId === workspace.id)
      if (!rootPath) {
        if (workspaceTemplates.length > 0) {
          throw new PublicError('INVALID_REQUEST', '模板工作区不可用，无法生成完整便携备份。')
        }
        continue
      }
      const root = await resolveAuthorizedRoot(rootPath).catch(() => null)
      if (!root) {
        if (workspaceTemplates.length > 0) {
          throw new PublicError('INVALID_REQUEST', '模板工作区不可用，无法生成完整便携备份。')
        }
        continue
      }
      const portableKeys = new Set<string>()
      for (const template of workspaceTemplates) {
        const source = await resolveAuthorizedFile(root, template.relativePath).catch(() => null)
        if (!source) {
          throw new PublicError('INVALID_REQUEST', '存在无法读取的模板源码，便携备份已取消。')
        }
        const portableRelativePath = template.relativePath
          .split(/[\\/]/u)
          .join('/')
          .normalize('NFC')
        const archivePath = assertPortableArchivePath(
          `${DATA_DIRECTORY}/template-sources/${workspace.id}/${portableRelativePath}`,
        )
        const collisionKey = portableArchiveCollisionKey(archivePath)
        if (portableKeys.has(collisionKey)) {
          throw new PublicError(
            'INVALID_REQUEST',
            '模板路径在 Windows 大小写或 Unicode 规则下冲突，便携备份已取消。',
          )
        }
        portableKeys.add(collisionKey)
        const target = join(
          packagePath,
          DATA_DIRECTORY,
          'template-sources',
          workspace.id,
          ...portableRelativePath.split('/'),
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
    let materialized: MaterializedBackupPackage | null = null
    try {
      materialized = await this.materializeBackupPackage(packagePath, options)
      return await this.verifyMaterializedBackup(materialized)
    } catch (error) {
      const message =
        error instanceof PortableBackupArchiveError || error instanceof PublicError
          ? error.message
          : '备份包结构无效。'
      return {
        checkedAt: new Date().toISOString(),
        errors: [message],
        manifest: null,
        ok: false,
        packagePath: resolve(packagePath),
      }
    } finally {
      if (materialized) await this.cleanupMaterializedBackup(materialized)
    }
  }

  private async inspectRestoreScopePath(
    packagePath: string,
    targetWorkspaceId: string,
    manifest: BackupManifest | null,
  ): Promise<WorkspaceRestoreScope> {
    let materialized: MaterializedBackupPackage | null = null
    try {
      materialized = await this.materializeBackupPackage(packagePath)
      if (
        await this.pathExists(
          join(materialized.packageRoot, DATA_DIRECTORY, 'batch-import-backups'),
        )
      ) {
        throw new PublicError(
          'INVALID_REQUEST',
          '备份包含当前格式不允许的批量临时备份，不能恢复到当前工作区。',
        )
      }
      const scope = this.inspectWorkspaceRestoreScope(
        join(materialized.packageRoot, SQLITE_SNAPSHOT_PATH),
        targetWorkspaceId,
      )
      if (manifest) this.assertManifestMatchesRestoreScope(manifest, scope)
      return scope
    } finally {
      if (materialized) await this.cleanupMaterializedBackup(materialized)
    }
  }

  private assertManifestMatchesRestoreScope(
    manifest: BackupManifest,
    scope: WorkspaceRestoreScope,
  ): void {
    if (
      manifest.workspaces.length !== 1 ||
      manifest.workspaces[0]?.id !== scope.sourceWorkspaceId
    ) {
      throw new PublicError(
        'INVALID_REQUEST',
        '备份包含多个工作区或工作区清单不一致，不能覆盖当前工作区；请使用单工作区备份。',
      )
    }
  }

  private inspectWorkspaceRestoreScope(
    snapshotPath: string,
    targetWorkspaceId: string,
  ): WorkspaceRestoreScope {
    const snapshot = new BetterSqlite3(snapshotPath, { readonly: true })
    try {
      const problemColumns = this.getTableColumns(snapshot, 'problems')
      if (!problemColumns.includes('workspace_id')) {
        throw new PublicError(
          'INVALID_REQUEST',
          '备份数据库缺少当前格式必需的题目工作区字段，不能安全恢复。',
        )
      }
      const sourceWorkspaces = snapshot
        .prepare('SELECT id, name FROM workspaces ORDER BY id')
        .all() as Array<{ id: string; name: string }>
      if (sourceWorkspaces.length !== 1) {
        throw new PublicError(
          'INVALID_REQUEST',
          '备份包含多个工作区，不能覆盖当前工作区；请使用单工作区备份。',
        )
      }
      const sourceWorkspaceId = sourceWorkspaces[0]!.id
      const invalidProblemScope = snapshot
        .prepare('SELECT count(*) FROM problems WHERE workspace_id IS NULL OR workspace_id <> ?')
        .pluck()
        .get(sourceWorkspaceId) as number
      const invalidTemplateScope = snapshot
        .prepare('SELECT count(*) FROM templates WHERE workspace_id <> ?')
        .pluck()
        .get(sourceWorkspaceId) as number
      const invalidPlanScope = snapshot
        .prepare('SELECT count(*) FROM file_change_plans WHERE workspace_id <> ?')
        .pluck()
        .get(sourceWorkspaceId) as number
      if (invalidProblemScope + invalidTemplateScope + invalidPlanScope > 0) {
        throw new PublicError('INVALID_REQUEST', '备份包含工作区归属不一致的数据，禁止恢复。')
      }
      const targetExists = this.database.client
        .prepare('SELECT 1 FROM workspaces WHERE id = ?')
        .get(targetWorkspaceId)
      if (!targetExists) {
        throw new PublicError('WORKSPACE_REQUIRED', '当前工作区不存在，请重新选择工作区。')
      }

      const sourceProblemIds = snapshot
        .prepare('SELECT id FROM problems ORDER BY id')
        .pluck()
        .all() as string[]
      const sourceTemplateIds = snapshot
        .prepare('SELECT id FROM templates ORDER BY id')
        .pluck()
        .all() as string[]
      const sourceTemplateFileCount = snapshot
        .prepare('SELECT count(*) FROM templates WHERE available = 1')
        .pluck()
        .get() as number
      const sourceImageIds = snapshot
        .prepare('SELECT id FROM problem_images ORDER BY id')
        .pluck()
        .all() as string[]
      const sourcePlanIds = snapshot
        .prepare('SELECT id FROM file_change_plans ORDER BY id')
        .pluck()
        .all() as string[]
      const sourceExecutionIds = snapshot
        .prepare('SELECT id FROM file_change_executions ORDER BY id')
        .pluck()
        .all() as string[]
      const currentProblemIds = this.database.client
        .prepare('SELECT id FROM problems WHERE workspace_id = ? ORDER BY id')
        .pluck()
        .all(targetWorkspaceId) as string[]
      const currentExecutionIds = this.database.client
        .prepare(
          `SELECT e.id
           FROM file_change_executions e
           INNER JOIN file_change_plans p ON p.id = e.plan_id
           WHERE p.workspace_id = ?
           ORDER BY e.id`,
        )
        .pluck()
        .all(targetWorkspaceId) as string[]
      return {
        currentExecutionIds,
        currentProblemIds,
        sourceExecutionIds,
        sourceImageIds,
        sourcePlanIds,
        sourceProblemIds,
        sourceTemplateFileCount,
        sourceTemplateIds,
        sourceWorkspaceId,
        sourceWorkspaceName: sourceWorkspaces[0]!.name,
        targetWorkspaceId,
      }
    } finally {
      snapshot.close()
    }
  }

  private async materializeBackupPackage(
    packagePath: string,
    options: { requireExtension?: boolean } = {},
  ): Promise<MaterializedBackupPackage> {
    const resolvedPackage = resolve(packagePath)
    if (options.requireExtension !== false && !resolvedPackage.endsWith(BACKUP_EXTENSION)) {
      throw new PublicError('INVALID_REQUEST', '备份包扩展名不受支持。')
    }
    const stats = await lstat(resolvedPackage).catch(() => null)
    if (!stats || stats.isSymbolicLink()) {
      throw new PublicError('INVALID_REQUEST', '备份包不存在或是符号链接。')
    }
    if (!stats.isFile()) {
      throw new PublicError('INVALID_REQUEST', '当前版本只接受单文件 .awb-backup 备份。')
    }
    const cleanupRoot = await mkdtemp(join(tmpdir(), 'awb-backup-verify-'))
    const packageRoot = join(cleanupRoot, 'package')
    try {
      await extractPortableBackupArchive(resolvedPackage, packageRoot)
      return {
        cleanupRoot,
        container: 'zip-v2',
        originalPath: resolvedPackage,
        packageRoot,
      }
    } catch (error) {
      await rm(cleanupRoot, { force: true, recursive: true }).catch(() => undefined)
      throw error
    }
  }

  private async ensureMutableRestorePackage(
    materialized: MaterializedBackupPackage,
  ): Promise<MaterializedBackupPackage> {
    return materialized
  }

  private async remapRestorePackageToTarget(
    packageRoot: string,
    targetWorkspace: WorkspaceRecord,
    sourceScope: WorkspaceRestoreScope,
  ): Promise<WorkspaceRestoreScope> {
    const snapshotPath = join(packageRoot, SQLITE_SNAPSHOT_PATH)
    const snapshot = new BetterSqlite3(snapshotPath)
    const occupiedTemplateIds = new Set(
      this.database.client
        .prepare('SELECT id FROM templates WHERE workspace_id <> ?')
        .pluck()
        .all(targetWorkspace.id) as string[],
    )
    const occupiedProblemIds = new Set(
      this.database.client
        .prepare('SELECT id FROM problems WHERE workspace_id <> ?')
        .pluck()
        .all(targetWorkspace.id) as string[],
    )
    const occupiedImageIds = new Set(
      this.database.client
        .prepare(
          `SELECT i.id
             FROM problem_images i
             INNER JOIN problems p ON p.id = i.problem_id
             WHERE p.workspace_id <> ?`,
        )
        .pluck()
        .all(targetWorkspace.id) as string[],
    )
    const occupiedPlanIds = new Set(
      this.database.client
        .prepare('SELECT id FROM file_change_plans WHERE workspace_id <> ?')
        .pluck()
        .all(targetWorkspace.id) as string[],
    )
    const occupiedExecutionIds = new Set(
      this.database.client
        .prepare(
          `SELECT e.id
             FROM file_change_executions e
             INNER JOIN file_change_plans p ON p.id = e.plan_id
             WHERE p.workspace_id <> ?`,
        )
        .pluck()
        .all(targetWorkspace.id) as string[],
    )
    const reserveUuidMap = (sourceIds: string[], occupied: Set<string>): Map<string, string> => {
      const reserved = new Set([...occupied, ...sourceIds])
      return new Map(
        sourceIds.map(sourceId => {
          let targetId = randomUUID()
          while (reserved.has(targetId)) targetId = randomUUID()
          reserved.add(targetId)
          return [sourceId, targetId]
        }),
      )
    }

    try {
      const templateRows = snapshot
        .prepare('SELECT id, relative_path AS relativePath FROM templates ORDER BY relative_path')
        .all() as Array<{ id: string; relativePath: string }>
      const sourceTemplateIds = new Set(templateRows.map(row => row.id))
      const allocatedTemplateIds = new Set<string>()
      const templateIdMap = new Map<string, string>()
      for (const row of templateRows) {
        let targetId = createTemplateId(targetWorkspace.id, row.relativePath)
        let attempt = 0
        while (
          occupiedTemplateIds.has(targetId) ||
          allocatedTemplateIds.has(targetId) ||
          (sourceTemplateIds.has(targetId) && targetId !== row.id)
        ) {
          attempt += 1
          targetId = createHash('sha256')
            .update(targetWorkspace.id)
            .update('\0')
            .update(row.relativePath)
            .update('\0restore\0')
            .update(String(attempt))
            .digest('hex')
        }
        allocatedTemplateIds.add(targetId)
        templateIdMap.set(row.id, targetId)
      }
      const problemIdMap = reserveUuidMap(sourceScope.sourceProblemIds, occupiedProblemIds)
      const imageIdMap = reserveUuidMap(sourceScope.sourceImageIds, occupiedImageIds)
      const planIdMap = reserveUuidMap(sourceScope.sourcePlanIds, occupiedPlanIds)
      const executionIdMap = reserveUuidMap(sourceScope.sourceExecutionIds, occupiedExecutionIds)

      const planRows = snapshot
        .prepare('SELECT id, operations_json AS operationsJson FROM file_change_plans')
        .all() as Array<{ id: string; operationsJson: string }>
      const remappedPlanJson = new Map(
        planRows.map(row => [row.id, this.remapPlanOperations(row.operationsJson, templateIdMap)]),
      )
      const executionRows = snapshot
        .prepare('SELECT id, operations_json AS operationsJson FROM file_change_executions')
        .all() as Array<{ id: string; operationsJson: string }>
      const remappedExecutionJson = new Map(
        executionRows.map(row => [
          row.id,
          this.remapExecutionOperations(row.operationsJson, templateIdMap),
        ]),
      )

      snapshot.pragma('foreign_keys = OFF')
      const transaction = snapshot.transaction(() => {
        for (const [sourceId, targetId] of templateIdMap) {
          snapshot
            .prepare('UPDATE template_metadata SET template_id = ? WHERE template_id = ?')
            .run(targetId, sourceId)
          snapshot
            .prepare('UPDATE template_problem_relations SET template_id = ? WHERE template_id = ?')
            .run(targetId, sourceId)
          snapshot.prepare('UPDATE templates SET id = ? WHERE id = ?').run(targetId, sourceId)
        }
        for (const [sourceId, targetId] of problemIdMap) {
          snapshot
            .prepare('UPDATE problem_images SET problem_id = ? WHERE problem_id = ?')
            .run(targetId, sourceId)
          snapshot
            .prepare(
              'UPDATE problem_images SET relative_path = replace(relative_path, ?, ?) WHERE problem_id = ?',
            )
            .run(`problem-images/${sourceId}/`, `problem-images/${targetId}/`, targetId)
          snapshot
            .prepare('UPDATE template_problem_relations SET problem_id = ? WHERE problem_id = ?')
            .run(targetId, sourceId)
          snapshot.prepare('UPDATE problems SET id = ? WHERE id = ?').run(targetId, sourceId)
        }
        for (const [sourceId, targetId] of imageIdMap) {
          snapshot.prepare('UPDATE problem_images SET id = ? WHERE id = ?').run(targetId, sourceId)
        }
        for (const [sourceId, targetId] of planIdMap) {
          snapshot
            .prepare('UPDATE file_change_executions SET plan_id = ? WHERE plan_id = ?')
            .run(targetId, sourceId)
          snapshot
            .prepare('UPDATE file_change_plans SET id = ?, operations_json = ? WHERE id = ?')
            .run(targetId, remappedPlanJson.get(sourceId), sourceId)
        }
        for (const [sourceId, targetId] of executionIdMap) {
          snapshot
            .prepare(
              'UPDATE file_change_executions SET id = ?, operations_json = ?, backup_directory = ? WHERE id = ?',
            )
            .run(
              targetId,
              remappedExecutionJson.get(sourceId),
              `file-plan-backups/${targetId}`,
              sourceId,
            )
        }
        snapshot
          .prepare('UPDATE templates SET workspace_id = ? WHERE workspace_id = ?')
          .run(targetWorkspace.id, sourceScope.sourceWorkspaceId)
        snapshot
          .prepare('UPDATE problems SET workspace_id = ? WHERE workspace_id = ?')
          .run(targetWorkspace.id, sourceScope.sourceWorkspaceId)
        snapshot
          .prepare('UPDATE file_change_plans SET workspace_id = ? WHERE workspace_id = ?')
          .run(targetWorkspace.id, sourceScope.sourceWorkspaceId)
        snapshot
          .prepare(
            `UPDATE workspaces
             SET id = ?, name = ?, root_path = ?, created_at = ?
             WHERE id = ?`,
          )
          .run(
            targetWorkspace.id,
            targetWorkspace.name,
            this.workspaceStorage?.current?.marker.templateDirectory ?? targetWorkspace.rootPath,
            targetWorkspace.createdAt,
            sourceScope.sourceWorkspaceId,
          )
        snapshot
          .prepare(
            'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          )
          .run('active_workspace_id', targetWorkspace.id)
      })
      transaction()
      snapshot.pragma('foreign_keys = ON')
      const check = this.checkDatabase(snapshot)
      if (check.quickCheck !== 'ok' || !check.foreignKeyOk) {
        throw new PublicError('INVALID_REQUEST', '备份内容重映射后校验失败，禁止恢复。')
      }

      await this.renameRestoredDirectories(
        join(packageRoot, DATA_DIRECTORY, 'problem-images'),
        problemIdMap,
      )
      await this.renameRestoredDirectories(
        join(packageRoot, DATA_DIRECTORY, 'file-plan-backups'),
        executionIdMap,
      )
      return {
        currentExecutionIds: sourceScope.currentExecutionIds,
        currentProblemIds: sourceScope.currentProblemIds,
        sourceExecutionIds: [...executionIdMap.values()],
        sourceImageIds: [...imageIdMap.values()],
        sourcePlanIds: [...planIdMap.values()],
        sourceProblemIds: [...problemIdMap.values()],
        sourceTemplateFileCount: sourceScope.sourceTemplateFileCount,
        sourceTemplateIds: [...templateIdMap.values()],
        sourceWorkspaceId: targetWorkspace.id,
        sourceWorkspaceName: targetWorkspace.name,
        targetWorkspaceId: targetWorkspace.id,
      }
    } catch (error) {
      if (error instanceof PublicError) throw error
      throw new PublicError('INVALID_REQUEST', '备份数据无法安全重映射到当前工作区。')
    } finally {
      snapshot.close()
    }
  }

  private remapPlanOperations(operationsJson: string, templateIdMap: Map<string, string>): string {
    let stored: unknown
    try {
      stored = JSON.parse(operationsJson)
    } catch {
      throw new PublicError('INVALID_REQUEST', '备份中的文件计划记录已损坏。')
    }
    if (!parseStoredFileChangePlanPayload(stored)) {
      throw new PublicError('INVALID_REQUEST', '备份中的文件计划记录不兼容。')
    }
    const remapOperation = (operation: unknown) => {
      const parsed = fileChangeOperationSchema.parse(operation)
      const templateId = templateIdMap.get(parsed.templateId)
      if (!templateId) {
        throw new PublicError('INVALID_REQUEST', '文件计划引用了备份外的模板。')
      }
      return { ...parsed, templateId }
    }
    return JSON.stringify({
      ...(stored as Record<string, unknown>),
      operations: ((stored as { operations: unknown[] }).operations ?? []).map(remapOperation),
    })
  }

  private remapExecutionOperations(
    operationsJson: string,
    templateIdMap: Map<string, string>,
  ): string {
    try {
      const stored = JSON.parse(operationsJson) as unknown
      if (!Array.isArray(stored)) throw new Error('execution operations must be an array')
      return JSON.stringify(
        stored.map(item => {
          if (!item || typeof item !== 'object' || !('operation' in item)) {
            throw new Error('execution operation is invalid')
          }
          const parsed = fileChangeOperationSchema.parse(item.operation)
          const templateId = templateIdMap.get(parsed.templateId)
          if (!templateId) throw new Error('execution template is outside the backup')
          return { ...item, operation: { ...parsed, templateId } }
        }),
      )
    } catch {
      throw new PublicError('INVALID_REQUEST', '备份中的文件执行记录已损坏。')
    }
  }

  private async renameRestoredDirectories(
    directoryRoot: string,
    idMap: Map<string, string>,
  ): Promise<void> {
    if (!(await this.pathExists(directoryRoot))) return
    for (const [sourceId, targetId] of idMap) {
      const source = join(directoryRoot, sourceId)
      if (!(await this.pathExists(source))) continue
      await rename(source, join(directoryRoot, targetId))
    }
  }

  private async cleanupMaterializedBackup(materialized: MaterializedBackupPackage): Promise<void> {
    if (!materialized.cleanupRoot) return
    await rm(materialized.cleanupRoot, { force: true, recursive: true }).catch(() => undefined)
  }

  private async verifyMaterializedBackup(
    materialized: MaterializedBackupPackage,
  ): Promise<BackupVerification> {
    const errors: string[] = []
    let manifest: BackupManifest | null = null
    const resolvedPackage = materialized.packageRoot
    try {
      if (!(await this.pathExists(join(resolvedPackage, COMPLETED_PATH)))) {
        errors.push('备份包缺少完成标记。')
      }
      const manifestStats = await stat(join(resolvedPackage, MANIFEST_PATH))
      if (manifestStats.size > MAX_MANIFEST_BYTES) {
        errors.push('manifest 过大。')
      } else {
        const parsedManifest = backupManifestSchema.safeParse(
          JSON.parse(await readFile(join(resolvedPackage, MANIFEST_PATH), 'utf8')),
        )
        if (parsedManifest.success) manifest = parsedManifest.data
        else errors.push('备份 manifest 不是当前单工作区完整源码格式。')
      }
      if (manifest) {
        const manifestPaths = manifest.files.map(file => file.path)
        if (new Set(manifestPaths).size !== manifestPaths.length) {
          errors.push('manifest 包含重复文件路径。')
        }
        try {
          const portableKeys = manifestPaths.map(path => portableArchiveCollisionKey(path))
          if (new Set(portableKeys).size !== portableKeys.length) {
            errors.push('manifest 路径在 NFC 或大小写规则下冲突。')
          }
        } catch (error) {
          errors.push(
            error instanceof PortableBackupArchiveError
              ? error.message
              : 'manifest 包含不可移植路径。',
          )
        }
        errors.push(...this.validatePortableTemplateSourceManifest(manifest))
        if (!manifestPaths.includes(SQLITE_SNAPSHOT_PATH)) {
          errors.push('manifest 未包含 SQLite 快照。')
        }
        const actualFiles = await this.listStrictPackageFiles(resolvedPackage)
        const expectedFiles = new Set([MANIFEST_PATH, CHECKSUMS_PATH, ...manifestPaths])
        if (actualFiles.some(path => !expectedFiles.has(path))) {
          errors.push('备份包包含 manifest 清单外文件。')
        }
        if ([...expectedFiles].some(path => !actualFiles.includes(path))) {
          errors.push('备份包缺少 manifest 声明文件。')
        }
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
          const fileStats = await lstat(absolutePath).catch(() => null)
          if (!fileStats?.isFile() || fileStats.isSymbolicLink()) {
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
      packagePath: materialized.originalPath,
    }
  }

  private async collectPackageFileEntries(packagePath: string): Promise<BackupFileEntry[]> {
    const dataSources = await this.listRelativeFileSources(join(packagePath, DATA_DIRECTORY))
    const sources = [
      ...dataSources.map(source => ({
        absolutePath: source.absolutePath,
        path: `${DATA_DIRECTORY}/${source.relativePath}`,
      })),
      { absolutePath: join(packagePath, COMPLETED_PATH), path: COMPLETED_PATH },
    ]
      .map(source => ({
        ...source,
        path: assertPortableArchivePath(source.path.normalize('NFC')),
      }))
      .sort((left, right) => left.path.localeCompare(right.path, 'en-US'))
    const keys = sources.map(source => portableArchiveCollisionKey(source.path))
    if (new Set(keys).size !== keys.length) {
      throw new PortableBackupArchiveError('备份路径在 NFC 或大小写规则下发生冲突。')
    }
    return Promise.all(
      sources.map(async source => {
        const stats = await stat(source.absolutePath)
        return {
          bytes: stats.size,
          path: source.path,
          sha256: await this.sha256File(source.absolutePath),
        }
      }),
    )
  }

  private validatePortableTemplateSourceManifest(manifest: BackupManifestV2): string[] {
    const errors: string[] = []
    const workspaceIds = new Set(manifest.workspaces.map(workspace => workspace.id))
    if (workspaceIds.size !== manifest.workspaces.length) {
      errors.push('备份工作区清单包含重复标识。')
    }
    const sourceCounts = new Map(manifest.workspaces.map(workspace => [workspace.id, 0]))
    for (const file of manifest.files) {
      const match = /^data\/template-sources\/([^/]+)\/(.+)$/u.exec(file.path)
      if (!match) continue
      const workspaceId = match[1]!
      if (!sourceCounts.has(workspaceId)) {
        errors.push('模板源码清单引用了未知工作区。')
        continue
      }
      sourceCounts.set(workspaceId, (sourceCounts.get(workspaceId) ?? 0) + 1)
    }
    for (const workspace of manifest.workspaces) {
      if ((sourceCounts.get(workspace.id) ?? 0) !== workspace.templateFileCount) {
        errors.push('模板源码数量与工作区清单不一致。')
        break
      }
    }
    return errors
  }

  private async collectPortableArchiveSources(
    packagePath: string,
  ): Promise<PortableArchiveSource[]> {
    const sources = await this.listRelativeFileSources(packagePath)
    return sources.map(source => ({
      absolutePath: source.absolutePath,
      archivePath: assertPortableArchivePath(source.relativePath.normalize('NFC')),
    }))
  }

  private async listStrictPackageFiles(root: string): Promise<string[]> {
    return (await this.listRelativeFileSources(root)).map(source => source.relativePath).sort()
  }

  private async listRelativeFileSources(
    root: string,
  ): Promise<Array<{ absolutePath: string; relativePath: string }>> {
    const files: Array<{ absolutePath: string; relativePath: string }> = []
    const walk = async (directory: string) => {
      const entries = await readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        const absolutePath = join(directory, entry.name)
        if (entry.isSymbolicLink()) {
          throw new PortableBackupArchiveError('备份目录包含符号链接。')
        }
        if (entry.isDirectory()) await walk(absolutePath)
        if (entry.isFile()) {
          files.push({
            absolutePath,
            relativePath: relative(root, absolutePath).split(sep).join('/'),
          })
        }
      }
    }
    await walk(root)
    return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en-US'))
  }

  private async formatChecksums(packagePath: string, files: BackupFileEntry[]): Promise<string> {
    const manifestHash = await this.sha256File(join(packagePath, MANIFEST_PATH))
    return [
      `${manifestHash}  ${MANIFEST_PATH}\n`,
      ...files.map(file => `${file.sha256}  ${file.path}\n`),
    ].join('')
  }

  private workspaceProblemImagePaths(workspaceId: string): string[] {
    return (
      this.database.client
        .prepare(
          `SELECT i.relative_path AS relativePath
           FROM problem_images i
           INNER JOIN problems p ON p.id = i.problem_id
           WHERE p.workspace_id = ?
           ORDER BY i.relative_path`,
        )
        .all(workspaceId) as Array<{ relativePath: string }>
    ).map(record => record.relativePath)
  }

  private workspaceFilePlanBackupDirectories(workspaceId: string): string[] {
    return (
      this.database.client
        .prepare(
          `SELECT e.id, e.backup_directory AS backupDirectory
           FROM file_change_executions e
           INNER JOIN file_change_plans p ON p.id = e.plan_id
           WHERE p.workspace_id = ?
           ORDER BY e.id`,
        )
        .all(workspaceId) as Array<{ backupDirectory: string; id: string }>
    ).flatMap(record =>
      record.backupDirectory === `file-plan-backups/${record.id}` ? [record.backupDirectory] : [],
    )
  }

  private async countExistingRelativeFiles(paths: string[]): Promise<number> {
    let count = 0
    for (const relativePath of paths) {
      const absolutePath = this.resolveWorkspaceDataRelative(relativePath)
      const stats = await lstat(absolutePath).catch(() => null)
      if (stats?.isFile() && !stats.isSymbolicLink()) count += 1
    }
    return count
  }

  private async countExistingRelativeDirectories(paths: string[]): Promise<number> {
    let count = 0
    for (const relativePath of paths) {
      const absolutePath = this.resolveWorkspaceDataRelative(relativePath)
      const stats = await lstat(absolutePath).catch(() => null)
      if (stats?.isDirectory() && !stats.isSymbolicLink()) count += 1
    }
    return count
  }

  private async sumRelativePathSizes(paths: string[]): Promise<number> {
    let bytes = 0
    for (const relativePath of paths) {
      const absolutePath = this.resolveWorkspaceDataRelative(relativePath)
      bytes += await this.pathSize(absolutePath)
    }
    return bytes
  }

  private requireActiveWorkspace(): WorkspaceRecord {
    const workspace = this.workspaceRepository.getActiveWorkspace()
    if (!workspace) {
      throw new PublicError('WORKSPACE_REQUIRED', '请先创建或选择模板工作区。')
    }
    return workspace
  }

  private getManagedDataRoot(): string {
    return this.workspaceStorage?.current?.dataRoot ?? this.userDataPath
  }

  private getProblemImageRoot(): string {
    return (
      this.workspaceStorage?.current?.problemImagesRoot ?? join(this.userDataPath, 'problem-images')
    )
  }

  private getRestorableDirectoryPath(directoryName: RestorableUserDataDirectory): string {
    return directoryName === 'problem-images'
      ? this.getProblemImageRoot()
      : join(this.getManagedDataRoot(), directoryName)
  }

  private resolveWorkspaceDataRelative(relativePath: string): string {
    const portable = relativePath.replaceAll('\\', '/')
    if (portable.startsWith('problem-images/')) {
      const pathWithinImages = portable.slice('problem-images/'.length)
      const absolutePath = resolve(this.getProblemImageRoot(), ...pathWithinImages.split('/'))
      if (!isPathInsideRoot(this.getProblemImageRoot(), absolutePath)) {
        throw new PublicError('PATH_NOT_AUTHORIZED', '题目图片路径越出当前工作区。')
      }
      return absolutePath
    }
    const managedDataRoot = this.getManagedDataRoot()
    const absolutePath = resolve(managedDataRoot, ...portable.split('/'))
    if (!isPathInsideRoot(managedDataRoot, absolutePath)) {
      throw new PublicError('PATH_NOT_AUTHORIZED', '工作区数据路径越出受管目录。')
    }
    return absolutePath
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
}
