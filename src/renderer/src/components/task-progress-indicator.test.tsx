import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { BackgroundTaskStatus } from '@core/contracts/background-task'

import { TaskProgressIndicator } from './task-progress-indicator'

describe('TaskProgressIndicator', () => {
  it('shows the real phase, count, current item and determinate percentage', () => {
    const status: BackgroundTaskStatus = {
      error: null,
      finishedAt: null,
      id: '10000000-0000-4000-8000-000000000001',
      kind: 'batch-operation',
      progress: {
        currentItem: '图论/最短路/dijkstra.cpp',
        phase: 'requesting-ai',
        processedCount: 2,
        totalCount: 5,
      },
      result: null,
      startedAt: new Date().toISOString(),
      state: 'running',
    }

    render(<TaskProgressIndicator status={status} title="批量任务" />)

    expect(screen.getByRole('status')).toHaveTextContent('正在等待 Provider 响应')
    expect(screen.getByRole('status')).toHaveTextContent('已处理 2 / 5')
    expect(screen.getByRole('status')).toHaveTextContent('图论/最短路/dijkstra.cpp')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
  })
})
