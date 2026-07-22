import { z } from 'zod'

import {
  batchImportTemplateRequestSchema,
  batchImportTemplateResultSchema,
  batchTemplateImportSourceListSchema,
  inspectBatchTemplateImportRequestSchema,
  inspectBatchTemplateImportResultSchema,
  classifyTemplateRequestSchema,
  importTemplateRequestSchema,
  importTemplateResultSchema,
  previewTemplateClassificationRequestSchema,
  previewTemplateClassificationResultSchema,
  templateClassificationSchema,
  templateImportSourceSchema,
  templateMetadataRequestSchema,
  templateMetadataSchema,
  updateTemplateMetadataRequestSchema,
  applyFileChangePlanRequestSchema,
  applyTemplateRelocationRequestSchema,
  cancelFilePlanGenerationRequestSchema,
  deleteFileExecutionsRequestSchema,
  deleteFileExecutionsResultSchema,
  deleteFilePlansRequestSchema,
  deleteFilePlansResultSchema,
  exportFilePlanDiagnosticRequestSchema,
  fileChangeExecutionListSchema,
  fileChangeExecutionPageSchema,
  fileHistoryPageRequestSchema,
  fileChangeMutationResultSchema,
  fileChangePlanListSchema,
  fileChangePlanPageSchema,
  fileHistoryDeletionPreviewSchema,
  fileChangePlanRequestSchema,
  fileChangePlanSchema,
  filePlanGenerationRequestSchema,
  previewFilePlanResultSchema,
  previewDeleteFileExecutionsRequestSchema,
  previewDeleteFilePlansRequestSchema,
  previewBatchTemplateClassificationRequestSchema,
  previewBatchTemplateClassificationResultSchema,
  previewTemplateRelocationRequestSchema,
  rollbackFileChangeExecutionRequestSchema,
  templateRelocationPreviewSchema,
  workspaceAuditSchema,
} from '@core/contracts/template-management'
import { IPC_CHANNELS } from '@core/ipc/channels'
import { cancelAiRequestSchema } from '@core/contracts/ai-request'
import {
  backgroundTaskStatusSchema,
  startBackgroundTaskRequestSchema,
} from '@core/contracts/background-task'

import type { TemplateManagementService } from '../services/template-management-service'
import type { BackgroundTaskRegistry } from '../services/background-task-registry'
import { registerValidatedHandler } from './register-validated-handler'

