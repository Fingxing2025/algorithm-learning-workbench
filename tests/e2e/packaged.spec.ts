import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('launches the packaged desktop app with a clean user-data directory', async () => {
  const executablePath = process.env.PACKAGED_APP_PATH
  test.skip(!executablePath, 'PACKAGED_APP_PATH is only set during packaged smoke tests')
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-packaged-'))
  const userDataDirectory = join(temporaryRoot, 'user-data')
  await mkdir(userDataDirectory)
  const app = await electron.launch({
    executablePath: resolve(executablePath!),
    env: {
      ...process.env,
      E2E_USER_DATA_DIR: userDataDirectory,
      NODE_ENV: 'test',
    },
  })
  try {
    const page = await app.firstWindow()
    await expect(page).toHaveTitle('智能算法学习助手 V2')
    await expect(page.getByRole('heading', { level: 1, name: '连接你的模板工作区' })).toBeVisible()
    await expect(page.getByText('V2 · 0.1.2')).toBeVisible()
    await expect(page.getByText(/Electron 43\.1\.0 · (darwin|linux|win32)/)).toBeVisible()
    const boundary = await page.evaluate(() => {
      const scope = globalThis as unknown as {
        desktop?: unknown
        process?: unknown
        require?: unknown
      }
      return {
        desktop: typeof scope.desktop,
        process: typeof scope.process,
        require: typeof scope.require,
      }
    })
    expect(boundary).toEqual({ desktop: 'object', process: 'undefined', require: 'undefined' })
  } finally {
    await app.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
