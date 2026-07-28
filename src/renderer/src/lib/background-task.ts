import type { BackgroundTaskStatus } from '@core/contracts/background-task'

const terminalStates = new Set<BackgroundTaskStatus['state']>(['completed', 'cancelled', 'failed'])

const phaseText: Record<BackgroundTaskStatus['progress']['phase'], string> = {
  'backing-up': '正在创建安全备份',
  cleaning: '正在清理临时数据',
  'duplicate-groups': '正在整理重复分组',
  discovering: '正在发现文件',
  finalizing: '正在完成收尾',
  'index-check': '正在检查模板索引',
  indexing: '正在读取并建立索引',
  preparing: '正在准备任务',
  processing: '正在处理结果',
  publishing: '正在发布结果',
  queued: '任务正在排队',
  'requesting-ai': '正在等待 Provider 响应',
  restoring: '正在恢复数据',
  similarity: '正在比较相似内容',
  validating: '正在校验数据',
  verifying: '正在验证结果',
  writing: '正在写入数据',
}

export async function waitForBackgroundTask(
  initial: BackgroundTaskStatus,
  onUpdate: (status: BackgroundTaskStatus) => void,
): Promise<BackgroundTaskStatus> {
  let current = initial
  onUpdate(current)
  while (!terminalStates.has(current.state)) {
    await new Promise<void>(resolve => window.setTimeout(resolve, 100))
    current = await window.desktop.backgroundTasks.get({ taskId: current.id })
    onUpdate(current)
  }
  if (current.state === 'failed') {
    throw Object.assign(new Error(current.error?.message ?? '后台任务失败，请重试。'), {
      code: current.error?.code,
    })
  }
  return current
}

export async function runTrackedOperation<Result>(
  requestId: string,
  operation: () => Promise<Result>,
  onUpdate: (status: BackgroundTaskStatus) => void,
): Promise<Result> {
  const operationPromise = operation()
  const backgroundTasks = window.desktop.backgroundTasks
  if (!backgroundTasks?.get) return operationPromise

  let stopped = false
  const poll = async () => {
    while (!stopped) {
      await new Promise<void>(resolve => window.setTimeout(resolve, 100))
      try {
        const status = await backgroundTasks.get({ taskId: requestId })
        if (status.id !== requestId) continue
        onUpdate(status)
        if (terminalStates.has(status.state)) stopped = true
      } catch {
        // The business IPC and task registration cross the process boundary separately.
        // A first poll may arrive before Main has published the task record.
      }
    }
  }
  const polling = poll()
  try {
    return await operationPromise
  } finally {
    stopped = true
    try {
      const status = await backgroundTasks.get({ taskId: requestId })
      if (status.id === requestId) onUpdate(status)
    } catch {
      // Preserve the original business result/error when no task record was published.
    }
    await polling
  }
}

export function backgroundTaskProgressText(
  status: BackgroundTaskStatus,
  translate: (source: string, variables?: Record<string, number | string>) => string,
): string {
  const { currentItem, processedCount, totalCount } = status.progress
  const countText =
    totalCount === null
      ? translate('已处理 {processed}', { processed: processedCount })
      : translate('已处理 {processed} / {total}', { processed: processedCount, total: totalCount })
  const stage = translate(phaseText[status.progress.phase])
  return currentItem
    ? `${stage} · ${countText} · ${translate('当前项')}：${currentItem}`
    : `${stage} · ${countText}`
}
