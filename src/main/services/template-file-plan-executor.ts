import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, rename, rm, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  applyFileChangePlanRequestSchema,
  parseStoredFileChangeOperation,
  parseStoredTemplateMetadataFields,
  type FileChangeMutationResult,
  type FileChangeOperation,
  type TemplateMetadataFields,
} from '@core/contracts/template-management'
import type { BackgroundTaskProgress } from '@core/contracts/background-task'

import { TemplateManagementRepository } from '../database/template-management-repository'
import { WorkspaceRepository } from '../database/workspace-repository'
import { PublicError } from '../errors/public-error'
import { resolveAuthorizedFile, resolveAuthorizedRoot } from '../security/path-guard'
import { TemplateFilePlanSafety } from './template-file-plan-safety'
import type { WorkspaceService } from './workspace-service'
import type { WorkspaceStorageManager } from './workspace-storage'

export class TemplateFilePlanExecutor {
  constructor(
    private readonly metadataRepository: TemplateManagementRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly userDataPath: string,
    private readonly safety: TemplateFilePlanSafety,
    private readonly workspaceStorage?: WorkspaceStorageManager,
  ) {}

  async deleteTemplate(templateId: string): Promise<FileChangeMutationResult> {
    const workspace = this.workspaceRepository.getActiveWorkspace()
    const record = this.workspaceRepository.getTemplateWithWorkspace(templateId)
    if (
      !workspace ||
      !record ||
      record.workspace.id !== workspace.id ||
      !record.template.available
    ) {
      throw new PublicError('TEMPLATE_NOT_FOUND', '模板不存在或需要重新扫描。')
    }
    const precondition = await this.safety.createOperationPrecondition(
      workspace.rootPath,
      record.template,
      false,
    )
    const plan = this.metadataRepository.createPlan(workspace.id, '本地操作', 'manual-delete', [
      {
        alternatives: ['保留该模板'],
        applicability: ['用户明确从模板卡片请求删除'],
        confidence: 1,
        evidence: ['用户手动操作'],
        id: randomUUID(),
        kind: 'delete',
        precondition,
        reason: '用户从模板卡片确认删除；执行前已创建应用内备份。',
        risk: 'high',
        selectedByDefault: false,
        source: 'manual',
        sourcePath: record.template.relativePath,
        templateId: record.template.id,
      },
    ])
    const operation = plan.operations[0]
    if (!operation) throw new PublicError('DATABASE_ERROR', '无法创建模板删除计划。')
    return this.applyFilePlan({ operationIds: [operation.id], planId: plan.id })
  }

