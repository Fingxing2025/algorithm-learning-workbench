import { z } from 'zod'

import {
  backupExportResultSchema,
  backupLifecycleInventorySchema,
  backupLifecycleRequestSchema,
  backupSelectionRequestSchema,
  backupVerificationSchema,
  dataDiagnosticsSchema,
  exportBackupRequestSchema,
  interruptedRecoveryPreviewRequestSchema,
  interruptedRecoveryPreviewSchema,
  recoverInterruptedOperationRequestSchema,
  recoverInterruptedOperationResultSchema,
  restoreBackupRequestSchema,
  restoreBackupResultSchema,
  restorePreviewSchema,
} from '@core/contracts/data-management'
import { IPC_CHANNELS } from '@core/ipc/channels'
import type { BackgroundTaskProgress } from '@core/contracts/background-task'

import type { DataManagementService } from '../services/data-management-service'
import type { BackgroundTaskRegistry } from '../services/background-task-registry'
import { registerValidatedHandler } from './register-validated-handler'

export function registerDataManagementIpc(
  service: DataManagementService,
  backgroundTasks: BackgroundTaskRegistry,
  getParentWindow: () => Electron.BrowserWindow | undefined,
): void {
  const runTracked = <Result>(
    requestId: string | undefined,
    run: (context: {
      signal: AbortSignal
      updateProgress: (progress: BackgroundTaskProgress) => void
    }) => Promise<Result>,
  ): Promise<Result> => {
    if (!requestId) {
      const controller = new AbortController()
      return run({ signal: controller.signal, updateProgress: () => undefined })
    }
    return backgroundTasks.track({ id: requestId, run, scope: 'data-management' })
  }

  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.diagnose,
    handler: () => service.diagnose(),
    inputSchema: z.void(),
    outputSchema: dataDiagnosticsSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.exportBackup,
    handler: request =>
      runTracked(request.requestId, ({ updateProgress }) =>
        service.exportBackup(request, getParentWindow(), updateProgress),
      ),
    inputSchema: exportBackupRequestSchema,
    outputSchema: backupExportResultSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.verifyBackup,
    handler: request =>
      runTracked(request.requestId, async ({ updateProgress }) => {
        updateProgress({
          currentItem: '所选备份包',
          phase: 'verifying',
          processedCount: 0,
          totalCount: null,
        })
        return service.verifyBackup(request, getParentWindow())
      }),
    inputSchema: backupSelectionRequestSchema,
    outputSchema: backupVerificationSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.inspectBackupLifecycle,
    handler: request => service.inspectBackupLifecycle(request),
    inputSchema: backupLifecycleRequestSchema,
    outputSchema: backupLifecycleInventorySchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.previewRestore,
    handler: request =>
      runTracked(request.requestId, ({ updateProgress }) =>
        service.previewRestore(request, getParentWindow(), updateProgress),
      ),
    inputSchema: backupSelectionRequestSchema,
    outputSchema: restorePreviewSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.previewInterruptedRecovery,
    handler: request => service.previewInterruptedRecovery(request),
    inputSchema: interruptedRecoveryPreviewRequestSchema,
    outputSchema: interruptedRecoveryPreviewSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.recoverInterruptedOperation,
    handler: request =>
      runTracked(request.requestId, async ({ updateProgress }) => {
        updateProgress({
          currentItem: '异常中断数据',
          phase: 'restoring',
          processedCount: 0,
          totalCount: null,
        })
        return service.recoverInterruptedOperation(request)
      }),
    inputSchema: recoverInterruptedOperationRequestSchema,
    outputSchema: recoverInterruptedOperationResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.restoreBackup,
    handler: request =>
      runTracked(request.requestId, ({ updateProgress }) =>
        service.restoreBackup(request, updateProgress),
      ),
    inputSchema: restoreBackupRequestSchema,
    outputSchema: restoreBackupResultSchema,
  })
}
