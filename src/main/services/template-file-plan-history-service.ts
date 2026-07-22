import { lstat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'

import {
  deleteFileExecutionsRequestSchema,
  deleteFilePlansRequestSchema,
  previewDeleteFileExecutionsRequestSchema,
  previewDeleteFilePlansRequestSchema,
  type DeleteFilePlansRequest,
  type DeleteFilePlansResult,
  type DeleteFileExecutionsRequest,
  type DeleteFileExecutionsResult,
  type FileChangeExecution,
  type FileChangeExecutionPage,
  type FileChangePlan,
  type FileChangePlanPage,
  type FileHistoryDeletionPreview,
  type FileHistoryPageRequest,
  type PreviewDeleteFileExecutionsRequest,
  type PreviewDeleteFilePlansRequest,
} from '@core/contracts/template-management'

import {
  TemplateManagementRepository,
  type FileExecutionDeletionRecord,
  type FilePlanDeletionRecord,
} from '../database/template-management-repository'
import { WorkspaceRepository } from '../database/workspace-repository'
import { PublicError } from '../errors/public-error'
import { resolveAuthorizedFile, resolveAuthorizedRoot } from '../security/path-guard'
import { normalizeTemplateRelativePath } from '../security/template-path'
import { TemplateFilePlanSafety } from './template-file-plan-safety'
import { TemplateWorkspaceAuditService } from './template-workspace-audit-service'
import type { DataLifecycleService } from './data-lifecycle-service'

const HISTORY_DELETION_PREVIEW_TTL_MS = 10 * 60 * 1_000

type StoredHistoryDeletionPreview =
  | {
      executions: FileExecutionDeletionRecord[]
      expiresAtMs: number
      kind: 'executions'
      preview: FileHistoryDeletionPreview
      workspaceId: string
    }
  | {
      expiresAtMs: number
      kind: 'plans'
      plans: FilePlanDeletionRecord[]
      preview: FileHistoryDeletionPreview
      workspaceId: string
    }

export class TemplateFilePlanHistoryService {
  private readonly deletionPreviews = new Map<string, StoredHistoryDeletionPreview>()

  constructor(
    private readonly metadataRepository: TemplateManagementRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly auditService: TemplateWorkspaceAuditService,
    private readonly safety: TemplateFilePlanSafety,
    private readonly lifecycleService: Pick<
      DataLifecycleService,
      'executeManagedHistoryDeletion' | 'inspectManagedHistoryBackups'
    > | null = null,
  ) {}

  async previewDeleteFileExecutions(
    rawRequest: PreviewDeleteFileExecutionsRequest,
  ): Promise<FileHistoryDeletionPreview> {
    const request = previewDeleteFileExecutionsRequestSchema.parse(rawRequest)
    const workspace = this.workspaceRepository.getActiveWorkspace()
    if (!workspace) throw new PublicError('WORKSPACE_REQUIRED', '请先创建或选择模板工作区。')
    const records = this.metadataRepository.inspectFileExecutionsForDeletion(
      workspace.id,
      request.executionIds,
    )
    if (!records) {
      throw new PublicError(
        'INVALID_REQUEST',
        '执行记录不存在、不属于当前工作区或状态已变化，未删除任何记录。',
      )
    }
    const backupInspection = await this.getLifecycleService().inspectManagedHistoryBackups(
      records.map(record => record.backupDirectory),
    )
    const preview = this.buildDeletionPreview({
      appliedExecutionCount: records.filter(record => record.status === 'applied').length,
      backupDirectoryCount: backupInspection.existingRelativePaths.length,
      executionCount: records.length,
      kind: 'executions',
      missingBackupDirectoryCount: backupInspection.missingCount,
      recordIds: request.executionIds,
      rolledBackExecutionCount: records.filter(record => record.status === 'rolled-back').length,
    })
    this.deletionPreviews.set(preview.previewId, {
      executions: records,
      expiresAtMs: Date.parse(preview.expiresAt),
      kind: 'executions',
      preview,
      workspaceId: workspace.id,
    })
    return preview
  }

  async deleteFileExecutions(
    rawRequest: DeleteFileExecutionsRequest,
  ): Promise<DeleteFileExecutionsResult> {
    const request = deleteFileExecutionsRequestSchema.parse(rawRequest)
    const stored = this.takeDeletionPreview(request.previewId, 'executions')
    const lifecycleResult = await this.getLifecycleService().executeManagedHistoryDeletion(
      stored.executions.map(record => record.backupDirectory),
      operationId => {
        const result = this.metadataRepository.deleteFileExecutions(
          stored.workspaceId,
          stored.executions,
          operationId,
        )
        if (!result) {
          throw new PublicError(
            'INVALID_REQUEST',
            '执行记录或撤销备份信息在确认后发生变化，未删除任何记录。',
          )
        }
        return result
      },
    )
    return {
      cleanupPending: lifecycleResult.cleanupPending,
      deletedAt: lifecycleResult.result.deletedAt,
      deletedBackupDirectoryCount: lifecycleResult.deletedBackupDirectoryCount,
      deletedExecutionCount: lifecycleResult.result.deletedExecutionCount,
      deletedPlanCount: 0,
      kind: 'executions',
      missingBackupDirectoryCount: lifecycleResult.missingBackupDirectoryCount,
      recordIds: stored.preview.recordIds,
    }
  }

  async previewDeleteFilePlans(
    rawRequest: PreviewDeleteFilePlansRequest,
  ): Promise<FileHistoryDeletionPreview> {
    const request = previewDeleteFilePlansRequestSchema.parse(rawRequest)
    const workspace = this.workspaceRepository.getActiveWorkspace()
    if (!workspace) throw new PublicError('WORKSPACE_REQUIRED', '请先创建或选择模板工作区。')
    const plans = this.metadataRepository.inspectFilePlansForDeletion(workspace.id, request.planIds)
    if (!plans) {
      throw new PublicError(
        'INVALID_REQUEST',
        '计划不存在、不属于当前工作区、仍为草稿或状态已变化，未删除任何记录。',
      )
    }
    const executions = plans.flatMap(plan => plan.executions)
    const backupInspection = await this.getLifecycleService().inspectManagedHistoryBackups(
      executions.map(record => record.backupDirectory),
    )
    const rolledBackPlanIds = new Set(
      plans
        .filter(plan => plan.executions.some(record => record.status === 'rolled-back'))
        .map(plan => plan.id),
    )
    const preview = this.buildDeletionPreview({
      appliedExecutionCount: executions.filter(record => record.status === 'applied').length,
      appliedPlanCount: plans.filter(
        plan => plan.status === 'applied' && !rolledBackPlanIds.has(plan.id),
      ).length,
      archivedPlanCount: plans.filter(plan => plan.archivedAt !== null).length,
      backupDirectoryCount: backupInspection.existingRelativePaths.length,
      cancelledPlanCount: plans.filter(plan => plan.status === 'cancelled').length,
      executionCount: executions.length,
      kind: 'plans',
      missingBackupDirectoryCount: backupInspection.missingCount,
      planCount: plans.length,
      recordIds: request.planIds,
      rolledBackExecutionCount: executions.filter(record => record.status === 'rolled-back').length,
      rolledBackPlanCount: rolledBackPlanIds.size,
    })
    this.deletionPreviews.set(preview.previewId, {
      expiresAtMs: Date.parse(preview.expiresAt),
      kind: 'plans',
      plans,
      preview,
      workspaceId: workspace.id,
    })
    return preview
  }

  async deleteFilePlans(rawRequest: DeleteFilePlansRequest): Promise<DeleteFilePlansResult> {
    const request = deleteFilePlansRequestSchema.parse(rawRequest)
    const stored = this.takeDeletionPreview(request.previewId, 'plans')
    const executions = stored.plans.flatMap(plan => plan.executions)
    const lifecycleResult = await this.getLifecycleService().executeManagedHistoryDeletion(
      executions.map(record => record.backupDirectory),
      operationId => {
        const result = this.metadataRepository.deleteFilePlans(
          stored.workspaceId,
          stored.plans,
          operationId,
        )
        if (!result) {
          throw new PublicError(
            'INVALID_REQUEST',
            '计划、子执行或撤销备份信息在确认后发生变化，未删除任何记录。',
          )
        }
        return result
      },
    )
    return {
      cleanupPending: lifecycleResult.cleanupPending,
      deletedAt: lifecycleResult.result.deletedAt,
      deletedBackupDirectoryCount: lifecycleResult.deletedBackupDirectoryCount,
      deletedExecutionCount: lifecycleResult.result.deletedExecutionCount,
      deletedPlanCount: lifecycleResult.result.deletedPlanCount,
      kind: 'plans',
      missingBackupDirectoryCount: lifecycleResult.missingBackupDirectoryCount,
      recordIds: stored.preview.recordIds,
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

  listArchivedFilePlansPage(request: FileHistoryPageRequest): FileChangePlanPage {
    const workspace = this.workspaceRepository.getActiveWorkspace()
    return workspace
      ? this.metadataRepository.listArchivedPlansPage(workspace.id, request)
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

  private buildDeletionPreview(
    input: Partial<FileHistoryDeletionPreview> &
      Pick<FileHistoryDeletionPreview, 'kind' | 'recordIds'>,
  ): FileHistoryDeletionPreview {
    const previewId = randomUUID()
    return {
      appliedExecutionCount: input.appliedExecutionCount ?? 0,
      appliedPlanCount: input.appliedPlanCount ?? 0,
      archivedPlanCount: input.archivedPlanCount ?? 0,
      backupDirectoryCount: input.backupDirectoryCount ?? 0,
      cancelledPlanCount: input.cancelledPlanCount ?? 0,
      executionCount: input.executionCount ?? 0,
      expiresAt: new Date(Date.now() + HISTORY_DELETION_PREVIEW_TTL_MS).toISOString(),
      kind: input.kind,
      missingBackupDirectoryCount: input.missingBackupDirectoryCount ?? 0,
      planCount: input.planCount ?? 0,
      previewId,
      recordIds: input.recordIds,
      rolledBackExecutionCount: input.rolledBackExecutionCount ?? 0,
      rolledBackPlanCount: input.rolledBackPlanCount ?? 0,
    }
  }

  private getLifecycleService(): NonNullable<TemplateFilePlanHistoryService['lifecycleService']> {
    if (!this.lifecycleService) {
      throw new PublicError('UNKNOWN', '历史删除服务尚未就绪，请重启应用后重试。')
    }
    return this.lifecycleService
  }

  private takeDeletionPreview<Kind extends StoredHistoryDeletionPreview['kind']>(
    previewId: string,
    kind: Kind,
  ): Extract<StoredHistoryDeletionPreview, { kind: Kind }> {
    const stored = this.deletionPreviews.get(previewId)
    this.deletionPreviews.delete(previewId)
    const workspace = this.workspaceRepository.getActiveWorkspace()
    if (
      !stored ||
      stored.kind !== kind ||
      stored.expiresAtMs <= Date.now() ||
      !workspace ||
      workspace.id !== stored.workspaceId
    ) {
      throw new PublicError('INVALID_REQUEST', '删除预览不存在、已过期或工作区已变化，请重新预览。')
    }
    return stored as Extract<StoredHistoryDeletionPreview, { kind: Kind }>
  }
}
