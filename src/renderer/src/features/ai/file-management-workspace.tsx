import {
  AlertTriangle,
  CheckCircle2,
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

import type {
  FileChangeExecution,
  FileChangeOperation,
  FileChangePlan,
  WorkspaceAudit,
} from '@core/contracts/template-management'
import type { WorkspaceSnapshot } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。'
}

function operationLabel(operation: FileChangeOperation): string {
  if (operation.kind === 'move') return '移动 / 重命名'
  if (operation.kind === 'delete') return '删除重复文件'
  return '更新算法元数据'
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
  const [audit, setAudit] = useState<WorkspaceAudit | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [confirmApply, setConfirmApply] = useState(false)
  const [confirmRollbackId, setConfirmRollbackId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [executions, setExecutions] = useState<FileChangeExecution[]>([])
  const [plans, setPlans] = useState<FileChangePlan[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [success, setSuccess] = useState<string | null>(null)
  const draftPlan = useMemo(() => plans.find(plan => plan.status === 'draft') ?? null, [plans])
  const cancelledPlans = useMemo(() => plans.filter(plan => plan.status === 'cancelled'), [plans])

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
    void refreshHistory().catch(caught => setError(errorMessage(caught)))
  }, [workspace])

  const run = async (action: string, operation: () => Promise<void>) => {
    setBusyAction(action)
    setError(null)
    setSuccess(null)
    try {
      await operation()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyAction(null)
    }
  }

  const auditWorkspace = () =>
    run('audit', async () => {
      const value = await window.desktop.templateManagement.auditWorkspace()
      setAudit(value)
      setSuccess(`只读扫描完成：发现 ${value.issues.length} 项建议。`)
    })

  const generatePlan = () =>
    run('generate', async () => {
      const plan = await window.desktop.templateManagement.generateFilePlan()
      setPlans(current => [plan, ...current.filter(item => item.id !== plan.id)])
      setSelectedIds(new Set(plan.operations.map(operation => operation.id)))
      setSuccess(`AI 已生成 ${plan.operations.length} 项可审查操作，尚未修改文件。`)
    })

  const cancelPlan = () => {
    if (!draftPlan) return
    void run('cancel', async () => {
      const plan = await window.desktop.templateManagement.cancelFilePlan(draftPlan.id)
      setPlans(current => [plan, ...current.filter(item => item.id !== plan.id)])
      setSelectedIds(new Set())
      setConfirmApply(false)
      setSuccess('计划已取消，工作区文件未发生变化。')
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
      setSuccess(`已执行 ${result.execution?.operationCount ?? 0} 项操作，并保留撤销备份。`)
    })
  }

  const rollback = (executionId: string) =>
    run('rollback', async () => {
      const result = await window.desktop.templateManagement.rollbackFileExecution(executionId)
      onWorkspaceChanged(result.workspace)
      await refreshHistory()
      setConfirmRollbackId(null)
      setSuccess('已从备份撤销文件计划。')
    })

  const redraft = (planId: string) =>
    run('redraft', async () => {
      const plan = await window.desktop.templateManagement.redraftFilePlan(planId)
      setPlans(current => [plan, ...current.filter(item => item.id !== plan.id)])
      setSelectedIds(new Set(plan.operations.map(operation => operation.id)))
      setSuccess(`已重新校验并创建 ${plan.operations.length} 项新草稿；旧计划记录保持不变。`)
    })

  if (!workspace) {
    return (
      <main className="grid h-full min-h-0 place-items-center p-8 text-center">
        <div className="max-w-sm">
          <FolderSearch className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-base font-semibold">先连接模板工作区</h1>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            文件 AI 管理只处理用户明确授权的当前工作区；Provider 配置仍可独立使用。
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
            <h1 className="text-[15px] font-semibold tracking-tight">总体文件 AI 管理</h1>
            <Badge tone="warning">{workspace.summary.templateCount} 个模板</Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            AI 仅接收路径、元数据和受限源码片段；文件操作始终需要二次确认
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button onClick={onOpenSettings} size="compact" type="button" variant="ghost">
            <Settings2 className="size-3.5" />
            AI 设置
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
            只读扫描
          </Button>
          <Button
            disabled={Boolean(busyAction) || Boolean(draftPlan)}
            onClick={() => void generatePlan()}
            size="compact"
            type="button"
          >
            {busyAction === 'generate' ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            生成 AI 计划
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto p-5 lg:p-6">
        <div
          aria-hidden="true"
          className="app-grid-texture pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        />
        <div className="relative mx-auto max-w-[1180px]">
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
              <span>{error ?? success}</span>
              <button
                aria-label="关闭文件管理提示"
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
                  生成失败不会创建计划或修改文件。若问题与模型、鉴权或格式有关，请前往“AI
                  设置”检查任务路由和模型能力。
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-2xl border border-warning/18 bg-panel p-5 shadow-focus">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">待确认变更计划</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    勾选要执行的项目，未选项目不会写入。
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
                    <p className="mt-3 text-xs font-medium">没有待确认计划</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      建议先运行只读扫描，再请求 AI 生成计划。
                    </p>
                  </div>
                </div>
              ) : draftPlan.operations.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                  AI 没有生成通过本地安全校验的操作。可取消本计划后重试。
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {draftPlan.operations.map(operation => (
                    <label
                      className="interactive-lift flex gap-3 rounded-xl border border-border bg-background/65 p-3 hover:border-warning/25"
                      key={operation.id}
                    >
                      <input
                        aria-label={`选择操作 ${operation.sourcePath}`}
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
                        <span className="flex items-center gap-2 text-xs font-semibold">
                          <Badge>{operationLabel(operation)}</Badge>
                          {operation.sourcePath}
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
                            标签：{operation.metadata.tags.join('、') || '无'} · 时间复杂度：
                            {operation.metadata.timeComplexity ?? '未知'}
                          </span>
                        )}
                        <span className="mt-2 block text-[11px] leading-5 text-muted-foreground">
                          {operation.reason}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {draftPlan && (
                <footer className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <Button
                    disabled={Boolean(busyAction)}
                    onClick={cancelPlan}
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    取消计划
                  </Button>
                  {confirmApply ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-warning">
                        将备份后执行 {selectedIds.size} 项操作
                      </span>
                      <Button
                        disabled={Boolean(busyAction) || selectedIds.size === 0}
                        onClick={applyPlan}
                        size="compact"
                        type="button"
                      >
                        <Play className="size-3.5" />
                        确认执行
                      </Button>
                      <Button
                        onClick={() => setConfirmApply(false)}
                        size="compact"
                        type="button"
                        variant="outline"
                      >
                        返回
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
                      预览并执行
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
                  <h2 className="text-sm font-semibold">只读审计</h2>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {audit
                    ? `${audit.issues.length} 项 · ${new Date(audit.generatedAt).toLocaleTimeString('zh-CN')}`
                    : '尚未扫描'}
                </p>
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                  {audit?.issues.slice(0, 40).map(issue => (
                    <article
                      className="rounded-xl border border-border bg-background/60 p-2.5"
                      key={issue.id}
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone={issue.severity === 'warning' ? 'accent' : 'neutral'}>
                          {issue.kind}
                        </Badge>
                        <span className="truncate text-[11px] font-medium">
                          {issue.paths.join('、')}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                        {issue.detail}
                      </p>
                    </article>
                  ))}
                  {audit && audit.issues.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      未发现确定性问题。
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-panel p-4 shadow-panel">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <RotateCcw className="size-4" />
                  </span>
                  <h2 className="text-sm font-semibold">执行与撤销</h2>
                </div>
                <div className="mt-3 space-y-2">
                  {executions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">暂无文件执行记录。</p>
                  ) : (
                    executions.slice(0, 6).map(execution => (
                      <article
                        className="rounded-lg border border-border bg-background/60 p-3"
                        key={execution.id}
                      >
                        <div className="flex items-center gap-2">
                          <Badge tone={execution.status === 'applied' ? 'success' : 'neutral'}>
                            {execution.status === 'applied' ? '已执行' : '已撤销'}
                          </Badge>
                          <span className="text-[11px]">{execution.operationCount} 项</span>
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
                                确认撤销
                              </Button>
                              <Button
                                onClick={() => setConfirmRollbackId(null)}
                                size="compact"
                                type="button"
                                variant="ghost"
                              >
                                取消
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
                              从备份撤销
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
                            复制为新计划
                          </Button>
                        )}
                      </article>
                    ))
                  )}
                </div>
                {cancelledPlans.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      已取消计划
                    </p>
                    <div className="space-y-2">
                      {cancelledPlans.slice(0, 4).map(plan => (
                        <article
                          className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-2.5"
                          key={plan.id}
                        >
                          <span className="min-w-0 flex-1 text-[11px]">
                            {plan.operations.length} 项 · {plan.providerName}
                          </span>
                          <Button
                            disabled={Boolean(busyAction) || Boolean(draftPlan)}
                            onClick={() => void redraft(plan.id)}
                            size="compact"
                            type="button"
                            variant="ghost"
                          >
                            复制为新计划
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
    </main>
  )
}
