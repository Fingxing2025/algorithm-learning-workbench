import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@core': resolve('src/core'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/performance/**/*.performance.ts'],
    testTimeout: 30 * 60 * 1_000,
  },
})
