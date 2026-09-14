import { randomUUID } from 'node:crypto'
import { workspaceSnapshotSchema } from '@core/contracts/workspace'
import { z } from 'zod'

import {
  applyExistingTemplateMetadataCompletionRequestSchema,
  batchStagingRecoveryListSchema,
  recoverBatchStagingRequestSchema,
  applyExistingTemplateMetadataCompletionResultSchema,
  batchImportTemplateRequestSchema,
  batchImportTemplateResultSchema,
  batchTemplateImportSourceListSchema,
  inspectBatchTemplateImportRequestSchema,
  inspectBatchTemplateImportResultSchema,
  classifyTemplateRequestSchema,
  classifyBatchTemplateClassificationRequestSchema,
  batchTemplateClassificationResultSchema,
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
  deleteInvalidFileExecutionsRequestSchema,
  deleteInvalidFileExecutionsResultSchema,
  deleteFilePlansRequestSchema,
  deleteFilePlansResultSchema,
  exportFilePlanDiagnosticRequestSchema,
  existingTemplateMetadataCompletionDraftSchema,
  existingTemplateMetadataCompletionPreviewSchema,
  fileChangeExecutionListSchema,
  fileChangeExecutionPageSchema,
  fileHistoryPageRequestSchema,
  invalidFileExecutionDeletionPreviewSchema,
  invalidFileExecutionPageRequestSchema,
  invalidFileExecutionPageSchema,
  fileChangeMutationResultSchema,
  fileChangePlanListSchema,
  fileChangePlanPageSchema,
  fileHistoryDeletionPreviewSchema,
  fileChangePlanRequestSchema,
  fileChangePlanSchema,
  filePlanGenerationRequestSchema,
  generateExistingTemplateMetadataCompletionRequestSchema,
  previewFilePlanRequestSchema,
  previewFilePlanResultSchema,
  previewExistingTemplateMetadataCompletionRequestSchema,
  previewDeleteFileExecutionsRequestSchema,
  previewDeleteInvalidFileExecutionsRequestSchema,
  previewDeleteFilePlansRequestSchema,
  previewBatchTemplateClassificationRequestSchema,
  previewBatchTemplateClassificationResultSchema,
  previewTemplateAiPlanRequestSchema,
  previewBatchStagingClassificationRequestSchema,
  previewBatchStagingClassificationResultSchema,
  stagingAiPlanPreviewSchema,
  stagingAiPlanDraftSchema,
  stagingAiPlanDraftRequestSchema,
  discardStagingAiPlanDraftRequestSchema,
  createBatchTemplateStagingRequestSchema,
  batchTemplateStagingSchema,
  batchTemplateStagingListSchema,
  batchTemplateStagingIdRequestSchema,
  processBatchTemplateStagingRequestSchema,
  retryBatchTemplateStagingRequestSchema,
  updateBatchTemplateStagingItemRequestSchema,
  applyBatchTemplateStagingRequestSchema,
  applyBatchTemplateStagingResultSchema,
  applyStagingAiPlanRequestSchema,
  applyStagingAiPlanResultSchema,
  discardBatchTemplateStagingRequestSchema,
  previewTemplateRelocationRequestSchema,
  rollbackFileChangeExecutionRequestSchema,
  templateRelocationPreviewSchema,
  workspaceAuditSchema,
} from '@core/contracts/template-management'
import { IPC_CHANNELS } from '@core/ipc/channels'
import { cancelAiRequestSchema } from '@core/contracts/ai-request'
import {
  type BackgroundTaskProgress,
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
  type StagingFacade = Pick<
    TemplateManagementService,
    | 'applyBatchStaging'
    | 'applyBatchStagingAiPlan'
    | 'cancelBatchStaging'
    | 'cancelBatchStagingAiPlan'
    | 'continueBatchStaging'
    | 'createBatchStaging'
    | 'discardBatchStaging'
    | 'discardBatchStagingAiDraft'
    | 'generateBatchStagingAiPlan'
    | 'getBatchStaging'
    | 'getBatchStagingAiDraft'
    | 'listBatchStagings'
    | 'previewBatchStagingAiPlan'
    | 'previewBatchStagingClassification'
    | 'retryBatchStaging'
    | 'updateBatchStagingItem'
  >
  // Keep one validated IPC façade.  TemplateManagementService owns the
  // staging dependency and enforces the active-workspace boundary; wiring a
  // second direct service here would let future handlers accidentally bypass
  // that policy.
  const stagingFacade: StagingFacade = service
  const runTracked = <Result>(
    requestId: string | undefined,
    scope: string,
    run: (context: {
      signal: AbortSignal
      updateProgress: (progress: BackgroundTaskProgress) => void
    }) => Promise<Result>,
  ): Promise<Result> => {
    return backgroundTasks.track({ id: requestId ?? randomUUID(), run, scope })
  }
  const runStagingTracked = <Result>(
    requestId: string | undefined,
    scope: string,
    run: (updateProgress: (progress: BackgroundTaskProgress) => void) => Promise<Result>,
    cancel: ((requestId: string) => void) | undefined,
  ): Promise<Result> =>
    runTracked(requestId, scope, ({ signal, updateProgress }) => {
      if (!requestId || !cancel) return run(updateProgress)
      const onAbort = () => cancel(requestId)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
      return run(updateProgress).finally(() => signal.removeEventListener('abort', onAbort))
    })

  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.inspectBatchStagingRecoveries,
    handler: () => service.inspectBatchStagingRecoveries(),
    inputSchema: z.void(),
    outputSchema: batchStagingRecoveryListSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.recoverBatchStaging,
    handler: request =>
      runTracked(randomUUID(), service.getActiveWorkspaceId(), () =>
        service.recoverBatchStaging(request),
      ),
    inputSchema: recoverBatchStagingRequestSchema,
    outputSchema: workspaceSnapshotSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewExistingMetadataCompletion,
    handler: request => service.previewExistingMetadataCompletion(request),
    inputSchema: previewExistingTemplateMetadataCompletionRequestSchema,
    outputSchema: existingTemplateMetadataCompletionPreviewSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.generateExistingMetadataCompletion,
    handler: request =>
      runTracked(request.requestId, service.getActiveWorkspaceId(), ({ updateProgress }) =>
        service.generateExistingMetadataCompletion(request, updateProgress),
      ),
    inputSchema: generateExistingTemplateMetadataCompletionRequestSchema,
    outputSchema: existingTemplateMetadataCompletionDraftSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.applyExistingMetadataCompletion,
    handler: request => service.applyExistingMetadataCompletion(request),
    inputSchema: applyExistingTemplateMetadataCompletionRequestSchema,
    outputSchema: applyExistingTemplateMetadataCompletionResultSchema,
  })
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
    channel: IPC_CHANNELS.templateManagement.createBatchStaging,
    handler: request =>
      runTracked(randomUUID(), service.getActiveWorkspaceId(), () =>
        stagingFacade.createBatchStaging(request),
      ),
    inputSchema: createBatchTemplateStagingRequestSchema,
    outputSchema: batchTemplateStagingSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.getBatchStaging,
    handler: request => stagingFacade.getBatchStaging(request),
    inputSchema: batchTemplateStagingIdRequestSchema,
    outputSchema: batchTemplateStagingSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.listBatchStagings,
    handler: () => stagingFacade.listBatchStagings(),
    inputSchema: z.void(),
    outputSchema: batchTemplateStagingListSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.continueBatchStaging,
    handler: request =>
      runStagingTracked(
        request.requestId,
        service.getActiveWorkspaceId(),
        updateProgress => stagingFacade.continueBatchStaging(request, updateProgress),
        requestId => stagingFacade.cancelBatchStaging(requestId),
      ),
    inputSchema: processBatchTemplateStagingRequestSchema,
    outputSchema: batchTemplateStagingSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.retryBatchStaging,
    handler: request =>
      runStagingTracked(
        request.requestId,
        service.getActiveWorkspaceId(),
        updateProgress => stagingFacade.retryBatchStaging(request, updateProgress),
        requestId => stagingFacade.cancelBatchStaging(requestId),
      ),
    inputSchema: retryBatchTemplateStagingRequestSchema,
    outputSchema: batchTemplateStagingSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.updateBatchStagingItem,
    handler: request =>
      runTracked(randomUUID(), service.getActiveWorkspaceId(), () =>
        stagingFacade.updateBatchStagingItem(request),
      ),
    inputSchema: updateBatchTemplateStagingItemRequestSchema,
    outputSchema: batchTemplateStagingSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.applyBatchStaging,
    handler: request =>
      runTracked(randomUUID(), service.getActiveWorkspaceId(), () =>
        stagingFacade.applyBatchStaging(request),
      ),
    inputSchema: applyBatchTemplateStagingRequestSchema,
    outputSchema: applyBatchTemplateStagingResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.applyBatchStagingAiPlan,
    handler: request =>
      runTracked(randomUUID(), service.getActiveWorkspaceId(), () =>
        stagingFacade.applyBatchStagingAiPlan(request),
      ),
    inputSchema: applyStagingAiPlanRequestSchema,
    outputSchema: applyStagingAiPlanResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.discardBatchStaging,
    handler: request => {
      return runTracked(randomUUID(), service.getActiveWorkspaceId(), () =>
        stagingFacade.discardBatchStaging(request),
      ).then(() => null)
    },
    inputSchema: discardBatchTemplateStagingRequestSchema,
    outputSchema: z.null(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewBatchStagingAiPlan,
    handler: request => stagingFacade.previewBatchStagingAiPlan(request),
    inputSchema: previewTemplateAiPlanRequestSchema,
    outputSchema: stagingAiPlanPreviewSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewBatchStagingClassification,
    handler: request => stagingFacade.previewBatchStagingClassification(request),
    inputSchema: previewBatchStagingClassificationRequestSchema,
    outputSchema: previewBatchStagingClassificationResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.generateBatchStagingAiPlan,
    handler: request =>
      runStagingTracked(
        request.requestId,
        service.getActiveWorkspaceId(),
        updateProgress => stagingFacade.generateBatchStagingAiPlan(request, updateProgress),
        requestId => stagingFacade.cancelBatchStagingAiPlan(requestId),
      ),
    inputSchema: filePlanGenerationRequestSchema,
    outputSchema: stagingAiPlanDraftSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.cancelBatchStagingAiPlan,
    handler: request => {
      stagingFacade.cancelBatchStagingAiPlan(request.requestId)
      return null
    },
    inputSchema: cancelAiRequestSchema,
    outputSchema: z.null(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.getBatchStagingAiDraft,
    handler: request => stagingFacade.getBatchStagingAiDraft(request),
    inputSchema: stagingAiPlanDraftRequestSchema,
    outputSchema: stagingAiPlanDraftSchema.nullable(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.discardBatchStagingAiDraft,
    handler: request => {
      stagingFacade.discardBatchStagingAiDraft(request)
      return null
    },
    inputSchema: discardStagingAiPlanDraftRequestSchema,
    outputSchema: z.null(),
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
    channel: IPC_CHANNELS.templateManagement.classifyBatch,
    handler: request =>
      runTracked(
        request.requestId,
        service.getActiveWorkspaceId(),
        ({ signal, updateProgress }) => {
          // Background-task cancellation and the AI run registry are separate
          // in-process controls; bridge them so cancelling from either path
          // stops the current provider request and prevents later batches.
          const abort = () => service.cancelClassification(request.requestId)
          signal.addEventListener('abort', abort, { once: true })
          return service
            .classifyBatch(request, { onProgress: updateProgress })
            .finally(() => signal.removeEventListener('abort', abort))
        },
      ),
    inputSchema: classifyBatchTemplateClassificationRequestSchema,
    outputSchema: batchTemplateClassificationResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewFilePlan,
    handler: request => service.previewFilePlan(request),
    inputSchema: previewFilePlanRequestSchema,
    outputSchema: previewFilePlanResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.generateFilePlan,
    handler: request =>
      runTracked(request.requestId, service.getActiveWorkspaceId(), ({ updateProgress }) =>
        service.generateFilePlan(request, updateProgress),
      ),
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
      try {
        backgroundTasks.cancel(request.requestId)
      } catch {
        // Direct service calls and previews do not create a background record.
      }
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
    channel: IPC_CHANNELS.templateManagement.cancelFilePlan,
    handler: request => service.cancelFilePlan(request.planId),
    inputSchema: fileChangePlanRequestSchema,
    outputSchema: fileChangePlanSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.applyFilePlan,
    handler: request =>
      runTracked(request.requestId, service.getActiveWorkspaceId(), ({ updateProgress }) =>
        service.applyFilePlan(request, updateProgress),
      ),
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
    channel: IPC_CHANNELS.templateManagement.listInvalidFileExecutionsPage,
    handler: request => service.listInvalidFileExecutionsPage(request),
    inputSchema: invalidFileExecutionPageRequestSchema,
    outputSchema: invalidFileExecutionPageSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewDeleteFileExecutions,
    handler: request => service.previewDeleteFileExecutions(request),
    inputSchema: previewDeleteFileExecutionsRequestSchema,
    outputSchema: fileHistoryDeletionPreviewSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.deleteFileExecutions,
    handler: request =>
      runTracked(request.requestId, service.getActiveWorkspaceId(), async ({ updateProgress }) => {
        updateProgress({
          currentItem: null,
          phase: 'cleaning',
          processedCount: 0,
          totalCount: null,
        })
        return service.deleteFileExecutions(request)
      }),
    inputSchema: deleteFileExecutionsRequestSchema,
    outputSchema: deleteFileExecutionsResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewDeleteInvalidFileExecutions,
    handler: request => service.previewDeleteInvalidFileExecutions(request),
    inputSchema: previewDeleteInvalidFileExecutionsRequestSchema,
    outputSchema: invalidFileExecutionDeletionPreviewSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.deleteInvalidFileExecutions,
    handler: request =>
      runTracked(request.requestId, service.getActiveWorkspaceId(), async ({ updateProgress }) => {
        updateProgress({
          currentItem: null,
          phase: 'cleaning',
          processedCount: 0,
          totalCount: null,
        })
        return service.deleteInvalidFileExecutions(request)
      }),
    inputSchema: deleteInvalidFileExecutionsRequestSchema,
    outputSchema: deleteInvalidFileExecutionsResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.previewDeleteFilePlans,
    handler: request => service.previewDeleteFilePlans(request),
    inputSchema: previewDeleteFilePlansRequestSchema,
    outputSchema: fileHistoryDeletionPreviewSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.deleteFilePlans,
    handler: request =>
      runTracked(request.requestId, service.getActiveWorkspaceId(), async ({ updateProgress }) => {
        updateProgress({
          currentItem: null,
          phase: 'cleaning',
          processedCount: 0,
          totalCount: null,
        })
        return service.deleteFilePlans(request)
      }),
    inputSchema: deleteFilePlansRequestSchema,
    outputSchema: deleteFilePlansResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.templateManagement.rollbackFileExecution,
    handler: request =>
      runTracked(request.requestId, service.getActiveWorkspaceId(), ({ updateProgress }) =>
        service.rollbackFileExecution(request.executionId, updateProgress),
      ),
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
    handler: request =>
      runTracked(request.requestId, service.getActiveWorkspaceId(), ({ updateProgress }) =>
        service.importTemplatesBatch(request, updateProgress),
      ),
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
