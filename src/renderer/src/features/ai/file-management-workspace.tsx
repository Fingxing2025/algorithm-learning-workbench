import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FolderSearch,
  LoaderCircle,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  FileChangeExecution,
  FileChangePlan,
  FilePlanRequestPreview,
  FileHistoryDeletionPreview,
  InvalidFileExecutionDeletionPreview,
  InvalidFileExecutionItem,
  WorkspaceAudit,
} from '@core/contracts/template-management'
import type { WorkspaceSnapshot } from '@core/contracts/workspace'
import type { BackgroundTaskStatus } from '@core/contracts/background-task'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AiRequestPreviewDialog } from '@/components/ai-request-preview-dialog'
import { TaskProgressIndicator } from '@/components/task-progress-indicator'
import { activeElementOrNull } from '@/lib/focus-management'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { runTrackedOperation, waitForBackgroundTask } from '@/lib/background-task'

import { FileManagementAuditPanel } from './file-management-audit-panel'
import { FileManagementHistoryPanel } from './file-management-history-panel'
import { FileManagementInvalidExecutionsPanel } from './file-management-invalid-executions-panel'
import {
  FileManagementPlanReviewPanel,
  type FileManagementPlanReviewSelectionPreset,
} from './file-management-plan-review-panel'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。'
}

