import { LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react'

import type {
  BackupLifecycleInventory,
  InterruptedRecoveryPreview,
} from '@core/contracts/data-management'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

interface DataInterruptedRecoveryPanelProps {
  confirmRecovery: boolean
  disabled: boolean
  interruptedOperationCount: number
  interruptedOperations: BackupLifecycleInventory['interruptedOperations']
  isRecovering: boolean
  onConfirmRecoveryChange: (confirmed: boolean) => void
  onPreview: (operationId: string) => void
  onRecover: () => void
  preview: InterruptedRecoveryPreview | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

export function DataInterruptedRecoveryPanel({
  confirmRecovery,
  disabled,
  interruptedOperationCount,
  interruptedOperations,
  isRecovering,
  onConfirmRecoveryChange,
  onPreview,
  onRecover,
  preview,
}: DataInterruptedRecoveryPanelProps) {
  const { t } = useI18n()

  const interruptedKindLabel = (
    kind: BackupLifecycleInventory['interruptedOperations'][number]['kind'],
  ) => {
    switch (kind) {
      case 'cleanup-operation':
        return t('中断的隔离操作')
      case 'restore-marker':
        return t('恢复提交标记')
      case 'restore-operation':
        return t('中断的恢复操作')
      case 'unknown':
        return t('未知临时残留')
    }
  }

  const interruptedActionLabel = (
    action: BackupLifecycleInventory['interruptedOperations'][number]['action'],
  ) => {
    switch (action) {
      case 'clear-history-deletion-marker':
        return t('清理已完成历史删除标记')
      case 'clear-restore-marker':
        return t('清理已完成恢复标记')
      case 'complete-history-deletion':
        return t('完成已提交历史删除的备份清理')
      case 'complete-restore':
        return t('完成已提交恢复的收尾')
      case 'none':
        return t('仅保护，不执行')
      case 'restore-preflight':
        return t('恢复到操作前状态')
      case 'rollback-cleanup':
        return t('退回中断隔离项目')
    }
  }

  const interruptedReasonLabel = (
    reason: BackupLifecycleInventory['interruptedOperations'][number]['reason'],
  ) => {
    switch (reason) {
      case 'cleanup-journal-ready':
        return t('隔离日志有效，可安全退回')
      case 'committed-restore-ready':
        return t('数据库已提交，可安全完成收尾')
      case 'committed-history-deletion-ready':
        return t('历史删除已提交，可安全完成备份清理')
      case 'journal-invalid':
        return t('日志缺失或损坏，保持只读保护')
      case 'preflight-invalid':
        return t('恢复预备份无效，保持只读保护')
      case 'restore-marker-only':
        return t('恢复已完成，仅剩提交标记')
      case 'restore-preflight-ready':
        return t('提交前中断，可安全恢复旧状态')
      case 'state-conflict':
        return t('文件状态已变化，保持只读保护')
      case 'unknown-temporary-item':
        return t('来源无法证明，保持只读保护')
    }
  }

  return (
    <>
      {interruptedOperationCount > 0 && (
        <div className="mt-4 rounded-xl border border-warning/25 bg-warning/8 p-4 text-xs">
          <p className="flex items-center gap-2 font-semibold text-warning">
            <TriangleAlert aria-hidden="true" className="size-4" />
            {t('发现异常中断残留')}
          </p>
          <p className="mt-2 leading-5 text-muted-foreground">
            {t('只有日志、提交标记和文件指纹都一致的操作才能手动恢复；其余残留继续只读保护。')}
          </p>
          <div className="mt-3 grid gap-2">
            {interruptedOperations.map(item => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/20 bg-background/65 p-3"
                key={item.id}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    {interruptedKindLabel(item.kind)}
                    <Badge tone={item.canRecover ? 'success' : 'warning'}>
                      {item.canRecover ? t('可安全恢复') : t('受保护')}
                    </Badge>
                  </p>
                  <p className="mt-1 leading-5 text-muted-foreground">
                    {interruptedReasonLabel(item.reason)} · {formatBytes(item.bytes)} · #
                    {item.id.slice(0, 8)}
                  </p>
                </div>
                {item.canRecover && (
                  <Button
                    disabled={disabled}
                    onClick={() => onPreview(item.id)}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    <RotateCcw aria-hidden="true" className="size-3.5" />
                    {t('预览异常恢复')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <div className="mt-4 rounded-xl border border-warning/25 bg-warning/8 p-4 text-xs">
          <p className="font-semibold text-warning">
            {preview.canExecute ? t('异常恢复预览可继续') : t('异常恢复预览已阻止')}
          </p>
          {preview.operation && (
            <p className="mt-2 leading-5 text-muted-foreground">
              {t('将执行：{action}。', {
                action: interruptedActionLabel(preview.operation.action),
              })}
            </p>
          )}
          {preview.errors.length > 0 && (
            <p className="mt-2 text-warning">{t('操作状态或恢复预备份已变化，请重新诊断。')}</p>
          )}
          {preview.canExecute && preview.operation && (
            <>
              <label className="mt-3 flex items-start gap-2 text-muted-foreground">
                <input
                  checked={confirmRecovery}
                  className="mt-0.5 size-4 accent-[hsl(var(--warning))]"
                  onChange={event => onConfirmRecoveryChange(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>{t('我已核对异常恢复预览，并允许应用执行所示安全恢复操作。')}</span>
              </label>
              <Button
                className="mt-3"
                disabled={disabled || !confirmRecovery}
                onClick={onRecover}
                type="button"
              >
                {isRecovering ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <RotateCcw aria-hidden="true" className="size-4" />
                )}
                {t('确认异常恢复')}
              </Button>
            </>
          )}
        </div>
      )}
    </>
  )
}
