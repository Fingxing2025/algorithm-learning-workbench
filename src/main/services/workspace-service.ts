import { clipboard, dialog, shell, type BrowserWindow } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'

import type {
  ApplyTemplateSourceEditRequest,
  ApplyTemplateSourceEditResult,
  ChooseWorkspaceRequest,
  CreateTemplateRequest,
  CreateTemplateResult,
  PreviewTemplateSourceEditRequest,
  TemplateActionRequest,
  TemplatePage,
  TemplatePageRequest,
  TemplateSummary,
  TemplateSource,
  TemplateSourceEditDiff,
  TemplateSourceEditPreview,
  WorkspaceSnapshot,
} from '@core/contracts/workspace'
import {
  applyTemplateSourceEditRequestSchema,
  previewTemplateSourceEditRequestSchema,
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
import {
  getLanguageForExtension,
  scanTemplateWorkspace,
  type TemplateScanOptions,
} from './template-scanner'
import { normalizeTemplateRelativePath } from '../security/template-path'

const MAX_SOURCE_BYTES = 2 * 1024 * 1024
const SOURCE_EDIT_PREVIEW_TTL_MS = 10 * 60 * 1000

interface StoredTemplateSourceEditPreview extends TemplateSourceEditPreview {
  updatedContent: string
  workspaceId: string
}

function createExistingFileState(stats: Stats): string {
  return [stats.dev, stats.ino, stats.size, stats.mtimeMs, stats.ctimeMs].join(':')
}

function sourceSha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function decodeSourceBuffer(content: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content)
  } catch {
    throw new PublicError('FILE_UNAVAILABLE', '该文件不是有效的 UTF-8 文本源码。')
  }
}

function assertEditableText(content: string, message: string): void {
  if (content.includes('\0')) throw new PublicError('FILE_UNAVAILABLE', message)
  let suspiciousControls = 0
  for (const character of content) {
    const code = character.codePointAt(0) ?? 0
    if (code < 32 && !['\t', '\n', '\r', '\f'].includes(character)) suspiciousControls += 1
  }
  if (suspiciousControls > Math.max(8, Math.floor(content.length * 0.01))) {
    throw new PublicError('FILE_UNAVAILABLE', message)
  }
}

function buildSourceEditDiff(before: string, after: string): TemplateSourceEditDiff {
  const beforeLines = before.split(/\r\n|\r|\n/u)
  const afterLines = after.split(/\r\n|\r|\n/u)
  let prefix = 0
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - suffix - 1] === afterLines[afterLines.length - suffix - 1]
  ) {
    suffix += 1
  }
  const beforeChanged = beforeLines.slice(prefix, beforeLines.length - suffix)
  const afterChanged = afterLines.slice(prefix, afterLines.length - suffix)
  return {
    after: afterChanged.join('\n'),
    afterEndLine: afterChanged.length === 0 ? prefix : prefix + afterChanged.length,
    afterStartLine: prefix + 1,
    before: beforeChanged.join('\n'),
    beforeEndLine: beforeChanged.length === 0 ? prefix : prefix + beforeChanged.length,
    beforeStartLine: prefix + 1,
  }
}

