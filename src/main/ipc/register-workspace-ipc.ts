import type { BrowserWindow } from 'electron'
import { z } from 'zod'

import {
  chooseWorkspaceRequestSchema,
  createTemplateRequestSchema,
  createTemplateResultSchema,
  templateActionRequestSchema,
  templateRequestSchema,
  templateSourceSchema,
  workspaceSnapshotSchema,
} from '@core/contracts/workspace'
import { IPC_CHANNELS } from '@core/ipc/channels'

import type { WorkspaceService } from '../services/workspace-service'
import { registerValidatedHandler } from './register-validated-handler'

export function registerWorkspaceIpc(
  workspaceService: WorkspaceService,
  getParentWindow: () => BrowserWindow | undefined,
): void {
  registerValidatedHandler({
    channel: IPC_CHANNELS.workspace.getCurrent,
    handler: () => workspaceService.getCurrentWorkspace(),
    inputSchema: z.void(),
    outputSchema: workspaceSnapshotSchema.nullable(),
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
