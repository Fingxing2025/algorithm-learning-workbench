import type { AiTaskKind } from '@core/contracts/ai-provider'

import { PublicError } from '../errors/public-error'

interface ActiveAiTaskRun {
  controller: AbortController
  task: AiTaskKind
}

export interface AiTaskRun {
  finish: () => void
  signal: AbortSignal
  throwIfCancelled: () => void
}

export class AiTaskRunRegistry {
  private readonly activeRuns = new Map<string, ActiveAiTaskRun>()

  private key(task: AiTaskKind, requestId: string): string {
    return `${task}:${requestId}`
  }

  start(task: AiTaskKind, requestId: string): AiTaskRun {
    const key = this.key(task, requestId)
    if (this.activeRuns.has(key)) {
      throw new PublicError('INVALID_REQUEST', '同一 AI 请求已在运行，请勿重复提交。')
    }
    const controller = new AbortController()
    const run = { controller, task }
    this.activeRuns.set(key, run)
    return {
      finish: () => {
        if (this.activeRuns.get(key) === run) this.activeRuns.delete(key)
      },
      signal: controller.signal,
      throwIfCancelled: () => {
        if (controller.signal.aborted) {
          throw new PublicError('AI_CANCELLED', 'AI 请求已取消，迟到响应不会写入状态。')
        }
      },
    }
  }

  cancel(task: AiTaskKind, requestId: string): void {
    this.activeRuns.get(this.key(task, requestId))?.controller.abort()
  }

  cancelAll(): void {
    for (const run of this.activeRuns.values()) run.controller.abort()
    this.activeRuns.clear()
  }
}
