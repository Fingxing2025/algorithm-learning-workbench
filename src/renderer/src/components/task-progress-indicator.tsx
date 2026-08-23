import { LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { BackgroundTaskStatus } from '@core/contracts/background-task'

import { useI18n } from '@/lib/i18n'

const phaseLabels: Record<BackgroundTaskStatus['progress']['phase'], string> = {
  'backing-up': '正在创建安全备份',
  cleaning: '正在清理临时数据',
  'duplicate-groups': '正在整理重复分组',
  discovering: '正在发现文件',
  finalizing: '正在完成收尾',
  'index-check': '正在检查模板索引',
  indexing: '正在读取并建立索引',
  preparing: '正在准备任务',
  processing: '正在处理结果',
  publishing: '正在发布结果',
  queued: '任务正在排队',
  'requesting-ai': '正在等待 Provider 响应',
  restoring: '正在恢复数据',
  similarity: '正在比较相似内容',
  validating: '正在校验数据',
  verifying: '正在验证结果',
  writing: '正在写入数据',
}

export function TaskProgressIndicator({
  status,
  title,
}: {
  status: BackgroundTaskStatus
  title?: string
}) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())
  const active = ['queued', 'running', 'cancelling'].includes(status.state)

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [active])

  const elapsedSeconds = Math.max(
    0,
    Math.floor(
      ((status.finishedAt ? Date.parse(status.finishedAt) : now) - Date.parse(status.startedAt)) /
        1_000,
    ),
  )
  const { currentItem, processedCount, totalCount } = status.progress
  const percentage = useMemo(
    () =>
      totalCount && totalCount > 0
        ? Math.min(100, Math.round((processedCount / totalCount) * 100))
        : null,
    [processedCount, totalCount],
  )

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="rounded-xl border border-primary/20 bg-primary/6 px-3 py-2.5 text-xs"
      data-testid="task-progress"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2">
        {active && (
          <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin text-primary" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {title ? `${t(title)} · ` : ''}
          {t(phaseLabels[status.progress.phase])}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {totalCount === null
            ? t('已处理 {processed}', { processed: processedCount })
            : t('已处理 {processed} / {total}', {
                processed: processedCount,
                total: totalCount,
              })}
          {' · '}
          {t('已等待 {seconds} 秒', { seconds: elapsedSeconds })}
        </span>
      </div>
      {percentage !== null && (
        <div
          aria-label={t('任务进度 {percentage}%', { percentage })}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percentage}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/12"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      {currentItem && (
        <p className="mt-2 truncate text-[11px] text-muted-foreground" title={currentItem}>
          {t('当前项')}：{t(currentItem)}
        </p>
      )}
    </div>
  )
}
