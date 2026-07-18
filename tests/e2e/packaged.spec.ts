import { access, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
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

test('preserves an existing V2 workspace across packaged app relaunch', async () => {
  const executablePath = process.env.PACKAGED_APP_PATH
  test.skip(!executablePath, 'PACKAGED_APP_PATH is only set during packaged smoke tests')
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-packaged-existing-'))
  const userDataDirectory = join(temporaryRoot, 'user-data')
  const workspaceDirectory = join(temporaryRoot, 'workspace')
  await mkdir(userDataDirectory)
  await mkdir(workspaceDirectory)

  const launch = () =>
    electron.launch({
      executablePath: resolve(executablePath!),
      env: {
        ...process.env,
        E2E_USER_DATA_DIR: userDataDirectory,
        NODE_ENV: 'test',
      },
    })

  let app = await launch()
  try {
    let page = await app.firstWindow()
    await app.evaluate(({ dialog }, selectedDirectory) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [selectedDirectory],
      })) as typeof dialog.showOpenDialog
    }, workspaceDirectory)
    await page.getByRole('button', { name: '创建工作区' }).click()
    await expect(page.getByRole('heading', { level: 1, name: '模板库' })).toBeVisible()
    const createTemplateTrigger = page.getByRole('button', { name: '新建模板' })
    const closeNewTemplateFromIconCenter = async () => {
      const dialog = page.getByRole('dialog')
      const closeButton = page.getByRole('button', { name: '关闭新建模板' })
      await expect(closeButton).toBeEnabled()
      await expect(dialog).toHaveCSS('-webkit-app-region', 'no-drag')
      const iconBounds = await closeButton.locator('svg').boundingBox()
      expect(iconBounds).not.toBeNull()
      const center = {
        x: iconBounds!.x + iconBounds!.width / 2,
        y: iconBounds!.y + iconBounds!.height / 2,
      }
      expect(
        await page.evaluate(point => {
          const browser = globalThis as unknown as {
            document: { elementFromPoint: (x: number, y: number) => { tagName: string } | null }
          }
          return browser.document.elementFromPoint(point.x, point.y)?.tagName.toLowerCase()
        }, center),
      ).toBe('button')
      await page.mouse.click(center.x, center.y)
      await expect(dialog).toHaveCount(0)
      await expect(createTemplateTrigger).toBeFocused()
    }

    await createTemplateTrigger.click()
    await closeNewTemplateFromIconCenter()
    await createTemplateTrigger.click()
    await page.getByLabel('补全语言').selectOption('en')
    await closeNewTemplateFromIconCenter()

    await createTemplateTrigger.click()
    await page.getByLabel('文件名').fill('release-smoke.cpp')
    await page
      .getByRole('textbox', { name: '模板源码', exact: true })
      .fill('void release_smoke() {}\n')
    await page.getByRole('button', { name: '确认创建' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'release-smoke' })).toBeVisible()
    await app.close()

    await access(join(userDataDirectory, 'algorithm-workbench.sqlite'))
    expect(await readFile(join(workspaceDirectory, 'release-smoke.cpp'), 'utf8')).toBe(
      'void release_smoke() {}\n',
    )

    app = await launch()
    page = await app.firstWindow()
    await expect(page.getByRole('heading', { level: 1, name: '工作台' })).toBeVisible()
    await expect(page.getByText('1 个模板 · 本地索引')).toBeVisible()
    await page.getByRole('button', { name: '模板库', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: '模板库' })).toBeVisible()
    await expect(page.getByText('release-smoke.cpp', { exact: true })).toBeVisible()
    await page.getByText('release-smoke.cpp', { exact: true }).click()
    await expect(page.getByText('void release_smoke() {}')).toBeVisible()
  } finally {
    await app.close().catch(() => undefined)
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
