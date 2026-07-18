import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

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
let fixtureImagePath: string
let secondFixtureImagePath: string
let fixtureSourcePath: string
let fixtureSourceBeforeScan: string
let page: Page
let tallFixtureImagePath: string
let temporaryRoot: string
let userDataDirectory: string

function crc32(value: Buffer): number {
  let crc = 0xffffffff
  for (const byte of value) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii')
  const chunk = Buffer.alloc(data.length + 12)
  chunk.writeUInt32BE(data.length, 0)
  typeBuffer.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8)
  return chunk
}

function createTallPng(width = 600, height = 4000): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 0
  const rows = Buffer.alloc((width + 1) * height, 236)
  for (let row = 0; row < height; row += 1) {
    const offset = row * (width + 1)
    rows[offset] = 0
    if (row % 180 < 8) rows.fill(72, offset + 1, offset + width + 1)
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function setNextDirectorySelection(directoryPath: string) {
  await electronApp.evaluate(({ dialog }, selectedDirectory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [selectedDirectory],
    })) as typeof dialog.showOpenDialog
  }, directoryPath)
}

async function launchApplication() {
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
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  blankWorkspace = join(temporaryRoot, 'blank-workspace')
  existingWorkspace = join(temporaryRoot, 'existing-workspace')
  fixtureImagePath = join(temporaryRoot, 'problem.png')
  secondFixtureImagePath = join(temporaryRoot, 'problem-2.png')
  tallFixtureImagePath = join(temporaryRoot, 'long-problem.png')
  fixtureSourcePath = join(existingWorkspace, '基础算法', '搜索', 'BFS', 'bfs.cpp')

  await mkdir(userDataDirectory)
  await mkdir(blankWorkspace)
  await mkdir(join(existingWorkspace, '基础算法', '搜索', 'BFS'), { recursive: true })
  await writeFile(fixtureSourcePath, 'void bfs() { /* fixture */ }\n', 'utf8')
  await writeFile(join(existingWorkspace, 'dfs.py'), 'def dfs():\n    pass\n', 'utf8')
  await writeFile(join(existingWorkspace, 'README.md'), '# not a template\n', 'utf8')
  await writeFile(join(temporaryRoot, 'outside.cpp'), 'outside\n', 'utf8')
  await writeFile(
    fixtureImagePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  await writeFile(secondFixtureImagePath, await readFile(fixtureImagePath))
  await writeFile(tallFixtureImagePath, createTallPng())
  await symlink(join(temporaryRoot, 'outside.cpp'), join(existingWorkspace, 'linked.cpp'))
  fixtureSourceBeforeScan = await readFile(fixtureSourcePath, 'utf8')

  await launchApplication()
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

  await page.getByRole('button', { name: '切换到深色主题' }).click()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage1-onboarding-dark.png'),
  })
  await page.getByRole('button', { name: '切换到浅色主题' }).click()

  await page.getByRole('button', { name: '打开全局搜索' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/command-palette-light.png'),
  })
  await page.getByRole('button', { name: '关闭全局搜索' }).click()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '打开全局搜索' }).click()
  const reducedMotionDurationMs = await page.getByRole('dialog').evaluate(element => {
    const browser = globalThis as unknown as {
      getComputedStyle: (target: unknown) => { animationDuration: string }
    }
    const duration = browser.getComputedStyle(element).animationDuration
    return duration.endsWith('ms')
      ? Number.parseFloat(duration)
      : Number.parseFloat(duration) * 1000
  })
  expect(reducedMotionDurationMs).toBeLessThanOrEqual(0.01)
  await page.getByRole('button', { name: '关闭全局搜索' }).click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  const exposedGlobals = await page.evaluate(() => {
    const desktopWindow = globalThis as unknown as {
      desktop?: {
        app?: { getRuntimeInfo?: unknown }
        problems?: { create?: unknown; list?: unknown }
        problemAnalysis?: { analyze?: unknown; commit?: unknown }
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
      problemCreate: typeof desktopWindow.desktop?.problems?.create,
      problemAnalysis: typeof desktopWindow.desktop?.problemAnalysis?.analyze,
      problemList: typeof desktopWindow.desktop?.problems?.list,
      readSource: typeof desktopWindow.desktop?.templates?.readSource,
      require: typeof desktopWindow.require,
    }
  })

  expect(exposedGlobals).toEqual({
    chooseWorkspace: 'function',
    getRuntimeInfo: 'function',
    process: 'undefined',
    problemCreate: 'function',
    problemAnalysis: 'function',
    problemList: 'function',
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
  await page.getByRole('textbox', { name: '模板源码', exact: true }).fill('void dijkstra() {}\n')
  await page.getByRole('button', { name: '确认创建' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'dijkstra' })).toBeVisible()
  expect(await readFile(join(blankWorkspace, 'dijkstra.cpp'), 'utf8')).toBe('void dijkstra() {}\n')

  await page.getByRole('button', { name: '新建模板' }).click()
  await page.getByLabel('文件名').fill('dijkstra.cpp')
  await page.getByRole('textbox', { name: '模板源码', exact: true }).fill('overwritten')
  await page.getByRole('button', { name: '确认创建' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    '同名文件已经存在，未覆盖原文件',
  )
  expect(await readFile(join(blankWorkspace, 'dijkstra.cpp'), 'utf8')).toBe('void dijkstra() {}\n')

  const closeDialogButton = page.getByRole('button', { name: '关闭新建模板' })
  if (await closeDialogButton.isVisible().catch(() => false)) {
    const bounds = await closeDialogButton.boundingBox()
    expect(bounds).not.toBeNull()
    await page.mouse.click(bounds!.x + 2, bounds!.y + bounds!.height / 2)
    await expect(closeDialogButton).toHaveCount(0)

    await page.getByRole('button', { name: '新建模板' }).click()
    await expect(closeDialogButton).toBeVisible()
    await closeDialogButton.click({ position: { x: 18, y: 18 } })
    await expect(closeDialogButton).toHaveCount(0)
  }
  const closeNoticeButton = page.getByRole('button', { name: '关闭提示' })
  if (await closeNoticeButton.isVisible().catch(() => false)) {
    await closeNoticeButton.click()
  }
})

test('scans an existing directory read-only and opens a folded tree result by keyboard search', async () => {
  await setNextDirectorySelection(existingWorkspace)
  await page.getByRole('button', { name: '切换工作区' }).click()

  await expect(page.getByText('基础算法 / 搜索 / BFS')).toBeVisible()
  await expect(page.getByText('bfs.cpp', { exact: true })).toHaveCount(0)
  await page.getByText('基础算法 / 搜索 / BFS').click()
  await expect(page.getByText('bfs.cpp', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '题目', exact: true }).click()
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await expect(page.getByText('bfs.cpp', { exact: true })).toBeVisible()
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

test('captures the dashboard and template workspace in light, compact, and dark states', async () => {
  const themeButton = page.getByRole('button', { name: /切换到(深色|浅色)主题/ })
  const root = page.locator('html')

  if ((await root.getAttribute('class'))?.includes('dark')) {
    await themeButton.click()
  }

  await page.getByRole('button', { exact: true, name: '工作台' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '工作台' })).toBeVisible()
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900)
  })
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/dashboard-light.png'),
  })

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720)
  })
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/dashboard-light-1280x720.png'),
  })

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900)
  })
  await page.getByRole('button', { name: '切换到深色主题' }).click()
  await expect(root).toHaveClass(/dark/)
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/dashboard-dark.png'),
  })

  await page.getByRole('button', { exact: true, name: '模板库' }).click()
  await page.getByRole('button', { name: '切换到浅色主题' }).click()
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

