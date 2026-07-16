import { z } from 'zod'

import {
  backupExportResultSchema,
  backupVerificationSchema,
  dataDiagnosticsSchema,
  exportBackupRequestSchema,
  restoreBackupRequestSchema,
  restoreBackupResultSchema,
  restorePreviewSchema,
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
    channel: IPC_CHANNELS.dataManagement.previewRestore,
    handler: () => service.previewRestore(getParentWindow()),
    inputSchema: z.void(),
    outputSchema: restorePreviewSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.dataManagement.restoreBackup,
    handler: request => service.restoreBackup(request),
    inputSchema: restoreBackupRequestSchema,
    outputSchema: restoreBackupResultSchema,
  })
}
