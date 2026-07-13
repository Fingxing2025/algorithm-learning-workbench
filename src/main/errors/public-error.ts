import { ZodError } from 'zod'

import type { IpcError, IpcErrorCode } from '@core/contracts/ipc-result'

export class PublicError extends Error {
  constructor(
    public readonly code: IpcErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'PublicError'
  }
}

export function toPublicIpcError(error: unknown): IpcError {
  if (error instanceof PublicError) {
    return { code: error.code, message: error.message }
  }

  if (error instanceof ZodError) {
    return { code: 'INVALID_REQUEST', message: '请求参数无效，请重试。' }
  }

  return { code: 'UNKNOWN', message: '操作未完成，请重试。' }
}
