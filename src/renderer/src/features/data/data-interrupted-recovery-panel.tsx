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

  if (interruptedOperationCount === 0 && !preview) return null

  const operationLabel = (
    kind: BackupLifecycleInventory['interruptedOperations'][number]['kind'],
  ) => {
    switch (kind) {
      case 'cleanup-operation':
        return t('上一次数据整理未完成')
      case 'restore-marker':
        return t('上一次备份恢复需要收尾')
      case 'restore-operation':
        return t('上一次备份恢复未完成')
      case 'unknown':
        return t('发现未识别的临时数据')
    }
  }

  const actionLabel = (
    action: BackupLifecycleInventory['interruptedOperations'][number]['action'],
  ) => {
    switch (action) {
      case 'clear-history-deletion-marker':
        return t('清理已完成的历史删除状态')
      case 'clear-restore-marker':
        return t('清理已完成的恢复状态')
      case 'complete-history-deletion':
        return t('完成历史删除后的备份收尾')
      case 'complete-restore':
        return t('完成备份恢复后的安全收尾')
      case 'none':
        return t('继续保护现有数据，不做修改')
      case 'restore-preflight':
        return t('恢复到上一次操作之前')
      case 'rollback-cleanup':
        return t('将未完成整理的数据放回原位置')
    }
  }

  const reasonLabel = (
    reason: BackupLifecycleInventory['interruptedOperations'][number]['reason'],
  ) => {
    switch (reason) {
      case 'cleanup-journal-ready':
        return t('安全信息完整，可以恢复原状')
      case 'committed-restore-ready':
        return t('主要数据已恢复，可以完成收尾')
      case 'committed-history-deletion-ready':
        return t('历史记录已处理，可以完成备份收尾')
      case 'journal-invalid':
      case 'preflight-invalid':
      case 'state-conflict':
      case 'unknown-temporary-item':
        return t('安全信息不足，应用已保持只读保护')
      case 'restore-marker-only':
        return t('恢复已完成，只需清理剩余状态')
      case 'restore-preflight-ready':
        return t('数据尚未替换，可以安全返回原状')
    }
  }

  return (
    <section className="content-card rounded-2xl border border-warning/30 bg-warning/7 p-5 shadow-panel">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/14 text-warning ring-1 ring-warning/18">
          <TriangleAlert aria-hidden="true" className="size-4.5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{t('上一次数据操作未完成')}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t('应用不会自动改动这些数据。请查看处理方式并手动确认。')}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {interruptedOperations.map(item => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/20 bg-background/65 p-3 text-xs"
            key={item.id}
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {operationLabel(item.kind)}
                <Badge tone={item.canRecover ? 'success' : 'warning'}>
                  {item.canRecover ? t('可安全处理') : t('已保护')}
                </Badge>
              </p>
              <p className="mt-1 leading-5 text-muted-foreground">{reasonLabel(item.reason)}</p>
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
                {t('查看处理方式')}
              </Button>
            )}
          </div>
        ))}
      </div>

      {preview && (
        <div className="mt-4 rounded-xl border border-warning/25 bg-background/70 p-4 text-xs">
          <p className="font-semibold text-warning">
            {preview.canExecute ? t('已准备安全处理方案') : t('当前状态不能安全处理')}
          </p>
          {preview.operation && (
            <p className="mt-2 leading-5 text-muted-foreground">
              {t('应用将：{action}。', { action: actionLabel(preview.operation.action) })}
            </p>
          )}
          {preview.errors.length > 0 && (
            <p className="mt-2 text-warning">{t('数据状态已变化，请重新检查后再试。')}</p>
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
                <span>{t('我已查看处理方式，并确认让应用执行。')}</span>
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
                {t('确认执行安全处理')}
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