export function FileManagementWorkspace({
  onOpenSettings,
  onWorkspaceChanged,
  workspace,
}: {
  onOpenSettings: () => void
  onWorkspaceChanged: (workspace: WorkspaceSnapshot) => void
  workspace: WorkspaceSnapshot | null
}) {
  const { locale, t } = useI18n()
  const [audit, setAudit] = useState<WorkspaceAudit | null>(null)
  const [auditTask, setAuditTask] = useState<BackgroundTaskStatus | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [operationTask, setOperationTask] = useState<BackgroundTaskStatus | null>(null)
  const [confirmDeletePlanPreview, setConfirmDeletePlanPreview] =
    useState<FileHistoryDeletionPreview | null>(null)
  const [confirmDeleteExecutionPreview, setConfirmDeleteExecutionPreview] =
    useState<FileHistoryDeletionPreview | null>(null)
  const [confirmRollbackId, setConfirmRollbackId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [executions, setExecutions] = useState<FileChangeExecution[]>([])
  const [executionCursor, setExecutionCursor] = useState<string | null>(null)
  const [executionTotalCount, setExecutionTotalCount] = useState(0)
  const [invalidExecutions, setInvalidExecutions] = useState<InvalidFileExecutionItem[]>([])
  const [invalidExecutionCursor, setInvalidExecutionCursor] = useState<string | null>(null)
  const [invalidExecutionTotalCount, setInvalidExecutionTotalCount] = useState(0)
  const [invalidExecutionPreview, setInvalidExecutionPreview] =
    useState<InvalidFileExecutionDeletionPreview | null>(null)
  const [invalidExecutionSelection, setInvalidExecutionSelection] = useState<Set<string>>(
    () => new Set(),
  )
  const [isLoadingInvalidExecutions, setIsLoadingInvalidExecutions] = useState(true)
  const [filePlanPreview, setFilePlanPreview] = useState<FilePlanRequestPreview | null>(null)
  const [filePlanRequestId, setFilePlanRequestId] = useState<string | null>(null)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [plans, setPlans] = useState<FileChangePlan[]>([])
  const [planReviewSelectionPreset, setPlanReviewSelectionPreset] =
    useState<FileManagementPlanReviewSelectionPreset | null>(null)
  const [planCursor, setPlanCursor] = useState<string | null>(null)
  const [planTotalCount, setPlanTotalCount] = useState(0)
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false)
  const [selectedHistoryPlanId, setSelectedHistoryPlanId] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const confirmDeleteExecutionButtonRef = useRef<HTMLButtonElement>(null)
  const confirmDeleteInvalidExecutionButtonRef = useRef<HTMLButtonElement>(null)
  const executionDeleteReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const invalidExecutionDeleteReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const executionSectionRef = useRef<HTMLDivElement>(null)
  const previewReturnFocusRef = useRef<HTMLElement | null>(null)
  const draftPlan = useMemo(() => plans.find(plan => plan.status === 'draft') ?? null, [plans])
  const deletableExecutions = executions.filter(execution => !execution.rollbackIssue)
  const historyPlans = useMemo(() => plans.filter(plan => plan.status !== 'draft'), [plans])

  const refreshHistory = async () => {
    setIsLoadingInvalidExecutions(true)
    try {
      const [planPage, executionPage, invalidExecutionPage] = await Promise.all([
        window.desktop.templateManagement.listFilePlansPage({ cursor: null, limit: 50 }),
        window.desktop.templateManagement.listFileExecutionsPage({ cursor: null, limit: 50 }),
        window.desktop.templateManagement.listInvalidFileExecutionsPage({
          cursor: null,
          limit: 50,
        }),
      ])
      setPlans(planPage.items)
      setPlanCursor(planPage.nextCursor)
      setPlanTotalCount(planPage.totalCount)
      setExecutions(executionPage.items)
      setExecutionCursor(executionPage.nextCursor)
      setExecutionTotalCount(executionPage.totalCount)
      setInvalidExecutions(invalidExecutionPage.items)
      setInvalidExecutionCursor(invalidExecutionPage.nextCursor)
      setInvalidExecutionTotalCount(invalidExecutionPage.totalCount)
      setInvalidExecutionSelection(new Set())
      setInvalidExecutionPreview(null)
    } finally {
      setIsLoadingInvalidExecutions(false)
    }
  }

  const loadMoreInvalidExecutions = async () => {
    if (!invalidExecutionCursor || isLoadingInvalidExecutions) return
    setIsLoadingInvalidExecutions(true)
    try {
      const page = await window.desktop.templateManagement.listInvalidFileExecutionsPage({
        cursor: invalidExecutionCursor,
        limit: 50,
      })
      setInvalidExecutions(current => {
        const known = new Set(current.map(execution => execution.id))
        return [...current, ...page.items.filter(execution => !known.has(execution.id))]
      })
      setInvalidExecutionCursor(page.nextCursor)
      setInvalidExecutionTotalCount(page.totalCount)
    } catch (caught) {
      setError(t(errorMessage(caught)))
    } finally {
      setIsLoadingInvalidExecutions(false)
    }
  }

  const loadMorePlans = async () => {
    if (!planCursor || isLoadingMoreHistory) return
    setIsLoadingMoreHistory(true)
    try {
      const page = await window.desktop.templateManagement.listFilePlansPage({
        cursor: planCursor,
        limit: 50,
      })
      setPlans(current => {
        const known = new Set(current.map(plan => plan.id))
        return [...current, ...page.items.filter(plan => !known.has(plan.id))]
      })
      setPlanCursor(page.nextCursor)
      setPlanTotalCount(page.totalCount)
    } catch (caught) {
      setError(t(errorMessage(caught)))
    } finally {
      setIsLoadingMoreHistory(false)
    }
  }

  const loadMoreExecutions = async () => {
    if (!executionCursor || isLoadingMoreHistory) return
    setIsLoadingMoreHistory(true)
    try {
      const page = await window.desktop.templateManagement.listFileExecutionsPage({
        cursor: executionCursor,
        limit: 50,
      })
      setExecutions(current => {
        const known = new Set(current.map(execution => execution.id))
        return [...current, ...page.items.filter(execution => !known.has(execution.id))]
      })
      setExecutionCursor(page.nextCursor)
      setExecutionTotalCount(page.totalCount)
    } catch (caught) {
      setError(t(errorMessage(caught)))
    } finally {
      setIsLoadingMoreHistory(false)
    }
  }

  useEffect(() => {
    if (!workspace) return
    void refreshHistory().catch(caught => setError(t(errorMessage(caught))))
  }, [t, workspace])

  useEffect(() => {
    if (selectedHistoryPlanId && historyPlans.some(plan => plan.id === selectedHistoryPlanId))
      return
    setSelectedHistoryPlanId(historyPlans[0]?.id ?? null)
  }, [historyPlans, selectedHistoryPlanId])

  const run = async (action: string, operation: () => Promise<void>) => {
    setBusyAction(action)
    setError(null)
    setSuccess(null)
    try {
      await operation()
    } catch (caught) {
      const message = errorMessage(caught)
      if (action === 'generate' && message.includes('取消')) {
        setSuccess(t('AI 生成已取消，未创建计划或修改文件。'))
      } else {
        setError(t(message))
      }
    } finally {
      setBusyAction(null)
    }
  }

  const auditWorkspace = () =>
    run('audit', async () => {
      const initial = await window.desktop.templateManagement.startAudit({
        requestId: crypto.randomUUID(),
      })
      const completed = await waitForBackgroundTask(initial, setAuditTask)
      if (completed.state === 'cancelled') {
        setSuccess(t('只读审计已取消，现有索引和用户文件保持不变。'))
        return
      }
      if (completed.result?.kind !== 'workspace-audit') return
      setAudit(completed.result.audit)
      setSuccess(
        t('只读扫描完成：发现 {count} 项建议。', {
          count: completed.result.audit.issues.length,
        }),
      )
    })

  const cancelAudit = async () => {
    if (!auditTask) return
    try {
      const status = await window.desktop.backgroundTasks.cancel({ taskId: auditTask.id })
      setAuditTask(status)
      setBusyAction(null)
      setSuccess(t('只读审计已取消，现有索引和用户文件保持不变。'))
    } catch (caught) {
      setError(t(errorMessage(caught)))
    }
  }

  const previewPlan = () => {
    previewReturnFocusRef.current = activeElementOrNull()
    return run('preview', async () => {
      const requestId = crypto.randomUUID()
      const preview = await window.desktop.templateManagement.previewFilePlan({
        includeNotes,
        outputLanguage: locale,
        requestId,
      })
      setFilePlanRequestId(requestId)
      setFilePlanPreview(preview)
    })
  }

  useEffect(() => {
    if (confirmDeleteExecutionPreview) confirmDeleteExecutionButtonRef.current?.focus()
  }, [confirmDeleteExecutionPreview])

  useEffect(() => {
    if (invalidExecutionPreview) confirmDeleteInvalidExecutionButtonRef.current?.focus()
  }, [invalidExecutionPreview])

  const restoreExecutionDeleteFocus = () => {
    window.requestAnimationFrame(() => {
      const trigger = executionDeleteReturnFocusRef.current
      if (trigger?.isConnected && !trigger.disabled) trigger.focus()
      else executionSectionRef.current?.focus()
    })
  }

  const openExecutionDeleteConfirmation = (executionIds: string[], trigger: HTMLButtonElement) => {
    executionDeleteReturnFocusRef.current = trigger
    void run('preview-delete-executions', async () => {
      const preview = await window.desktop.templateManagement.previewDeleteFileExecutions({
        executionIds,
      })
      setConfirmDeleteExecutionPreview(preview)
    })
  }

  const closeExecutionDeleteConfirmation = () => {
    setConfirmDeleteExecutionPreview(null)
    restoreExecutionDeleteFocus()
  }

  const restoreInvalidExecutionDeleteFocus = () => {
    window.requestAnimationFrame(() => {
      const trigger = invalidExecutionDeleteReturnFocusRef.current
      if (trigger?.isConnected && !trigger.disabled) trigger.focus()
    })
  }

  const previewInvalidExecutionCleanup = (trigger: HTMLButtonElement) => {
    invalidExecutionDeleteReturnFocusRef.current = trigger
    void run('preview-delete-invalid-executions', async () => {
      const preview = await window.desktop.templateManagement.previewDeleteInvalidFileExecutions({
        executionIds: [...invalidExecutionSelection],
      })
      setInvalidExecutionPreview(preview)
    })
  }

  const closeInvalidExecutionPreview = () => {
    setInvalidExecutionPreview(null)
    restoreInvalidExecutionDeleteFocus()
  }

  const deleteInvalidExecutions = (preview: InvalidFileExecutionDeletionPreview) =>
    run('delete-invalid-executions', async () => {
      setInvalidExecutionPreview(null)
      const requestId = crypto.randomUUID()
      setOperationTask(null)
      try {
        const result = await runTrackedOperation(
          requestId,
          () =>
            window.desktop.templateManagement.deleteInvalidFileExecutions({
              confirmed: true,
              previewId: preview.previewId,
              requestId,
            }),
          setOperationTask,
        )
        await refreshHistory()
        setSuccess(
          t('已清理 {count} 条失效执行记录；当前工作区文件未修改。', {
            count: result.deletedExecutionCount,
          }),
        )
      } finally {
        restoreInvalidExecutionDeleteFocus()
      }
    })

  const generatePlan = () => {
    if (!filePlanRequestId || !filePlanPreview) return
    void run('generate', async () => {
      const requestId = filePlanRequestId
      setOperationTask(null)
      let plan: FileChangePlan
      try {
        plan = await runTrackedOperation(
          requestId,
          () =>
            window.desktop.templateManagement.generateFilePlan({
              previewId: filePlanPreview.filePlan.previewId,
              requestId,
            }),
          setOperationTask,
        )
      } catch (caught) {
        setFilePlanPreview(null)
        setFilePlanRequestId(null)
        throw caught
      }
      setPlans(current => [plan, ...current.filter(item => item.id !== plan.id)])
      setPlanReviewSelectionPreset({
        operationIds: plan.operations
          .filter(operation => operation.selectedByDefault)
          .map(({ id }) => id),
        planId: plan.id,
      })
      setFilePlanPreview(null)
      setFilePlanRequestId(null)
      setSuccess(
        t('AI 已生成 {count} 项可审查操作，尚未修改文件。', { count: plan.operations.length }),
      )
    })
  }

  const cancelGeneration = () => {
    if (!filePlanRequestId) return
    const requestId = filePlanRequestId
    setFilePlanPreview(null)
    setFilePlanRequestId(null)
    void window.desktop.templateManagement.cancelFilePlanGeneration(requestId)
  }

  const exportDiagnostic = (planId: string | null) =>
    run('diagnostic', async () => {
      const exported = await window.desktop.templateManagement.exportFilePlanDiagnostic(planId)
      if (exported) setSuccess(t('安全诊断已导出；不包含路径、源码、笔记或密钥。'))
    })

  const cancelPlan = (planId: string) => {
    void run('cancel', async () => {
      const plan = await window.desktop.templateManagement.cancelFilePlan(planId)
      setPlans(current => [plan, ...current.filter(item => item.id !== plan.id)])
      setPlanReviewSelectionPreset(null)
      setSuccess(t('计划已取消，工作区文件未发生变化。'))
    })
  }

  const applyPlan = async (planId: string, operationIds: string[]): Promise<boolean> => {
    let applied = false
    await run('apply', async () => {
      const requestId = crypto.randomUUID()
      setOperationTask(null)
      const result = await runTrackedOperation(
        requestId,
        () =>
          window.desktop.templateManagement.applyFilePlan({
            operationIds,
            planId,
            requestId,
          }),
        setOperationTask,
      )
      onWorkspaceChanged(result.workspace)
      await refreshHistory()
      setPlanReviewSelectionPreset(null)
      setSuccess(
        t('已执行 {count} 项操作，并保留撤销备份。', {
          count: result.execution?.operationCount ?? 0,
        }),
      )
      applied = true
    })
    return applied
  }

  const rollback = (executionId: string) =>
    run('rollback', async () => {
      const requestId = crypto.randomUUID()
      setOperationTask(null)
      const result = await runTrackedOperation(
        requestId,
        () => window.desktop.templateManagement.rollbackFileExecution(executionId, requestId),
        setOperationTask,
      )
      onWorkspaceChanged(result.workspace)
      await refreshHistory()
      setConfirmRollbackId(null)
      setSuccess(t('已从备份撤销文件计划。'))
    })

  const redraft = (planId: string) =>
    run('redraft', async () => {
      const plan = await window.desktop.templateManagement.redraftFilePlan(planId)
      setPlans(current => [plan, ...current.filter(item => item.id !== plan.id)])
      setPlanReviewSelectionPreset({
        operationIds: plan.operations
          .filter(operation => operation.selectedByDefault)
          .map(({ id }) => id),
        planId: plan.id,
      })
      setSuccess(
        t('已重新校验并创建 {count} 项新草稿；旧计划记录保持不变。', {
          count: plan.operations.length,
        }),
      )
    })

  const requestDeletePlans = (planIds: string[]) =>
    run('preview-delete-plans', async () => {
      const preview = await window.desktop.templateManagement.previewDeleteFilePlans({ planIds })
      setConfirmDeletePlanPreview(preview)
    })

  const deletePlans = (preview: FileHistoryDeletionPreview) =>
    run('delete-plans', async () => {
      const requestId = crypto.randomUUID()
      setOperationTask(null)
      const result = await runTrackedOperation(
        requestId,
        () =>
          window.desktop.templateManagement.deleteFilePlans({
            confirmed: true,
            previewId: preview.previewId,
            requestId,
          }),
        setOperationTask,
      )
      await refreshHistory()
      setConfirmDeletePlanPreview(null)
      setSuccess(
        t(
          '已永久删除 {count} 份计划、{executions} 条子执行和 {backups} 份撤销备份；当前模板文件未修改。',
          {
            backups: result.deletedBackupDirectoryCount,
            count: result.deletedPlanCount,
            executions: result.deletedExecutionCount,
          },
        ),
      )
    })

  const deleteExecutions = (preview: FileHistoryDeletionPreview) =>
    run('delete-executions', async () => {
      const requestId = crypto.randomUUID()
      setOperationTask(null)
      const result = await runTrackedOperation(
        requestId,
        () =>
          window.desktop.templateManagement.deleteFileExecutions({
            confirmed: true,
            previewId: preview.previewId,
            requestId,
          }),
        setOperationTask,
      )
      await refreshHistory()
      setConfirmDeleteExecutionPreview(null)
      setSuccess(
        t('已永久删除 {count} 条执行记录和 {backups} 份撤销备份；当前模板文件未修改。', {
          backups: result.deletedBackupDirectoryCount,
          count: result.deletedExecutionCount,
        }),
      )
      restoreExecutionDeleteFocus()
    })

  if (!workspace) {
    return (
      <main className="grid h-full min-h-0 place-items-center p-8 text-center">
        <div className="max-w-sm">
          <FolderSearch className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-base font-semibold">{t('先连接模板工作区')}</h1>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {t('文件 AI 管理只处理用户明确授权的当前工作区；Provider 配置仍可独立使用。')}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="workspace-stage flex h-full min-h-0 flex-col overflow-hidden">
      <header className="glass-section-header flex min-h-[62px] flex-wrap items-center gap-3 border-b border-warning/16 px-5 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/12 text-warning ring-1 ring-warning/15">
          <Sparkles aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight">{t('总体文件 AI 管理')}</h1>
            <Badge tone="warning">
              {workspace.summary.templateCount} {t('个模板')}
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('AI 仅接收路径、元数据和受限源码片段；文件操作始终需要二次确认')}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-2.5 text-[11px] text-muted-foreground">
            <input
              checked={includeNotes}
              className="size-3.5 accent-primary"
              disabled={Boolean(busyAction) || Boolean(draftPlan)}
              onChange={event => setIncludeNotes(event.target.checked)}
              type="checkbox"
            />
            {t('允许发送模板用户笔记')}
          </label>
          <Button onClick={onOpenSettings} size="compact" type="button" variant="ghost">
            <Settings2 className="size-3.5" />
            {t('AI 设置')}
          </Button>
          {busyAction === 'audit' ? (
            <Button
              onClick={() => void cancelAudit()}
              size="compact"
              type="button"
              variant="outline"
            >
              <X className="size-3.5" />
              {t('取消审计')}
            </Button>
          ) : (
            <Button
              disabled={Boolean(busyAction)}
              onClick={() => void auditWorkspace()}
              size="compact"
              type="button"
              variant="outline"
            >
              <FolderSearch className="size-3.5" />
              {t('只读扫描')}
            </Button>
          )}
          <Button
            disabled={Boolean(busyAction) || Boolean(draftPlan)}
            onClick={() => void previewPlan()}
            size="compact"
            type="button"
          >
            {busyAction === 'preview' ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {t('生成 AI 计划')}
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto p-5 lg:p-6">
        <div
          aria-hidden="true"
          className="app-grid-texture pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        />
        <div className="relative mx-auto max-w-[1180px]">
          {busyAction === 'generate' && !operationTask && (
            <div
              aria-atomic="true"
              aria-live="polite"
              className="mb-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/6 px-3 py-2.5 text-xs"
              role="status"
            >
              <LoaderCircle className="size-4 animate-spin text-primary" />
              <span className="min-w-0 flex-1">
                {t('正在分析审计结果、工作区分类和相关源码；可以随时取消。')}
              </span>
              <Button onClick={cancelGeneration} size="compact" type="button" variant="outline">
                {t('取消生成')}
              </Button>
            </div>
          )}
          {busyAction && operationTask && (
            <div className="mb-4 space-y-2">
              <TaskProgressIndicator status={operationTask} title="批量任务" />
              {busyAction === 'generate' && (
                <div className="flex justify-end">
                  <Button onClick={cancelGeneration} size="compact" type="button" variant="outline">
                    {t('取消生成')}
                  </Button>
                </div>
              )}
            </div>
          )}
          {(error || success) && (
            <div
              aria-atomic="true"
              aria-live={error ? 'assertive' : 'polite'}
              className={cn(
                'mb-4 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-xs',
                error
                  ? 'border-red-500/25 bg-red-500/5 text-red-700 dark:text-red-300'
                  : 'border-success/25 bg-success/8',
              )}
              role={error ? 'alert' : 'status'}
            >
              {error ? (
                <AlertTriangle className="size-4" />
              ) : (
                <CheckCircle2 className="size-4 text-success" />
              )}
              <span>{t(error ?? success ?? '')}</span>
              <button
                aria-label={t('关闭文件管理提示')}
                className="ml-auto rounded p-0.5"
                onClick={() => {
                  setError(null)
                  setSuccess(null)
                }}
                type="button"
              >
                <X className="size-3.5" />
              </button>
              {error && (
                <p className="ml-6 basis-full text-[11px] leading-5 text-muted-foreground">
                  {t(
                    '生成失败不会创建计划或修改文件。若问题与模型、鉴权或格式有关，请前往 AI 设置检查任务路由和模型能力。',
                  )}
                </p>
              )}
              {error && (
                <Button
                  className="ml-6"
                  disabled={Boolean(busyAction)}
                  onClick={() => void exportDiagnostic(draftPlan?.id ?? null)}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  <Download className="size-3.5" />
                  {t('导出安全诊断')}
                </Button>
              )}
            </div>
          )}

          <FileManagementInvalidExecutionsPanel
            busyAction={busyAction}
            confirmButtonRef={confirmDeleteInvalidExecutionButtonRef}
            cursor={invalidExecutionCursor}
            isLoading={isLoadingInvalidExecutions}
            items={invalidExecutions}
            onCancelPreview={closeInvalidExecutionPreview}
            onConfirm={deleteInvalidExecutions}
            onLoadMore={loadMoreInvalidExecutions}
            onPreview={previewInvalidExecutionCleanup}
            onToggle={(executionId, checked) => {
              setInvalidExecutionPreview(null)
              setInvalidExecutionSelection(current => {
                const next = new Set(current)
                if (checked) next.add(executionId)
                else next.delete(executionId)
                return next
              })
            }}
            preview={invalidExecutionPreview}
            selectedIds={invalidExecutionSelection}
            totalCount={invalidExecutionTotalCount}
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <FileManagementPlanReviewPanel
              busyAction={busyAction}
              draftPlan={draftPlan}
              key={draftPlan?.id ?? 'no-draft'}
              onApplyPlan={applyPlan}
              onCancelPlan={cancelPlan}
              onExportDiagnostic={exportDiagnostic}
              selectionPreset={planReviewSelectionPreset}
            />

            <div className="space-y-4">
              <FileManagementAuditPanel audit={audit} auditTask={auditTask} />

              <FileManagementHistoryPanel
                busyAction={busyAction}
                confirmDeletePlanPreview={confirmDeletePlanPreview}
                confirmDeleteExecutionButtonRef={confirmDeleteExecutionButtonRef}
                confirmDeleteExecutionPreview={confirmDeleteExecutionPreview}
                confirmRollbackId={confirmRollbackId}
                deletableExecutions={deletableExecutions}
                executionCursor={executionCursor}
                executionSectionRef={executionSectionRef}
                executionTotalCount={executionTotalCount}
                executions={executions}
                hasDraftPlan={Boolean(draftPlan)}
                historyPlans={historyPlans}
                isLoadingMoreHistory={isLoadingMoreHistory}
                onCancelDeletePlans={() => setConfirmDeletePlanPreview(null)}
                onCancelRollback={() => setConfirmRollbackId(null)}
                onCloseExecutionDeleteConfirmation={closeExecutionDeleteConfirmation}
                onConfirmDeletePlans={deletePlans}
                onConfirmDeleteExecutions={deleteExecutions}
                onConfirmRollback={rollback}
                onLoadMoreExecutions={loadMoreExecutions}
                onLoadMorePlans={loadMorePlans}
                onOpenExecutionDeleteConfirmation={openExecutionDeleteConfirmation}
                onRedraft={redraft}
                onRequestDeletePlans={requestDeletePlans}
                onRequestRollback={setConfirmRollbackId}
                onSelectHistoryPlan={setSelectedHistoryPlanId}
                planCursor={planCursor}
                planTotalCount={planTotalCount}
                plans={plans}
                selectedHistoryPlanId={selectedHistoryPlanId}
              />
            </div>
          </div>
        </div>
      </div>
      {filePlanPreview && (
        <AiRequestPreviewDialog
          allowCancelWhileBusy
          busy={busyAction === 'generate'}
          onCancel={() => {
            if (busyAction === 'generate') cancelGeneration()
            else {
              setFilePlanPreview(null)
              setFilePlanRequestId(null)
            }
          }}
          onConfirm={generatePlan}
          preview={filePlanPreview}
          returnFocusTo={previewReturnFocusRef.current}
          taskStatus={operationTask}
        />
      )}
    </main>
  )
}
