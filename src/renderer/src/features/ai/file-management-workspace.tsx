import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileClock,
  FolderSearch,
  LoaderCircle,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { AiRequestPreview } from '@core/contracts/ai-request'
import type {
  FileChangeExecution,
  FileChangeOperation,
  FileChangePlan,
  WorkspaceAudit,
} from '@core/contracts/template-management'
import type { WorkspaceSnapshot } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AiRequestPreviewDialog } from '@/components/ai-request-preview-dialog'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。'
}

function operationLabel(operation: FileChangeOperation): string {
  if (operation.kind === 'move') return '移动 / 重命名'
  if (operation.kind === 'delete') return '删除重复文件'
  return '更新算法元数据'
}

function operationGroupLabel(operation: FileChangeOperation): string {
  const source = operation.source === 'local-audit' ? '本地审计' : 'AI 建议'
  const risk =
    operation.risk === 'high' ? '高风险' : operation.risk === 'medium' ? '中风险' : '低风险'
  return `${source} · ${operationLabel(operation)} · ${risk}`
}

type AuditIssue = WorkspaceAudit['issues'][number]

const auditIssueLabels: Record<AuditIssue['kind'], string> = {
  'duplicate-content': '完全重复',
  'empty-file': '空文件',
  'invalid-name': '命名异常',
  'missing-metadata': '缺失元数据',
  'similar-content': '高度相似',
  'stale-relation': '失效关联',
}

