import { lstat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'

import {
  archiveFilePlansRequestSchema,
  deleteFileExecutionsRequestSchema,
  type ArchiveFilePlansRequest,
  type ArchiveFilePlansResult,
  type DeleteFileExecutionsRequest,
  type DeleteFileExecutionsResult,
  type FileChangeExecution,
  type FileChangeExecutionPage,
  type FileChangePlan,
  type FileChangePlanPage,
  type FileHistoryPageRequest,
} from '@core/contracts/template-management'

import { TemplateManagementRepository } from '../database/template-management-repository'
import { WorkspaceRepository } from '../database/workspace-repository'
import { PublicError } from '../errors/public-error'
import { resolveAuthorizedFile, resolveAuthorizedRoot } from '../security/path-guard'
import { normalizeTemplateRelativePath } from '../security/template-path'
import { TemplateFilePlanSafety } from './template-file-plan-safety'
import { TemplateWorkspaceAuditService } from './template-workspace-audit-service'

export class TemplateFilePlanHistoryService {
  constructor(
    private readonly metadataRepository: TemplateManagementRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly auditService: TemplateWorkspaceAuditService,
    private readonly safety: TemplateFilePlanSafety,
  ) {}

  archiveFilePlans(rawRequest: ArchiveFilePlansRequest): ArchiveFilePlansResult {
    const request = archiveFilePlansRequestSchema.parse(rawRequest)
    const workspace = this.workspaceRepository.getActiveWorkspace()
    if (!workspace) throw new PublicError('WORKSPACE_REQUIRED', '请先创建或选择模板工作区。')
    try {
      const result = this.metadataRepository.archivePlans(workspace.id, request.planIds)
      if (!result) {
        throw new PublicError(
          'INVALID_REQUEST',
          '计划状态已变化、仍是待确认草稿，或计划不属于当前工作区；未归档任何记录。',
        )
      }
      return result
    } catch (error) {
      if (error instanceof PublicError) throw error
      throw new PublicError('DATABASE_ERROR', '计划记录归档失败，所有记录均保持原状。')
    }
  }

  deleteFileExecutions(rawRequest: DeleteFileExecutionsRequest): DeleteFileExecutionsResult {
    const request = deleteFileExecutionsRequestSchema.parse(rawRequest)
    const workspace = this.workspaceRepository.getActiveWorkspace()
    if (!workspace) throw new PublicError('WORKSPACE_REQUIRED', '请先创建或选择模板工作区。')
    try {
      const result = this.metadataRepository.deleteRolledBackExecutions(
        workspace.id,
        request.executionIds,
      )
      if (!result) {
        throw new PublicError(
          'INVALID_REQUEST',
          '只有当前工作区中已撤销的执行记录可以删除；仍可撤销的记录请先从备份撤销。',
        )
      }
      return result
    } catch (error) {
      if (error instanceof PublicError) throw error
      throw new PublicError('DATABASE_ERROR', '执行记录删除失败，所有记录均保持原状。')
    }
  }

  cancelFilePlan(planId: string): FileChangePlan {
    const plan = this.metadataRepository.cancelPlan(planId)
    if (!plan) throw new PublicError('INVALID_REQUEST', '文件计划不存在或已结束。')
    return plan
  }

  listFilePlans(): FileChangePlan[] {
    const workspace = this.workspaceRepository.getActiveWorkspace()
    return workspace ? this.metadataRepository.listPlans(workspace.id) : []
  }

  listFilePlansPage(request: FileHistoryPageRequest): FileChangePlanPage {
    const workspace = this.workspaceRepository.getActiveWorkspace()
    return workspace
      ? this.metadataRepository.listPlansPage(workspace.id, request)
      : {
          draftCount: 0,
          items: [],
          nextAction: null,
          nextCursor: null,
          processedCount: 0,
          totalCount: 0,
          truncated: false,
          truncatedReason: null,
        }
  }

  listFileExecutions(): FileChangeExecution[] {
    const workspace = this.workspaceRepository.getActiveWorkspace()
    return workspace ? this.metadataRepository.listExecutions(workspace.id) : []
  }

  listFileExecutionsPage(request: FileHistoryPageRequest): FileChangeExecutionPage {
    const workspace = this.workspaceRepository.getActiveWorkspace()
    return workspace
      ? this.metadataRepository.listExecutionsPage(workspace.id, request)
      : {
          items: [],
          nextAction: null,
          nextCursor: null,
          processedCount: 0,
          totalCount: 0,
          truncated: false,
          truncatedReason: null,
        }
  }

  async redraftFilePlan(planId: string): Promise<FileChangePlan> {
    const workspace = this.workspaceRepository.getActiveWorkspace()
    const sourcePlan = this.metadataRepository.getPlan(planId)
    if (
      !workspace ||
      !sourcePlan ||
      this.metadataRepository.getPlanWorkspaceId(planId) !== workspace.id
    ) {
      throw new PublicError('INVALID_REQUEST', '原文件计划不存在或不属于当前工作区。')
    }
    const executions = this.metadataRepository.listExecutions(workspace.id)
    const wasRolledBack = executions.some(
      execution => execution.planId === planId && execution.status === 'rolled-back',
    )
    if (sourcePlan.status !== 'cancelled' && !wasRolledBack) {
      throw new PublicError('INVALID_REQUEST', '只有已取消或已回滚的计划可以重新草拟。')
    }
    if (this.metadataRepository.listPlans(workspace.id).some(plan => plan.status === 'draft')) {
      throw new PublicError('INVALID_REQUEST', '请先处理当前待确认计划，再重新草拟历史计划。')
    }

    const templates = this.workspaceRepository.listTemplates(workspace.id)
    const templateByPath = new Map(templates.map(template => [template.relativePath, template]))
    const audit = await this.auditService.auditWorkspace()
    const deletablePaths = new Set(
      audit.issues
        .filter(issue => issue.kind === 'duplicate-content' || issue.kind === 'similar-content')
        .flatMap(issue => issue.paths.slice(1)),
    )
    const root = await resolveAuthorizedRoot(workspace.rootPath)
    const operations = []
    for (const oldOperation of sourcePlan.operations) {
      const template = templateByPath.get(oldOperation.sourcePath)
      if (!template) continue
      await resolveAuthorizedFile(root, template.relativePath)
      if (
        oldOperation.kind === 'delete' &&
        sourcePlan.model !== 'manual-delete' &&
        !deletablePaths.has(template.relativePath)
      ) {
        continue
      }
      if (oldOperation.kind === 'move') {
        const targetPath = normalizeTemplateRelativePath(oldOperation.targetPath)
        const targetAbsolute = join(root, ...targetPath.split('/'))
        const targetExists = await lstat(targetAbsolute)
          .then(() => true)
          .catch(error => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
            throw error
          })
        if (
          targetExists ||
          extname(targetPath).toLowerCase() !== template.extension.toLowerCase()
        ) {
          continue
        }
        operations.push({
          ...oldOperation,
          id: randomUUID(),
          precondition: await this.safety.createOperationPrecondition(root, template, true),
          sourcePath: template.relativePath,
          templateId: template.id,
          targetPath,
        })
      } else {
        operations.push({
          ...oldOperation,
          id: randomUUID(),
          precondition: await this.safety.createOperationPrecondition(root, template, false),
          sourcePath: template.relativePath,
          templateId: template.id,
        })
      }
    }
    if (operations.length === 0) {
      throw new PublicError('INVALID_REQUEST', '当前文件状态下没有可重新草拟的有效操作。')
    }
    return this.metadataRepository.createPlan(
      workspace.id,
      sourcePlan.providerName,
      sourcePlan.model,
      operations,
      {
        contextVersion: sourcePlan.contextVersion,
        diagnostic: { ...sourcePlan.diagnostic, requestId: null },
        outputLanguage: sourcePlan.outputLanguage,
        summary: sourcePlan.summary,
      },
    )
  }
}
