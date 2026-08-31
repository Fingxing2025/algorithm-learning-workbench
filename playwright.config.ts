import { defineConfig } from '@playwright/test'

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  outputDir: 'output/playwright/test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'output/playwright/report' }]],
  // Electron startup and window-resize assertions can transiently race on hosted CI runners.
  // Keep local runs strict while allowing a failed test to retry from a fresh Electron context.
  retries: process.env.CI ? 2 : 0,
  testDir: './tests/e2e',
  timeout: 45_000,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  workers: 1,
})
