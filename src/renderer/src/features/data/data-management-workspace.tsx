import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

import type {
  BackupExportResult,
  BackupLifecycleInventory,
  BackupRetentionPolicy,
  DataDiagnostics,
  InterruptedRecoveryPreview,
  RestoreBackupResult,
  RestorePreview,
} from '@core/contracts/data-management'
import type { WorkspaceSnapshot } from '@core/contracts/workspace'
import type { BackgroundTaskStatus } from '@core/contracts/background-task'

import { useI18n } from '@/lib/i18n'
import { runTrackedOperation } from '@/lib/background-task'
import { TaskProgressIndicator } from '@/components/task-progress-indicator'

import { DataBackupRestorePanel } from './data-backup-restore-panel'
import { DataHealthSummary } from './data-health-summary'
import { DataInterruptedRecoveryPanel } from './data-interrupted-recovery-panel'

type Operation =
  'diagnose' | 'export' | 'interrupted-preview' | 'preview' | 'recover-interrupted' | 'restore'

const compatibilityRetentionPolicy: BackupRetentionPolicy = 'forever'

export function DataManagementWorkspace({
  onNavigateToAiManagement,
  onWorkspaceRestored,
}: {
  onNavigateToAiManagement: () => void
  onWorkspaceRestored: (workspace: WorkspaceSnapshot) => void
}) {
  const { t } = useI18n()
  const [diagnostics, setDiagnostics] = useState<DataDiagnostics | null>(null)
  const [lifecycle, setLifecycle] = useState<BackupLifecycleInventory | null>(null)
  const [interruptedPreview, setInterruptedPreview] = useState<InterruptedRecoveryPreview | null>(
    null,
  )
  const [confirmInterruptedRecovery, setConfirmInterruptedRecovery] = useState(false)
  const [exportResult, setExportResult] = useState<BackupExportResult | null>(null)
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null)
  const [restoreResult, setRestoreResult] = useState<RestoreBackupResult | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [operation, setOperation] = useState<Operation | null>(null)
  const [taskStatus, setTaskStatus] = useState<BackgroundTaskStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageKind, setMessageKind] = useState<'error' | 'success'>('success')
  const restoreConfirmationRef = useRef<HTMLInputElement>(null)

  const setSuccessMessage = (nextMessage: string) => {
    setMessageKind('success')
    setMessage(nextMessage)
  }

  const run = async (nextOperation: Operation, task: () => Promise<void>) => {
    setOperation(nextOperation)
    setTaskStatus(null)
    setMessage(null)
    try {
      await task()
    } catch (error) {
      setMessageKind('error')
      setMessage(error instanceof Error ? t(error.message) : t('数据操作未完成。'))
    } finally {
      setOperation(null)
    }
  }

  const readCurrentState = async () =>
    Promise.all([
      window.desktop.dataManagement.diagnose(),
      window.desktop.dataManagement.inspectBackupLifecycle({
        retentionPolicy: compatibilityRetentionPolicy,
      }),
    ])

  const refreshDiagnostics = async () => {
    await run('diagnose', async () => {
      const [nextDiagnostics, nextLifecycle] = await readCurrentState()
      setDiagnostics(nextDiagnostics)
      setLifecycle(nextLifecycle)
      setInterruptedPreview(null)
      setConfirmInterruptedRecovery(false)
    })
  }

  useEffect(() => {
    void refreshDiagnostics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (restorePreview?.canRestore) restoreConfirmationRef.current?.focus()
  }, [restorePreview])

  const restorePackagePath = restorePreview?.verification.packagePath ?? null
  const canExecuteRestore =
    Boolean(restorePackagePath) && Boolean(restorePreview?.canRestore) && confirmRestore

  const publishRestorePreview = (preview: RestorePreview | null) => {
    setRestorePreview(preview)
    setRestoreResult(null)
    setConfirmRestore(false)
  }

  return (
    <main className="workspace-stage flex h-full min-h-0 flex-col overflow-hidden">
      <header className="glass-section-header flex min-h-[62px] flex-wrap items-center gap-3 border-b px-5 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/12 text-success ring-1 ring-success/14">
          <ShieldCheck aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{t('备份与恢复')}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('检查当前工作区数据，导出工作区备份，或从已验证的备份恢复')}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-[1120px] gap-4">
          {message && (
            <div
              aria-atomic="true"
              aria-live={messageKind === 'error' ? 'assertive' : 'polite'}
              className={
                messageKind === 'error'
                  ? 'rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning'
                  : 'rounded-xl border border-success/25 bg-success/8 p-3 text-sm text-success'
              }
              role={messageKind === 'error' ? 'alert' : 'status'}
            >
              {message}
            </div>
          )}

          {operation && taskStatus && (
            <TaskProgressIndicator status={taskStatus} title="批量任务" />
          )}

          <DataInterruptedRecoveryPanel
            confirmRecovery={confirmInterruptedRecovery}
            disabled={operation !== null}
            interruptedOperationCount={lifecycle?.interruptedOperationCount ?? 0}
            interruptedOperations={lifecycle?.interruptedOperations ?? []}
            isRecovering={operation === 'recover-interrupted'}
            onConfirmRecoveryChange={setConfirmInterruptedRecovery}
            onPreview={operationId =>
              void run('interrupted-preview', async () => {
                setInterruptedPreview(
                  await window.desktop.dataManagement.previewInterruptedRecovery({ operationId }),
                )
                setConfirmInterruptedRecovery(false)
              })
            }
            onRecover={() =>
              void run('recover-interrupted', async () => {
                if (!interruptedPreview?.operation) return
                const requestId = crypto.randomUUID()
                const result = await runTrackedOperation(
                  requestId,
                  () =>
                    window.desktop.dataManagement.recoverInterruptedOperation({
                      confirmRecovery: true,
                      operationId: interruptedPreview.operation!.id,
                      requestId,
                      retentionPolicy: compatibilityRetentionPolicy,
                    }),
                  setTaskStatus,
                )
                setLifecycle(result.inventory)
                setDiagnostics(await window.desktop.dataManagement.diagnose())
                setInterruptedPreview(null)
                setConfirmInterruptedRecovery(false)
                setSuccessMessage(t('未完成的数据操作已按预览安全处理。'))
              })
            }
            preview={interruptedPreview}
          />

          <DataHealthSummary
            disabled={operation !== null}
            diagnostics={diagnostics}
            interruptedOperationCount={lifecycle?.interruptedOperationCount ?? 0}
            isChecking={operation === 'diagnose'}
            onNavigateToAiManagement={onNavigateToAiManagement}
            onRefresh={() => void refreshDiagnostics()}
          />

          <DataBackupRestorePanel
            canExecuteRestore={canExecuteRestore}
            confirmRestore={confirmRestore}
            exportResult={exportResult}
            onConfirmRestoreChange={setConfirmRestore}
            onExport={() =>
              void run('export', async () => {
                const requestId = crypto.randomUUID()
                const result = await runTrackedOperation(
                  requestId,
                  () =>
                    window.desktop.dataManagement.exportBackup({
                      includeTemplateSources: true,
                      requestId,
                    }),
                  setTaskStatus,
                )
                setExportResult(result)
                if (result) setSuccessMessage(t('备份已导出并通过校验。'))
              })
            }
            onPreviewRestore={() =>
              void run('preview', async () => {
                const requestId = crypto.randomUUID()
                publishRestorePreview(
                  await runTrackedOperation(
                    requestId,
                    () => window.desktop.dataManagement.previewRestore({ requestId }),
                    setTaskStatus,
                  ),
                )
              })
            }
            onRestore={() =>
              void run('restore', async () => {
                if (!restorePackagePath) return
                const requestId = crypto.randomUUID()
                const result = await runTrackedOperation(
                  requestId,
                  () =>
                    window.desktop.dataManagement.restoreBackup({
                      confirmRestore: true,
                      expectedSourceWorkspaceId: restorePreview!.sourceWorkspace!.id,
                      expectedTargetWorkspaceId: restorePreview!.targetWorkspace.id,
                      packagePath: restorePackagePath,
                      requestId,
                    }),
                  setTaskStatus,
                )
                const [nextDiagnostics, nextLifecycle] = await readCurrentState()
                const restoredWorkspace = await window.desktop.workspace.getCurrent()
                if (!restoredWorkspace) {
                  throw new Error(t('恢复完成，但无法重新加载当前工作区，请重启应用。'))
                }
                setRestoreResult(result)
                setDiagnostics(nextDiagnostics)
                setLifecycle(nextLifecycle)
                onWorkspaceRestored(restoredWorkspace)
                setSuccessMessage(t('当前工作区恢复完成；其他工作区和 Provider 配置未修改。'))
                setConfirmRestore(false)
              })
            }
            operation={operation}
            restoreConfirmationRef={restoreConfirmationRef}
            restorePreview={restorePreview}
            restoreResult={restoreResult}
          />
        </div>
      </div>
    </main>
  )
}
