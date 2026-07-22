export type IpcErrorCode =
  | 'AI_AUTH_FAILED'
  | 'AI_CAPABILITY_UNSUPPORTED'
  | 'AI_CANCELLED'
  | 'AI_CONNECTION_TIMEOUT'
  | 'AI_CONTEXT_TOO_LARGE'
  | 'AI_INVALID_RESPONSE'
  | 'AI_MODEL_NOT_FOUND'
  | 'AI_NETWORK_ERROR'
  | 'AI_PROVIDER_NOT_FOUND'
  | 'AI_RATE_LIMITED'
  | 'AI_RESPONSE_TIMEOUT'
  | 'AI_RESPONSE_TOO_LARGE'
  | 'AI_ROUTE_REQUIRED'
  | 'AI_SECRET_REQUIRED'
  | 'AI_SECRET_STORAGE_UNAVAILABLE'
  | 'AI_SECRET_UNAVAILABLE'
  | 'AI_SERVICE_UNAVAILABLE'
  | 'AI_STREAM_INTERRUPTED'
  | 'AI_TIMEOUT'
  | 'DATABASE_ERROR'
  | 'FILE_ALREADY_EXISTS'
  | 'FILE_TOO_LARGE'
  | 'FILE_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'IMAGE_LIMIT_REACHED'
  | 'PATH_NOT_AUTHORIZED'
  | 'PROBLEM_NOT_FOUND'
  | 'SCAN_FAILED'
  | 'SCAN_CHANGED_DURING_RUN'
  | 'TASK_CANCELLED'
  | 'TASK_CONFLICT'
  | 'UNKNOWN'
  | 'TEMPLATE_NOT_FOUND'
  | 'WORKSPACE_REQUIRED'
  | 'WORKSPACE_UNAVAILABLE'

export type AiErrorStage =
  | 'capability-check'
  | 'connection'
  | 'envelope-normalization'
  | 'json-extraction'
  | 'provider-envelope'
  | 'request'
  | 'response-read'
  | 'retry-wait'
  | 'schema-validation'
  | 'semantic-validation'
  | 'stream-read'
  | 'structure-repair'

export interface IpcError {
  code: IpcErrorCode
  message: string
  retryAfterMs?: number
  stage?: AiErrorStage
}

export type IpcResult<T> = { ok: true; value: T } | { error: IpcError; ok: false }
