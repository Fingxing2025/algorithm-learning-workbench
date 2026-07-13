import { ipcMain } from 'electron'
import type { ZodType } from 'zod'

import type { IpcResult } from '@core/contracts/ipc-result'

import { toPublicIpcError } from '../errors/public-error'

interface HandlerOptions<Input, Output> {
  channel: string
  handler: (input: Input) => Output | Promise<Output>
  inputSchema: ZodType<Input>
  outputSchema: ZodType<Output>
}

export function registerValidatedHandler<Input, Output>({
  channel,
  handler,
  inputSchema,
  outputSchema,
}: HandlerOptions<Input, Output>): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (_event, rawInput): Promise<IpcResult<Output>> => {
    try {
      const input = inputSchema.parse(rawInput)
      const value = outputSchema.parse(await handler(input))
      return { ok: true, value }
    } catch (error) {
      return { error: toPublicIpcError(error), ok: false }
    }
  })
}
