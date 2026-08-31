import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

let app: ElectronApplication
let page: Page
let temporaryRoot: string
let userDataDirectory: string
let workspaceRoot: string
let exportRoot: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-export-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  workspaceRoot = join(temporaryRoot, 'workspace')
  exportRoot = join(temporaryRoot, 'exports')
  await mkdir(userDataDirectory)
  await mkdir(workspaceRoot)
  await mkdir(exportRoot)
  app = await electron.launch({
    args: [resolve('.')],
    env: { ...process.env, E2E_USER_DATA_DIR: userDataDirectory, NODE_ENV: 'test' },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900))
})

test.afterAll(async () => {
  await app?.close()
  await rm(temporaryRoot, { force: true, recursive: true })
})

test('exports selected templates from the real desktop entry', async () => {
  const guide = page.getByRole('dialog', { name: '使用说明' })
  if (await guide.count()) await page.getByRole('button', { name: '开始使用' }).click()
  await app.evaluate(({ dialog }, selectedDirectory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [selectedDirectory],
    })) as typeof dialog.showOpenDialog
  }, workspaceRoot)
  await page.getByRole('button', { name: '创建工作区' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '模板库' })).toBeVisible()
  await page.getByRole('button', { name: '新建模板' }).click()
  await page.getByLabel(/文件名/).fill('中文 # 模板.cpp')
  await page
    .getByRole('textbox', { name: '模板源码', exact: true })
    .fill('int main() { return 0; }\n')
  await page.getByRole('button', { name: '确认创建' }).click()
  await expect(page.locator('[title="中文 # 模板.cpp"]').first()).toBeVisible()

  await page.getByRole('button', { name: '导出模板册' }).click()
  const exportDialog = page.getByRole('dialog', { name: '导出算法模板册' })
  await expect(exportDialog).toBeVisible()
  await exportDialog.getByRole('button', { name: '选择分类' }).click()
  await exportDialog.getByLabel('同时生成 PDF（内置引擎，无需安装 TeX）').check()
  await exportDialog.getByLabel('同时生成 Word 文档（.doc）').check()
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: `${target}/算法模板册.tex`,
    })) as typeof dialog.showSaveDialog
  }, exportRoot)
  await exportDialog.getByRole('button', { name: '选择位置并导出' }).click()
  await expect(exportDialog.getByRole('status')).toContainText('算法模板册.tex')
  await expect(exportDialog.getByRole('status')).toContainText('PDF 已生成')
  await expect(exportDialog.getByRole('status')).toContainText('Word 文档已生成')

  const tex = await readFile(join(exportRoot, '算法模板册.tex'), 'utf8')
  expect(tex).toContain('中文 \\# 模板')
  expect(tex).toContain('int main()')
  expect(await readdir(join(exportRoot, '算法模板册-resources'))).toContain('README.txt')
  expect((await readFile(join(exportRoot, '算法模板册.pdf'))).subarray(0, 5).toString()).toBe(
    '%PDF-',
  )
  expect((await readFile(join(exportRoot, '算法模板册.doc'))).subarray(0, 5).toString()).toBe(
    '{\\rtf',
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/template-export-light-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/template-export-dark-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  const dimensions: Array<[number, number]> = [
    [1280, 720],
    [1024, 640],
  ]
  for (const [width, height] of dimensions) {
    await app.evaluate(
      ({ BrowserWindow }, size) => {
        const [widthValue, heightValue] = size as [number, number]
        BrowserWindow.getAllWindows()[0]?.setSize(widthValue, heightValue)
      },
      [width, height],
    )
    await page.screenshot({
      animations: 'disabled',
      path: resolve(`output/playwright/template-export-light-${width}x${height}.png`),
    })
  }
  expect(
    await page.evaluate(() => {
      const browser = globalThis as unknown as {
        document: { documentElement: { clientWidth: number; scrollWidth: number } }
      }
      return (
        browser.document.documentElement.scrollWidth <= browser.document.documentElement.clientWidth
      )
    }),
  ).toBe(true)
})
