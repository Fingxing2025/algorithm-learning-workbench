import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

let blankWorkspace: string
let electronApp: ElectronApplication
let existingWorkspace: string
let fixtureSourcePath: string
let fixtureSourceBeforeScan: string
let page: Page
let temporaryRoot: string
let userDataDirectory: string

async function setNextDirectorySelection(directoryPath: string) {
  await electronApp.evaluate(({ dialog }, selectedDirectory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [selectedDirectory],
    })) as typeof dialog.showOpenDialog
  }, directoryPath)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  blankWorkspace = join(temporaryRoot, 'blank-workspace')
  existingWorkspace = join(temporaryRoot, 'existing-workspace')
  fixtureSourcePath = join(existingWorkspace, '基础算法', '搜索', 'BFS', 'bfs.cpp')

  await mkdir(userDataDirectory)
  await mkdir(blankWorkspace)
  await mkdir(join(existingWorkspace, '基础算法', '搜索', 'BFS'), { recursive: true })
  await writeFile(fixtureSourcePath, 'void bfs() { /* fixture */ }\n', 'utf8')
  await writeFile(join(existingWorkspace, 'dfs.py'), 'def dfs():\n    pass\n', 'utf8')
  await writeFile(join(existingWorkspace, 'README.md'), '# not a template\n', 'utf8')
  await writeFile(join(temporaryRoot, 'outside.cpp'), 'outside\n', 'utf8')
  await symlink(join(temporaryRoot, 'outside.cpp'), join(existingWorkspace, 'linked.cpp'))
  fixtureSourceBeforeScan = await readFile(fixtureSourcePath, 'utf8')

  electronApp = await electron.launch({
    args: [resolve('.')],
    env: {
      ...process.env,
      E2E_USER_DATA_DIR: userDataDirectory,
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
  await electronApp?.close()
  if (temporaryRoot) {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})

test('starts from zero through the real desktop entry with a narrow preload API', async () => {
  await expect(page).toHaveTitle('智能算法学习助手 V2')
  await expect(page.getByRole('heading', { level: 1, name: '连接你的模板工作区' })).toBeVisible()
  await expect(page.getByText(/Electron 43\.1\.0 · (darwin|linux|win32)/)).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage1-onboarding-light.png'),
  })

  const exposedGlobals = await page.evaluate(() => {
    const desktopWindow = globalThis as unknown as {
      desktop?: {
        app?: { getRuntimeInfo?: unknown }
        templates?: { readSource?: unknown }
        workspace?: { choose?: unknown }
      }
      process?: unknown
      require?: unknown
    }

    return {
      chooseWorkspace: typeof desktopWindow.desktop?.workspace?.choose,
      getRuntimeInfo: typeof desktopWindow.desktop?.app?.getRuntimeInfo,
      process: typeof desktopWindow.process,
      readSource: typeof desktopWindow.desktop?.templates?.readSource,
      require: typeof desktopWindow.require,
    }
  })

  expect(exposedGlobals).toEqual({
    chooseWorkspace: 'function',
    getRuntimeInfo: 'function',
    process: 'undefined',
    readSource: 'function',
    require: 'undefined',
  })
})

test('creates an empty workspace and the first template without allowing overwrite', async () => {
  await setNextDirectorySelection(blankWorkspace)
  await page.getByRole('button', { name: '创建工作区' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '模板库' })).toBeVisible()
  await expect(page.getByText('工作区还是空的')).toBeVisible()

  await page.getByRole('button', { name: '新建模板' }).click()
  await page.getByLabel('文件名').fill('dijkstra.cpp')
  await page.getByLabel('模板源码').fill('void dijkstra() {}\n')
  await page.getByRole('button', { name: '确认创建' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'dijkstra' })).toBeVisible()
  expect(await readFile(join(blankWorkspace, 'dijkstra.cpp'), 'utf8')).toBe('void dijkstra() {}\n')

  await page.getByRole('button', { name: '新建模板' }).click()
  await page.getByLabel('文件名').fill('dijkstra.cpp')
  await page.getByLabel('模板源码').fill('overwritten')
  await page.getByRole('button', { name: '确认创建' }).click()
  await expect(page.getByRole('alert')).toContainText('同名文件已经存在，未覆盖原文件')
  expect(await readFile(join(blankWorkspace, 'dijkstra.cpp'), 'utf8')).toBe('void dijkstra() {}\n')

  const closeDialogButton = page.getByRole('button', { name: '关闭新建模板' })
  if (await closeDialogButton.isVisible().catch(() => false)) {
    await closeDialogButton.click()
  }
  const closeNoticeButton = page.getByRole('button', { name: '关闭提示' })
  if (await closeNoticeButton.isVisible().catch(() => false)) {
    await closeNoticeButton.click()
  }
})

test('scans an existing directory read-only and opens a folded tree result by keyboard search', async () => {
  await setNextDirectorySelection(existingWorkspace)
  await page.getByRole('button', { name: '更换目录' }).click()

  await expect(page.getByText('基础算法 / 搜索 / BFS')).toBeVisible()
  await expect(page.getByText('2 个模板').first()).toBeVisible()
  expect(await readFile(fixtureSourcePath, 'utf8')).toBe(fixtureSourceBeforeScan)

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  const searchInput = page.getByRole('textbox', { name: '搜索模板、题目或操作' })
  await expect(searchInput).toBeVisible()
  await searchInput.fill('bfs')
  await searchInput.press('Enter')

  await expect(page.getByRole('heading', { level: 1, name: 'bfs' })).toBeVisible()
  await expect(page.getByText('void bfs() { /* fixture */ }')).toBeVisible()
  await page.getByRole('button', { name: '复制源码' }).click()
  const clipboardText = await electronApp.evaluate(({ clipboard }) => clipboard.readText())
  expect(clipboardText).toBe(fixtureSourceBeforeScan)
  await page.getByRole('button', { name: '关闭提示' }).click()
})

test('captures the template workspace in light, compact, and dark states', async () => {
  const themeButton = page.getByRole('button', { name: /切换到(深色|浅色)主题/ })
  const root = page.locator('html')

  if ((await root.getAttribute('class'))?.includes('dark')) {
    await themeButton.click()
  }

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900)
  })
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage1-light.png'),
  })

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720)
  })
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage1-light-1280x720.png'),
  })

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900)
  })
  await page.getByRole('button', { name: '切换到深色主题' }).click()
  await expect(root).toHaveClass(/dark/)
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage1-dark.png'),
  })
})
