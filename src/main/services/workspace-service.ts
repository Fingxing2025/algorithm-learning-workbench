import { clipboard, dialog, shell, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'

import type {
  ChooseWorkspaceRequest,
  CreateTemplateRequest,
  CreateTemplateResult,
  TemplateActionRequest,
  TemplateSource,
  WorkspaceSnapshot,
} from '@core/contracts/workspace'
import type {
  BatchImportTemplateRequest,
  BatchImportTemplateResult,
  InspectBatchTemplateImportRequest,
  InspectBatchTemplateImportResult,
  ImportTemplateRequest,
  ImportTemplateResult,
} from '@core/contracts/template-management'

import { TemplateManagementRepository } from '../database/template-management-repository'
import { WorkspaceRepository, type WorkspaceRecord } from '../database/workspace-repository'
import { PublicError } from '../errors/public-error'
import {
  isPathInsideRoot,
  resolveAuthorizedFile,
  resolveAuthorizedRoot,
} from '../security/path-guard'
import { getLanguageForExtension, scanTemplateWorkspace } from './template-scanner'
import { normalizeTemplateRelativePath } from '../security/template-path'

const MAX_SOURCE_BYTES = 2 * 1024 * 1024

function createExistingFileState(stats: Stats): string {
  return [stats.dev, stats.ino, stats.size, stats.mtimeMs, stats.ctimeMs].join(':')
}

export class WorkspaceService {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly metadataRepository?: TemplateManagementRepository,
    private readonly userDataPath?: string,
  ) {}

  async chooseWorkspace(
    request: ChooseWorkspaceRequest,
    parentWindow?: BrowserWindow,
  ): Promise<WorkspaceSnapshot | null> {
    const options: Electron.OpenDialogOptions = {
      buttonLabel: request.intent === 'create' ? '使用此文件夹' : '打开工作区',
      message:
        request.intent === 'create'
          ? '创建或选择一个空白文件夹作为模板工作区'
          : '选择已有模板目录，应用将先进行只读扫描',
      properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
      title: request.intent === 'create' ? '创建模板工作区' : '选择模板工作区',
    }
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    const canonicalRoot = await resolveAuthorizedRoot(result.filePaths[0])
    const workspace = this.repository.upsertWorkspace(
      canonicalRoot,
      basename(canonicalRoot) || '模板工作区',
    )
    this.repository.setActiveWorkspace(workspace.id)
    return this.scanAndSnapshot(workspace)
  }

  async createTemplate(request: CreateTemplateRequest): Promise<CreateTemplateResult> {
    const workspace = this.requireWorkspace()
    const canonicalRoot = await resolveAuthorizedRoot(workspace.rootPath)
    const extension = extname(request.fileName).toLowerCase()
    if (!getLanguageForExtension(extension)) {
      throw new PublicError('INVALID_REQUEST', '文件扩展名不受支持，请使用常见源码扩展名。')
    }
    if (Buffer.byteLength(request.content, 'utf8') > MAX_SOURCE_BYTES) {
      throw new PublicError('FILE_TOO_LARGE', '模板源码超过 2 MiB，无法创建。')
    }

    const targetPath = resolve(canonicalRoot, request.fileName)
    if (!isPathInsideRoot(canonicalRoot, targetPath) || targetPath === canonicalRoot) {
      throw new PublicError('PATH_NOT_AUTHORIZED', '模板文件必须创建在当前工作区根目录。')
    }

    try {
      await writeFile(targetPath, request.content, { encoding: 'utf8', flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new PublicError('FILE_ALREADY_EXISTS', '同名文件已经存在，未覆盖原文件。')
      }
      throw new PublicError('FILE_UNAVAILABLE', '无法创建模板文件，请检查文件夹权限。')
    }

    const snapshot = await this.scanAndSnapshot(workspace)
    const createdTemplate = snapshot.templates.find(
      template =>
        !template.relativePath.includes('/') &&
        template.fileName.normalize('NFC') === request.fileName.normalize('NFC'),
    )
    if (!createdTemplate) {
      throw new PublicError('DATABASE_ERROR', '模板文件已创建，但索引更新失败。请重新扫描工作区。')
    }
    return {
      templateId: createdTemplate.id,
      workspace: snapshot,
    }
  }

  async getCurrentWorkspace(): Promise<WorkspaceSnapshot | null> {
    const workspace = this.repository.getActiveWorkspace()
    if (!workspace) {
      return null
    }

    let available = true
    try {
      await resolveAuthorizedRoot(workspace.rootPath)
    } catch {
      available = false
    }
    return this.toSnapshot(workspace, available)
  }

  async importTemplate(request: ImportTemplateRequest): Promise<ImportTemplateResult> {
    const workspace = this.requireWorkspace()
    const canonicalRoot = await resolveAuthorizedRoot(workspace.rootPath)
    const relativePath = normalizeTemplateRelativePath(request.relativePath)
    if (Buffer.byteLength(request.content, 'utf8') > MAX_SOURCE_BYTES) {
      throw new PublicError('FILE_TOO_LARGE', '模板源码超过 2 MiB，无法创建。')
    }
    const targetPath = resolve(canonicalRoot, relativePath)
    if (!isPathInsideRoot(canonicalRoot, targetPath) || targetPath === canonicalRoot) {
      throw new PublicError('PATH_NOT_AUTHORIZED', '模板文件必须创建在当前工作区内。')
    }

    let fileCreated = false
    try {
      await mkdir(dirname(targetPath), { recursive: true })
      await writeFile(targetPath, request.content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      fileCreated = true
      const snapshot = await this.scanAndSnapshot(workspace)
      const createdTemplate = snapshot.templates.find(
        template => template.relativePath.normalize('NFC') === relativePath.normalize('NFC'),
      )
      if (!createdTemplate) {
        throw new PublicError('DATABASE_ERROR', '模板文件已创建，但索引更新失败。')
      }
      if (request.metadata) {
        if (!this.metadataRepository) {
          throw new PublicError('DATABASE_ERROR', '模板元数据服务未初始化。')
        }
        this.metadataRepository.upsertMetadata(createdTemplate.id, request.metadata)
      }
      return { templateId: createdTemplate.id, workspace: snapshot }
    } catch (error) {
      if (fileCreated) {
        await rm(targetPath, { force: true }).catch(() => undefined)
        await this.scanAndSnapshot(workspace).catch(() => undefined)
      }
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new PublicError('FILE_ALREADY_EXISTS', '同名文件已经存在，未覆盖原文件。')
      }
      if (error instanceof PublicError) throw error
      throw new PublicError('FILE_UNAVAILABLE', '无法创建模板文件，请检查目录权限。')
    }
  }

  async importTemplatesBatch(
    request: BatchImportTemplateRequest,
  ): Promise<BatchImportTemplateResult> {
    const workspace = this.requireWorkspace()
    const canonicalRoot = await resolveAuthorizedRoot(workspace.rootPath)
    if (!this.metadataRepository) {
      throw new PublicError('DATABASE_ERROR', '模板元数据服务未初始化。')
    }
    if (!this.userDataPath) {
      throw new PublicError('FILE_UNAVAILABLE', '批量导入备份目录未初始化。')
    }
    const seenPaths = new Set<string>()
    const existingPaths = new Map(
      this.repository
        .listTemplates(workspace.id)
        .map(template => [
          template.relativePath.normalize('NFC').toLocaleLowerCase('en-US'),
          template.relativePath.normalize('NFC'),
        ]),
    )
    const prepared = request.items.map(item => {
      const relativePath = normalizeTemplateRelativePath(item.relativePath)
      if (extname(relativePath).toLowerCase() !== '.cpp') {
        throw new PublicError('INVALID_REQUEST', '批量导入只接受 .cpp 文件。')
      }
      if (Buffer.byteLength(item.content, 'utf8') > MAX_SOURCE_BYTES) {
        throw new PublicError('FILE_TOO_LARGE', '模板源码超过 2 MiB，无法创建。')
      }
      const conflictKey = relativePath.normalize('NFC').toLocaleLowerCase('en-US')
      if (seenPaths.has(conflictKey)) {
        throw new PublicError('FILE_ALREADY_EXISTS', `批量导入包含重复目标路径：${relativePath}`)
      }
      seenPaths.add(conflictKey)
      const targetPath = resolve(canonicalRoot, relativePath)
      if (!isPathInsideRoot(canonicalRoot, targetPath) || targetPath === canonicalRoot) {
        throw new PublicError('PATH_NOT_AUTHORIZED', '模板文件必须创建在当前工作区内。')
      }
      const existingCasePath = existingPaths.get(conflictKey)
      if (existingCasePath && existingCasePath !== relativePath) {
        throw new PublicError(
          'FILE_ALREADY_EXISTS',
          `目标路径与已有文件仅大小写不同：${existingCasePath}`,
        )
      }
      return { ...item, relativePath, targetPath }
    })

    const directoriesCreatedByBatch = new Set<string>()
    const overwriteItems: typeof prepared = []
    for (const item of prepared) {
      const targetStats = await lstat(item.targetPath)
        .then(stats => stats)
        .catch(error => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
          throw error
        })
      if (item.conflictAction === 'overwrite') {
        if (!targetStats) {
          throw new PublicError(
            'FILE_ALREADY_EXISTS',
            `待覆盖文件状态已变化，请重新检查：${item.relativePath}`,
          )
        }
        if (!targetStats.isFile() || targetStats.isSymbolicLink()) {
          throw new PublicError('FILE_ALREADY_EXISTS', `目标路径不能覆盖：${item.relativePath}`)
        }
        if (
          !item.expectedExistingFileState ||
          createExistingFileState(targetStats) !== item.expectedExistingFileState
        ) {
          throw new PublicError(
            'FILE_ALREADY_EXISTS',
            `待覆盖文件内容已变化，请重新确认：${item.relativePath}`,
          )
        }
        overwriteItems.push(item)
      } else if (targetStats) {
        throw new PublicError('FILE_ALREADY_EXISTS', `目标路径已存在：${item.relativePath}`)
      }
      let parent = dirname(item.targetPath)
      while (parent !== canonicalRoot) {
        const parentExists = await lstat(parent)
          .then(() => true)
          .catch(error => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
            throw error
          })
        if (parentExists) break
        directoriesCreatedByBatch.add(parent)
        parent = dirname(parent)
      }
    }

    const batchId = randomUUID()
    const backupRoot = join(this.userDataPath, 'batch-import-backups', batchId)
    const backupRecords = new Map<string, string>()
    const createdPaths: string[] = []
    const temporaryPaths: string[] = []
    const mutatedOverwritePaths = new Set<string>()
    try {
      if (overwriteItems.length > 0) {
        await mkdir(backupRoot, { mode: 0o700, recursive: true })
        for (let index = 0; index < overwriteItems.length; index += 1) {
          const item = overwriteItems[index]!
          const backupPath = join(backupRoot, `${index}.backup`)
          await copyFile(item.targetPath, backupPath)
          backupRecords.set(item.targetPath, backupPath)
        }
        await writeFile(
          join(backupRoot, 'manifest.json'),
          JSON.stringify(
            {
              batchId,
              createdAt: new Date().toISOString(),
              items: overwriteItems.map(item => ({
                relativePath: item.relativePath,
                sourceId: item.sourceId,
              })),
              schemaVersion: 1,
            },
            null,
            2,
          ),
          { encoding: 'utf8', flag: 'wx', mode: 0o600 },
        )
      }
      for (const item of prepared) {
        await mkdir(dirname(item.targetPath), { recursive: true })
        if (item.conflictAction === 'overwrite') {
          const temporaryPath = join(
            dirname(item.targetPath),
            `.algorithm-workbench-${batchId}.tmp`,
          )
          temporaryPaths.push(temporaryPath)
          await writeFile(temporaryPath, item.content, {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600,
          })
          mutatedOverwritePaths.add(item.targetPath)
          await rm(item.targetPath)
          await rename(temporaryPath, item.targetPath)
          temporaryPaths.splice(temporaryPaths.indexOf(temporaryPath), 1)
        } else {
          await writeFile(item.targetPath, item.content, {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600,
          })
          createdPaths.push(item.targetPath)
        }
      }
      const snapshot = await this.scanAndSnapshot(workspace)
      const imported = prepared.map(item => {
        const createdTemplate = snapshot.templates.find(
          template => template.relativePath.normalize('NFC') === item.relativePath.normalize('NFC'),
        )
        if (!createdTemplate) {
          throw new PublicError('DATABASE_ERROR', '批量文件已创建，但索引更新失败。')
        }
        return {
          metadata: item.metadata,
          relativePath: item.relativePath,
          sourceId: item.sourceId,
          templateId: createdTemplate.id,
        }
      })
      this.metadataRepository.upsertMetadataBatch(
        imported.flatMap(item =>
          item.metadata ? [{ fields: item.metadata, templateId: item.templateId }] : [],
        ),
      )
      return {
        imported: imported.map(item => ({
          relativePath: item.relativePath,
          sourceId: item.sourceId,
          templateId: item.templateId,
        })),
        workspace: snapshot,
      }
    } catch (error) {
      let restoreFailed = false
      for (const path of temporaryPaths) {
        await rm(path, { force: true }).catch(() => undefined)
      }
      for (const path of createdPaths.reverse()) {
        await rm(path, { force: true }).catch(() => undefined)
      }
      for (const targetPath of mutatedOverwritePaths) {
        const backupPath = backupRecords.get(targetPath)
        if (!backupPath) continue
        try {
          await rm(targetPath, { force: true })
          await copyFile(backupPath, targetPath)
        } catch {
          restoreFailed = true
        }
      }
      for (const directory of [...directoriesCreatedByBatch].sort(
        (left, right) => right.length - left.length,
      )) {
        await rmdir(directory).catch(() => undefined)
      }
      await this.scanAndSnapshot(workspace).catch(() => undefined)
      if (overwriteItems.length > 0 && !restoreFailed) {
        await rm(backupRoot, { force: true, recursive: true }).catch(() => undefined)
      }
      if (restoreFailed) {
        throw new PublicError(
          'FILE_UNAVAILABLE',
          '批量导入失败，部分覆盖文件无法自动恢复；安全备份已保留，请停止编辑并检查工作区。',
        )
      }
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new PublicError('FILE_ALREADY_EXISTS', '目标路径状态已变化，请重新检查后再导入。')
      }
      if (error instanceof PublicError) throw error
      throw new PublicError('FILE_UNAVAILABLE', '批量导入失败，已恢复覆盖文件并移除新文件。')
    }
  }

  async inspectBatchImport(
    request: InspectBatchTemplateImportRequest,
  ): Promise<InspectBatchTemplateImportResult> {
    const workspace = this.requireWorkspace()
    const canonicalRoot = await resolveAuthorizedRoot(workspace.rootPath)
    const normalizedItems = request.items.map(item => {
      const relativePath = normalizeTemplateRelativePath(item.relativePath)
      if (extname(relativePath).toLowerCase() !== '.cpp') {
        throw new PublicError('INVALID_REQUEST', '批量导入只接受 .cpp 文件。')
      }
      const targetPath = resolve(canonicalRoot, relativePath)
      if (!isPathInsideRoot(canonicalRoot, targetPath) || targetPath === canonicalRoot) {
        throw new PublicError('PATH_NOT_AUTHORIZED', '模板文件必须创建在当前工作区内。')
      }
      return {
        ...item,
        conflictKey: relativePath.normalize('NFC').toLocaleLowerCase('en-US'),
        relativePath,
        targetPath,
      }
    })
    const pathCounts = new Map<string, number>()
    for (const item of normalizedItems) {
      pathCounts.set(item.conflictKey, (pathCounts.get(item.conflictKey) ?? 0) + 1)
    }
    const existingPaths = new Map(
      this.repository
        .listTemplates(workspace.id)
        .map(template => [
          template.relativePath.normalize('NFC').toLocaleLowerCase('en-US'),
          template.relativePath.normalize('NFC'),
        ]),
    )
    const conflicts: InspectBatchTemplateImportResult['conflicts'] = []
    for (const item of normalizedItems) {
      if ((pathCounts.get(item.conflictKey) ?? 0) > 1) {
        conflicts.push({
          actualRelativePath: null,
          canOverwrite: false,
          existingFileState: null,
          kind: 'batch-duplicate',
          relativePath: item.relativePath,
          sourceId: item.sourceId,
        })
        continue
      }
      const caseConflictPath = existingPaths.get(item.conflictKey)
      if (caseConflictPath && caseConflictPath !== item.relativePath) {
        conflicts.push({
          actualRelativePath: caseConflictPath,
          canOverwrite: false,
          existingFileState: null,
          kind: 'case-conflict',
          relativePath: item.relativePath,
          sourceId: item.sourceId,
        })
        continue
      }
      const targetStats = await lstat(item.targetPath).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      })
      if (!targetStats) continue
      const kind = targetStats.isSymbolicLink()
        ? 'existing-special'
        : targetStats.isFile()
          ? 'existing-file'
          : targetStats.isDirectory()
            ? 'existing-directory'
            : 'existing-special'
      conflicts.push({
        actualRelativePath: item.relativePath,
        canOverwrite: kind === 'existing-file',
        existingFileState: kind === 'existing-file' ? createExistingFileState(targetStats) : null,
        kind,
        relativePath: item.relativePath,
        sourceId: item.sourceId,
      })
    }
    return { conflicts }
  }

  async performTemplateAction(request: TemplateActionRequest): Promise<void> {
    const record = this.repository.getTemplateWithWorkspace(request.templateId)
    if (!record) {
      throw new PublicError('FILE_UNAVAILABLE', '模板记录不存在，可能需要重新扫描。')
    }

    if (request.action === 'copy-relative-path') {
      clipboard.writeText(record.template.relativePath)
      return
    }

    if (request.action === 'copy-source') {
      const source = await this.readTemplateSource(request.templateId)
      clipboard.writeText(source.content)
      return
    }

    const resolvedFile = await resolveAuthorizedFile(
      record.workspace.rootPath,
      record.template.relativePath,
    )
    shell.showItemInFolder(resolvedFile.absolutePath)
  }

  async readTemplateSource(templateId: string): Promise<TemplateSource> {
    const record = this.repository.getTemplateWithWorkspace(templateId)
    if (!record) {
      throw new PublicError('FILE_UNAVAILABLE', '模板记录不存在，可能需要重新扫描。')
    }

    const resolvedFile = await resolveAuthorizedFile(
      record.workspace.rootPath,
      record.template.relativePath,
    )
    if (resolvedFile.sizeBytes > MAX_SOURCE_BYTES) {
      throw new PublicError('FILE_TOO_LARGE', '模板文件超过 2 MiB，无法在应用内打开。')
    }

    const content = await readFile(resolvedFile.absolutePath, 'utf8')
    if (content.includes('\0')) {
      throw new PublicError('FILE_UNAVAILABLE', '该文件不是可显示的文本源码。')
    }

    return {
      content,
      id: record.template.id,
      language: record.template.language,
      relativePath: record.template.relativePath,
    }
  }

  async rescanCurrentWorkspace(
    stableIdsByRelativePath?: ReadonlyMap<string, string>,
  ): Promise<WorkspaceSnapshot> {
    return this.scanAndSnapshot(this.requireWorkspace(), stableIdsByRelativePath)
  }

  private requireWorkspace(): WorkspaceRecord {
    const workspace = this.repository.getActiveWorkspace()
    if (!workspace) {
      throw new PublicError('WORKSPACE_REQUIRED', '请先创建或选择模板工作区。')
    }
    return workspace
  }

  private async scanAndSnapshot(
    workspace: WorkspaceRecord,
    stableIdsByRelativePath?: ReadonlyMap<string, string>,
  ): Promise<WorkspaceSnapshot> {
    const scanResult = await scanTemplateWorkspace(workspace.rootPath, workspace.id)
    const scannedAt = new Date().toISOString()
    const templates = scanResult.templates.map(template => ({
      ...template,
      id: stableIdsByRelativePath?.get(template.relativePath) ?? template.id,
    }))
    this.repository.replaceTemplates(workspace.id, templates, scanResult.summary, scannedAt)
    const refreshedWorkspace = this.repository.getActiveWorkspace()
    if (!refreshedWorkspace) {
      throw new PublicError('DATABASE_ERROR', '无法读取工作区索引，请重试。')
    }
    return this.toSnapshot(refreshedWorkspace, true)
  }

  private toSnapshot(workspace: WorkspaceRecord, available: boolean): WorkspaceSnapshot {
    return {
      available,
      id: workspace.id,
      name: workspace.name,
      rootPath: workspace.rootPath,
      scannedAt: workspace.scannedAt,
      summary: this.repository.parseSummary(workspace),
      templates: this.repository.listTemplates(workspace.id),
    }
  }
}
