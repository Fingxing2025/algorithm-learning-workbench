import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

import type { DesktopApi } from '@core/contracts/desktop-api'

declare const window: { desktop: DesktopApi }

let electronApp: ElectronApplication
let page: Page
let temporaryRoot: string
let userDataDirectory: string
let workspaceA: string
let workspaceB: string

async function setNextDirectorySelection(directoryPath: string) {
  await electronApp.evaluate(({ dialog }, selectedDirectory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [selectedDirectory],
    })) as typeof dialog.showOpenDialog
    dialog.showMessageBox = (async () => ({
      checkboxChecked: false,
      response: 1,
    })) as typeof dialog.showMessageBox
  }, directoryPath)
}

async function setNextDirectorySelectionCancelled() {
  await electronApp.evaluate(({ dialog }) => {
    dialog.showOpenDialog = (async () => ({
      canceled: true,
      filePaths: [],
    })) as typeof dialog.showOpenDialog
  })
}

async function expectHealthyBackupPageAndInternalTemplateCount(count: number) {
  await page.getByRole('button', { name: '备份与恢复' }).click()
  await expect(page.locator('p').filter({ hasText: /^数据状态正常$/u })).toBeVisible()
  await expect(page.getByTestId('data-count-templates')).toHaveCount(0)
  const diagnostics = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(diagnostics.counts.templates).toBe(count)
}

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-data-count-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  workspaceA = join(temporaryRoot, 'workspace-a')
  workspaceB = join(temporaryRoot, 'workspace-b')
  await mkdir(userDataDirectory)
  await mkdir(workspaceA)
  await mkdir(workspaceB)
  await writeFile(join(workspaceA, 'a.cpp'), 'void a() {}\n', 'utf8')
  await writeFile(join(workspaceA, 'b.cpp'), 'void b() {}\n', 'utf8')
  await writeFile(join(workspaceB, 'only.cpp'), 'void only() {}\n', 'utf8')

  electronApp = await electron.launch({
    args: [resolve('.')],
    env: { ...process.env, E2E_USER_DATA_DIR: userDataDirectory, NODE_ENV: 'test' },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp?.close()
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

test('keeps diagnostics accurate without exposing management count tiles', async () => {
  await setNextDirectorySelection(workspaceA)
  await page.getByRole('button', { name: '选择目录' }).click()
  await expect(page.getByText('2 个模板').first()).toBeVisible()
  await expectHealthyBackupPageAndInternalTemplateCount(2)

  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await setNextDirectorySelection(workspaceB)
  await page.getByRole('button', { name: '切换工作区' }).click()
  await expect(page.getByText('1 个模板').first()).toBeVisible()
  await expectHealthyBackupPageAndInternalTemplateCount(1)

  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await unlink(join(workspaceB, 'templates', 'only.cpp'))
  await page.getByRole('button', { name: '重新扫描工作区' }).click()
  await expect(page.getByText('工作区还是空的')).toBeVisible()
  await expectHealthyBackupPageAndInternalTemplateCount(0)

  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await setNextDirectorySelectionCancelled()
  await page.getByRole('button', { name: '切换工作区' }).click()
  await expect(page.getByText('workspace-b · 本地索引')).toBeVisible()
  await expect(page.getByText('工作区还是空的')).toBeVisible()

  await setNextDirectorySelection(workspaceA)
  await page.getByRole('button', { name: '切换工作区' }).click()
  await expect(page.getByText('2 个模板').first()).toBeVisible()
  await expectHealthyBackupPageAndInternalTemplateCount(2)
})
