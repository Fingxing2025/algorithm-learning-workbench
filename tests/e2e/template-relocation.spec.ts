import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
let workspaceRoot: string

async function launchApplication(options?: {
  archiveFailureAfter?: number
  fileFailure?: boolean
}) {
  electronApp = await electron.launch({
    args: [resolve('.')],
    env: {
      ...process.env,
      E2E_FILE_PLAN_FAILURE_STAGE: options?.fileFailure ? 'after-file-mutations' : '',
      E2E_PLAN_ARCHIVE_FAILURE_AFTER: String(options?.archiveFailureAfter ?? ''),
      E2E_USER_DATA_DIR: userDataDirectory,
      NODE_ENV: 'test',
    },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
}

async function setNextDirectorySelection(directoryPath: string) {
  await electronApp.evaluate(({ dialog }, selectedDirectory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [selectedDirectory],
    })) as typeof dialog.showOpenDialog
  }, directoryPath)
}

async function currentTemplate(relativePath: string) {
  return page.evaluate(async path => {
    const api = (
      globalThis as unknown as {
        desktop: {
          workspace: {
            getCurrent: () => Promise<{ templates: Array<{ id: string; relativePath: string }> }>
          }
        }
      }
    ).desktop
    const workspace = await api.workspace.getCurrent()
    return workspace.templates.find(template => template.relativePath === path) ?? null
  }, relativePath)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'template-relocation-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  workspaceRoot = join(temporaryRoot, 'workspace')
  await mkdir(userDataDirectory)
  await mkdir(join(workspaceRoot, '算法'), { recursive: true })
  await writeFile(join(workspaceRoot, '算法', 'a.cpp'), 'void stableTemplate() {}\n', 'utf8')
  await writeFile(join(workspaceRoot, 'failure.cpp'), 'void rollbackTemplate() {}\n', 'utf8')
  await launchApplication()
})

test.afterAll(async () => {
  await electronApp?.close()
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

test('renames and moves a real template with a stable ID, archives its plan, and still undoes it', async () => {
  await setNextDirectorySelection(workspaceRoot)
  await page.getByRole('button', { name: '选择目录' }).click()

  await page.getByRole('button', { name: '题目', exact: true }).click()
  await page.getByRole('button', { name: '新建题目' }).click()
  await page.getByLabel('题目标题').fill('模板移动关系验证')
  await page.getByRole('button', { name: '创建题目' }).click()
  await page.getByRole('button', { name: '添加关联' }).click()
  await page.getByLabel('算法模板', { exact: true }).selectOption({ label: 'a · 算法/a.cpp' })
  await page.getByLabel('关系类型', { exact: true }).selectOption('used')
  await page.getByRole('button', { name: '保存关联' }).click()

  const original = await currentTemplate('算法/a.cpp')
  expect(original).not.toBeNull()
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await page.getByText('算法', { exact: true }).click()
  await page.getByText('a.cpp', { exact: true }).click()
  await page.getByRole('button', { name: '重命名或移动模板 a' }).click()
  await page.getByLabel('新的文件名与相对路径').fill('算法/最短路/renamed.cpp')
  await page.getByRole('button', { name: '预览变更' }).click()
  await expect(page.getByText('重命名并移动')).toBeVisible()
  await expect(page.getByText('1 项保持原模板 ID')).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/template-relocation-preview-light-1440x900.png'),
  })
  await page.getByRole('button', { name: '确认重命名或移动' }).click()
  await expect(page.getByRole('heading', { name: '重命名或移动模板' })).toHaveCount(0)

  expect(await readFile(join(workspaceRoot, '算法', '最短路', 'renamed.cpp'), 'utf8')).toBe(
    'void stableTemplate() {}\n',
  )
  await expect(readFile(join(workspaceRoot, '算法', 'a.cpp'), 'utf8')).rejects.toThrow()
  const moved = await currentTemplate('算法/最短路/renamed.cpp')
  expect(moved?.id).toBe(original?.id)

  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByRole('button', { name: /renamed 实际使用/ })).toBeVisible()
  await page.getByRole('button', { name: 'AI 管理', exact: true }).click()
  await expect(page.getByText('本地手动操作')).toBeVisible()
  await page.getByRole('button', { name: '删除计划记录 本地手动操作' }).click()
  await expect(page.getByText(/将归档 1 份计划/)).toBeVisible()
  await page.getByRole('button', { name: '确认删除计划记录' }).click()
  await expect(page.getByText('本地手动操作')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '从备份撤销' })).toBeVisible()
  await page.getByRole('button', { name: '从备份撤销' }).click()
  await page.getByRole('button', { name: '确认撤销' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: '已从备份撤销文件计划。' }),
  ).toBeVisible()

  expect(await readFile(join(workspaceRoot, '算法', 'a.cpp'), 'utf8')).toBe(
    'void stableTemplate() {}\n',
  )
  await expect(
    readFile(join(workspaceRoot, '算法', '最短路', 'renamed.cpp'), 'utf8'),
  ).rejects.toThrow()
  const restored = await currentTemplate('算法/a.cpp')
  expect(restored?.id).toBe(original?.id)
})

