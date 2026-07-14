import { z } from 'zod'

import {
  classifyTemplateRequestSchema,
  importTemplateRequestSchema,
  importTemplateResultSchema,
  templateClassificationSchema,
  templateImportSourceSchema,
  templateMetadataRequestSchema,
  templateMetadataSchema,
  updateTemplateMetadataRequestSchema,
} from '@core/contracts/template-management'
import { IPC_CHANNELS } from '@core/ipc/channels'

import type { TemplateManagementService } from '../services/template-management-service'
import { registerValidatedHandler } from './register-validated-handler'

export function registerTemplateManagementIpc(
  service: TemplateManagementService,
  getParentWindow: () => Electron.BrowserWindow | undefined,
): void {
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.chooseImportSource,
    handler: () => service.chooseImportSource(getParentWindow()),
    inputSchema: z.void(),
    outputSchema: templateImportSourceSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.classify,
    handler: request => service.classify(request),
    inputSchema: classifyTemplateRequestSchema,
    outputSchema: templateClassificationSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.importTemplate,
    handler: request => service.importTemplate(request),
    inputSchema: importTemplateRequestSchema,
    outputSchema: importTemplateResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.getMetadata,
    handler: request => service.getMetadata(request.templateId),
    inputSchema: templateMetadataRequestSchema,
    outputSchema: templateMetadataSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.updateMetadata,
    handler: request => service.updateMetadata(request),
    inputSchema: updateTemplateMetadataRequestSchema,
    outputSchema: templateMetadataSchema,
  })
}