  async applyFilePlan(
    rawRequest: {
      operationIds: string[]
      planId: string
      requestId?: string
    },
    onProgress?: (progress: BackgroundTaskProgress) => void,
  ): Promise<FileChangeMutationResult> {
    const request = applyFileChangePlanRequestSchema.parse(rawRequest)
    const workspace = this.workspaceRepository.getActiveWorkspace()
    const plan = this.metadataRepository.getPlan(request.planId)
    if (
      !workspace ||
      !plan ||
      plan.status !== 'draft' ||
      this.metadataRepository.getPlanWorkspaceId(plan.id) !== workspace.id
    ) {
      throw new PublicError('INVALID_REQUEST', '文件计划不存在、已结束或不属于当前工作区。')
    }
    const selected = plan.operations.filter(operation =>
      request.operationIds.includes(operation.id),
    )
    if (selected.length !== request.operationIds.length)
      throw new PublicError('INVALID_REQUEST', '选择的计划操作无效。')
    const root = await resolveAuthorizedRoot(workspace.rootPath)
    onProgress?.({
      currentItem: null,
      phase: 'validating',
      processedCount: 0,
      totalCount: selected.length,
    })
    await this.safety.assertOperationPreconditions(root, selected)
    const executionId = randomUUID()
    const backupRelative = `file-plan-backups/${executionId}`
    const backupAbsolute = join(this.getManagedDataRoot(), backupRelative)
    const stored: Array<{
      operation: FileChangeOperation
      previousMetadata: TemplateMetadataFields | null
    }> = []
    const applied: FileChangeOperation[] = []
    try {
      await mkdir(backupAbsolute, { mode: 0o700, recursive: true })
      for (const [operationIndex, operation] of selected.entries()) {
        onProgress?.({
          currentItem: operation.sourcePath,
          phase: 'backing-up',
          processedCount: operationIndex,
          totalCount: selected.length,
        })
        const source = await resolveAuthorizedFile(root, operation.sourcePath)
        if (operation.kind === 'move') {
          await this.safety.assertSafeMoveTarget(
            root,
            workspace.id,
            operation.sourcePath,
            operation.targetPath,
          )
        }
        if (operation.kind !== 'update-metadata') {
          await copyFile(source.absolutePath, join(backupAbsolute, `${operation.id}.backup`))
        }
        const metadata = this.metadataRepository.getMetadata(operation.templateId)
        stored.push({
          operation,
          previousMetadata: metadata
            ? {
                notes: metadata.notes,
                solves: metadata.solves,
                spaceComplexity: metadata.spaceComplexity,
                tags: metadata.tags,
                timeComplexity: metadata.timeComplexity,
              }
            : null,
        })
      }
      for (const [operationIndex, operation] of selected.entries()) {
        onProgress?.({
          currentItem: operation.sourcePath,
          phase: 'writing',
          processedCount: operationIndex,
          totalCount: selected.length,
        })
        const source = await resolveAuthorizedFile(root, operation.sourcePath)
        if (operation.kind === 'move') {
          const targetAbsolute = await this.safety.assertSafeMoveTarget(
            root,
            workspace.id,
            operation.sourcePath,
            operation.targetPath,
          )
          await mkdir(dirname(targetAbsolute), { recursive: true })
          await rename(source.absolutePath, targetAbsolute)
        } else if (operation.kind === 'delete') {
          await unlink(source.absolutePath)
        }
        applied.push(operation)
      }
      if (
        process.env.NODE_ENV === 'test' &&
        process.env.E2E_FILE_PLAN_FAILURE_STAGE === 'after-file-mutations'
      ) {
        throw new Error('Injected file plan failure after file mutations')
      }
      const stableIdsByRelativePath = new Map(
        selected.flatMap(operation =>
          operation.kind === 'move' ? [[operation.targetPath, operation.templateId] as const] : [],
        ),
      )
      onProgress?.({
        currentItem: null,
        phase: 'indexing',
        processedCount: selected.length,
        totalCount: selected.length,
      })
      const snapshot = await this.workspaceService.rescanCurrentWorkspace(stableIdsByRelativePath)
      this.metadataRepository.finalizeExecution({
        backupDirectory: backupRelative,
        executionId,
        metadataUpdates: selected.flatMap(operation =>
          operation.kind === 'update-metadata'
            ? [
                {
                  fields: operation.metadata,
                  templateId: operation.templateId,
                },
              ]
            : [],
        ),
        operationsJson: JSON.stringify(stored),
        planId: plan.id,
        remaps: [],
      })
      const execution = this.metadataRepository
        .listExecutions(workspace.id)
        .find(item => item.id === executionId)!
      onProgress?.({
        currentItem: null,
        phase: 'finalizing',
        processedCount: selected.length,
        totalCount: selected.length,
      })
      return { execution, workspace: snapshot }
    } catch (error) {
      for (const operation of applied.reverse()) {
        try {
          if (operation.kind === 'move') {
            await mkdir(dirname(join(root, ...operation.sourcePath.split('/'))), {
              recursive: true,
            })
            await rename(
              join(root, ...operation.targetPath.split('/')),
              join(root, ...operation.sourcePath.split('/')),
            )
          } else if (operation.kind === 'delete') {
            await mkdir(dirname(join(root, ...operation.sourcePath.split('/'))), {
              recursive: true,
            })
            await copyFile(
              join(backupAbsolute, `${operation.id}.backup`),
              join(root, ...operation.sourcePath.split('/')),
            )
          }
        } catch {
          /* report original failure */
        }
      }
      await this.workspaceService
        .rescanCurrentWorkspace(
          new Map(
            selected.flatMap(operation =>
              operation.kind === 'move'
                ? [[operation.sourcePath, operation.templateId] as const]
                : [],
            ),
          ),
        )
        .catch(() => undefined)
      await rm(backupAbsolute, { force: true, recursive: true }).catch(() => undefined)
      if (error instanceof PublicError) throw error
      throw new PublicError('FILE_UNAVAILABLE', '文件计划执行失败，已恢复完成的步骤。')
    }
  }

