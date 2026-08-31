import type { BrowserWindow } from 'electron'
import { z } from 'zod'

import {
  cancelTemplateExportRequestSchema,
  templateExportRequestSchema,
  templateExportResultSchema,
} from '@core/contracts/template-export'
import { IPC_CHANNELS } from '@core/ipc/channels'

import type { TemplateExportService } from '../services/template-export-service'
import { registerValidatedHandler } from './register-validated-handler'

export function registerTemplateExportIpc(
  service: TemplateExportService,
  getParentWindow: () => BrowserWindow | undefined,
): void {
  registerValidatedHandler({
    channel: IPC_CHANNELS.templates.export,
    handler: request => service.export(request, getParentWindow()),
    inputSchema: templateExportRequestSchema,
    outputSchema: templateExportResultSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templates.cancelExport,
    handler: request => {
      service.cancel(request.requestId)
      return null
    },
    inputSchema: cancelTemplateExportRequestSchema,
    outputSchema: z.null(),
  })
}
