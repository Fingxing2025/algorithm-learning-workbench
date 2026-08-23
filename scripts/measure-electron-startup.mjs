import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'

import { _electron as electron } from '@playwright/test'

const userDataPath = process.argv[2]
if (!userDataPath) throw new Error('A test userData path is required.')

function processTreeRssBytes(rootPid) {
  if (process.platform === 'win32') return 0
  try {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map(line => line.trim().split(/\s+/).map(Number))
      .filter(row => row.length === 3 && row.every(Number.isFinite))
    const descendants = new Set([rootPid])
    let changed = true
    while (changed) {
      changed = false
      for (const [pid, parentPid] of rows) {
        if (!descendants.has(parentPid) || descendants.has(pid)) continue
        descendants.add(pid)
        changed = true
      }
    }
    return rows.reduce(
      (total, [pid, , rssKiB]) => total + (descendants.has(pid) ? rssKiB * 1024 : 0),
      0,
    )
  } catch {
    return 0
  }
}

const environment = {
  ...process.env,
  E2E_USER_DATA_DIR: userDataPath,
  NODE_ENV: 'test',
}
delete environment.ELECTRON_RUN_AS_NODE
delete environment.PERF_NODE_EXECUTABLE

const startedAt = performance.now()
const application = await electron.launch({
  args: [resolve('.')],
  env: environment,
})
let peakRssBytes = 0
const sampleMemory = () => {
  const pid = application.process().pid
  if (pid) peakRssBytes = Math.max(peakRssBytes, processTreeRssBytes(pid))
}
const interval = setInterval(sampleMemory, 10)
try {
  const page = await application.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('navigation', { name: '主导航' }).waitFor({ state: 'visible' })
  sampleMemory()
  process.stdout.write(
    `${JSON.stringify({ durationMs: performance.now() - startedAt, peakRssBytes })}\n`,
  )
} finally {
  clearInterval(interval)
  await application.close()
}
