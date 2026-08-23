import { CircleCheck, Database, LoaderCircle, TriangleAlert } from 'lucide-react'

import type { DataDiagnostics, DataIntegrityIssue } from '@core/contracts/data-management'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

interface DataHealthSummaryProps {
  disabled: boolean
  diagnostics: DataDiagnostics | null
  interruptedOperationCount: number
  isChecking: boolean
  onNavigateToAiManagement: () => void
  onRefresh: () => void
}

function issueLabel(kind: DataIntegrityIssue['kind'], t: ReturnType<typeof useI18n>['t']) {
  switch (kind) {
    case 'batch-backup-without-record':
      return t('发现没有对应记录的批量导入备份')
    case 'database-foreign-key':
      return t('数据库中的关联关系不完整')
    case 'database-quick-check':
      return t('数据库完整性检查未通过')
    case 'file-execution-backup-missing':
      return t('文件执行记录缺少撤销备份')
    case 'file-plan-backup-without-record':
      return t('发现没有对应执行记录的撤销备份')
    case 'image-file-missing':
      return t('题目图片记录对应的文件缺失')
    case 'image-record-orphaned':
      return t('发现没有对应题目的图片记录')
    case 'orphan-image-file':
      return t('发现没有对应记录的题目图片文件')
    case 'residual-trash':
      return t('题目图片回收区仍有残留')
    case 'temporary-file':
      return t('发现上次操作留下的临时文件')
  }
}

function severityLabel(
  severity: DataIntegrityIssue['severity'],
  t: ReturnType<typeof useI18n>['t'],
) {
  if (severity === 'error') return t('需要处理')
  if (severity === 'warning') return t('需要检查')
  return t('提示')
}

export function DataHealthSummary({
  disabled,
  diagnostics,
  interruptedOperationCount,
  isChecking,
  onNavigateToAiManagement,
  onRefresh,
}: DataHealthSummaryProps) {
  const { t } = useI18n()
  const issues = diagnostics?.issues ?? []
  const issueCount = issues.reduce((total, issue) => total + issue.count, 0)
  const hasError = issues.some(issue => issue.severity === 'error')
  const needsAttention = issueCount > 0 || interruptedOperationCount > 0
  const title = isChecking
    ? t('正在检查本地数据…')
    : !diagnostics
      ? t('暂时无法确认数据状态')
      : hasError
        ? t('发现需要处理的数据问题')
        : needsAttention
          ? t('发现需要检查的数据项目')
          : t('数据状态正常')
  const detail = !diagnostics
    ? t('请重新检查；检查本身不会修改任何用户文件。')
    : interruptedOperationCount > 0
      ? t('上一次数据操作未完成，请先查看安全处理方式。')
      : issueCount > 0
        ? t('发现 {count} 项需要检查的数据；应用不会自动删除或修复。', {
            count: issueCount,
          })
        : t('当前工作区的题目图片和关键撤销备份未发现问题。')

  return (
    <section className="content-card rounded-2xl border border-border p-5 shadow-panel">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={
            needsAttention || !diagnostics
              ? 'grid size-10 shrink-0 place-items-center rounded-xl bg-warning/12 text-warning ring-1 ring-warning/14'
              : 'grid size-10 shrink-0 place-items-center rounded-xl bg-success/12 text-success ring-1 ring-success/14'
          }
        >
          {isChecking ? (
            <LoaderCircle aria-hidden="true" className="size-4.5 animate-spin" />
          ) : needsAttention || !diagnostics ? (
            <TriangleAlert aria-hidden="true" className="size-4.5" />
          ) : (
            <CircleCheck aria-hidden="true" className="size-4.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{t('数据状态')}</h2>
            {!isChecking && diagnostics && (
              <Badge tone={needsAttention ? 'warning' : 'success'}>
                {needsAttention ? t('需要检查') : t('正常')}
              </Badge>
            )}
          </div>
          <p aria-live="polite" className="mt-1 text-xs font-medium">
            {title}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
        <Button
          disabled={disabled || isChecking}
          onClick={onRefresh}
          size="compact"
          type="button"
          variant="outline"
        >
          {isChecking ? (
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <Database aria-hidden="true" className="size-3.5" />
          )}
          {t('重新检查')}
        </Button>
      </div>

      {issues.length > 0 && (
        <details className="mt-4 border-t border-border pt-4">
          <summary className="cursor-pointer text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t('查看检查详情')}
          </summary>
          <div className="mt-3 grid gap-2">
            {issues.map(issue => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/25 px-3 py-2 text-xs"
                key={issue.kind}
              >
                <span>{issueLabel(issue.kind, t)}</span>
                <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  {severityLabel(issue.severity, t)} · {t('{count} 项', { count: issue.count })}
                  {issue.kind === 'file-execution-backup-missing' && (
                    <Button
                      aria-label={t('前往 AI 管理处理失效执行记录')}
                      onClick={onNavigateToAiManagement}
                      size="compact"
                      type="button"
                      variant="ghost"
                    >
                      {t('前往 AI 管理处理')}
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
