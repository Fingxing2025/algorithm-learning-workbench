import { z } from 'zod'

import {
  aiConnectionResultSchema,
  aiProviderIdRequestSchema,
  aiProviderListSchema,
  aiProviderProfileSchema,
  aiTaskRouteListSchema,
  aiTaskRouteSchema,
  createAiProviderRequestSchema,
  updateAiProviderRequestSchema,
  upsertAiTaskRouteRequestSchema,
} from '@core/contracts/ai-provider'
import { IPC_CHANNELS } from '@core/ipc/channels'

import type { AiProviderService } from '../services/ai-provider-service'
import { registerValidatedHandler } from './register-validated-handler'

export function registerAiProviderIpc(service: AiProviderService): void {
  registerValidatedHandler({
    channel: IPC_CHANNELS.aiProviders.list,
    handler: () => service.list(),
    inputSchema: z.void(),
    outputSchema: aiProviderListSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.aiProviders.create,
    handler: request => service.create(request),
    inputSchema: createAiProviderRequestSchema,
    outputSchema: aiProviderProfileSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.aiProviders.update,
    handler: request => service.update(request),
    inputSchema: updateAiProviderRequestSchema,
    outputSchema: aiProviderProfileSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.aiProviders.delete,
    handler: async request => {
      await service.delete(request.id)
      return null
    },
    inputSchema: aiProviderIdRequestSchema,
    outputSchema: z.null(),
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.aiProviders.testConnection,
    handler: request => service.testConnection(request.id),
    inputSchema: aiProviderIdRequestSchema,
    outputSchema: aiConnectionResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.aiProviders.listRoutes,
    handler: () => service.listRoutes(),
    inputSchema: z.void(),
    outputSchema: aiTaskRouteListSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.aiProviders.upsertRoute,
    handler: request => service.upsertRoute(request),
    inputSchema: upsertAiTaskRouteRequestSchema,
    outputSchema: aiTaskRouteSchema,
  })
}
