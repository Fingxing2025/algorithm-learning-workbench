import { z } from 'zod'

import {
  analyzeProblemRequestSchema,
  chooseProblemAnalysisImagesResultSchema,
  commitProblemAnalysisRequestSchema,
  problemAnalysisDraftSchema,
  previewProblemAnalysisRequestSchema,
  previewProblemAnalysisResultSchema,
} from '@core/contracts/problem-analysis'
import { problemSchema } from '@core/contracts/problem'
import { IPC_CHANNELS } from '@core/ipc/channels'

import type { ProblemAnalysisService } from '../services/problem-analysis-service'
import { registerValidatedHandler } from './register-validated-handler'

export function registerProblemAnalysisIpc(
  service: ProblemAnalysisService,
  getParentWindow: () => Electron.BrowserWindow | undefined,
): void {
  registerValidatedHandler({
    channel: IPC_CHANNELS.problemAnalysis.chooseImages,
    handler: () => service.chooseImages(getParentWindow()),
    inputSchema: z.void(),
    outputSchema: chooseProblemAnalysisImagesResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.problemAnalysis.preview,
    handler: request => service.preview(request),
    inputSchema: previewProblemAnalysisRequestSchema,
    outputSchema: previewProblemAnalysisResultSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.problemAnalysis.analyze,
    handler: request => service.analyze(request),
    inputSchema: analyzeProblemRequestSchema,
    outputSchema: problemAnalysisDraftSchema,
  })
  registerValidatedHandler({
    channel: IPC_CHANNELS.problemAnalysis.commit,
    handler: request => service.commit(request),
    inputSchema: commitProblemAnalysisRequestSchema,
    outputSchema: problemSchema,
  })
}