test('creates a problem, associates multiple templates, stores an image, and safely removes one relation', async () => {
  const root = page.locator('html')
  if ((await root.getAttribute('class'))?.includes('dark')) {
    await page.getByRole('button', { name: '切换到浅色主题' }).click()
  }

  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByText('还没有题目卡片')).toBeVisible()
  await page.getByRole('button', { name: '新建题目' }).click()
  await page.getByLabel('题目标题').fill('单源最短路径')
  await page.getByLabel('平台').fill('洛谷')
  await page.getByLabel('题号').fill('P3371')
  await page.getByLabel('难度').fill('提高')
  await page.getByLabel('状态').selectOption('attempted')
  await page.getByLabel('标签').fill('图论, 最短路, Dijkstra')
  await page.getByLabel('原始题面').fill('给定一张有向图，求起点到其余顶点的最短距离。')
  await page.getByLabel('本地备注').fill('注意重边和不可达顶点。')
  await page.getByRole('button', { name: '创建题目' }).click()

  await expect(page.getByRole('heading', { level: 2, name: '单源最短路径' })).toBeVisible()
  await expect(page.getByText('给定一张有向图，求起点到其余顶点的最短距离。')).toBeVisible()

  await page.getByRole('button', { name: '添加关联' }).click()
  await page
    .getByLabel('算法模板', { exact: true })
    .selectOption({ label: 'bfs · 基础算法/搜索/BFS/bfs.cpp' })
  await page.getByLabel('关系类型', { exact: true }).selectOption('used')
  await page.getByLabel('关联备注', { exact: true }).fill('用于验证模板与题目双向关联。')
  await page.getByRole('button', { name: '保存关联' }).click()

  await page.getByRole('button', { name: '添加关联' }).click()
  await page.getByLabel('算法模板', { exact: true }).selectOption({ label: 'dfs · dfs.py' })
  await page.getByLabel('关系类型', { exact: true }).selectOption('alternative')
  await page.getByRole('button', { name: '保存关联' }).click()
  await expect(page.getByText('2 个已确认关联')).toBeVisible()

  await setNextDirectorySelection(fixtureImagePath)
  await page.getByRole('button', { name: '添加图片' }).click()
  await expect(page.getByRole('img', { exact: true, name: 'problem.png' })).toBeVisible()
  await page.getByRole('button', { name: '预览图片 problem.png' }).click()
  await expect(page.getByRole('dialog', { name: '预览题目图片：problem.png' })).toBeVisible()
  await expect(
    page
      .getByRole('dialog', { name: '预览题目图片：problem.png' })
      .getByRole('img', { name: 'problem.png' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '关闭图片预览' })).toHaveCount(0)

  await setNextDirectorySelection(tallFixtureImagePath)
  await page.getByRole('button', { name: '添加图片' }).click()
  const tallPreviewTrigger = page.getByRole('button', { name: '预览图片 long-problem.png' })
  await expect(tallPreviewTrigger).toBeVisible()
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await tallPreviewTrigger.click()
  const tallPreviewDialog = page.getByRole('dialog', {
    name: '预览题目图片：long-problem.png',
  })
  const tallPreviewRegion = tallPreviewDialog.getByRole('region', {
    name: '题目图片滚动预览',
  })
  const tallPreviewImage = tallPreviewDialog.getByRole('img', { name: 'long-problem.png' })
  await expect(tallPreviewImage).toHaveAttribute('data-preview-mode', 'fit-width')
  expect(
    await tallPreviewRegion.evaluate(element => element.scrollHeight > element.clientHeight),
  ).toBe(true)
  await tallPreviewRegion.focus()
  await page.keyboard.press('End')
  await expect
    .poll(() => tallPreviewRegion.evaluate(element => element.scrollTop))
    .toBeGreaterThan(0)
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/problem-image-long-preview-1280x720.png'),
  })
  await tallPreviewDialog.getByRole('button', { name: '适合窗口' }).click()
  await expect(tallPreviewImage).toHaveAttribute('data-preview-mode', 'fit-screen')
  const [regionBounds, imageBounds] = await Promise.all([
    tallPreviewRegion.boundingBox(),
    tallPreviewImage.boundingBox(),
  ])
  expect(regionBounds).not.toBeNull()
  expect(imageBounds).not.toBeNull()
  expect(imageBounds!.x).toBeGreaterThanOrEqual(regionBounds!.x)
  expect(imageBounds!.y).toBeGreaterThanOrEqual(regionBounds!.y)
  expect(imageBounds!.x + imageBounds!.width).toBeLessThanOrEqual(
    regionBounds!.x + regionBounds!.width,
  )
  expect(imageBounds!.y + imageBounds!.height).toBeLessThanOrEqual(
    regionBounds!.y + regionBounds!.height,
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/problem-image-long-preview-fit-window-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(2),
  )
  await expect(tallPreviewDialog.getByRole('button', { name: '按宽度查看' })).toBeInViewport()
  await expect(tallPreviewDialog.getByRole('button', { name: '适合窗口' })).toBeInViewport()
  await expect(tallPreviewDialog.getByRole('button', { name: '关闭图片预览' })).toBeInViewport()
  const [zoomRegionBounds, zoomImageBounds] = await Promise.all([
    tallPreviewRegion.boundingBox(),
    tallPreviewImage.boundingBox(),
  ])
  expect(zoomRegionBounds).not.toBeNull()
  expect(zoomImageBounds).not.toBeNull()
  expect(zoomImageBounds!.x).toBeGreaterThanOrEqual(zoomRegionBounds!.x)
  expect(zoomImageBounds!.y).toBeGreaterThanOrEqual(zoomRegionBounds!.y)
  expect(zoomImageBounds!.x + zoomImageBounds!.width).toBeLessThanOrEqual(
    zoomRegionBounds!.x + zoomRegionBounds!.width,
  )
  expect(zoomImageBounds!.y + zoomImageBounds!.height).toBeLessThanOrEqual(
    zoomRegionBounds!.y + zoomRegionBounds!.height,
  )
  const zoomScreenshotBase64 = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) throw new Error('expected Electron window for zoom screenshot')
    return (await window.webContents.capturePage()).toPNG().toString('base64')
  })
  await writeFile(
    resolve('output/playwright/problem-image-long-preview-fit-window-200-percent.png'),
    Buffer.from(zoomScreenshotBase64, 'base64'),
  )
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1),
  )
  await page.keyboard.press('Escape')
  await expect(tallPreviewTrigger).toBeFocused()
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )

  await setNextDirectorySelection(secondFixtureImagePath)
  await page.getByRole('button', { name: '添加图片' }).click()
  await expect(page.getByRole('img', { name: 'problem-2.png' })).toBeVisible()
  await page.getByRole('button', { name: '移除图片 problem-2.png' }).click()
  await page.getByRole('button', { name: '确认' }).click()
  await expect(page.getByRole('img', { name: 'problem-2.png' })).toHaveCount(0)
  const storedImages = await readdir(join(userDataDirectory, 'problem-images'), {
    recursive: true,
  })
  expect(storedImages.filter(path => path.endsWith('.png'))).toHaveLength(2)

  await page.getByRole('button', { name: '解除与模板的关联 dfs' }).click()
  await page.getByRole('button', { name: '确认解除' }).click()
  await expect(page.getByText('1 个已确认关联')).toBeVisible()

  await page.getByRole('button', { name: '模板库' }).click()
  await expect(page.getByText('dfs.py')).toBeVisible()
  await page.getByRole('button', { name: '重新扫描工作区' }).click()
  await expect(page.getByRole('status')).toContainText('扫描完成')
  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByText('1 个已确认关联')).toBeVisible()
  await page.getByRole('button', { name: '关闭提示' }).click()
  expect(await readFile(fixtureSourcePath, 'utf8')).toBe(fixtureSourceBeforeScan)
})

