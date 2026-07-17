import { describe, expect, it } from 'vitest'

import { AiTaskRunRegistry } from './ai-task-run-registry'

const requestId = '10000000-0000-4000-8000-000000000001'

describe('AiTaskRunRegistry', () => {
  it('rejects duplicate submissions and releases the id after completion', () => {
    const registry = new AiTaskRunRegistry()
    const run = registry.start('template-metadata', requestId)
    expect(() => registry.start('template-metadata', requestId)).toThrow(
      '同一 AI 请求已在运行，请勿重复提交。',
    )
    run.finish()
    expect(() => registry.start('template-metadata', requestId).finish()).not.toThrow()
  })

  it('cancels only the matching task and blocks late state checks', () => {
    const registry = new AiTaskRunRegistry()
    const problemRun = registry.start('problem-image-analysis', requestId)
    const planRun = registry.start('workspace-management', requestId)
    registry.cancel('problem-image-analysis', requestId)
    expect(problemRun.signal.aborted).toBe(true)
    expect(() => problemRun.throwIfCancelled()).toThrow('AI 请求已取消，迟到响应不会写入状态。')
    expect(planRun.signal.aborted).toBe(false)
  })

  it('cancels every active run on application shutdown', () => {
    const registry = new AiTaskRunRegistry()
    const runs = [
      registry.start('problem-image-analysis', requestId),
      registry.start('template-metadata', '20000000-0000-4000-8000-000000000002'),
      registry.start('workspace-management', '30000000-0000-4000-8000-000000000003'),
    ]
    registry.cancelAll()
    expect(runs.every(run => run.signal.aborted)).toBe(true)
  })
})
