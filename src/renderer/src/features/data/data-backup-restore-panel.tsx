import { CheckCircle2, Download, FolderInput, LoaderCircle, RotateCcw } from 'lucide-react'
import type { RefObject } from 'react'

import type {
  BackupExportResult,
  DataManagementCounts,
  RestoreBackupResult,
  RestorePreview,
} from '@core/contracts/data-management'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

export interface DataBackupRestorePanelProps {
  canExecuteRestore: boolean
  confirmRestore: boolean
  exportResult: BackupExportResult | null
  onConfirmRestoreChange: (checked: boolean) => void
  onExport: () => void
  onPreviewRestore: () => void
  onRestore: () => void
  operation: string | null
  restoreConfirmationRef: RefObject<HTMLInputElement | null>
  restorePreview: RestorePreview | null
  restoreResult: RestoreBackupResult | null
}

const comparisonRows: Array<{
  key: keyof Pick<
    DataManagementCounts,
    | 'fileChangeExecutions'
    | 'fileChangePlans'
    | 'problemImages'
    | 'problems'
    | 'templateProblemRelations'
    | 'templates'
  >
  label: string
}> = [
  { key: 'templates', label: '模板' },
  { key: 'problems', label: '题目' },
  { key: 'problemImages', label: '题目图片' },
  { key: 'templateProblemRelations', label: '模板与题目关联' },
  { key: 'fileChangePlans', label: '文件计划' },
  { key: 'fileChangeExecutions', label: '执行记录' },
]

export function DataBackupRestorePanel({
  canExecuteRestore,
  confirmRestore,
  exportResult,
  onConfirmRestoreChange,
  onExport,
  onPreviewRestore,
  onRestore,
  operation,
  restoreConfirmationRef,
  restorePreview,
  restoreResult,
}: DataBackupRestorePanelProps) {
  const { t } = useI18n()
  const restoreManifest = restorePreview?.manifest ?? null
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <section className="content-card rounded-2xl border border-border p-5 shadow-panel">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/11 text-primary ring-1 ring-primary/12">
            <Download aria-hidden="true" className="size-4.5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{t('当前工作区备份')}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('只导出当前工作区的模板、题目、图片、关联和必要撤销备份。')}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-muted/25 p-3 text-xs">
          <p className="font-medium">{t('完整深拷贝')}</p>
          <p className="mt-1 leading-5 text-muted-foreground">
            {t('固定包含模板源码、相对路径、元数据、题目、图片和关联，可恢复到任意当前工作区。')}
          </p>
        </div>

        <Button className="mt-4" disabled={operation !== null} onClick={onExport} type="button">
          {operation === 'export' ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Download aria-hidden="true" className="size-4" />
          )}
          {t('导出当前工作区备份')}
        </Button>

        {exportResult && (
          <div className="mt-4 rounded-xl border border-success/25 bg-success/8 p-4 text-xs">
            <p className="flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              {t('当前工作区备份已导出并通过校验')}
            </p>
            <p className="mt-2 text-muted-foreground">
              {t('文件数量')}: {exportResult.manifest.files.length} · {t('格式版本')}:{' '}
              {exportResult.manifest.formatVersion}
            </p>
          </div>
        )}

        <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
          {t('备份不包含 API Key 或系统安全存储中的密钥。')}
        </p>
      </section>

      <section className="content-card rounded-2xl border border-border p-5 shadow-panel">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/11 text-success ring-1 ring-success/12">
            <RotateCcw aria-hidden="true" className="size-4.5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{t('恢复备份')}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('选择备份后会先自动校验，并展示恢复前后的数据对比。')}
            </p>
          </div>
        </div>

        <Button
          className="mt-4"
          disabled={operation !== null}
          onClick={onPreviewRestore}
          type="button"
          variant="outline"
        >
          {operation === 'preview' ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <FolderInput aria-hidden="true" className="size-4" />
          )}
          {t('选择备份并恢复')}
        </Button>

        {restorePreview && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-xs">
            <p
              className={
                restorePreview.canRestore
                  ? 'font-semibold text-success'
                  : 'font-semibold text-warning'
              }
            >
              {restorePreview.canRestore ? t('备份检查通过，可以恢复') : t('这个备份暂时无法恢复')}
            </p>
            <p className="mt-1 text-muted-foreground">
              {restorePreview.verification.ok
                ? t('已自动验证备份完整性。')
                : t('备份完整性校验未通过。')}
            </p>

            {restorePreview.verification.errors.length > 0 && (
              <div className="mt-3 space-y-1 text-warning">
                {restorePreview.verification.errors.map(error => (
                  <p key={error}>{t(error)}</p>
                ))}
              </div>
            )}

            {restoreManifest && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-border bg-background/55 p-3 leading-5">
                  <p>
                    {t('备份内容来源')}：
                    <span className="font-medium" data-testid="restore-source-workspace">
                      {restorePreview.sourceWorkspace?.name ?? t('未知工作区')}
                    </span>
                  </p>
                  <p>
                    {t('深拷贝到当前工作区')}：
                    <span className="font-medium" data-testid="restore-target-workspace">
                      {restorePreview.targetWorkspace.name}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    {t(
                      '来源工作区身份不参与恢复；当前工作区保留名称和标识，来源及其他工作区不变。',
                    )}
                  </p>
                </div>
                <div className="overflow-hidden rounded-xl border border-border bg-background/55">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-border px-3 py-2 text-[11px] font-medium text-muted-foreground">
                    <span>{t('数据项')}</span>
                    <span>{t('目标当前')}</span>
                    <span>{t('备份')}</span>
                  </div>
                  {comparisonRows.map(row => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-border/70 px-3 py-2 last:border-b-0"
                      data-testid={`restore-count-${row.key}`}
                      key={row.key}
                    >
                      <span className="truncate text-muted-foreground">{t(row.label)}</span>
                      <span className="min-w-8 text-right tabular-nums">
                        {restorePreview.targetCounts[row.key]}
                      </span>
                      <span className="min-w-8 text-right font-medium tabular-nums">
                        {restoreManifest.counts[row.key]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {restorePreview.conflicts.length > 0 && (
              <div className="mt-3 space-y-1 text-warning">
                {restorePreview.conflicts.map(conflict => (
                  <p key={conflict}>{t(conflict)}</p>
                ))}
              </div>
            )}

            {restorePreview.canRestore && (
              <div className="mt-4 rounded-xl border border-warning/25 bg-warning/8 p-3">
                <p className="font-semibold text-warning">
                  {t(
                    '恢复会把备份内容深拷贝到当前工作区；不会修改来源或其他工作区，也不是合并操作。',
                  )}
                </p>
                <p className="mt-2 leading-5 text-muted-foreground">
                  {t(
                    '恢复前会自动备份当前工作区；模板源码按备份相对路径原地写入当前工作区文件夹，当前路径和身份保持不变。',
                  )}
                </p>

                <label className="mt-3 flex items-start gap-2 text-muted-foreground">
                  <input
                    checked={confirmRestore}
                    className="mt-0.5 size-4 accent-[hsl(var(--warning))]"
                    onChange={event => onConfirmRestoreChange(event.currentTarget.checked)}
                    ref={restoreConfirmationRef}
                    type="checkbox"
                  />
                  <span>{t('我了解恢复会替换当前工作区，并确认继续。')}</span>
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
              {restoreResult.restoredCounts.templates}
            </p>
            {restoreResult.restoredTemplateSourceFiles > 0 && (
              <p className="mt-2 text-muted-foreground">
                {t('已原地恢复模板源码')}: {restoreResult.restoredTemplateSourceFiles}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
