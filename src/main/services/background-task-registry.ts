import type {
  BackgroundTaskKind,
  BackgroundTaskProgress,
  BackgroundTaskResult,
  BackgroundTaskStatus,
} from '@core/contracts/background-task'

import { PublicError, toPublicIpcError } from '../errors/public-error'

const MAX_RETAINED_TASKS = 32

interface TaskRecord {
  controller: AbortController
  error: BackgroundTaskStatus['error']
  finishedAt: string | null
  id: string
  kind: BackgroundTaskKind
  progress: BackgroundTaskProgress
  result: BackgroundTaskResult | null
  scope: string
  startedAt: string
  state: BackgroundTaskStatus['state']
}

interface StartTaskOptions {
  id: string
  kind: BackgroundTaskKind
  run: (context: {
    signal: AbortSignal
    updateProgress: (progress: BackgroundTaskProgress) => void
  }) => Promise<BackgroundTaskResult>
  scope: string
}

interface TrackTaskOptions<Result> {
  id: string
  initialProgress?: BackgroundTaskProgress
  run: (context: {
    signal: AbortSignal
    updateProgress: (progress: BackgroundTaskProgress) => void
  }) => Promise<Result>
  scope: string
}

function isActive(state: BackgroundTaskStatus['state']): boolean {
  return state === 'queued' || state === 'running' || state === 'cancelling'
}

export class BackgroundTaskRegistry {
  private readonly records = new Map<string, TaskRecord>()
  private readonly running = new Set<Promise<void>>()

  cancel(taskId: string): BackgroundTaskStatus {
    const record = this.requireRecord(taskId)
    if (record.state === 'queued' || record.state === 'running') {
      record.state = 'cancelling'
      record.controller.abort()
    }
    return this.snapshot(record)
  }

  async cancelAll(): Promise<void> {
    for (const record of this.records.values()) {
      if (!isActive(record.state)) continue
      record.state = 'cancelling'
      record.controller.abort()
    }
    await Promise.allSettled([...this.running])
  }

  get(taskId: string): BackgroundTaskStatus {
    return this.snapshot(this.requireRecord(taskId))
  }

  track<Result>(options: TrackTaskOptions<Result>): Promise<Result> {
    if (this.records.has(options.id)) {
      throw new PublicError('INVALID_REQUEST', '同一批量任务已在运行，请勿重复提交。')
    }
    const record: TaskRecord = {
      controller: new AbortController(),
      error: null,
      finishedAt: null,
      id: options.id,
      kind: 'batch-operation',
      progress: options.initialProgress ?? {
        currentItem: null,
        phase: 'preparing',
        processedCount: 0,
        totalCount: null,
      },
      result: null,
      scope: options.scope,
      startedAt: new Date().toISOString(),
      state: 'queued',
    }
    this.records.set(record.id, record)
    const operation = Promise.resolve().then(async () => {
      if (record.controller.signal.aborted)
        throw new PublicError('TASK_CANCELLED', '后台任务已取消。')
      record.state = 'running'
      return options.run({
        signal: record.controller.signal,
        updateProgress: progress => {
          if (record.state === 'running') {
            record.progress = {
              ...progress,
              currentItem: progress.currentItem?.trim().slice(0, 500) || null,
            }
          }
        },
      })
    })
    const bookkeeping = operation
      .then(() => {
        if (record.controller.signal.aborted) {
          record.state = 'cancelled'
          return
        }
        record.progress = {
          ...record.progress,
          currentItem: null,
          processedCount: record.progress.totalCount ?? record.progress.processedCount,
        }
        record.state = 'completed'
      })
      .catch(error => {
        if (
          record.controller.signal.aborted ||
          (error instanceof PublicError && error.code === 'TASK_CANCELLED')
        ) {
          record.state = 'cancelled'
          return
        }
        const publicError = toPublicIpcError(error)
        record.error = { code: publicError.code, message: publicError.message }
        record.state = 'failed'
      })
      .finally(() => {
        record.finishedAt = new Date().toISOString()
        this.prune()
      })
    this.running.add(bookkeeping)
    void bookkeeping.finally(() => this.running.delete(bookkeeping))
    return operation
  }

  start(options: StartTaskOptions): BackgroundTaskStatus {
    const existingRequest = this.records.get(options.id)
    if (existingRequest) return this.snapshot(existingRequest)
    const existingActive = [...this.records.values()].find(
      record =>
        record.kind === options.kind && record.scope === options.scope && isActive(record.state),
    )
    if (existingActive) return this.snapshot(existingActive)

    const record: TaskRecord = {
      controller: new AbortController(),
      error: null,
      finishedAt: null,
      id: options.id,
      kind: options.kind,
      progress: {
        currentItem: null,
        phase: 'queued',
        processedCount: 0,
        totalCount: null,
      },
      result: null,
      scope: options.scope,
      startedAt: new Date().toISOString(),
      state: 'queued',
    }
    this.records.set(record.id, record)
    const execution = Promise.resolve()
      .then(async () => {
        if (record.controller.signal.aborted)
          throw new PublicError('TASK_CANCELLED', '后台任务已取消。')
        record.state = 'running'
        return options.run({
          signal: record.controller.signal,
          updateProgress: progress => {
            if (record.state === 'running') {
              record.progress = {
                ...progress,
                currentItem: progress.currentItem?.trim().slice(0, 500) || null,
              }
            }
          },
        })
      })
      .then(result => {
        if (record.controller.signal.aborted) {
          record.state = 'cancelled'
          return
        }
        record.result = result
        record.progress = {
          ...record.progress,
          processedCount: record.progress.totalCount ?? record.progress.processedCount,
        }
        record.state = 'completed'
      })
      .catch(error => {
        if (
          record.controller.signal.aborted ||
          (error instanceof PublicError && error.code === 'TASK_CANCELLED')
        ) {
          record.state = 'cancelled'
          return
        }
        const publicError = toPublicIpcError(error)
        record.error = { code: publicError.code, message: publicError.message }
        record.state = 'failed'
      })
      .finally(() => {
        record.finishedAt = new Date().toISOString()
        this.prune()
      })
    this.running.add(execution)
    void execution.finally(() => this.running.delete(execution))
    return this.snapshot(record)
  }

  private prune(): void {
    const completed = [...this.records.values()]
      .filter(record => !isActive(record.state))
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
    while (completed.length > MAX_RETAINED_TASKS) {
      const oldest = completed.shift()
      if (oldest) this.records.delete(oldest.id)
    }
  }

  private requireRecord(taskId: string): TaskRecord {
    const record = this.records.get(taskId)
    if (!record) throw new PublicError('INVALID_REQUEST', '后台任务不存在或已经过期。')
    return record
  }

  private snapshot(record: TaskRecord): BackgroundTaskStatus {
    return {
      error: record.error,
      finishedAt: record.finishedAt,
      id: record.id,
      kind: record.kind,
      progress: { ...record.progress },
      result: record.result,
      startedAt: record.startedAt,
      state: record.state,
    }
  }
}
