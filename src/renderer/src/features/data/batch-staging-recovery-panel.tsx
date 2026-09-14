import { useEffect, useState } from 'react'
import type { BatchStagingRecovery } from '@core/contracts/template-management'
import type { WorkspaceSnapshot } from '@core/contracts/workspace'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

export function BatchStagingRecoveryPanel({
  onRecovered,
}: {
  onRecovered: (workspace: WorkspaceSnapshot) => void
}) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<BatchStagingRecovery[]>([])
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let disposed = false
    const inspect = window.desktop.templateManagement.inspectBatchStagingRecoveries
    if (inspect)
      void inspect()
        .then(value => {
          if (!disposed) setEntries(value)
        })
        .catch(() => {
          if (!disposed) setError(t('无法检查暂存恢复记录，请保留工作区并重新打开。'))
        })
    return () => {
      disposed = true
    }
  }, [t])
  if (entries.length === 0 && !error) return null
  return (
    <section
      aria-label={t('暂存导入中断恢复')}
      className="rounded-xl border border-warning/30 bg-panel p-4 text-sm"
    >
      <h2 className="font-semibold">{t('暂存导入中断恢复')}</h2>
      {error && (
        <p role="alert" className="mt-2 text-warning">
          {error}
        </p>
      )}
      {entries.map(entry => (
        <div key={entry.operationId} className="mt-3 space-y-3 border-t pt-3">
          <p>
            {t(
              entry.action === 'rollback'
                ? '应用尚未提交。恢复将退回原模板树，保留暂存结果以便再次确认。'
                : '应用已经提交。恢复将核验已应用文件并完成收尾，原模板备份继续保留。',
            )}
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              disabled={busy}
              checked={confirmed === entry.operationId}
              onChange={event => setConfirmed(event.target.checked ? entry.operationId : null)}
            />
            {t('我已了解恢复动作并确认继续')}
          </label>
          <Button
            disabled={busy || confirmed !== entry.operationId}
            onClick={() => {
              setBusy(true)
              setError(null)
              void window.desktop.templateManagement
                .recoverBatchStaging({
                  confirmed: true,
                  operationId: entry.operationId,
                  stagingId: entry.stagingId,
                })
                .then(async workspace => {
                  setEntries(
                    await window.desktop.templateManagement.inspectBatchStagingRecoveries(),
                  )
                  setConfirmed(null)
                  if (workspace) onRecovered(workspace)
                })
                .catch(caught =>
                  setError(
                    caught instanceof Error ? caught.message : t('恢复失败，请保留现场并重试。'),
                  ),
                )
                .finally(() => setBusy(false))
            }}
          >
            {t('确认恢复暂存导入')}
          </Button>
        </div>
      ))}
    </section>
  )
}
