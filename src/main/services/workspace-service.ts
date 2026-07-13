import { clipboard, dialog, shell, type BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'

import type {
  ChooseWorkspaceRequest,
  CreateTemplateRequest,
  CreateTemplateResult,
  TemplateActionRequest,
  TemplateSource,
  WorkspaceSnapshot,
} from '@core/contracts/workspace'

import { WorkspaceRepository, type WorkspaceRecord } from '../database/workspace-repository'
import { PublicError } from '../errors/public-error'
import {
  isPathInsideRoot,
  resolveAuthorizedFile,
  resolveAuthorizedRoot,
} from '../security/path-guard'
import { getLanguageForExtension, scanTemplateWorkspace } from './template-scanner'

const MAX_SOURCE_BYTES = 2 * 1024 * 1024

export class WorkspaceService {
  constructor(private readonly repository: WorkspaceRepository) {}

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

  async rescanCurrentWorkspace(): Promise<WorkspaceSnapshot> {
    return this.scanAndSnapshot(this.requireWorkspace())
  }

  private requireWorkspace(): WorkspaceRecord {
    const workspace = this.repository.getActiveWorkspace()
    if (!workspace) {
      throw new PublicError('WORKSPACE_REQUIRED', '请先创建或选择模板工作区。')
    }
    return workspace
  }

  private async scanAndSnapshot(workspace: WorkspaceRecord): Promise<WorkspaceSnapshot> {
    const scanResult = await scanTemplateWorkspace(workspace.rootPath, workspace.id)
    const scannedAt = new Date().toISOString()
    this.repository.replaceTemplates(
      workspace.id,
      scanResult.templates,
      scanResult.summary,
      scannedAt,
    )
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