test('sets a problem relation directly from the template card', async () => {
  await page.evaluate(async () => {
    const renderer = globalThis as unknown as {
      desktop: {
        problems: {
          create: (request: {
            aiSummary: string
            analysis: {
              algorithmSignals: string[]
              constraints: string[]
              edgeCases: string[]
              examples: []
              inputDescription: string
              outputDescription: string
            }
            difficulty: null
            notes: string
            platform: string
            problemCode: string
            statement: string
            status: 'unattempted'
            tags: string[]
            title: string
            url: null
          }) => Promise<unknown>
        }
      }
    }
    await renderer.desktop.problems.create({
      aiSummary: '',
      analysis: {
        algorithmSignals: [],
        constraints: [],
        edgeCases: [],
        examples: [],
        inputDescription: '',
        outputDescription: '',
      },
      difficulty: null,
      notes: '',
      platform: '模板卡片测试',
      problemCode: 'CARD-RELATION',
      statement: '用于验证模板卡片中的双向关联入口。',
      status: 'unattempted',
      tags: ['关联'],
      title: '从模板卡片建立关联',
      url: null,
    })
  })
  await page.reload()
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await page.getByText('bfs.cpp').click()
  await page.getByRole('button', { name: '设置关联' }).click()
  await expect(page.getByRole('heading', { name: '关联题目' })).toBeVisible()
  await page.getByLabel('选择题目').selectOption({ label: '从模板卡片建立关联 · CARD-RELATION' })
  await page.getByLabel('关系类型').selectOption('recommended')
  await page.getByLabel('关联备注').fill('在模板卡片中建立。')
  await page.getByRole('button', { name: '保存关联' }).click()
  await expect(page.getByRole('button', { name: /从模板卡片建立关联.*推荐/ })).toBeVisible()

  await page.getByRole('button', { name: /从模板卡片建立关联.*推荐/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: '从模板卡片建立关联' })).toBeVisible()
  await expect(page.getByText('1 个已确认关联')).toBeVisible()
})

