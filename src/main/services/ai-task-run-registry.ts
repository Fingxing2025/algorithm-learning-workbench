import type { AiTaskKind } from '@core/contracts/ai-provider'

import { PublicError } from '../errors/public-error'

interface ActiveAiTaskRun {
  completed: Promise<void>
  controller: AbortController
  finish: () => void
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
    let markCompleted!: () => void
    const completed = new Promise<void>(resolve => {
      markCompleted = resolve
    })
    const run: ActiveAiTaskRun = {
      completed,
      controller,
      finish: markCompleted,
      task,
    }
    this.activeRuns.set(key, run)
    return {
      finish: () => {
        if (this.activeRuns.get(key) === run) this.activeRuns.delete(key)
        run.finish()
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

  async cancelAll(): Promise<void> {
    const runs = [...this.activeRuns.values()]
    for (const run of runs) run.controller.abort()
    await Promise.allSettled(runs.map(run => run.completed))
  }
}
