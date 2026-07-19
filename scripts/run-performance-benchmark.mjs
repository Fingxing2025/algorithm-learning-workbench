import { spawnSync } from 'node:child_process'

import electronPath from 'electron'

const result = spawnSync(
  electronPath,
  ['./node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.performance.config.ts'],
  {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PERF_NODE_EXECUTABLE: process.execPath,
    },
    stdio: 'inherit',
  },
)

if (result.error) throw result.error
process.exitCode = result.status ?? 1
