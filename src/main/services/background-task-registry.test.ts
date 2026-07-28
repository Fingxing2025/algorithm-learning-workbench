// @vitest-environment node

import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { BackgroundTaskRegistry } from './background-task-registry'

async function nextTurn(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
}

describe('BackgroundTaskRegistry', () => {
  it('reuses the active task for the same scope and publishes one complete result', async () => {
    const registry = new BackgroundTaskRegistry()
    const firstId = randomUUID()
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const first = registry.start({
      id: firstId,
      kind: 'workspace-scan',
      run: async ({ updateProgress }) => {
        updateProgress({ phase: 'indexing', processedCount: 2, totalCount: 4 })
        await gate
        return { kind: 'workspace-scan', workspace: {} as never }
      },
      scope: 'workspace-1',
    })
    const reused = registry.start({
      id: randomUUID(),
      kind: 'workspace-scan',
      run: async () => ({ kind: 'workspace-scan', workspace: {} as never }),
      scope: 'workspace-1',
    })
    expect(reused.id).toBe(first.id)
    await nextTurn()
    expect(registry.get(firstId)).toMatchObject({
      progress: { phase: 'indexing', processedCount: 2, totalCount: 4 },
      state: 'running',
    })
    release()
    await nextTurn()
    expect(registry.get(firstId).state).toBe('completed')
  })

  it('marks cancellation immediately and discards a late result', async () => {
    const registry = new BackgroundTaskRegistry()
    const taskId = randomUUID()
    registry.start({
      id: taskId,
      kind: 'workspace-audit',
      run: async ({ signal }) => {
        await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve()))
        return { audit: {} as never, kind: 'workspace-audit' }
      },
      scope: 'workspace-1',
    })
    await nextTurn()
    expect(registry.cancel(taskId).state).toBe('cancelling')
    await nextTurn()
    expect(registry.get(taskId)).toMatchObject({ result: null, state: 'cancelled' })
  })

  it('tracks progress for an IPC operation while preserving its original result', async () => {
    const registry = new BackgroundTaskRegistry()
    const taskId = randomUUID()
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const result = registry.track({
      id: taskId,
      run: async ({ updateProgress }) => {
        updateProgress({
          currentItem: `模板/${'a'.repeat(600)}.cpp`,
          phase: 'requesting-ai',
          processedCount: 2,
          totalCount: 5,
        })
        await gate
        return { saved: true }
      },
      scope: 'workspace-1',
    })

    await nextTurn()
    expect(registry.get(taskId)).toMatchObject({
      kind: 'batch-operation',
      progress: {
        phase: 'requesting-ai',
        processedCount: 2,
        totalCount: 5,
      },
      state: 'running',
    })
    expect(registry.get(taskId).progress.currentItem).toHaveLength(500)
    release()
    await expect(result).resolves.toEqual({ saved: true })
    await nextTurn()
    expect(registry.get(taskId)).toMatchObject({
      progress: { currentItem: null, processedCount: 5, totalCount: 5 },
      state: 'completed',
    })
  })
})
