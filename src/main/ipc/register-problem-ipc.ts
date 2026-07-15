import type { BrowserWindow } from 'electron'
import { z } from 'zod'

import {
  createProblemRequestSchema,
  problemImageDataSchema,
  problemImageRequestSchema,
  problemListSchema,
  problemRequestSchema,
  problemSchema,
  removeProblemImageRequestSchema,
  removeProblemRelationRequestSchema,
  updateProblemRequestSchema,
  upsertProblemRelationRequestSchema,
} from '@core/contracts/problem'
import { IPC_CHANNELS } from '@core/ipc/channels'

import type { ProblemService } from '../services/problem-service'
import { registerValidatedHandler } from './register-validated-handler'

export function registerProblemIpc(
  problemService: ProblemService,
  getParentWindow: () => BrowserWindow | undefined,
): void {
  registerValidatedHandler({
    channel: IPC_CHANNELS.problems.list,
    handler: () => problemService.getProblems(),
    inputSchema: z.void(),
    outputSchema: problemListSchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.problems.create,
    handler: request => problemService.createProblem(request),
    inputSchema: createProblemRequestSchema,
    outputSchema: problemSchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.problems.delete,
    handler: async request => {
      await problemService.deleteProblem(request.problemId)
      return null
    },
    inputSchema: problemRequestSchema,
    outputSchema: z.null(),
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.problems.update,
    handler: request => problemService.updateProblem(request),
    inputSchema: updateProblemRequestSchema,
    outputSchema: problemSchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.problems.upsertRelation,
    handler: request => problemService.upsertRelation(request),
    inputSchema: upsertProblemRelationRequestSchema,
    outputSchema: problemSchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.problems.removeRelation,
    handler: request => problemService.removeRelation(request),
    inputSchema: removeProblemRelationRequestSchema,
    outputSchema: problemSchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.problems.addImages,
    handler: request => problemService.addImages(request.problemId, getParentWindow()),
    inputSchema: problemRequestSchema,
    outputSchema: problemSchema.nullable(),
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.problems.readImage,
    handler: request => problemService.readImage(request.imageId),
    inputSchema: problemImageRequestSchema,
    outputSchema: problemImageDataSchema,
  })

  registerValidatedHandler({
    channel: IPC_CHANNELS.problems.removeImage,
    handler: request => problemService.removeImage(request),
    inputSchema: removeProblemImageRequestSchema,
    outputSchema: problemSchema,
  })
}
