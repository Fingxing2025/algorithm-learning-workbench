import { AlertTriangle, LoaderCircle, Trash2 } from 'lucide-react'
import type { RefObject } from 'react'

import type {
  InvalidFileExecutionDeletionPreview,
  InvalidFileExecutionItem,
} from '@core/contracts/template-management'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

function reasonLabel(item: InvalidFileExecutionItem, t: ReturnType<typeof useI18n>['t']) {
  switch (item.reason) {
    case 'backup-missing':
      return t('撤销备份已缺失')
    case 'backup-reference-invalid':
      return t('备份引用格式异常，无法自动处理')
    case 'backup-path-symbolic-link':
      return t('备份位置是符号链接，无法自动处理')
    case 'backup-path-not-directory':
      return t('备份位置不是普通目录，无法自动处理')
    case 'backup-path-unreadable':
      return t('无法安全读取备份位置')
  }
}

export interface FileManagementInvalidExecutionsPanelProps {
  busyAction: string | null
  confirmButtonRef: RefObject<HTMLButtonElement | null>
  cursor: string | null
  isLoading: boolean
  items: InvalidFileExecutionItem[]
  onCancelPreview: () => void
  onConfirm: (preview: InvalidFileExecutionDeletionPreview) => void | Promise<void>
  onLoadMore: () => void | Promise<void>
  onPreview: (trigger: HTMLButtonElement) => void
  onToggle: (executionId: string, checked: boolean) => void
  preview: InvalidFileExecutionDeletionPreview | null
  selectedIds: ReadonlySet<string>
  totalCount: number
}

export function FileManagementInvalidExecutionsPanel({
  busyAction,
  confirmButtonRef,
  cursor,
  isLoading,
  items,
  onCancelPreview,
  onConfirm,
  onLoadMore,
  onPreview,
  onToggle,
  preview,
  selectedIds,
  totalCount,
}: FileManagementInvalidExecutionsPanelProps) {
  const { locale, t } = useI18n()
  if (!isLoading && items.length === 0) return null

  const selectedCount = items.filter(item => selectedIds.has(item.id)).length
  const blockedCount = items.filter(item => !item.deletable).length

  return (
    <section
      aria-labelledby="invalid-file-executions-title"
      className="mb-4 rounded-2xl border border-warning/30 bg-warning/6 p-4 shadow-panel"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/14 text-warning ring-1 ring-warning/20">
          <AlertTriangle aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold" id="invalid-file-executions-title">
              {t('失效执行记录')}
            </h2>
            <Badge tone="warning">{t('{count} 项', { count: totalCount })}</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t(
              '这里只显示当前工作区的记录。撤销备份已经缺失或状态异常；清理记录不会修改当前模板文件。',
            )}
          </p>
        </div>
        <Button
          disabled={Boolean(busyAction) || selectedCount === 0}
          onClick={event => onPreview(event.currentTarget)}
          size="compact"
          type="button"
          variant="outline"
        >
          {busyAction === 'preview-delete-invalid-executions' ? (
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" className="size-3.5" />
          )}
          {t('清理所选失效记录')} · {selectedCount}
        </Button>
      </div>

      {preview && (
        <div className="mt-3 rounded-xl border border-warning/30 bg-background/75 p-3 text-xs leading-5">
          <p className="font-semibold text-foreground">
            {t('将清理当前工作区的 {count} 条失效执行记录。', {
              count: preview.executionCount,
            })}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(
              '撤销能力在本次操作前已经丢失。本次只删除历史记录，父计划和当前文件保持不变；清理后记录无法恢复。',
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              disabled={Boolean(busyAction)}
              onClick={() => void onConfirm(preview)}
              ref={confirmButtonRef}
              size="compact"
              type="button"
              variant="outline"
            >
              {t('确认清理失效记录')}
            </Button>
            <Button
              disabled={Boolean(busyAction)}
              onClick={onCancelPreview}
              size="compact"
              type="button"
              variant="ghost"
            >
              {t('取消')}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading && items.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            {t('正在检查当前工作区的失效执行记录…')}
          </div>
        ) : (
          items.map(item => (
            <label
              className="flex min-w-0 items-start gap-2 rounded-xl border border-border bg-background/70 p-3"
              key={item.id}
            >
              <input
                aria-label={`${t('选择失效执行记录')} ${item.workspaceName}`}
                checked={selectedIds.has(item.id)}
                className="mt-0.5 size-3.5 accent-primary"
                disabled={Boolean(busyAction) || !item.deletable}
                onChange={event => onToggle(item.id, event.target.checked)}
                type="checkbox"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-xs font-medium">{item.workspaceName}</span>
                  <Badge tone={item.deletable ? 'warning' : 'neutral'}>
                    {item.deletable ? t('可清理') : t('受保护')}
                  </Badge>
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString(locale)} ·{' '}
                  {item.operationCount === null
                    ? t('操作数量未知')
                    : t('{count} 项操作', { count: item.operationCount })}
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  {reasonLabel(item, t)}
                </span>
              </span>
            </label>
          ))
        )}
      </div>

      {(cursor || blockedCount > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {blockedCount > 0 &&
            t('{count} 项状态异常记录已受保护，不会进入清理预览。', {
              count: blockedCount,
            })}
          {cursor && (
            <Button
              className="ml-auto"
              disabled={Boolean(busyAction) || isLoading}
              onClick={() => void onLoadMore()}
              size="compact"
              type="button"
              variant="ghost"
            >
              {isLoading && <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />}
              {t('加载更多失效记录')} · {items.length} / {totalCount}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