test('captures the problem workspace in light, compact, and dark states', async () => {
  const root = page.locator('html')
  if ((await root.getAttribute('class'))?.includes('dark')) {
    await page.getByRole('button', { name: '切换到浅色主题' }).click()
  }

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900)
  })
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage2-problems-light.png'),
  })

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720)
  })
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage2-problems-light-1280x720.png'),
  })

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900)
  })
  await page.getByRole('button', { name: '切换到深色主题' }).click()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage2-problems-dark.png'),
  })
})

test('persists the problem, image, and surviving relation across a desktop restart', async () => {
  await electronApp.close()
  await launchApplication()

  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await expect(page.getByText('bfs.cpp', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '题目', exact: true }).click()
  await page.getByRole('button', { name: /单源最短路径 洛谷/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: '单源最短路径' })).toBeVisible()
  await expect(page.getByText('1 个已确认关联')).toBeVisible()
  await expect(page.getByRole('img', { exact: true, name: 'problem.png' })).toBeVisible()

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  const searchInput = page.getByRole('textbox', { name: '搜索模板、题目或操作' })
  await searchInput.fill('bfs')
  await searchInput.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'bfs' })).toBeVisible()
  await expect(page.getByRole('button', { name: /单源最短路径/ })).toBeVisible()
})

test('deletes a template with backup and removes a problem with its stored images', async () => {
  await page.getByRole('button', { name: '删除模板 bfs' }).click()
  await expect(page.getByRole('button', { name: '确认删除' })).toBeVisible()
  await page.getByText('dfs.py', { exact: true }).click()
  await expect(page.getByRole('button', { name: '确认删除' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '删除模板 dfs' })).toBeVisible()
  await page.getByText('bfs.cpp', { exact: true }).click()
  await page.getByRole('button', { name: '删除模板 bfs' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByText('模板已备份并删除')).toBeVisible()
  await expect(readFile(fixtureSourcePath, 'utf8')).rejects.toThrow()

  await page.getByRole('button', { name: '题目', exact: true }).click()
  await page.getByRole('button', { name: /单源最短路径 洛谷/ }).click()
  await page.getByRole('button', { name: '删除题目 单源最短路径' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByRole('heading', { level: 2, name: '单源最短路径' })).toHaveCount(0)
  const remainingImages = await readdir(join(userDataDirectory, 'problem-images'), {
    recursive: true,
  })
  expect(remainingImages.filter(path => path.endsWith('.png'))).toHaveLength(0)
})
