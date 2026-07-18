import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

const storageKeys = {
  navigation: 'ui:layout:v1:app-navigation',
  problems: 'ui:layout:v1:problem-workspace',
  providers: 'ui:layout:v1:ai-provider-workspace',
  templates: 'ui:layout:v1:template-library',
}

let app: ElectronApplication
let page: Page
let persistedTemplateSize = 0
let temporaryRoot: string
let userDataDirectory: string
let workspaceDirectory: string

async function launchApplication() {
  app = await electron.launch({
    args: [resolve('.')],
    env: { ...process.env, E2E_USER_DATA_DIR: userDataDirectory, NODE_ENV: 'test' },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720)
  })
}

async function setNextDirectorySelection(directoryPath: string) {
  await app.evaluate(({ dialog }, selectedDirectory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [selectedDirectory],
    })) as typeof dialog.showOpenDialog
  }, directoryPath)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-layout-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  workspaceDirectory = join(temporaryRoot, 'workspace')
  await mkdir(userDataDirectory)
  await mkdir(workspaceDirectory)
  await launchApplication()
  await setNextDirectorySelection(workspaceDirectory)
  await page.getByRole('button', { name: '创建工作区' }).click()
  await page.getByRole('heading', { name: '模板库' }).waitFor()
})

test.afterAll(async () => {
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

test('resizes navigation and template panels with keyboard and pointer using safe bounds', async () => {
  const navigationSeparator = page.getByRole('separator', { name: '调整导航宽度' })
  await expect(navigationSeparator).toHaveAttribute('aria-orientation', 'vertical')
  await expect(navigationSeparator).toHaveAttribute('aria-valuenow', '216')
  await navigationSeparator.focus()
  await page.keyboard.press('ArrowRight')
  await expect(navigationSeparator).toHaveAttribute('aria-valuenow', '224')

  const templateSeparator = page.getByRole('separator', { name: '调整模板树宽度' })
  await templateSeparator.focus()
  await page.keyboard.press('Home')
  await expect(templateSeparator).toHaveAttribute('aria-valuenow', '220')
  const beforeDrag = Number(await templateSeparator.getAttribute('aria-valuenow'))
  const bounds = await templateSeparator.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 48, bounds!.y + bounds!.height / 2)
  await page.mouse.up()
  await expect
    .poll(async () => Number(await templateSeparator.getAttribute('aria-valuenow')))
    .toBeGreaterThan(beforeDrag)

  const persisted = await page.evaluate(
    keys => ({
      navigation: localStorage.getItem(keys.navigation),
      templates: localStorage.getItem(keys.templates),
    }),
    storageKeys,
  )
  expect(persisted.navigation).toBe('224')
  persistedTemplateSize = Number(persisted.templates)
  expect(persistedTemplateSize).toBeGreaterThan(beforeDrag)
})

test('restores persisted panel sizes after a real desktop restart', async () => {
  await app.close()
  await launchApplication()
  await page.getByRole('button', { name: '模板库', exact: true }).click()

  await expect(page.getByRole('separator', { name: '调整导航宽度' })).toHaveAttribute(
    'aria-valuenow',
    '224',
  )
  await expect(page.getByRole('separator', { name: '调整模板树宽度' })).toHaveAttribute(
    'aria-valuenow',
    String(persistedTemplateSize),
  )
})

test('falls back from invalid persisted values and resets all layouts without data migration', async () => {
  await page.evaluate(keys => {
    localStorage.setItem(keys.navigation, '9999')
    localStorage.setItem(keys.problems, 'not-a-number')
    localStorage.setItem(keys.providers, '9999')
    localStorage.setItem(keys.templates, '-25')
    localStorage.setItem('ui:theme', 'light')
  }, storageKeys)
  await page.reload()
  await page.getByRole('button', { name: '模板库', exact: true }).click()

  await expect(page.getByRole('separator', { name: '调整导航宽度' })).toHaveAttribute(
    'aria-valuenow',
    '216',
  )
  await expect(page.getByRole('separator', { name: '调整模板树宽度' })).toHaveAttribute(
    'aria-valuenow',
    '292',
  )

  await page.getByRole('separator', { name: '调整模板树宽度' }).focus()
  await page.keyboard.press('ArrowLeft')
  await page.getByRole('button', { name: '题目', exact: true }).click()
  await page.getByRole('separator', { name: '调整题目列表宽度' }).focus()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click()
  await page.getByRole('separator', { name: '调整 Provider 列表宽度' }).focus()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: '重置布局' }).click()

  await expect(page.getByRole('status')).toContainText('布局已恢复默认值')
  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByRole('separator', { name: '调整题目列表宽度' })).toHaveAttribute(
    'aria-valuenow',
    '312',
  )
  expect(
    await page.evaluate(
      keys => ({
        navigation: localStorage.getItem(keys.navigation),
        problems: localStorage.getItem(keys.problems),
        providers: localStorage.getItem(keys.providers),
        templates: localStorage.getItem(keys.templates),
        theme: localStorage.getItem('ui:theme'),
      }),
      storageKeys,
    ),
  ).toEqual({ navigation: null, problems: null, providers: null, templates: null, theme: 'light' })
})

