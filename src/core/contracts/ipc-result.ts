export type IpcErrorCode =
  | 'DATABASE_ERROR'
  | 'FILE_ALREADY_EXISTS'
  | 'FILE_TOO_LARGE'
  | 'FILE_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'IMAGE_LIMIT_REACHED'
  | 'PATH_NOT_AUTHORIZED'
  | 'PROBLEM_NOT_FOUND'
  | 'SCAN_FAILED'
  | 'UNKNOWN'
  | 'TEMPLATE_NOT_FOUND'
  | 'WORKSPACE_REQUIRED'
  | 'WORKSPACE_UNAVAILABLE'

export interface IpcError {
  code: IpcErrorCode
  message: string
}

export type IpcResult<T> = { ok: true; value: T } | { error: IpcError; ok: false }
