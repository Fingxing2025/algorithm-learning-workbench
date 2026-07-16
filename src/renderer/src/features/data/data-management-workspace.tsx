import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  CheckCircle2,
  Database,
  Download,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'

import type {
  BackupExportResult,
  BackupVerification,
  DataDiagnostics,
  RestorePreview,
} from '@core/contracts/data-management'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

type Operation = 'diagnose' | 'export' | 'preview' | 'verify'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-panel/70 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

export function DataManagementWorkspace() {
  const { t } = useI18n()
  const [diagnostics, setDiagnostics] = useState<DataDiagnostics | null>(null)
  const [exportResult, setExportResult] = useState<BackupExportResult | null>(null)
  const [verification, setVerification] = useState<BackupVerification | null>(null)
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null)
  const [includeTemplateSources, setIncludeTemplateSources] = useState(false)
  const [operation, setOperation] = useState<Operation | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (nextOperation: Operation, task: () => Promise<void>) => {
    setOperation(nextOperation)
    setMessage(null)
    try {
      await task()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('数据操作未完成。'))
    } finally {
      setOperation(null)
    }
  }

  const refreshDiagnostics = async () => {
    await run('diagnose', async () => {
      setDiagnostics(await window.desktop.dataManagement.diagnose())
    })
  }

  useEffect(() => {
    void refreshDiagnostics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const counts = diagnostics?.counts
  const issueCount = diagnostics?.issues.reduce((total, issue) => total + issue.count, 0) ?? 0
  const storageTotal = useMemo(
    () => diagnostics?.storage.find(area => area.key === 'user-data-total')?.bytes ?? 0,
    [diagnostics],
  )

  return (
    <main className="workspace-stage flex h-full min-h-0 flex-col overflow-hidden">
      <header className="glass-section-header flex min-h-[62px] flex-wrap items-center gap-3 border-b px-5 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/12 text-success ring-1 ring-success/14">
          <ShieldCheck aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{t('数据管理')}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('只读诊断、可验证导出和恢复预览')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            disabled={operation !== null}
            onClick={() => void refreshDiagnostics()}
            size="compact"
            type="button"
            variant="outline"
          >
            {operation === 'diagnose' ? (
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Database aria-hidden="true" className="size-3.5" />
            )}
            {t('重新诊断')}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-[1120px] gap-4">
          {message && (
            <div
              role="alert"
              className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
            >
              {message}
            </div>
          )}

          <section className="content-card rounded-2xl border border-border p-5 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{t('一致性诊断')}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('诊断不会删除、移动、覆盖或修复用户文件。')}
                </p>
              </div>
              <Badge tone={issueCount > 0 ? 'warning' : 'success'}>
                {issueCount > 0 ? t('{count} 个异常', { count: issueCount }) : t('未发现异常')}
              </Badge>
            </div>

            {counts ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CountTile label={t('工作区')} value={counts.workspaces} />
                <CountTile label={t('模板')} value={counts.templates} />
                <CountTile label={t('题目')} value={counts.problems} />
                <CountTile label={t('题目图片')} value={counts.problemImages} />
                <CountTile label={t('模板关系')} value={counts.templateProblemRelations} />
                <CountTile label={t('Provider 配置')} value={counts.aiProviderProfiles} />
                <CountTile label={t('文件计划')} value={counts.fileChangePlans} />
                <CountTile label={t('执行记录')} value={counts.fileChangeExecutions} />
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> {t('正在诊断本地数据…')}
              </div>
            )}

            {diagnostics && (
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <h3 className="text-xs font-semibold">{t('SQLite 状态')}</h3>
                  <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <p>
                      {t('quick_check')}:{' '}
                      <span className="font-medium text-foreground">
                        {diagnostics.database.quickCheck}
                      </span>
                    </p>
                    <p>
                      {t('外键')}:{' '}
                      <span className="font-medium text-foreground">
                        {diagnostics.database.foreignKeyOk ? t('通过') : t('失败')}
                      </span>
                    </p>
                    <p>
                      WAL:{' '}
                      <span className="font-medium text-foreground">
                        {diagnostics.database.walPresent ? t('存在') : t('不存在')}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <h3 className="text-xs font-semibold">{t('空间统计')}</h3>
                  <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <p>
                      {t('用户数据总量')}:{' '}
                      <span className="font-medium text-foreground">
                        {formatBytes(storageTotal)}
                      </span>
                    </p>
                    {diagnostics.storage
                      .filter(area => area.key !== 'user-data-total')
                      .slice(0, 5)
                      .map(area => (
                        <p key={area.key}>
                          {area.key}:{' '}
                          <span className="font-medium text-foreground">
                            {formatBytes(area.bytes)}
                          </span>
                        </p>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {diagnostics && diagnostics.issues.length > 0 && (
              <div className="mt-4 rounded-xl border border-warning/25 bg-warning/8 p-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold text-warning">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                  {t('只读发现')}
                </h3>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  {diagnostics.issues.map(issue => (
                    <p key={issue.kind}>
                      {issue.kind}:{' '}
                      <span className="font-medium text-foreground">{issue.count}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>

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
                  checked={includeTemplateSources}
                  className="size-4 accent-[hsl(var(--primary))]"
                  onChange={event => setIncludeTemplateSources(event.currentTarget.checked)}
                  type="checkbox"
                />
                {t('包含模板源码副本')}
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={operation !== null}
                onClick={() =>
                  void run('export', async () => {
                    const result = await window.desktop.dataManagement.exportBackup({
                      includeTemplateSources,
                    })
                    setExportResult(result)
                    setVerification(result?.verification ?? null)
                    if (result) setMessage(t('备份已导出并通过校验。'))
                  })
                }
                type="button"
              >
                {operation === 'export' ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Download aria-hidden="true" className="size-4" />
                )}
                {t('导出备份')}
              </Button>
              <Button
                disabled={operation !== null}
                onClick={() =>
                  void run('verify', async () => {
                    setVerification(await window.desktop.dataManagement.verifyBackup())
                  })
                }
                type="button"
                variant="outline"
              >
                <CheckCircle2 aria-hidden="true" className="size-4" />
                {t('验证备份包')}
              </Button>
              <Button
                disabled={operation !== null}
                onClick={() =>
                  void run('preview', async () => {
                    setRestorePreview(await window.desktop.dataManagement.previewRestore())
                  })
                }
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
                      <p key={error}>{error}</p>
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
                      <p key={conflict}>{conflict}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-panel/70 p-5 text-xs leading-5 text-muted-foreground">
            <div className="flex items-start gap-3">
              <Archive aria-hidden="true" className="mt-0.5 size-4 text-primary" />
              <p>{t('当前版本只开放恢复预览；执行恢复会在导出校验和失败回滚测试稳定后开放。')}</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