  async rollbackFileExecution(
    executionId: string,
    onProgress?: (progress: BackgroundTaskProgress) => void,
  ): Promise<FileChangeMutationResult> {
    const workspace = this.workspaceRepository.getActiveWorkspace()
    const record = this.metadataRepository.getExecutionRecord(executionId)
    if (
      !workspace ||
      !record ||
      record.status !== 'applied' ||
      this.metadataRepository.getPlanWorkspaceId(record.planId) !== workspace.id ||
      !/^file-plan-backups\/[0-9a-f-]{36}$/i.test(record.backupDirectory)
    ) {
      throw new PublicError('INVALID_REQUEST', '该执行记录不可撤销。')
    }
    let stored: Array<{
      operation: FileChangeOperation
      previousMetadata: TemplateMetadataFields | null
    }>
    try {
      const raw = JSON.parse(record.operationsJson) as Array<{
        operation: unknown
        previousMetadata: unknown
      }>
      stored = raw.map(item => ({
        operation: (() => {
          const parsed = parseStoredFileChangeOperation(item.operation)
          if (!parsed) throw new Error('invalid operation')
          return parsed
        })(),
        previousMetadata:
          item.previousMetadata === null
            ? null
            : (() => {
                const parsed = parseStoredTemplateMetadataFields(item.previousMetadata)
                if (!parsed) throw new Error('invalid metadata')
                return parsed
              })(),
      }))
    } catch {
      throw new PublicError('DATABASE_ERROR', '执行记录损坏，无法安全撤销。')
    }
    const root = await resolveAuthorizedRoot(workspace.rootPath)
    const backupAbsolute = join(this.getManagedDataRoot(), record.backupDirectory)
    const reversed: FileChangeOperation[] = []
    try {
      for (const [itemIndex, item] of stored.entries()) {
        const operation = item.operation
        onProgress?.({
          currentItem: operation.sourcePath,
          phase: 'validating',
          processedCount: itemIndex,
          totalCount: stored.length,
        })
        if (operation.kind === 'move') {
          const target = await resolveAuthorizedFile(root, operation.targetPath)
          const originalAbsolute = join(root, ...operation.sourcePath.split('/'))
          await lstat(originalAbsolute)
            .then(() => {
              throw new PublicError(
                'FILE_ALREADY_EXISTS',
                `原路径已被占用：${operation.sourcePath}`,
              )
            })
            .catch(error => {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            })
          const [currentDigest, backupDigest] = await Promise.all([
            readFile(target.absolutePath).then(value =>
              createHash('sha256').update(value).digest('hex'),
            ),
            readFile(join(backupAbsolute, `${operation.id}.backup`)).then(value =>
              createHash('sha256').update(value).digest('hex'),
            ),
          ])
          if (currentDigest !== backupDigest) {
            throw new PublicError(
              'FILE_UNAVAILABLE',
              `文件已在计划后被修改，拒绝撤销：${operation.targetPath}`,
            )
          }
        } else if (operation.kind === 'delete') {
          const originalAbsolute = join(root, ...operation.sourcePath.split('/'))
          await lstat(originalAbsolute)
            .then(() => {
              throw new PublicError(
                'FILE_ALREADY_EXISTS',
                `原路径已被占用：${operation.sourcePath}`,
              )
            })
            .catch(error => {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            })
          await lstat(join(backupAbsolute, `${operation.id}.backup`))
        }
      }
      for (const [itemIndex, item] of [...stored].reverse().entries()) {
        const operation = item.operation
        onProgress?.({
          currentItem: operation.sourcePath,
          phase: 'restoring',
          processedCount: itemIndex,
          totalCount: stored.length,
        })
        if (operation.kind === 'move') {
          await mkdir(dirname(join(root, ...operation.sourcePath.split('/'))), { recursive: true })
          await rename(
            join(root, ...operation.targetPath.split('/')),
            join(root, ...operation.sourcePath.split('/')),
          )
        } else if (operation.kind === 'delete') {
          await mkdir(dirname(join(root, ...operation.sourcePath.split('/'))), { recursive: true })
          await copyFile(
            join(backupAbsolute, `${operation.id}.backup`),
            join(root, ...operation.sourcePath.split('/')),
          )
        }
        reversed.push(operation)
      }
      const snapshot = await this.workspaceService.rescanCurrentWorkspace(
        new Map(
          stored.flatMap(item =>
            item.operation.kind === 'move'
              ? [[item.operation.sourcePath, item.operation.templateId] as const]
              : [],
          ),
        ),
      )
      this.metadataRepository.finalizeRollback({
        executionId,
        metadataRestores: stored.map(item => ({
          fields: item.previousMetadata,
          templateId: item.operation.templateId,
        })),
        remaps: [],
      })
      await rm(backupAbsolute, { force: true, recursive: true }).catch(() => undefined)
      const execution = this.metadataRepository
        .listExecutions(workspace.id)
        .find(item => item.id === executionId)!
      onProgress?.({
        currentItem: null,
        phase: 'finalizing',
        processedCount: stored.length,
        totalCount: stored.length,
      })
      return { execution, workspace: snapshot }
    } catch (error) {
      for (const operation of reversed.reverse()) {
        try {
          if (operation.kind === 'move') {
            await mkdir(dirname(join(root, ...operation.targetPath.split('/'))), {
              recursive: true,
            })
            await rename(
              join(root, ...operation.sourcePath.split('/')),
              join(root, ...operation.targetPath.split('/')),
            )
          } else if (operation.kind === 'delete') {
            await unlink(join(root, ...operation.sourcePath.split('/')))
          }
        } catch {
          /* keep the original conflict visible */
        }
      }
      await this.workspaceService
        .rescanCurrentWorkspace(
          new Map(
            stored.flatMap(item =>
              item.operation.kind === 'move'
                ? [[item.operation.targetPath, item.operation.templateId] as const]
                : [],
            ),
          ),
        )
        .catch(() => undefined)
      if (error instanceof PublicError) throw error
      throw new PublicError('FILE_UNAVAILABLE', '撤销未完成，已恢复到撤销前状态。')
    }
  }

  private getManagedDataRoot(): string {
    return this.workspaceStorage?.current?.dataRoot ?? this.userDataPath
  }
}
