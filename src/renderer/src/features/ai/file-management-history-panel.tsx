import { FileClock, LoaderCircle, RotateCcw, Trash2 } from 'lucide-react'
import type { KeyboardEvent, RefObject } from 'react'

import type {
  FileChangeExecution,
  FileChangePlan,
  FileHistoryDeletionPreview,
} from '@core/contracts/template-management'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export interface FileManagementHistoryPanelProps {
  busyAction: string | null
  confirmDeletePlanPreview: FileHistoryDeletionPreview | null
  confirmDeleteExecutionPreview: FileHistoryDeletionPreview | null
  confirmRollbackId: string | null
  confirmDeleteExecutionButtonRef: RefObject<HTMLButtonElement | null>
  deletableExecutions: FileChangeExecution[]
  executionCursor: string | null
  executionSectionRef: RefObject<HTMLDivElement | null>
  executionTotalCount: number
  executions: FileChangeExecution[]
  historyPlans: FileChangePlan[]
  hasDraftPlan: boolean
  isLoadingMoreHistory: boolean
  onCancelDeletePlans: () => void
  onCancelRollback: () => void
  onCloseExecutionDeleteConfirmation: () => void
  onConfirmDeletePlans: (preview: FileHistoryDeletionPreview) => void | Promise<void>
  onConfirmDeleteExecutions: (preview: FileHistoryDeletionPreview) => void | Promise<void>
  onConfirmRollback: (executionId: string) => void | Promise<void>
  onLoadMoreExecutions: () => void | Promise<void>
  onLoadMorePlans: () => void | Promise<void>
  onOpenExecutionDeleteConfirmation: (executionIds: string[], trigger: HTMLButtonElement) => void
  onRedraft: (planId: string) => void | Promise<void>
  onRequestDeletePlans: (planIds: string[]) => void
  onRequestRollback: (executionId: string) => void
  onSelectHistoryPlan: (planId: string) => void
  planCursor: string | null
  planTotalCount: number
  plans: FileChangePlan[]
  selectedHistoryPlanId: string | null
}

