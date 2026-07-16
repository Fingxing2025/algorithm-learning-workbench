import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

let electronApp: ElectronApplication
let page: Page
let temporaryRoot: string
let userDataDirectory: string

test.describe.configure({ mode: 'serial' })

async function launchApplication() {
  electronApp = await electron.launch({
    args: [resolve('.')],
    env: { ...process.env, E2E_USER_DATA_DIR: userDataDirectory, NODE_ENV: 'test' },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
}

async function setNextSavePath(path: string) {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: selectedPath,
    })) as typeof dialog.showSaveDialog
  }, path)
}

async function setNextSelection(path: string) {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [selectedPath],
    })) as typeof dialog.showOpenDialog
  }, path)
}

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-data-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  await mkdir(userDataDirectory)
  await launchApplication()
})

test.afterAll(async () => {
  await electronApp?.close()
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

test('exports and verifies a blank user data backup, then rejects tampering', async () => {
  await page.getByRole('button', { name: '数据管理' }).click()
  await expect(page.getByRole('heading', { name: '数据管理' })).toBeVisible()
  await expect(page.getByText('未发现异常')).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-light-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-dark-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))

  const backupPath = join(temporaryRoot, 'blank-export.awb-backup')
  await setNextSavePath(backupPath)
  await page.getByRole('button', { name: '导出备份' }).click()
  await expect(page.getByRole('alert')).toContainText('备份已导出并通过校验')
  await expect(page.getByText('备份包校验通过')).toBeVisible()

  const manifest = JSON.parse(await readFile(join(backupPath, 'manifest.json'), 'utf8')) as {
    counts: { problems: number; templates: number }
    privacy: { providerSecrets: string }
  }
  expect(manifest.counts.problems).toBe(0)
  expect(manifest.counts.templates).toBe(0)
  expect(manifest.privacy.providerSecrets).toBe('omitted')
  await expect(
    stat(join(backupPath, 'data', 'sqlite', 'algorithm-workbench.sqlite')),
  ).resolves.toBeTruthy()
  await expect(stat(join(backupPath, 'secrets'))).rejects.toThrow()

  await writeFile(join(backupPath, 'COMPLETED'), 'tampered\n', 'utf8')
  await setNextSelection(backupPath)
  await page.getByRole('button', { name: '验证备份包' }).click()
  await expect(page.getByText('备份包校验失败')).toBeVisible()
  await expect(page.getByText(/文件哈希不匹配/)).toBeVisible()
})