function auditIssueDetail(
  issue: AuditIssue,
  t: (source: string, variables?: Record<string, number | string>) => string,
): string {
  if (issue.kind === 'missing-metadata') return t('算法卡片尚未补充结构化元数据。')
  if (issue.kind === 'invalid-name')
    return t('文件名可能包含副本标记或不一致空格，建议人工确认命名。')
  if (issue.kind === 'empty-file') return t('模板文件为空。')
  if (issue.kind === 'duplicate-content')
    return t('这些模板源码规范化后完全相同；建议仅保留 {path}。', {
      path: issue.paths[0] ?? '',
    })
  if (issue.kind === 'similar-content')
    return t('这些模板源码高度相似；建议仅保留 {path}，执行前请查看源码确认。', {
      path: issue.paths[0] ?? '',
    })
  return t('模板关联指向当前不可用的模板。')
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
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [confirmApply, setConfirmApply] = useState(false)
  const [confirmRollbackId, setConfirmRollbackId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [executions, setExecutions] = useState<FileChangeExecution[]>([])
  const [filePlanPreview, setFilePlanPreview] = useState<AiRequestPreview | null>(null)
  const [filePlanRequestId, setFilePlanRequestId] = useState<string | null>(null)
  const [plans, setPlans] = useState<FileChangePlan[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [success, setSuccess] = useState<string | null>(null)
  const draftPlan = useMemo(() => plans.find(plan => plan.status === 'draft') ?? null, [plans])
  const cancelledPlans = useMemo(() => plans.filter(plan => plan.status === 'cancelled'), [plans])
  const operationGroups = useMemo(() => {
    const groups = new Map<string, FileChangeOperation[]>()
    for (const operation of draftPlan?.operations ?? []) {
      const label = operationGroupLabel(operation)
      groups.set(label, [...(groups.get(label) ?? []), operation])
    }
    return [...groups.entries()]
  }, [draftPlan])

  const refreshHistory = async () => {
    const [nextPlans, nextExecutions] = await Promise.all([
      window.desktop.templateManagement.listFilePlans(),
      window.desktop.templateManagement.listFileExecutions(),
    ])
    setPlans(nextPlans)
    setExecutions(nextExecutions)
  }

  useEffect(() => {
    if (!workspace) return
    void refreshHistory().catch(caught => setError(t(errorMessage(caught))))
  }, [t, workspace])

  const run = async (action: string, operation: () => Promise<void>) => {
    setBusyAction(action)
    setError(null)
    setSuccess(null)
    try {
      await operation()
    } catch (caught) {
      setError(t(errorMessage(caught)))
    } finally {
      setBusyAction(null)
    }
  }

  const auditWorkspace = () =>
    run('audit', async () => {
      const value = await window.desktop.templateManagement.auditWorkspace()
      setAudit(value)
      setSuccess(t('只读扫描完成：发现 {count} 项建议。', { count: value.issues.length }))
    })

  const previewPlan = () =>
    run('preview', async () => {
      const requestId = crypto.randomUUID()
      const preview = await window.desktop.templateManagement.previewFilePlan({
        outputLanguage: locale,
        requestId,
      })
      setFilePlanRequestId(requestId)
      setFilePlanPreview(preview)
    })

  const generatePlan = () => {
    if (!filePlanRequestId || !filePlanPreview) return
    const requestId = filePlanRequestId
    const outputLanguage = filePlanPreview.outputLanguage
    void run('generate', async () => {
      let plan: FileChangePlan
      try {
        plan = await window.desktop.templateManagement.generateFilePlan({
          outputLanguage,
          requestId,
        })
      } catch (caught) {
        setFilePlanPreview(null)
        setFilePlanRequestId(null)
        throw caught
      }
      setPlans(current => [plan, ...current.filter(item => item.id !== plan.id)])
      setSelectedIds(
        new Set(
          plan.operations.filter(operation => operation.selectedByDefault).map(({ id }) => id),
        ),
      )
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

  const cancelPlan = () => {
    if (!draftPlan) return
    void run('cancel', async () => {
      const plan = await window.desktop.templateManagement.cancelFilePlan(draftPlan.id)
      setPlans(current => [plan, ...current.filter(item => item.id !== plan.id)])
      setSelectedIds(new Set())
      setConfirmApply(false)
      setSuccess(t('计划已取消，工作区文件未发生变化。'))
    })
  }

  const applyPlan = () => {
    if (!draftPlan) return
    void run('apply', async () => {
      const result = await window.desktop.templateManagement.applyFilePlan({
        operationIds: [...selectedIds],
        planId: draftPlan.id,
      })
      onWorkspaceChanged(result.workspace)
      await refreshHistory()
      setConfirmApply(false)
      setSuccess(
        t('已执行 {count} 项操作，并保留撤销备份。', {
          count: result.execution?.operationCount ?? 0,
        }),
      )
    })
  }

  const rollback = (executionId: string) =>
    run('rollback', async () => {
      const result = await window.desktop.templateManagement.rollbackFileExecution(executionId)
      onWorkspaceChanged(result.workspace)
      await refreshHistory()
      setConfirmRollbackId(null)
      setSuccess(t('已从备份撤销文件计划。'))
    })

  const redraft = (planId: string) =>
    run('redraft', async () => {
      const plan = await window.desktop.templateManagement.redraftFilePlan(planId)
      setPlans(current => [plan, ...current.filter(item => item.id !== plan.id)])
      setSelectedIds(
        new Set(
          plan.operations.filter(operation => operation.selectedByDefault).map(({ id }) => id),
        ),
      )
      setSuccess(
        t('已重新校验并创建 {count} 项新草稿；旧计划记录保持不变。', {
          count: plan.operations.length,
        }),
      )
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
      <header className="glass-section-header flex min-h-[62px] items-center gap-3 border-b border-warning/16 px-5 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/12 text-warning ring-1 ring-warning/15">
          <Sparkles aria-hidden="true" className="size-4.5" />
        </span>
        <div>
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
        <div className="ml-auto flex gap-2">
          <Button onClick={onOpenSettings} size="compact" type="button" variant="ghost">
            <Settings2 className="size-3.5" />
            {t('AI 设置')}
          </Button>
          <Button
            disabled={Boolean(busyAction)}
            onClick={() => void auditWorkspace()}
            size="compact"
            type="button"
            variant="outline"
          >
            {busyAction === 'audit' ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <FolderSearch className="size-3.5" />
            )}
            {t('只读扫描')}
          </Button>
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
          {busyAction === 'generate' && (
            <div
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
          {(error || success) && (
            <div
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

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-2xl border border-warning/18 bg-panel p-5 shadow-focus">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{t('待确认变更计划')}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('勾选要执行的项目，未选项目不会写入。')}
                  </p>
                </div>
                {draftPlan && (
                  <Badge tone="warning">
                    {draftPlan.providerName} · {draftPlan.model}
                  </Badge>
                )}
              </div>
              {!draftPlan ? (
                <div className="mt-4 grid min-h-48 place-items-center rounded-xl border border-dashed border-warning/20 bg-warning/4 text-center">
                  <div>
                    <span className="mx-auto grid size-10 place-items-center rounded-xl bg-warning/10 text-warning">
                      <FileClock className="size-5" />
                    </span>
                    <p className="mt-3 text-xs font-medium">{t('没有待确认计划')}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t('建议先运行只读扫描，再请求 AI 生成计划。')}
                    </p>
                  </div>
                </div>
              ) : draftPlan.operations.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                  {t('AI 没有生成通过本地安全校验的操作。可取消本计划后重试。')}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {draftPlan.summary && (
                    <p className="rounded-xl border border-warning/18 bg-warning/5 p-3 text-xs leading-5">
                      {draftPlan.summary}
                    </p>
                  )}
                  {operationGroups.map(([group, operations]) => (
                    <section key={group}>
                      <div className="mb-2 flex items-center gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t(operations[0]?.source === 'local-audit' ? '本地审计' : 'AI 建议')} ·{' '}
                          {t(operationLabel(operations[0]!))} ·{' '}
                          {t(
                            operations[0]?.risk === 'high'
                              ? '高风险'
                              : operations[0]?.risk === 'medium'
                                ? '中风险'
                                : '低风险',
                          )}
                        </p>
                        <Badge tone="neutral">{operations.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {operations.map(operation => (
                          <label
                            className="interactive-lift flex gap-3 rounded-xl border border-border bg-background/65 p-3 hover:border-warning/25"
                            key={operation.id}
                          >
                            <input
                              aria-label={`${t('选择操作')} ${operation.sourcePath}`}
                              checked={selectedIds.has(operation.id)}
                              className="mt-1 size-4 accent-warning"
                              onChange={event =>
                                setSelectedIds(current => {
                                  const next = new Set(current)
                                  if (event.target.checked) next.add(operation.id)
                                  else next.delete(operation.id)
                                  return next
                                })
                              }
                              type="checkbox"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                                <Badge>{t(operationLabel(operation))}</Badge>
                                <span className="break-all">{operation.sourcePath}</span>
                                {!operation.selectedByDefault && (
                                  <Badge tone="accent">{t('需手动选择')}</Badge>
                                )}
                              </span>
                              {operation.kind === 'move' && (
                                <span className="mt-2 block rounded-lg bg-muted px-3 py-2 font-mono text-[11px]">
                                  − {operation.sourcePath}
                                  <br />+ {operation.targetPath}
                                </span>
                              )}
                              {operation.kind === 'delete' && (
                                <span className="mt-2 block rounded-lg bg-red-500/5 px-3 py-2 font-mono text-[11px] text-red-600 dark:text-red-300">
                                  − {operation.sourcePath}
                                </span>
                              )}
                              {operation.kind === 'update-metadata' && (
                                <span className="mt-2 block rounded-lg bg-muted px-3 py-2 text-[11px]">
                                  {t('标签')}：{operation.metadata.tags.join('、') || t('无')} ·{' '}
                                  {t('时间复杂度')}：
                                  {operation.metadata.timeComplexity ?? t('未知')}
                                </span>
                              )}
                              <span className="mt-2 block text-[11px] leading-5 text-muted-foreground">
                                {operation.reason}
                              </span>
                              {operation.evidence.length > 0 && (
                                <span className="mt-2 block text-[11px] leading-5">
                                  <strong>{t('证据')}：</strong> {operation.evidence.join('；')}
                                </span>
                              )}
                              <span className="mt-1 block text-[10px] text-muted-foreground">
                                {t('置信度')}：{Math.round(operation.confidence * 100)}%
                                {operation.applicability.length > 0 &&
                                  ` · ${t('适用条件')}：${operation.applicability.join('；')}`}
                              </span>
                              {operation.alternatives.length > 0 && (
                                <span className="mt-1 block text-[10px] text-muted-foreground">
                                  {t('备选方案')}：{operation.alternatives.join('；')}
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              {draftPlan && (
                <footer className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <div className="flex items-center gap-2">
                    <Button
                      disabled={Boolean(busyAction)}
                      onClick={cancelPlan}
                      size="compact"
                      type="button"
                      variant="ghost"
                    >
                      {t('取消计划')}
                    </Button>
                    <Button
                      disabled={Boolean(busyAction)}
                      onClick={() => void exportDiagnostic(draftPlan.id)}
                      size="compact"
                      type="button"
                      variant="ghost"
                    >
                      <Download className="size-3.5" />
                      {t('安全诊断')}
                    </Button>
                  </div>
                  {confirmApply ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-warning">
                        {t('将备份后执行 {count} 项操作', { count: selectedIds.size })}
                      </span>
                      <Button
                        disabled={Boolean(busyAction) || selectedIds.size === 0}
                        onClick={applyPlan}
                        size="compact"
                        type="button"
                      >
                        <Play className="size-3.5" />
                        {t('确认执行')}
                      </Button>
                      <Button
                        onClick={() => setConfirmApply(false)}
                        size="compact"
                        type="button"
                        variant="outline"
                      >
                        {t('返回')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      disabled={selectedIds.size === 0 || Boolean(busyAction)}
                      onClick={() => setConfirmApply(true)}
                      size="compact"
                      type="button"
                      variant="outline"
                    >
                      {t('预览并执行')}
                    </Button>
                  )}
                </footer>
              )}
            </section>

            <div className="space-y-4">
              <section className="rounded-2xl border border-border bg-panel p-4 shadow-panel">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-success/10 text-success">
                    <FolderSearch className="size-4" />
                  </span>
                  <h2 className="text-sm font-semibold">{t('只读审计')}</h2>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {audit
                    ? `${audit.issues.length} ${t('项')} · ${new Date(audit.generatedAt).toLocaleTimeString(locale)}`
                    : t('尚未扫描')}
                </p>
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                  {audit?.issues.slice(0, 40).map(issue => (
                    <article
                      className="rounded-xl border border-border bg-background/60 p-2.5"
                      key={issue.id}
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone={issue.severity === 'warning' ? 'accent' : 'neutral'}>
                          {t(auditIssueLabels[issue.kind])}
                        </Badge>
                        <span className="truncate text-[11px] font-medium">
                          {issue.paths.join('、')}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                        {auditIssueDetail(issue, t)}
                      </p>
                    </article>
                  ))}
                  {audit && audit.issues.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      {t('未发现确定性问题。')}
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-panel p-4 shadow-panel">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <RotateCcw className="size-4" />
                  </span>
                  <h2 className="text-sm font-semibold">{t('执行与撤销')}</h2>
                </div>
                <div className="mt-3 space-y-2">
                  {executions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('暂无文件执行记录。')}</p>
                  ) : (
                    executions.slice(0, 6).map(execution => (
                      <article
                        className="rounded-lg border border-border bg-background/60 p-3"
                        key={execution.id}
                      >
                        <div className="flex items-center gap-2">
                          <Badge tone={execution.status === 'applied' ? 'success' : 'neutral'}>
                            {t(execution.status === 'applied' ? '已执行' : '已撤销')}
                          </Badge>
                          <span className="text-[11px]">
                            {execution.operationCount} {t('项')}
                          </span>
                        </div>
                        {execution.canRollback &&
                          (confirmRollbackId === execution.id ? (
                            <div className="mt-2 flex gap-2">
                              <Button
                                disabled={Boolean(busyAction)}
                                onClick={() => void rollback(execution.id)}
                                size="compact"
                                type="button"
                                variant="outline"
                              >
                                <RotateCcw className="size-3.5" />
                                {t('确认撤销')}
                              </Button>
                              <Button
                                onClick={() => setConfirmRollbackId(null)}
                                size="compact"
                                type="button"
                                variant="ghost"
                              >
                                {t('取消')}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              className="mt-2"
                              onClick={() => setConfirmRollbackId(execution.id)}
                              size="compact"
                              type="button"
                              variant="ghost"
                            >
                              <RotateCcw className="size-3.5" />
                              {t('从备份撤销')}
                            </Button>
                          ))}
                        {execution.status === 'rolled-back' && (
                          <Button
                            className="mt-2"
                            disabled={Boolean(busyAction) || Boolean(draftPlan)}
                            onClick={() => void redraft(execution.planId)}
                            size="compact"
                            type="button"
                            variant="ghost"
                          >
                            <FileClock className="size-3.5" />
                            {t('复制为新计划')}
                          </Button>
                        )}
                      </article>
                    ))
                  )}
                </div>
                {cancelledPlans.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('已取消计划')}
                    </p>
                    <div className="space-y-2">
                      {cancelledPlans.slice(0, 4).map(plan => (
                        <article
                          className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-2.5"
                          key={plan.id}
                        >
                          <span className="min-w-0 flex-1 text-[11px]">
                            {plan.operations.length} {t('项')} · {plan.providerName}
                          </span>
                          <Button
                            disabled={Boolean(busyAction) || Boolean(draftPlan)}
                            onClick={() => void redraft(plan.id)}
                            size="compact"
                            type="button"
                            variant="ghost"
                          >
                            {t('复制为新计划')}
                          </Button>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </section>
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
        />
      )}
    </main>
  )
}