export function FileManagementHistoryPanel({
  busyAction,
  confirmDeletePlanPreview,
  confirmDeleteExecutionPreview,
  confirmRollbackId,
  confirmDeleteExecutionButtonRef,
  deletableExecutions,
  executionCursor,
  executionSectionRef,
  executionTotalCount,
  executions,
  hasDraftPlan,
  historyPlans,
  isLoadingMoreHistory,
  onCancelDeletePlans,
  onCancelRollback,
  onCloseExecutionDeleteConfirmation,
  onConfirmDeletePlans,
  onConfirmDeleteExecutions,
  onConfirmRollback,
  onLoadMoreExecutions,
  onLoadMorePlans,
  onOpenExecutionDeleteConfirmation,
  onRedraft,
  onRequestDeletePlans,
  onRequestRollback,
  onSelectHistoryPlan,
  planCursor,
  planTotalCount,
  plans,
  selectedHistoryPlanId,
}: FileManagementHistoryPanelProps) {
  const { locale, t } = useI18n()

  const handlePlanHistoryKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.currentTarget.scrollBy({
        behavior: 'auto',
        top: event.key === 'ArrowDown' ? 48 : -48,
      })
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      event.currentTarget.scrollTop = event.key === 'Home' ? 0 : event.currentTarget.scrollHeight
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const selector = selectedHistoryPlanId
        ? `[data-plan-select="${selectedHistoryPlanId}"]`
        : '[data-plan-select]'
      const planButton = event.currentTarget.querySelector<HTMLButtonElement>(selector)
      planButton?.focus()
      planButton?.click()
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-panel p-4 shadow-panel">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <RotateCcw className="size-3.5" strokeWidth={1.8} />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{t('计划记录与撤销')}</h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {t('已加载 {processed} / {total} 份计划；确认后永久删除历史与专属撤销备份。', {
              processed: plans.length,
              total: planTotalCount,
            })}
          </p>
        </div>
        <Button
          className="ml-auto"
          disabled={Boolean(busyAction) || historyPlans.length === 0}
          onClick={() => onRequestDeletePlans(historyPlans.map(plan => plan.id))}
          size="compact"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-3.5" />
          {t('一键删除计划记录')}
        </Button>
      </div>

      {confirmDeletePlanPreview && (
        <div className="mt-3 rounded-xl border border-warning/25 bg-warning/7 p-3 text-[11px] leading-5">
          <p className="font-semibold text-foreground">
            {t(
              '将永久删除 {count} 份计划：{cancelled} 份已取消、{applied} 份已执行、{rolledBack} 份已撤销。',
              {
                applied: confirmDeletePlanPreview.appliedPlanCount,
                cancelled: confirmDeletePlanPreview.cancelledPlanCount,
                count: confirmDeletePlanPreview.planCount,
                rolledBack: confirmDeletePlanPreview.rolledBackPlanCount,
              },
            )}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(
              '同时永久删除 {executions} 条子执行和 {backups} 份现存撤销备份；另有 {missing} 份备份已缺失。当前模板文件不会恢复、移动或修改。删除后计划、执行记录和撤销能力均无法恢复。',
              {
                backups: confirmDeletePlanPreview.backupDirectoryCount,
                executions: confirmDeletePlanPreview.executionCount,
                missing: confirmDeletePlanPreview.missingBackupDirectoryCount,
              },
            )}
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              disabled={Boolean(busyAction)}
              onClick={() => void onConfirmDeletePlans(confirmDeletePlanPreview)}
              size="compact"
              type="button"
              variant="outline"
            >
              {t('确认永久删除计划记录')}
            </Button>
            <Button
              disabled={Boolean(busyAction)}
              onClick={onCancelDeletePlans}
              size="compact"
              type="button"
              variant="ghost"
            >
              {t('取消')}
            </Button>
          </div>
        </div>
      )}

      <div
        aria-label={t('文件计划历史列表')}
        className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onKeyDown={handlePlanHistoryKeyDown}
        role="region"
        tabIndex={0}
      >
        {historyPlans.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            {t('暂无可删除计划记录。')}
          </p>
        ) : (
          historyPlans.map(plan => (
            <article
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border bg-background/60 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selectedHistoryPlanId === plan.id
                  ? 'border-primary/30 bg-primary/6'
                  : 'border-border',
              )}
              key={plan.id}
            >
              <button
                aria-pressed={selectedHistoryPlanId === plan.id}
                className="flex min-w-0 flex-1 items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-plan-select={plan.id}
                onClick={() => onSelectHistoryPlan(plan.id)}
                type="button"
              >
                <Badge tone={plan.status === 'applied' ? 'success' : 'neutral'}>
                  {t(plan.status === 'applied' ? '已执行' : '已取消')}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[11px]">
                  {plan.operations.length} {t('项')} · {plan.providerName}
                </span>
              </button>
              {plan.status === 'cancelled' && (
                <Button
                  disabled={Boolean(busyAction) || hasDraftPlan}
                  onClick={() => void onRedraft(plan.id)}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  {t('复制为新计划')}
                </Button>
              )}
              <Button
                aria-label={`${t('删除计划记录')} ${plan.providerName}`}
                disabled={Boolean(busyAction)}
                onClick={() => onRequestDeletePlans([plan.id])}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-3.5 text-red-500" />
              </Button>
            </article>
          ))
        )}
        {planCursor && (
          <Button
            className="w-full"
            disabled={isLoadingMoreHistory}
            onClick={() => void onLoadMorePlans()}
            size="compact"
            type="button"
            variant="outline"
          >
            {isLoadingMoreHistory && <LoaderCircle className="size-3.5 animate-spin" />}
            {t('加载更多计划记录')} · {plans.length} / {planTotalCount}
          </Button>
        )}
      </div>

      <div
        className="mt-3 border-t border-border pt-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ref={executionSectionRef}
        tabIndex={-1}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('执行与撤销')}
          </p>
          <span className="text-[10px] text-muted-foreground">
            {executions.length} / {executionTotalCount}
          </span>
          <Button
            className="ml-auto"
            disabled={Boolean(busyAction) || deletableExecutions.length === 0}
            onClick={event =>
              onOpenExecutionDeleteConfirmation(
                deletableExecutions.map(execution => execution.id),
                event.currentTarget,
              )
            }
            size="compact"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
            {t('一键删除执行记录')}
          </Button>
        </div>
        {confirmDeleteExecutionPreview && (
          <div className="mb-3 rounded-xl border border-warning/25 bg-warning/7 p-3 text-[11px] leading-5">
            <p className="font-semibold text-foreground">
              {t('将永久删除 {count} 条执行记录：{applied} 条已执行、{rolledBack} 条已撤销。', {
                applied: confirmDeleteExecutionPreview.appliedExecutionCount,
                count: confirmDeleteExecutionPreview.executionCount,
                rolledBack: confirmDeleteExecutionPreview.rolledBackExecutionCount,
              })}
            </p>
            <p className="mt-1 text-muted-foreground">
              {t(
                '将永久删除 {backups} 份现存撤销备份，另有 {missing} 份已缺失；当前模板、题目、关系和源码不会被撤销或修改。已执行记录删除后无法再从备份撤销，本次历史删除无法恢复。',
                {
                  backups: confirmDeleteExecutionPreview.backupDirectoryCount,
                  missing: confirmDeleteExecutionPreview.missingBackupDirectoryCount,
                },
              )}
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                disabled={Boolean(busyAction)}
                onClick={() => void onConfirmDeleteExecutions(confirmDeleteExecutionPreview)}
                ref={confirmDeleteExecutionButtonRef}
                size="compact"
                type="button"
                variant="outline"
              >
                {t('确认永久删除执行记录')}
              </Button>
              <Button
                disabled={Boolean(busyAction)}
                onClick={onCloseExecutionDeleteConfirmation}
                size="compact"
                type="button"
                variant="ghost"
              >
                {t('取消')}
              </Button>
            </div>
          </div>
        )}
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {executions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('暂无文件执行记录。')}</p>
          ) : (
            executions.map(execution => (
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
                        onClick={() => void onConfirmRollback(execution.id)}
                        size="compact"
                        type="button"
                        variant="outline"
                      >
                        <RotateCcw className="size-3.5" />
                        {t('确认撤销')}
                      </Button>
                      <Button
                        onClick={onCancelRollback}
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
                      onClick={() => onRequestRollback(execution.id)}
                      size="compact"
                      type="button"
                      variant="ghost"
                    >
                      <RotateCcw className="size-3.5" />
                      {t('从备份撤销')}
                    </Button>
                  ))}
                {execution.rollbackIssue && (
                  <p className="mt-2 text-[11px] font-medium text-warning">
                    {t(
                      execution.rollbackIssue === 'backup-missing'
                        ? '撤销备份已缺失，请在上方失效执行记录中处理。'
                        : '撤销备份状态异常，已阻止自动撤销和删除。',
                    )}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {execution.status === 'rolled-back' && (
                    <Button
                      disabled={Boolean(busyAction) || hasDraftPlan}
                      onClick={() => void onRedraft(execution.planId)}
                      size="compact"
                      type="button"
                      variant="ghost"
                    >
                      <FileClock aria-hidden="true" className="size-3.5" />
                      {t('复制为新计划')}
                    </Button>
                  )}
                  {!execution.rollbackIssue && (
                    <Button
                      aria-label={`${t('永久删除执行记录')} · ${new Date(execution.createdAt).toLocaleString(locale)}`}
                      disabled={Boolean(busyAction)}
                      onClick={event =>
                        onOpenExecutionDeleteConfirmation([execution.id], event.currentTarget)
                      }
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" className="size-3.5 text-red-500" />
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
          {executionCursor && (
            <Button
              className="w-full"
              disabled={isLoadingMoreHistory}
              onClick={() => void onLoadMoreExecutions()}
              size="compact"
              type="button"
              variant="outline"
            >
              {isLoadingMoreHistory && <LoaderCircle className="size-3.5 animate-spin" />}
              {t('加载更多执行记录')} · {executions.length} / {executionTotalCount}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