test('rolls the file and stable index back when a post-mutation step fails', async () => {
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await page.getByText('failure.cpp', { exact: true }).click()
  await page.getByRole('button', { name: '重命名或移动模板 failure' }).click()
  await page.getByLabel('新的文件名与相对路径').fill('阶段一/failure.cpp')
  await page.getByRole('button', { name: '预览变更' }).click()
  await page.getByRole('button', { name: '确认重命名或移动' }).click()
  await expect(page.getByRole('heading', { name: '重命名或移动模板' })).toHaveCount(0)
  await page.getByRole('button', { name: '重命名或移动模板 failure' }).click()
  await page.getByLabel('新的文件名与相对路径').fill('阶段二/failure.cpp')
  await page.getByRole('button', { name: '预览变更' }).click()
  await page.getByRole('button', { name: '确认重命名或移动' }).click()
  await expect(page.getByRole('heading', { name: '重命名或移动模板' })).toHaveCount(0)

  await electronApp.close()
  await launchApplication({ archiveFailureAfter: 1 })
  await page.getByRole('button', { name: 'AI 管理', exact: true }).click()
  await expect(page.getByText('本地手动操作')).toHaveCount(2)
  await page.getByRole('button', { name: '一键删除计划记录' }).click()
  await page.getByRole('button', { name: '确认删除计划记录' }).click()
  await expect(page.getByRole('alert')).toContainText('归档失败')
  await expect(page.getByText('本地手动操作')).toHaveCount(2)

  await electronApp.close()
  await launchApplication()
  await page.getByRole('button', { name: 'AI 管理', exact: true }).click()
  await page.getByRole('button', { name: '一键删除计划记录' }).click()
  await page.getByRole('button', { name: '确认删除计划记录' }).click()
  await expect(page.getByText('本地手动操作')).toHaveCount(0)

  await electronApp.close()
  await launchApplication({ fileFailure: true })
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  const original = await currentTemplate('阶段二/failure.cpp')
  await page.getByText('阶段二', { exact: true }).click()
  await page.getByText('failure.cpp', { exact: true }).click()
  await page.getByRole('button', { name: '重命名或移动模板 failure' }).click()
  await page.getByLabel('新的文件名与相对路径').fill('故障/failure.cpp')
  await page.getByRole('button', { name: '预览变更' }).click()
  await page.getByRole('button', { name: '确认重命名或移动' }).click()
  await expect(page.getByRole('alert')).toContainText('文件计划执行失败')

  expect(await readFile(join(workspaceRoot, '阶段二', 'failure.cpp'), 'utf8')).toBe(
    'void rollbackTemplate() {}\n',
  )
  await expect(readFile(join(workspaceRoot, '故障', 'failure.cpp'), 'utf8')).rejects.toThrow()
  const afterFailure = await currentTemplate('阶段二/failure.cpp')
  expect(afterFailure?.id).toBe(original?.id)
})