export class WorkspaceService {
  private readonly sourceEditPreviews = new Map<string, StoredTemplateSourceEditPreview>()

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
    const createdTemplate = this.repository.getTemplateByRelativePath(
      workspace.id,
      request.fileName.normalize('NFC'),
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

  getActiveWorkspaceId(): string {
    return this.requireWorkspace().id
  }

  getTemplateSummary(templateId: string): TemplateSummary {
    const workspace = this.requireWorkspace()
    const template = this.repository.getTemplateSummary(workspace.id, templateId)
    if (!template) {
      throw new PublicError('TEMPLATE_NOT_FOUND', '模板不存在或当前不可用，请重新扫描工作区。')
    }
    return template
  }

  listTemplatesPage(request: TemplatePageRequest): TemplatePage {
    return this.repository.listTemplatesPage(this.requireWorkspace().id, request)
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
      const createdTemplate = this.repository.getTemplateByRelativePath(workspace.id, relativePath)
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
        const createdTemplate = this.repository.getTemplateByRelativePath(
          workspace.id,
          item.relativePath,
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

  async previewTemplateSourceEdit(
    rawRequest: PreviewTemplateSourceEditRequest,
  ): Promise<TemplateSourceEditPreview> {
    const request = previewTemplateSourceEditRequestSchema.parse(rawRequest)
    const updatedBytes = Buffer.byteLength(request.content, 'utf8')
    if (updatedBytes > MAX_SOURCE_BYTES) {
      throw new PublicError('FILE_TOO_LARGE', '模板源码超过 2 MiB，无法保存。')
    }
    assertEditableText(request.content, '新源码包含 NUL 或二进制控制字符，未创建预览。')
    const workspace = this.requireWorkspace()
    const record = this.repository.getTemplateWithWorkspace(request.templateId)
    if (!record || record.workspace.id !== workspace.id || !record.template.available) {
      throw new PublicError('TEMPLATE_NOT_FOUND', '模板不存在或当前不可用，请重新扫描工作区。')
    }
    const resolvedFile = await resolveAuthorizedFile(
      workspace.rootPath,
      record.template.relativePath,
    )
    if (resolvedFile.sizeBytes > MAX_SOURCE_BYTES) {
      throw new PublicError('FILE_TOO_LARGE', '模板文件超过 2 MiB，无法在应用内编辑。')
    }
    const originalBuffer = await readFile(resolvedFile.absolutePath)
    const originalContent = decodeSourceBuffer(originalBuffer)
    assertEditableText(originalContent, '该文件包含 NUL 或二进制控制字符，无法编辑。')
    if (originalContent === request.content) {
      throw new PublicError('INVALID_REQUEST', '源码没有变化，无需保存。')
    }

    const previewId = randomUUID()
    const preview: StoredTemplateSourceEditPreview = {
      diff: buildSourceEditDiff(originalContent, request.content),
      expiresAt: new Date(Date.now() + SOURCE_EDIT_PREVIEW_TTL_MS).toISOString(),
      originalSha256: sourceSha256(originalBuffer),
      originalSizeBytes: originalBuffer.length,
      previewId,
      relativePath: record.template.relativePath,
      templateId: record.template.id,
      updatedContent: request.content,
      updatedSizeBytes: updatedBytes,
      workspaceId: workspace.id,
    }
    for (const [id, stored] of this.sourceEditPreviews) {
      if (Date.parse(stored.expiresAt) <= Date.now()) this.sourceEditPreviews.delete(id)
    }
    this.sourceEditPreviews.set(previewId, preview)
    const { updatedContent, workspaceId, ...publicPreview } = preview
    void updatedContent
    void workspaceId
    return publicPreview
  }

  async applyTemplateSourceEdit(
    rawRequest: ApplyTemplateSourceEditRequest,
  ): Promise<ApplyTemplateSourceEditResult> {
    const request = applyTemplateSourceEditRequestSchema.parse(rawRequest)
    const preview = this.sourceEditPreviews.get(request.previewId)
    this.sourceEditPreviews.delete(request.previewId)
    const workspace = this.requireWorkspace()
    if (
      !preview ||
      preview.workspaceId !== workspace.id ||
      Date.parse(preview.expiresAt) <= Date.now()
    ) {
      throw new PublicError('INVALID_REQUEST', '源码编辑预览已过期或不属于当前工作区，请重新预览。')
    }
    const record = this.repository.getTemplateWithWorkspace(preview.templateId)
    if (
      !record ||
      record.workspace.id !== workspace.id ||
      !record.template.available ||
      record.template.relativePath !== preview.relativePath
    ) {
      throw new PublicError('FILE_UNAVAILABLE', '模板索引已变化，请重新读取并预览。')
    }
    if (!this.userDataPath) {
      throw new PublicError('FILE_UNAVAILABLE', '源码编辑备份目录未初始化。')
    }

    const resolvedFile = await resolveAuthorizedFile(workspace.rootPath, preview.relativePath)
    if (resolvedFile.sizeBytes > MAX_SOURCE_BYTES) {
      throw new PublicError('FILE_TOO_LARGE', '模板文件超过 2 MiB，无法在应用内编辑。')
    }
    const originalBuffer = await readFile(resolvedFile.absolutePath)
    const originalContent = decodeSourceBuffer(originalBuffer)
    assertEditableText(originalContent, '该文件包含 NUL 或二进制控制字符，无法编辑。')
    if (sourceSha256(originalBuffer) !== preview.originalSha256) {
      throw new PublicError('FILE_UNAVAILABLE', '源码已在预览后被外部修改，拒绝覆盖；请重新读取。')
    }
    assertEditableText(preview.updatedContent, '新源码包含 NUL 或二进制控制字符，未保存。')
    if (Buffer.byteLength(preview.updatedContent, 'utf8') > MAX_SOURCE_BYTES) {
      throw new PublicError('FILE_TOO_LARGE', '模板源码超过 2 MiB，无法保存。')
    }

    const backupRoot = join(this.userDataPath, 'file-plan-backups', preview.previewId)
    const backupPath = join(backupRoot, 'source.backup')
    const temporaryPath = join(
      dirname(resolvedFile.absolutePath),
      `.algorithm-workbench-source-edit-${preview.previewId}.tmp`,
    )
    let replaced = false
    let backupCreated = false
    try {
      await mkdir(dirname(backupRoot), { mode: 0o700, recursive: true })
      await mkdir(backupRoot, { mode: 0o700, recursive: false })
      await copyFile(resolvedFile.absolutePath, backupPath)
      backupCreated = true
      const handle = await open(temporaryPath, 'wx', 0o600)
      try {
        await handle.writeFile(preview.updatedContent, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      const current = await resolveAuthorizedFile(workspace.rootPath, preview.relativePath)
      const currentBuffer = await readFile(current.absolutePath)
      if (sourceSha256(currentBuffer) !== preview.originalSha256) {
        throw new PublicError(
          'FILE_UNAVAILABLE',
          '源码已在确认保存时发生变化，拒绝覆盖；请重新读取。',
        )
      }
      await rename(temporaryPath, current.absolutePath)
      replaced = true
      const snapshot = await this.scanAndSnapshot(
        workspace,
        new Map([[preview.relativePath, preview.templateId]]),
      )
      const refreshed = this.repository.getTemplateSummary(workspace.id, preview.templateId)
      if (!refreshed || refreshed.relativePath !== preview.relativePath) {
        throw new PublicError('DATABASE_ERROR', '源码已写入，但模板索引同步失败。')
      }
      const backupCleanupPending = await rm(backupRoot, { force: true, recursive: true })
        .then(() => false)
        .catch(() => true)
      return {
        backupCleanupPending,
        source: {
          content: preview.updatedContent,
          id: preview.templateId,
          language: refreshed.language,
          relativePath: refreshed.relativePath,
        },
        workspace: snapshot,
      }
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      if (replaced) {
        let restored = false
        try {
          const restorePath = `${temporaryPath}.restore`
          const handle = await open(restorePath, 'wx', 0o600)
          try {
            await handle.writeFile(originalBuffer)
            await handle.sync()
          } finally {
            await handle.close()
          }
          await rename(restorePath, resolvedFile.absolutePath)
          await this.scanAndSnapshot(
            workspace,
            new Map([[preview.relativePath, preview.templateId]]),
          )
          restored = true
        } catch {
          // Keep the recovery failure private; the guarded message below explains the safe next step.
        }
        if (!restored) {
          throw new PublicError(
            'FILE_UNAVAILABLE',
            '源码保存失败且自动恢复未完成；安全备份已保留，请停止编辑并检查工作区。',
          )
        }
      }
      if (backupCreated) {
        await rm(backupRoot, { force: true, recursive: true }).catch(() => undefined)
      }
      if (error instanceof PublicError) throw error
      throw new PublicError('FILE_UNAVAILABLE', '源码保存失败，原文件已保持或恢复。')
    }
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

    const content = decodeSourceBuffer(await readFile(resolvedFile.absolutePath))
    assertEditableText(content, '该文件不是可显示的文本源码。')

    return {
      content,
      id: record.template.id,
      language: record.template.language,
      relativePath: record.template.relativePath,
    }
  }

  async rescanCurrentWorkspace(
    stableIdsByRelativePath?: ReadonlyMap<string, string>,
    options: Omit<TemplateScanOptions, 'previousEntries'> = {},
  ): Promise<WorkspaceSnapshot> {
    return this.scanAndSnapshot(this.requireWorkspace(), stableIdsByRelativePath, options)
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
    options: Omit<TemplateScanOptions, 'previousEntries'> = {},
  ): Promise<WorkspaceSnapshot> {
    const previousEntries = this.repository.listTemplateIndexEntries(workspace.id)
    const scanResult = await scanTemplateWorkspace(workspace.rootPath, workspace.id, {
      ...options,
      previousEntries,
    })
    const scannedAt = new Date().toISOString()
    const templates = scanResult.templates.map(template => ({
      ...template,
      ...(stableIdsByRelativePath?.has(template.relativePath)
        ? {
            changeKind: 'moved' as const,
            id: stableIdsByRelativePath.get(template.relativePath)!,
          }
        : {}),
    }))
    options.onBeforePublish?.()
    this.repository.applyTemplateScan(
      workspace.id,
      templates,
      scanResult.summary,
      scanResult.stats,
      scannedAt,
    )
    const refreshedWorkspace = this.repository.getActiveWorkspace()
    if (!refreshedWorkspace) {
      throw new PublicError('DATABASE_ERROR', '无法读取工作区索引，请重试。')
    }
    return this.toSnapshot(refreshedWorkspace, true)
  }

  private toSnapshot(workspace: WorkspaceRecord, available: boolean): WorkspaceSnapshot {
    const templatePage = this.repository.listTemplatesPage(workspace.id, {
      cursor: null,
      limit: 500,
      query: '',
    })
    return {
      available,
      id: workspace.id,
      name: workspace.name,
      rootPath: workspace.rootPath,
      scannedAt: workspace.scannedAt,
      summary: this.repository.parseSummary(workspace),
      templatePage: {
        nextAction: templatePage.nextAction,
        nextCursor: templatePage.nextCursor,
        processedCount: templatePage.processedCount,
        totalCount: templatePage.totalCount,
        truncated: templatePage.truncated,
        truncatedReason: templatePage.truncatedReason,
      },
      templates: templatePage.items,
    }
  }
}
