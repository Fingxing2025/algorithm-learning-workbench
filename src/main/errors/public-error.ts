import { ZodError } from 'zod'

import type { AiErrorStage, IpcError, IpcErrorCode } from '@core/contracts/ipc-result'

export type AiProviderFailureReason =
  'model-not-found' | 'structured-output-unsupported' | 'token-limit'

export class PublicError extends Error {
  constructor(
    public readonly code: IpcErrorCode,
    message: string,
    public readonly retryAfterMs?: number,
    public readonly stage?: AiErrorStage,
    public readonly providerReason?: AiProviderFailureReason,
  ) {
    super(message)
    this.name = 'PublicError'
  }
}

export function toPublicIpcError(error: unknown): IpcError {
  if (error instanceof PublicError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
      ...(error.stage === undefined ? {} : { stage: error.stage }),
    }
  }

  if (error instanceof ZodError) {
    return { code: 'INVALID_REQUEST', message: '请求参数无效，请重试。' }
  }

  return { code: 'UNKNOWN', message: '操作未完成，请重试。' }
}