test('announces page changes and restores focus after search, template, and problem dialogs', async () => {
  await page.getByRole('button', { name: '数据管理', exact: true }).click()
  await expect(page.getByTestId('page-announcement')).toHaveText('已切换到 数据管理')

  const searchTrigger = page.getByRole('button', { name: '打开全局搜索' })
  await searchTrigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: '搜索模板、题目或操作' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(searchTrigger).toBeFocused()

  await page.getByRole('button', { name: '模板库', exact: true }).click()
  const templateTrigger = page.getByRole('main').getByRole('button', { name: '新建模板' })
  await templateTrigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('文件名')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(templateTrigger).toBeFocused()

  await page.getByRole('button', { name: '题目', exact: true }).click()
  const problemTrigger = page.getByRole('button', { name: '新建题目' })
  await problemTrigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('题目标题')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(problemTrigger).toBeFocused()
})

test('creates, searches, selects, and relates long content without a mouse', async () => {
  const longTemplateName = `超长路径与按钮可达性模板${'最短路'.repeat(12)}`
  const longProblemTitle = `超长题目标题${'算法工作台'.repeat(14)}`

  const templatesNavigation = page.getByRole('button', { name: '模板库', exact: true })
  await templatesNavigation.focus()
  await page.keyboard.press('Enter')
  const templateTrigger = page.getByRole('main').getByRole('button', { name: '新建模板' })
  await templateTrigger.focus()
  await page.keyboard.press('Enter')
  await page.getByLabel('文件名').fill(`${longTemplateName}.cpp`)
  await page
    .getByRole('textbox', { name: '模板源码', exact: true })
    .fill('void long_content_fixture() {}\n')
  await page.getByRole('button', { name: '确认创建' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: longTemplateName })).toBeVisible()

  const problemsNavigation = page.getByRole('button', { name: '题目', exact: true })
  await problemsNavigation.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '新建题目' }).focus()
  await page.keyboard.press('Enter')
  await page.getByLabel('题目标题').fill(longProblemTitle)
  await page
    .getByLabel('标签')
    .fill(Array.from({ length: 16 }, (_, index) => `超长标签${index + 1}算法分类`).join(', '))
  await page.getByLabel('原始题面').fill(`题面${'A'.repeat(900)}`)
  await page.getByRole('button', { name: '创建题目' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: longProblemTitle })).toBeVisible()

  const relationTrigger = page.getByRole('button', { name: '添加关联' })
  await relationTrigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('算法模板', { exact: true })).toBeFocused()
  await page.getByRole('button', { name: '保存关联' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('1 个已确认关联')).toBeVisible()

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  const searchInput = page.getByRole('textbox', { name: '搜索模板、题目或操作' })
  await searchInput.fill('超长路径与按钮可达性')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: longTemplateName })).toBeVisible()
})

test('uses the real 1024x640 window and keeps core controls reachable at 200 percent zoom', async () => {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.webContents.setZoomFactor(1)
    window?.setSize(1024, 640)
  })
  await expect
    .poll(async () =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getSize()),
    )
    .toEqual([1024, 640])

  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.setSize(1440, 900)
    window?.webContents.setZoomFactor(2)
  })
  await expect(page.locator('.app-shell')).toHaveAttribute('data-compact-navigation', 'true')

  for (const [navigationLabel, heading] of [
    ['工作台', '工作台'],
    ['模板库', '模板库'],
    ['题目', '题目卡片'],
    ['AI 管理', '总体文件 AI 管理'],
    ['数据管理', '数据管理'],
  ] as const) {
    await page.getByRole('button', { name: navigationLabel, exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    expect(
      await page.evaluate(() => ({
        clientWidth: (
          globalThis as unknown as {
            document: { documentElement: { clientWidth: number } }
          }
        ).document.documentElement.clientWidth,
        scrollWidth: (
          globalThis as unknown as {
            document: { documentElement: { scrollWidth: number } }
          }
        ).document.documentElement.scrollWidth,
      })),
    ).toEqual({ clientWidth: 720, scrollWidth: 720 })

    const clientWidth = 720
    const visibleButtons = page.locator('button:visible')
    const offscreenButtons: string[] = []
    for (let index = 0; index < (await visibleButtons.count()); index += 1) {
      const button = visibleButtons.nth(index)
      const bounds = await button.boundingBox()
      if (bounds && (bounds.x < -1 || bounds.x + bounds.width > clientWidth + 1)) {
        offscreenButtons.push(
          (await button.getAttribute('aria-label')) ?? (await button.innerText()),
        )
      }
    }
    expect(offscreenButtons).toEqual([])
  }

  for (const label of ['工作台', '模板库', '题目', 'AI 管理', '数据管理', 'AI 设置']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  }

  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.webContents.setZoomFactor(1)
    window?.setSize(1280, 720)
  })
})