export function registerTemplateManagementIpc(
  service: TemplateManagementService,
  backgroundTasks: BackgroundTaskRegistry,
  getParentWindow: () => Electron.BrowserWindow | undefined,
): void {
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewTemplateRelocation,
    handler: request => service.previewTemplateRelocation(request),
    inputSchema: previewTemplateRelocationRequestSchema,
    outputSchema: templateRelocationPreviewSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.applyTemplateRelocation,
    handler: request => service.applyTemplateRelocation(request),
    inputSchema: applyTemplateRelocationRequestSchema,
    outputSchema: fileChangeMutationResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.chooseBatchImportFiles,
    handler: () => service.chooseBatchImportFiles(getParentWindow()),
    inputSchema: z.void(),
    outputSchema: batchTemplateImportSourceListSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.chooseBatchImportDirectory,
    handler: () => service.chooseBatchImportDirectory(getParentWindow()),
    inputSchema: z.void(),
    outputSchema: batchTemplateImportSourceListSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.chooseImportSource,
    handler: () => service.chooseImportSource(getParentWindow()),
    inputSchema: z.void(),
    outputSchema: templateImportSourceSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.auditWorkspace,
    handler: () => service.auditWorkspace(),
    inputSchema: z.void(),
    outputSchema: workspaceAuditSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.startAudit,
    handler: request => {
      const workspaceId = service.getActiveWorkspaceId()
      return backgroundTasks.start({
        id: request.requestId,
        kind: 'workspace-audit',
        run: async ({ signal, updateProgress }) => ({
          audit: await service.auditWorkspace({ onProgress: updateProgress, signal }),
          kind: 'workspace-audit',
        }),
        scope: workspaceId,
      })
    },
    inputSchema: startBackgroundTaskRequestSchema,
    outputSchema: backgroundTaskStatusSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewBatchClassification,
    handler: request => service.previewBatchClassification(request),
    inputSchema: previewBatchTemplateClassificationRequestSchema,
    outputSchema: previewBatchTemplateClassificationResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewFilePlan,
    handler: request => service.previewFilePlan(request),
    inputSchema: filePlanGenerationRequestSchema,
    outputSchema: previewFilePlanResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.generateFilePlan,
    handler: request => service.generateFilePlan(request),
    inputSchema: filePlanGenerationRequestSchema,
    outputSchema: fileChangePlanSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.cancelFilePlanGeneration,
    handler: request => {
      service.cancelFilePlanGeneration(request.requestId)
      return null
    },
    inputSchema: cancelFilePlanGenerationRequestSchema,
    outputSchema: z.null(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.cancelClassification,
    handler: request => {
      service.cancelClassification(request.requestId)
      return null
    },
    inputSchema: cancelAiRequestSchema,
    outputSchema: z.null(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.exportFilePlanDiagnostic,
    handler: request => service.exportFilePlanDiagnostic(request.planId, getParentWindow()),
    inputSchema: exportFilePlanDiagnosticRequestSchema,
    outputSchema: z.boolean(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.listFilePlans,
    handler: () => service.listFilePlans(),
    inputSchema: z.void(),
    outputSchema: fileChangePlanListSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.listFilePlansPage,
    handler: request => service.listFilePlansPage(request),
    inputSchema: fileHistoryPageRequestSchema,
    outputSchema: fileChangePlanPageSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.listArchivedFilePlansPage,
    handler: request => service.listArchivedFilePlansPage(request),
    inputSchema: fileHistoryPageRequestSchema,
    outputSchema: fileChangePlanPageSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.cancelFilePlan,
    handler: request => service.cancelFilePlan(request.planId),
    inputSchema: fileChangePlanRequestSchema,
    outputSchema: fileChangePlanSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.applyFilePlan,
    handler: request => service.applyFilePlan(request),
    inputSchema: applyFileChangePlanRequestSchema,
    outputSchema: fileChangeMutationResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.listFileExecutions,
    handler: () => service.listFileExecutions(),
    inputSchema: z.void(),
    outputSchema: fileChangeExecutionListSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.listFileExecutionsPage,
    handler: request => service.listFileExecutionsPage(request),
    inputSchema: fileHistoryPageRequestSchema,
    outputSchema: fileChangeExecutionPageSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewDeleteFileExecutions,
    handler: request => service.previewDeleteFileExecutions(request),
    inputSchema: previewDeleteFileExecutionsRequestSchema,
    outputSchema: fileHistoryDeletionPreviewSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.deleteFileExecutions,
    handler: request => service.deleteFileExecutions(request),
    inputSchema: deleteFileExecutionsRequestSchema,
    outputSchema: deleteFileExecutionsResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewDeleteFilePlans,
    handler: request => service.previewDeleteFilePlans(request),
    inputSchema: previewDeleteFilePlansRequestSchema,
    outputSchema: fileHistoryDeletionPreviewSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.deleteFilePlans,
    handler: request => service.deleteFilePlans(request),
    inputSchema: deleteFilePlansRequestSchema,
    outputSchema: deleteFilePlansResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.rollbackFileExecution,
    handler: request => service.rollbackFileExecution(request.executionId),
    inputSchema: rollbackFileChangeExecutionRequestSchema,
    outputSchema: fileChangeMutationResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewClassification,
    handler: request => service.previewClassification(request),
    inputSchema: previewTemplateClassificationRequestSchema,
    outputSchema: previewTemplateClassificationResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.classify,
    handler: request => service.classify(request),
    inputSchema: classifyTemplateRequestSchema,
    outputSchema: templateClassificationSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.deleteTemplate,
    handler: request => service.deleteTemplate(request.templateId),
    inputSchema: templateMetadataRequestSchema,
    outputSchema: fileChangeMutationResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.redraftFilePlan,
    handler: request => service.redraftFilePlan(request.planId),
    inputSchema: fileChangePlanRequestSchema,
    outputSchema: fileChangePlanSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.importTemplatesBatch,
    handler: request => service.importTemplatesBatch(request),
    inputSchema: batchImportTemplateRequestSchema,
    outputSchema: batchImportTemplateResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.inspectBatchImport,
    handler: request => service.inspectBatchImport(request),
    inputSchema: inspectBatchTemplateImportRequestSchema,
    outputSchema: inspectBatchTemplateImportResultSchema,
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
