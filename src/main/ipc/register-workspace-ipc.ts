import type { BrowserWindow } from 'electron'
import { z } from 'zod'

import {
  backgroundTaskStatusSchema,
  startBackgroundTaskRequestSchema,
} from '@core/contracts/background-task'
import {
  chooseWorkspaceRequestSchema,
  createTemplateRequestSchema,
  createTemplateResultSchema,
  templateActionRequestSchema,
  templatePageRequestSchema,
  templatePageSchema,
  templateRequestSchema,
  templateSummarySchema,
  templateSourceSchema,
  workspaceSnapshotSchema,
} from '@core/contracts/workspace'
import { IPC_CHANNELS } from '@core/ipc/channels'

import type { WorkspaceService } from '../services/workspace-service'
import type { BackgroundTaskRegistry } from '../services/background-task-registry'
import { registerValidatedHandler } from './register-validated-handler'

export function registerWorkspaceIpc(
  workspaceService: WorkspaceService,
  backgroundTasks: BackgroundTaskRegistry,
  getParentWindow: () => BrowserWindow | undefined,
): void {
  registerValidatedHandler({
    channel: IPC_CHANNELS.workspace.getCurrent,
    handler: () => workspaceService.getCurrentWorkspace(),
    inputSchema: z.void(),
    outputSchema: workspaceSnapshotSchema.nullable(),
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.workspace.startRescan,
    handler: request => {
      const workspaceId = workspaceService.getActiveWorkspaceId()
      return backgroundTasks.start({
        id: request.requestId,
        kind: 'workspace-scan',
        run: async ({ signal, updateProgress }) => {
          let lastProcessedCount = 0
          let lastTotalCount: number | null = null
          const workspace = await workspaceService.rescanCurrentWorkspace(undefined, {
            onBeforePublish: () => {
              updateProgress({
                phase: 'publishing',
                processedCount: lastProcessedCount,
                totalCount: lastTotalCount,
              })
            },
            onProgress: progress => {
              lastProcessedCount = progress.processedCount
              lastTotalCount = progress.totalCount
              updateProgress(progress)
            },
            signal,
          })
          return { kind: 'workspace-scan', workspace }
        },
        scope: workspaceId,
      })
    },
    inputSchema: startBackgroundTaskRequestSchema,
    outputSchema: backgroundTaskStatusSchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.workspace.choose,
    handler: request => workspaceService.chooseWorkspace(request, getParentWindow()),
    inputSchema: chooseWorkspaceRequestSchema,
    outputSchema: workspaceSnapshotSchema.nullable(),
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.workspace.rescan,
    handler: () => workspaceService.rescanCurrentWorkspace(),
    inputSchema: z.void(),
    outputSchema: workspaceSnapshotSchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.templates.readSource,
    handler: request => workspaceService.readTemplateSource(request.templateId),
    inputSchema: templateRequestSchema,
    outputSchema: templateSourceSchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.templates.getSummary,
    handler: request => workspaceService.getTemplateSummary(request.templateId),
    inputSchema: templateRequestSchema,
    outputSchema: templateSummarySchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.templates.listPage,
    handler: request => workspaceService.listTemplatesPage(request),
    inputSchema: templatePageRequestSchema,
    outputSchema: templatePageSchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.templates.performAction,
    handler: async request => {
      await workspaceService.performTemplateAction(request)
      return null
    },
    inputSchema: templateActionRequestSchema,
    outputSchema: z.null(),
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.templates.create,
    handler: request => workspaceService.createTemplate(request),
    inputSchema: createTemplateRequestSchema,
    outputSchema: createTemplateResultSchema,
  })
}
