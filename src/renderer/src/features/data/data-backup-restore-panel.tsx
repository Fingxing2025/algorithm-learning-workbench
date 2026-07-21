import { CheckCircle2, Download, LoaderCircle, RotateCcw } from 'lucide-react'
import type { RefObject } from 'react'

import type {
  BackupExportResult,
  BackupVerification,
  RestoreBackupResult,
  RestorePreview,
} from '@core/contracts/data-management'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

export interface DataBackupRestorePanelProps {
  canExecuteRestore: boolean
  confirmRestore: boolean
  exportResult: BackupExportResult | null
  includeTemplateSources: boolean
  onConfirmRestoreChange: (checked: boolean) => void
  onExport: () => void
  onIncludeTemplateSourcesChange: (checked: boolean) => void
  onPreviewRestore: () => void
  onRestore: () => void
  onVerify: () => void
  operation: string | null
  restoreConfirmationRef: RefObject<HTMLInputElement | null>
  restorePreview: RestorePreview | null
  restoreResult: RestoreBackupResult | null
  verification: BackupVerification | null
}

export function DataBackupRestorePanel({
  canExecuteRestore,
  confirmRestore,
  exportResult,
  includeTemplateSources,
  onConfirmRestoreChange,
  onExport,
  onIncludeTemplateSourcesChange,
  onPreviewRestore,
  onRestore,
  onVerify,
  operation,
  restoreConfirmationRef,
  restorePreview,
  restoreResult,
  verification,
}: DataBackupRestorePanelProps) {
  const { t } = useI18n()

  return (
    <section className="content-card rounded-2xl border border-border p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t('导出与验证')}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t('导出包不包含 API Key 或安全存储密钥；Provider 恢复后需要重新填写密钥。')}
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs">
          <input
            aria-label={t('包含模板源码副本')}
            checked={includeTemplateSources}
            className="size-4 accent-[hsl(var(--primary))]"
            onChange={event => onIncludeTemplateSourcesChange(event.currentTarget.checked)}
            type="checkbox"
          />
          {t('包含模板源码副本')}
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={operation !== null} onClick={onExport} type="button">
          {operation === 'export' ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Download aria-hidden="true" className="size-4" />
          )}
          {t('导出备份')}
        </Button>
        <Button disabled={operation !== null} onClick={onVerify} type="button" variant="outline">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {t('验证备份包')}
        </Button>
        <Button
          disabled={operation !== null}
          onClick={onPreviewRestore}
          type="button"
          variant="outline"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          {t('恢复预览')}
        </Button>
      </div>

      {exportResult && (
        <div className="mt-4 rounded-xl border border-success/25 bg-success/8 p-4 text-xs">
          <p className="font-semibold text-success">{t('导出完成')}</p>
          <p className="mt-2 text-muted-foreground">
            {t('文件数量')}: {exportResult.manifest.files.length} · {t('格式版本')}:{' '}
            {exportResult.manifest.formatVersion}
          </p>
        </div>
      )}

      {verification && (
        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-xs">
          <p className="font-semibold">
            {verification.ok ? t('备份包校验通过') : t('备份包校验失败')}
          </p>
          {verification.manifest && (
            <p className="mt-2 text-muted-foreground">
              {t('版本')}: {verification.manifest.formatVersion} · {t('题目')}:{' '}
              {verification.manifest.counts.problems} · {t('模板')}:{' '}
              {verification.manifest.counts.templates}
            </p>
          )}
          {verification.errors.length > 0 && (
            <div className="mt-3 space-y-1 text-warning">
              {verification.errors.map(error => (
                <p key={error}>{t(error)}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {restorePreview && (
        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-xs">
          <p className="font-semibold">
            {restorePreview.canRestore ? t('恢复预览可继续') : t('恢复预览存在阻止项')}
          </p>
          <p className="mt-2 text-muted-foreground">
            {t('当前题目')}: {restorePreview.currentCounts.problems} · {t('备份题目')}:{' '}
            {restorePreview.manifest?.counts.problems ?? 0}
          </p>
          {restorePreview.conflicts.length > 0 && (
            <div className="mt-3 space-y-1 text-warning">
              {restorePreview.conflicts.map(conflict => (
                <p key={conflict}>{t(conflict)}</p>
              ))}
            </div>
          )}
          {restorePreview.canRestore && (
            <div className="mt-4 rounded-xl border border-warning/25 bg-warning/8 p-3">
              <p className="font-semibold text-warning">{t('恢复执行确认')}</p>
              <p className="mt-2 leading-5 text-muted-foreground">
                {t('恢复前会自动备份当前数据；本版本会跳过模板源码恢复，不会修改外部模板工作区。')}
              </p>
              <label className="mt-3 flex items-start gap-2 text-muted-foreground">
                <input
                  checked={confirmRestore}
                  className="mt-0.5 size-4 accent-[hsl(var(--warning))]"
                  onChange={event => onConfirmRestoreChange(event.currentTarget.checked)}
                  ref={restoreConfirmationRef}
                  type="checkbox"
                />
                <span>{t('我已确认恢复预览，并允许应用恢复 userData 中的数据副本。')}</span>
              </label>
              <Button
                className="mt-3"
                disabled={operation !== null || !canExecuteRestore}
                onClick={onRestore}
                type="button"
              >
                {operation === 'restore' ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <RotateCcw aria-hidden="true" className="size-4" />
                )}
                {t('确认恢复')}
              </Button>
            </div>
          )}
        </div>
      )}

      {restoreResult && (
        <div className="mt-4 rounded-xl border border-success/25 bg-success/8 p-4 text-xs">
          <p className="font-semibold text-success">{t('恢复完成')}</p>
          <p className="mt-2 text-muted-foreground">
            {t('题目')}: {restoreResult.restoredCounts.problems} · {t('模板')}:{' '}
            {restoreResult.restoredCounts.templates} · {t('Provider 配置')}:{' '}
            {restoreResult.restoredCounts.aiProviderProfiles}
          </p>
          {restoreResult.skippedTemplateSources && (
            <p className="mt-2 text-muted-foreground">
              {t('备份包包含模板源码副本；本次已按策略跳过。')}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
