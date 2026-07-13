import { resolve } from 'node:path'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve('.')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })

  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900)
  })
})

test.afterAll(async () => {
  await electronApp.close()
})

test('starts through the real desktop entry with a narrow preload API', async () => {
  await expect(page).toHaveTitle('智能算法学习助手 V2')
  await expect(page.getByRole('heading', { level: 1, name: '工作台' })).toBeVisible()
  await expect(page.getByText(/Electron 43\.1\.0 · darwin/)).toBeVisible()

  const exposedGlobals = await page.evaluate(() => {
    const desktopWindow = globalThis as unknown as {
      desktop?: { app?: { getRuntimeInfo?: unknown } }
      process?: unknown
      require?: unknown
    }

    return {
      getRuntimeInfo: typeof desktopWindow.desktop?.app?.getRuntimeInfo,
      process: typeof desktopWindow.process,
      require: typeof desktopWindow.require,
    }
  })

  expect(exposedGlobals).toEqual({
    getRuntimeInfo: 'function',
    process: 'undefined',
    require: 'undefined',
  })
})

test('supports global search and captures both visual themes', async () => {
  const themeButton = page.getByRole('button', { name: /切换到(深色|浅色)主题/ })
  const root = page.locator('html')

  if ((await root.getAttribute('class'))?.includes('dark')) {
    await themeButton.click()
  }

  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage0-light.png'),
  })

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720)
  })
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage0-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900)
  })

  await page.getByRole('button', { name: '打开全局搜索' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '关闭全局搜索' }).click()

  await page.getByRole('button', { name: '切换到深色主题' }).click()
  await expect(root).toHaveClass(/dark/)
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage0-dark.png'),
  })
})
