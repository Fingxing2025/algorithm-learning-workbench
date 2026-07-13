export type IpcErrorCode =
  | 'DATABASE_ERROR'
  | 'FILE_ALREADY_EXISTS'
  | 'FILE_TOO_LARGE'
  | 'FILE_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'PATH_NOT_AUTHORIZED'
  | 'SCAN_FAILED'
  | 'UNKNOWN'
  | 'WORKSPACE_REQUIRED'
  | 'WORKSPACE_UNAVAILABLE'

export interface IpcError {
  code: IpcErrorCode
  message: string
}

export type IpcResult<T> = { ok: true; value: T } | { error: IpcError; ok: false }
