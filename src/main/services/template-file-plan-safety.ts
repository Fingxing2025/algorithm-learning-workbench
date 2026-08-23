import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

import type { FileChangeOperation } from '@core/contracts/template-management'
import type { TemplateSummary } from '@core/contracts/workspace'

import { TemplateManagementRepository } from '../database/template-management-repository'
import { WorkspaceRepository } from '../database/workspace-repository'
import { PublicError } from '../errors/public-error'
import { resolveAuthorizedFile } from '../security/path-guard'
import { normalizeTemplateRelativePath } from '../security/template-path'
import { getLanguageForExtension } from './template-scanner'

export class TemplateFilePlanSafety {
  constructor(
    private readonly metadataRepository: TemplateManagementRepository,
    private readonly workspaceRepository: WorkspaceRepository,
  ) {}

  async assertSafeMoveTarget(
    root: string,
    workspaceId: string,
    sourceRelativePath: string,
    rawTargetRelativePath: string,
  ): Promise<string> {
    const targetRelativePath = normalizeTemplateRelativePath(rawTargetRelativePath)
    if (targetRelativePath === sourceRelativePath) {
      throw new PublicError('INVALID_REQUEST', '新路径必须与原路径不同。')
    }
    if (extname(targetRelativePath).toLowerCase() !== extname(sourceRelativePath).toLowerCase()) {
      throw new PublicError('INVALID_REQUEST', '重命名时必须保留原源码扩展名。')
    }
    if (!getLanguageForExtension(extname(targetRelativePath).toLowerCase())) {
      throw new PublicError('INVALID_REQUEST', '目标文件扩展名不受支持。')
    }
    const normalizedTargetKey = targetRelativePath.normalize('NFC').toLocaleLowerCase('en-US')
    const caseConflict = this.workspaceRepository
      .listTemplates(workspaceId)
      .find(
        template =>
          template.relativePath !== sourceRelativePath &&
          template.relativePath.normalize('NFC').toLocaleLowerCase('en-US') === normalizedTargetKey,
      )
    if (caseConflict) {
      throw new PublicError(
        'FILE_ALREADY_EXISTS',
        `目标路径与已有模板仅大小写不同：${caseConflict.relativePath}`,
      )
    }
    if (sourceRelativePath.normalize('NFC').toLocaleLowerCase('en-US') === normalizedTargetKey) {
      throw new PublicError('FILE_ALREADY_EXISTS', '首版不支持仅修改文件名大小写。')
    }
    const targetAbsolute = join(root, ...targetRelativePath.split('/'))
    const parentSegments = targetRelativePath.split('/').slice(0, -1)
    let current = root
    for (const segment of parentSegments) {
      current = join(current, segment)
      const stats = await lstat(current).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      })
      if (!stats) break
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new PublicError('PATH_NOT_AUTHORIZED', '目标父目录不是安全的普通目录。')
      }
    }
    const targetStats = await lstat(targetAbsolute).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    })
    if (targetStats) {
      throw new PublicError('FILE_ALREADY_EXISTS', `目标路径已存在：${targetRelativePath}`)
    }
    return targetAbsolute
  }

  async createOperationPrecondition(
    rootPath: string,
    template: TemplateSummary,
    targetExpectedAbsent: boolean,
  ) {
    const resolved = await resolveAuthorizedFile(rootPath, template.relativePath)
    const content = await readFile(resolved.absolutePath)
    const sourceStats = await lstat(resolved.absolutePath)
    return {
      metadataUpdatedAt: this.metadataRepository.getMetadata(template.id)?.updatedAt ?? null,
      sourceModifiedAt: sourceStats.mtime.toISOString(),
      sourceSha256: createHash('sha256').update(content).digest('hex'),
      sourceSizeBytes: content.length,
      targetExpectedAbsent,
    }
  }

  async assertOperationPreconditions(root: string, operations: readonly FileChangeOperation[]) {
    for (const operation of operations) {
      if (!operation.precondition) continue
      const source = await resolveAuthorizedFile(root, operation.sourcePath)
      const content = await readFile(source.absolutePath)
      const sourceStats = await lstat(source.absolutePath)
      const digest = createHash('sha256').update(content).digest('hex')
      const currentMetadata = this.metadataRepository.getMetadata(operation.templateId)
      if (
        content.length !== operation.precondition.sourceSizeBytes ||
        digest !== operation.precondition.sourceSha256 ||
        sourceStats.mtime.toISOString() !== operation.precondition.sourceModifiedAt ||
        (currentMetadata?.updatedAt ?? null) !== operation.precondition.metadataUpdatedAt
      ) {
        throw new PublicError(
          'FILE_UNAVAILABLE',
          `文件或元数据已在计划生成后变更，请重新生成计划：${operation.sourcePath}`,
        )
      }
    }
  }
}
