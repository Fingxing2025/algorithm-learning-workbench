import { z } from 'zod'

import {
  backupExportResultSchema,
  backupLifecycleInventorySchema,
  backupLifecycleRequestSchema,
  backupVerificationSchema,
  cleanupPreviewRequestSchema,
  cleanupPreviewSchema,
  dataDiagnosticsSchema,
  exportBackupRequestSchema,
  interruptedRecoveryPreviewRequestSchema,
  interruptedRecoveryPreviewSchema,
  quarantineReleasePreviewRequestSchema,
  quarantineReleasePreviewSchema,
  recoverInterruptedOperationRequestSchema,
  recoverInterruptedOperationResultSchema,
  releaseQuarantineRequestSchema,
  releaseQuarantineResultSchema,
  restoreBackupRequestSchema,
  restoreBackupResultSchema,
  restorePreviewSchema,
  quarantineCleanupRequestSchema,
  quarantineCleanupResultSchema,
  undoCleanupRequestSchema,
  undoCleanupResultSchema,
} from '@core/contracts/data-management'
import { IPC_CHANNELS } from '@core/ipc/channels'

import type { DataManagementService } from '../services/data-management-service'
import { registerValidatedHandler } from './register-validated-handler'

export function registerDataManagementIpc(
  service: DataManagementService,
  getParentWindow: () => Electron.BrowserWindow | undefined,
): void {
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.diagnose,
    handler: () => service.diagnose(),
    inputSchema: z.void(),
    outputSchema: dataDiagnosticsSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.exportBackup,
    handler: request => service.exportBackup(request, getParentWindow()),
    inputSchema: exportBackupRequestSchema,
    outputSchema: backupExportResultSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.verifyBackup,
    handler: () => service.verifyBackup(getParentWindow()),
    inputSchema: z.void(),
    outputSchema: backupVerificationSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.inspectBackupLifecycle,
    handler: request => service.inspectBackupLifecycle(request),
    inputSchema: backupLifecycleRequestSchema,
    outputSchema: backupLifecycleInventorySchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.previewCleanup,
    handler: request => service.previewCleanup(request),
    inputSchema: cleanupPreviewRequestSchema,
    outputSchema: cleanupPreviewSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.previewRestore,
    handler: () => service.previewRestore(getParentWindow()),
    inputSchema: z.void(),
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
    handler: request => service.recoverInterruptedOperation(request),
    inputSchema: recoverInterruptedOperationRequestSchema,
    outputSchema: recoverInterruptedOperationResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.previewQuarantineRelease,
    handler: request => service.previewQuarantineRelease(request),
    inputSchema: quarantineReleasePreviewRequestSchema,
    outputSchema: quarantineReleasePreviewSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.releaseQuarantine,
    handler: request => service.releaseQuarantine(request),
    inputSchema: releaseQuarantineRequestSchema,
    outputSchema: releaseQuarantineResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.quarantineCleanup,
    handler: request => service.quarantineCleanup(request),
    inputSchema: quarantineCleanupRequestSchema,
    outputSchema: quarantineCleanupResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.restoreBackup,
    handler: request => service.restoreBackup(request),
    inputSchema: restoreBackupRequestSchema,
    outputSchema: restoreBackupResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.undoCleanup,
    handler: request => service.undoCleanup(request),
    inputSchema: undoCleanupRequestSchema,
    outputSchema: undoCleanupResultSchema,
  })
}
