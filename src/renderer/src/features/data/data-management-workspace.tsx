import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-react'

import type {
  BackupExportResult,
  BackupLifecycleInventory,
  BackupRetentionPolicy,
  BackupVerification,
  CleanupPreview,
  DataDiagnostics,
  InterruptedRecoveryPreview,
  QuarantineReleasePreview,
  RestoreBackupResult,
  RestorePreview,
} from '@core/contracts/data-management'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

type Operation =
  | 'cleanup-preview'
  | 'diagnose'
  | 'export'
  | 'interrupted-preview'
  | 'lifecycle'
  | 'quarantine'
  | 'quarantine-release'
  | 'quarantine-release-preview'
  | 'recover-interrupted'
  | 'preview'
  | 'restore'
  | 'undo-cleanup'
  | 'verify'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

function CountTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-panel/70 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

export function DataManagementWorkspace() {
  const { locale, t } = useI18n()
  const [diagnostics, setDiagnostics] = useState<DataDiagnostics | null>(null)
  const [lifecycle, setLifecycle] = useState<BackupLifecycleInventory | null>(null)
  const [retentionPolicy, setRetentionPolicy] = useState<BackupRetentionPolicy>('forever')
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(null)
  const [confirmQuarantine, setConfirmQuarantine] = useState(false)
  const [interruptedPreview, setInterruptedPreview] = useState<InterruptedRecoveryPreview | null>(
    null,
  )
  const [confirmInterruptedRecovery, setConfirmInterruptedRecovery] = useState(false)
  const [quarantineReleasePreview, setQuarantineReleasePreview] =
    useState<QuarantineReleasePreview | null>(null)
  const [confirmQuarantineRelease, setConfirmQuarantineRelease] = useState(false)
  const [exportResult, setExportResult] = useState<BackupExportResult | null>(null)
  const [verification, setVerification] = useState<BackupVerification | null>(null)
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null)
  const [restoreResult, setRestoreResult] = useState<RestoreBackupResult | null>(null)
  const [includeTemplateSources, setIncludeTemplateSources] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [operation, setOperation] = useState<Operation | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (nextOperation: Operation, task: () => Promise<void>) => {
    setOperation(nextOperation)
    setMessage(null)
    try {
      await task()
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t('数据操作未完成。'))
    } finally {
      setOperation(null)
    }
  }

  const refreshDiagnostics = async () => {
    await run('diagnose', async () => {
      const [nextDiagnostics, nextLifecycle] = await Promise.all([
        window.desktop.dataManagement.diagnose(),
        window.desktop.dataManagement.inspectBackupLifecycle({ retentionPolicy }),
      ])
      setDiagnostics(nextDiagnostics)
      setLifecycle(nextLifecycle)
      setSelectedCandidateIds([])
      setCleanupPreview(null)
      setConfirmQuarantine(false)
      setInterruptedPreview(null)
      setConfirmInterruptedRecovery(false)
      setQuarantineReleasePreview(null)
      setConfirmQuarantineRelease(false)
    })
  }

  const refreshLifecycle = async (policy: BackupRetentionPolicy) => {
    await run('lifecycle', async () => {
      setLifecycle(
        await window.desktop.dataManagement.inspectBackupLifecycle({ retentionPolicy: policy }),
      )
      setSelectedCandidateIds([])
      setCleanupPreview(null)
      setConfirmQuarantine(false)
      setInterruptedPreview(null)
      setConfirmInterruptedRecovery(false)
      setQuarantineReleasePreview(null)
      setConfirmQuarantineRelease(false)
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
  const restorePackagePath = restorePreview?.verification.packagePath ?? null
  const canExecuteRestore =
    Boolean(restorePackagePath) && Boolean(restorePreview?.canRestore) && confirmRestore
  const selectedCandidates =
    lifecycle?.candidates.filter(candidate => selectedCandidateIds.includes(candidate.id)) ?? []
  const canPreviewCleanup = selectedCandidates.length > 0 && operation === null

  const lifecycleAreaLabel = (key: BackupLifecycleInventory['areas'][number]['key']) => {
    switch (key) {
      case 'restore-preflight-backups':
        return t('恢复预备份')
      case 'file-plan-backups':
        return t('文件计划备份')
      case 'batch-import-backups':
        return t('批量导入备份')
      case 'problem-image-trash':
        return t('题目图片残留区')
      case 'data-management-quarantine':
        return t('数据隔离区')
      case 'interrupted-operations':
        return t('异常中断残留')
    }
  }

  const candidateCategoryLabel = (
    category: BackupLifecycleInventory['candidates'][number]['category'],
  ) => {
    switch (category) {
      case 'restore-preflight-backup':
        return t('恢复预备份')
      case 'file-plan-backup':
        return t('文件计划备份')
      case 'batch-import-backup':
        return t('批量导入备份')
      case 'problem-image-trash':
        return t('题目图片残留')
    }
  }

  const candidateReasonLabel = (
    reason: BackupLifecycleInventory['candidates'][number]['reason'],
  ) => {
    switch (reason) {
      case 'applied-file-execution':
        return t('仍用于撤销文件计划，必须保留')
      case 'batch-import-without-record':
        return t('批量导入备份，需要你判断')
      case 'invalid-preflight-backup':
        return t('预备份校验未通过，需要你判断')
      case 'latest-valid-preflight':
        return t('最新有效预备份，必须保留')
      case 'residual-image-trash':
        return t('无当前记录的题目图片残留')
      case 'retention-expired':
        return t('已超过所选保留期')
      case 'retention-policy-forever':
        return t('当前策略为永久保留')
      case 'rolled-back-file-execution':
        return t('文件计划已经回滚，可建议隔离')
      case 'symlink-detected':
        return t('包含符号链接，禁止处理')
      case 'unrecorded-file-plan-backup':
        return t('没有对应执行记录，需要你判断')
      case 'within-retention-window':
        return t('仍在所选保留期内')
    }
  }

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
      case 'clear-restore-marker':
        return t('清理已完成恢复标记')
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
    <main className="workspace-stage flex h-full min-h-0 flex-col overflow-hidden">
      <header className="glass-section-header flex min-h-[62px] flex-wrap items-center gap-3 border-b px-5 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/12 text-success ring-1 ring-success/14">
          <ShieldCheck aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{t('数据管理')}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('只读诊断、可验证备份恢复与安全治理')}
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

          <section
            className="content-card rounded-2xl border border-border p-5 shadow-panel"
            data-testid="backup-lifecycle"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{t('备份生命周期')}</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                  {t('保留策略只生成建议，不会后台删除。确认后的项目只移入应用隔离区，并可撤销。')}
                </p>
              </div>
              <label className="grid gap-1 text-xs text-muted-foreground">
                <span>{t('备份保留策略')}</span>
                <select
                  aria-label={t('备份保留策略')}
                  className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={operation !== null}
                  onChange={event => {
                    const policy = event.currentTarget.value as BackupRetentionPolicy
                    setRetentionPolicy(policy)
                    void refreshLifecycle(policy)
                  }}
                  value={retentionPolicy}
                >
                  <option value="forever">{t('永久保留')}</option>
                  <option value="7-days">{t('保留 7 天')}</option>
                  <option value="30-days">{t('保留 30 天')}</option>
                  <option value="90-days">{t('保留 90 天')}</option>
                </select>
              </label>
            </div>

            {lifecycle ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <CountTile
                    label={t('受管数据占用')}
                    value={formatBytes(lifecycle.totalManagedBytes)}
                  />
                  <CountTile
                    label={t('可隔离占用')}
                    value={formatBytes(lifecycle.quarantinableBytes)}
                  />
                  <CountTile
                    label={t('异常中断残留')}
                    value={lifecycle.interruptedOperationCount}
                  />
                  <CountTile
                    label={t('可撤销隔离操作')}
                    value={lifecycle.quarantineOperations.filter(item => item.canUndo).length}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t('占用数值以字节计：受管 {managed}，可隔离 {eligible}。', {
                    eligible: formatBytes(lifecycle.quarantinableBytes),
                    managed: formatBytes(lifecycle.totalManagedBytes),
                  })}
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {lifecycle.areas.map(area => (
                    <div className="rounded-xl border border-border bg-muted/25 p-3" key={area.key}>
                      <p className="text-xs font-medium">{lifecycleAreaLabel(area.key)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t('{count} 项 · {bytes}', {
                          bytes: formatBytes(area.bytes),
                          count: area.itemCount,
                        })}
                      </p>
                    </div>
                  ))}
                </div>

                {lifecycle.interruptedOperationCount > 0 && (
                  <div className="mt-4 rounded-xl border border-warning/25 bg-warning/8 p-4 text-xs">
                    <p className="flex items-center gap-2 font-semibold text-warning">
                      <TriangleAlert aria-hidden="true" className="size-4" />
                      {t('发现异常中断残留')}
                    </p>
                    <p className="mt-2 leading-5 text-muted-foreground">
                      {t(
                        '只有日志、提交标记和文件指纹都一致的操作才能手动恢复；其余残留继续只读保护。',
                      )}
                    </p>
                    <div className="mt-3 grid gap-2">
                      {lifecycle.interruptedOperations.map(item => (
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
                              disabled={operation !== null}
                              onClick={() =>
                                void run('interrupted-preview', async () => {
                                  const preview =
                                    await window.desktop.dataManagement.previewInterruptedRecovery({
                                      operationId: item.id,
                                    })
                                  setInterruptedPreview(preview)
                                  setConfirmInterruptedRecovery(false)
                                })
                              }
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

                {interruptedPreview && (
                  <div className="mt-4 rounded-xl border border-warning/25 bg-warning/8 p-4 text-xs">
                    <p className="font-semibold text-warning">
                      {interruptedPreview.canExecute
                        ? t('异常恢复预览可继续')
                        : t('异常恢复预览已阻止')}
                    </p>
                    {interruptedPreview.operation && (
                      <p className="mt-2 leading-5 text-muted-foreground">
                        {t('将执行：{action}。', {
                          action: interruptedActionLabel(interruptedPreview.operation.action),
                        })}
                      </p>
                    )}
                    {interruptedPreview.errors.length > 0 && (
                      <p className="mt-2 text-warning">
                        {t('操作状态或恢复预备份已变化，请重新诊断。')}
                      </p>
                    )}
                    {interruptedPreview.canExecute && interruptedPreview.operation && (
                      <>
                        <label className="mt-3 flex items-start gap-2 text-muted-foreground">
                          <input
                            checked={confirmInterruptedRecovery}
                            className="mt-0.5 size-4 accent-[hsl(var(--warning))]"
                            onChange={event =>
                              setConfirmInterruptedRecovery(event.currentTarget.checked)
                            }
                            type="checkbox"
                          />
                          <span>{t('我已核对异常恢复预览，并允许应用执行所示安全恢复操作。')}</span>
                        </label>
                        <Button
                          className="mt-3"
                          disabled={operation !== null || !confirmInterruptedRecovery}
                          onClick={() =>
                            void run('recover-interrupted', async () => {
                              if (!interruptedPreview.operation) return
                              const result =
                                await window.desktop.dataManagement.recoverInterruptedOperation({
                                  confirmRecovery: true,
                                  operationId: interruptedPreview.operation.id,
                                  retentionPolicy,
                                })
                              setLifecycle(result.inventory)
                              setDiagnostics(await window.desktop.dataManagement.diagnose())
                              setInterruptedPreview(null)
                              setConfirmInterruptedRecovery(false)
                              setMessage(t('异常操作已按预览安全处理。'))
                            })
                          }
                          type="button"
                        >
                          {operation === 'recover-interrupted' ? (
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

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold">{t('逐项治理清单')}</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t('受保护项目不可选择；需要判断的项目必须由你主动勾选。')}
                    </p>
                  </div>
                  <Button
                    disabled={
                      operation !== null ||
                      !lifecycle.candidates.some(candidate => candidate.canQuarantine)
                    }
                    onClick={() => {
                      setSelectedCandidateIds(
                        lifecycle.candidates
                          .filter(candidate => candidate.canQuarantine)
                          .slice(0, 100)
                          .map(candidate => candidate.id),
                      )
                      setCleanupPreview(null)
                      setConfirmQuarantine(false)
                    }}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    {t('选择全部可隔离项')}
                  </Button>
                </div>

                {lifecycle.candidates.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {lifecycle.candidates.slice(0, 100).map(candidate => (
                      <label
                        className="flex items-start gap-3 rounded-xl border border-border bg-panel/55 p-3"
                        data-cleanup-candidate={candidate.id.slice(0, 8)}
                        key={candidate.id}
                      >
                        <input
                          aria-label={t('选择治理项目 {id}', { id: candidate.id.slice(0, 8) })}
                          checked={selectedCandidateIds.includes(candidate.id)}
                          className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
                          disabled={!candidate.canQuarantine || operation !== null}
                          onChange={event => {
                            setSelectedCandidateIds(current =>
                              event.currentTarget.checked
                                ? [...current, candidate.id]
                                : current.filter(id => id !== candidate.id),
                            )
                            setCleanupPreview(null)
                            setConfirmQuarantine(false)
                          }}
                          type="checkbox"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-xs font-medium">
                            {candidateCategoryLabel(candidate.category)}
                            <Badge
                              tone={
                                candidate.disposition === 'protected'
                                  ? 'neutral'
                                  : candidate.disposition === 'suggested'
                                    ? 'success'
                                    : 'warning'
                              }
                            >
                              {candidate.disposition === 'protected'
                                ? t('受保护')
                                : candidate.disposition === 'suggested'
                                  ? t('建议隔离')
                                  : t('需要判断')}
                            </Badge>
                          </span>
                          <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                            {candidateReasonLabel(candidate.reason)} ·{' '}
                            {formatBytes(candidate.bytes)} ·{' '}
                            {new Date(candidate.createdAt).toLocaleString(locale)} · #
                            {candidate.id.slice(0, 8)}
                          </span>
                        </span>
                      </label>
                    ))}
                    {lifecycle.candidates.length > 100 && (
                      <p className="text-[11px] text-warning">
                        {t('清单超过 100 项；本次仅显示前 100 项，请分批处理。')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                    {t('当前没有受管备份或异常残留。')}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={!canPreviewCleanup}
                    onClick={() =>
                      void run('cleanup-preview', async () => {
                        const preview = await window.desktop.dataManagement.previewCleanup({
                          candidateIds: selectedCandidateIds,
                          retentionPolicy,
                        })
                        setCleanupPreview(preview)
                        setConfirmQuarantine(false)
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    <HardDrive aria-hidden="true" className="size-4" />
                    {operation === 'cleanup-preview' ? t('正在生成预览…') : t('预览隔离操作')}
                  </Button>
                </div>

                {cleanupPreview && (
                  <div className="mt-4 rounded-xl border border-warning/25 bg-warning/8 p-4 text-xs">
                    <p className="font-semibold text-warning">
                      {cleanupPreview.canExecute ? t('隔离预览可继续') : t('隔离预览已阻止')}
                    </p>
                    <p className="mt-2 leading-5 text-muted-foreground">
                      {t('将移动 {count} 项、共 {bytes}；不会永久删除，可从隔离区撤销。', {
                        bytes: formatBytes(cleanupPreview.totalBytes),
                        count: cleanupPreview.candidates.length,
                      })}
                    </p>
                    {cleanupPreview.errors.length > 0 && (
                      <p className="mt-2 text-warning">
                        {t('候选已变化或包含受保护项目，请重新诊断。')}
                      </p>
                    )}
                    {cleanupPreview.canExecute && (
                      <>
                        <label className="mt-3 flex items-start gap-2 text-muted-foreground">
                          <input
                            checked={confirmQuarantine}
                            className="mt-0.5 size-4 accent-[hsl(var(--warning))]"
                            onChange={event => setConfirmQuarantine(event.currentTarget.checked)}
                            type="checkbox"
                          />
                          <span>{t('我已核对清单，并允许应用把所选项目移入隔离区。')}</span>
                        </label>
                        <Button
                          className="mt-3"
                          disabled={operation !== null || !confirmQuarantine}
                          onClick={() =>
                            void run('quarantine', async () => {
                              const result = await window.desktop.dataManagement.quarantineCleanup({
                                candidateIds: selectedCandidateIds,
                                confirmQuarantine: true,
                                retentionPolicy,
                              })
                              setLifecycle(result.inventory)
                              setDiagnostics(await window.desktop.dataManagement.diagnose())
                              setSelectedCandidateIds([])
                              setCleanupPreview(null)
                              setConfirmQuarantine(false)
                              setMessage(t('所选项目已移入隔离区，可以撤销；没有永久删除文件。'))
                            })
                          }
                          type="button"
                        >
                          {operation === 'quarantine' ? (
                            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                          ) : (
                            <ArchiveRestore aria-hidden="true" className="size-4" />
                          )}
                          {t('确认移入隔离区')}
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {lifecycle.quarantineOperations.length > 0 && (
                  <div className="mt-5 rounded-xl border border-border bg-muted/25 p-4">
                    <h3 className="text-xs font-semibold">{t('可撤销隔离操作')}</h3>
                    <div className="mt-3 grid gap-2">
                      {lifecycle.quarantineOperations.map(item => (
                        <div
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 p-3 text-xs"
                          key={item.id}
                        >
                          <p className="text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString(locale)} · {item.itemCount}{' '}
                            {t('项')} · {formatBytes(item.bytes)} · #{item.id.slice(0, 8)}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={!item.canUndo || operation !== null}
                              onClick={() =>
                                void run('undo-cleanup', async () => {
                                  const result = await window.desktop.dataManagement.undoCleanup({
                                    confirmUndo: true,
                                    operationId: item.id,
                                    retentionPolicy,
                                  })
                                  setLifecycle(result.inventory)
                                  setDiagnostics(await window.desktop.dataManagement.diagnose())
                                  setMessage(
                                    t('已从隔离区恢复 {count} 项；未覆盖任何后续文件。', {
                                      count: result.restoredCount,
                                    }),
                                  )
                                })
                              }
                              size="compact"
                              type="button"
                              variant="outline"
                            >
                              <Undo2 aria-hidden="true" className="size-3.5" />
                              {t('撤销隔离')}
                            </Button>
                            <Button
                              disabled={operation !== null}
                              onClick={() =>
                                void run('quarantine-release-preview', async () => {
                                  const preview =
                                    await window.desktop.dataManagement.previewQuarantineRelease({
                                      operationId: item.id,
                                    })
                                  setQuarantineReleasePreview(preview)
                                  setConfirmQuarantineRelease(false)
                                })
                              }
                              size="compact"
                              type="button"
                              variant="outline"
                            >
                              <Trash2 aria-hidden="true" className="size-3.5" />
                              {t('移入系统废纸篓')}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {quarantineReleasePreview && (
                  <div className="mt-4 rounded-xl border border-warning/25 bg-warning/8 p-4 text-xs">
                    <p className="font-semibold text-warning">
                      {quarantineReleasePreview.canRelease
                        ? t('废纸篓移交预览可继续')
                        : t('废纸篓移交预览已阻止')}
                    </p>
                    {quarantineReleasePreview.operation && (
                      <p className="mt-2 leading-5 text-muted-foreground">
                        {t('将把 {count} 项、共 {bytes} 移交系统废纸篓；应用不会直接永久删除。', {
                          bytes: formatBytes(quarantineReleasePreview.operation.bytes),
                          count: quarantineReleasePreview.operation.itemCount,
                        })}
                      </p>
                    )}
                    {quarantineReleasePreview.errors.length > 0 && (
                      <p className="mt-2 text-warning">{t('隔离记录或内容已变化，请重新诊断。')}</p>
                    )}
                    {quarantineReleasePreview.canRelease && quarantineReleasePreview.operation && (
                      <>
                        <label className="mt-3 flex items-start gap-2 text-muted-foreground">
                          <input
                            checked={confirmQuarantineRelease}
                            className="mt-0.5 size-4 accent-[hsl(var(--warning))]"
                            onChange={event =>
                              setConfirmQuarantineRelease(event.currentTarget.checked)
                            }
                            type="checkbox"
                          />
                          <span>{t('我已核对隔离记录，并允许应用将其移交系统废纸篓。')}</span>
                        </label>
                        <Button
                          className="mt-3"
                          disabled={operation !== null || !confirmQuarantineRelease}
                          onClick={() =>
                            void run('quarantine-release', async () => {
                              if (!quarantineReleasePreview.operation) return
                              const result = await window.desktop.dataManagement.releaseQuarantine({
                                confirmMoveToTrash: true,
                                operationId: quarantineReleasePreview.operation.id,
                                retentionPolicy,
                              })
                              setLifecycle(result.inventory)
                              setDiagnostics(await window.desktop.dataManagement.diagnose())
                              setQuarantineReleasePreview(null)
                              setConfirmQuarantineRelease(false)
                              setMessage(
                                t('隔离记录已移交系统废纸篓；永久清空仍由操作系统和你决定。'),
                              )
                            })
                          }
                          type="button"
                        >
                          {operation === 'quarantine-release' ? (
                            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                          ) : (
                            <Trash2 aria-hidden="true" className="size-4" />
                          )}
                          {t('确认移入系统废纸篓')}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> {t('正在读取备份生命周期…')}
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
                    const preview = await window.desktop.dataManagement.previewRestore()
                    setRestorePreview(preview)
                    setRestoreResult(null)
                    setConfirmRestore(false)
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
                      {t(
                        '恢复前会自动备份当前数据；本版本会跳过模板源码恢复，不会修改外部模板工作区。',
                      )}
                    </p>
                    <label className="mt-3 flex items-start gap-2 text-muted-foreground">
                      <input
                        checked={confirmRestore}
                        className="mt-0.5 size-4 accent-[hsl(var(--warning))]"
                        onChange={event => setConfirmRestore(event.currentTarget.checked)}
                        type="checkbox"
                      />
                      <span>{t('我已确认恢复预览，并允许应用恢复 userData 中的数据副本。')}</span>
                    </label>
                    <Button
                      className="mt-3"
                      disabled={operation !== null || !canExecuteRestore}
                      onClick={() =>
                        void run('restore', async () => {
                          if (!restorePackagePath) return
                          const result = await window.desktop.dataManagement.restoreBackup({
                            confirmRestore: true,
                            packagePath: restorePackagePath,
                            templateSourceStrategy: 'skip',
                          })
                          setRestoreResult(result)
                          setDiagnostics(await window.desktop.dataManagement.diagnose())
                          setMessage(
                            result.providerSecretsNeedReentry
                              ? t('恢复完成。Provider 密钥未恢复，请重新配置密钥。')
                              : t('恢复完成。恢复前自动备份已保存。'),
                          )
                          setConfirmRestore(false)
                        })
                      }
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

          <section className="rounded-2xl border border-border bg-panel/70 p-5 text-xs leading-5 text-muted-foreground">
            <div className="flex items-start gap-3">
              <Archive aria-hidden="true" className="mt-0.5 size-4 text-primary" />
              <p>
                {t('恢复执行只处理应用 userData 数据；模板源码默认跳过，外部工作区不会被修改。')}
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
