import type { BackgroundTaskStatus } from '@core/contracts/background-task'

const terminalStates = new Set<BackgroundTaskStatus['state']>(['completed', 'cancelled', 'failed'])

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

export function backgroundTaskProgressText(
  status: BackgroundTaskStatus,
  translate: (source: string, variables?: Record<string, number | string>) => string,
): string {
  const { processedCount, totalCount } = status.progress
  return totalCount === null
    ? translate('已处理 {processed}', { processed: processedCount })
    : translate('已处理 {processed} / {total}', { processed: processedCount, total: totalCount })
}
