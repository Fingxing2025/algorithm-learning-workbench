import {
  backgroundTaskRequestSchema,
  backgroundTaskStatusSchema,
} from '@core/contracts/background-task'
import { IPC_CHANNELS } from '@core/ipc/channels'

import type { BackgroundTaskRegistry } from '../services/background-task-registry'
import { registerValidatedHandler } from './register-validated-handler'

export function registerBackgroundTaskIpc(registry: BackgroundTaskRegistry): void {
  registerValidatedHandler({
    channel: IPC_CHANNELS.backgroundTasks.get,
    handler: request => registry.get(request.taskId),
    inputSchema: backgroundTaskRequestSchema,
    outputSchema: backgroundTaskStatusSchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.backgroundTasks.cancel,
    handler: request => registry.cancel(request.taskId),
    inputSchema: backgroundTaskRequestSchema,
    outputSchema: backgroundTaskStatusSchema,
  })
}
