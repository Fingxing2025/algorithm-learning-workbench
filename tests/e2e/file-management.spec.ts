import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
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
let mockBaseUrl: string
let mockServer: Server
let page: Page
let temporaryRoot: string
let userDataDirectory: string
let workspaceRoot: string

test.describe.configure({ mode: 'serial' })

async function launchApplication() {
  electronApp = await electron.launch({
    args: [resolve('.')],
    env: {
      ...process.env,
      E2E_ALLOW_INSECURE_AI_LOOPBACK: '1',
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

async function setNextSelection(path: string) {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [selectedPath],
    })) as typeof dialog.showOpenDialog
  }, path)
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false)
}

test.beforeAll(async () => {
  mockServer = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(Buffer.from(chunk)))
    request.on('end', () => {
      const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        messages: Array<{ content: string }>
      }
      const input = JSON.parse(requestBody.messages.at(-1)?.content ?? '{}') as {
        audit: { issues: Array<{ kind: string; paths: string[] }> }
        templates: Array<{ id: string; path: string }>
      }
      const duplicatePath = input.audit.issues.find(issue => issue.kind === 'duplicate-content')
        ?.paths[1]
      const duplicate = input.templates.find(template => template.path === duplicatePath)
      const named = input.templates.find(template => template.path === 'Old Name.cpp')
      const metadataTarget = input.templates.find(template => template.path === 'plain.py')
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `这是整理建议：\n\`\`\`json\n${JSON.stringify({
                  data: {
                    operations: [
                      ...(duplicate
                        ? [
                            {
                              kind: 'delete',
                              reason: '与保留副本内容完全相同。',
                              templateId: duplicate.id,
                            },
                          ]
                        : []),
                      ...(named
                        ? [
                            {
                              kind: 'move',
                              reason: '统一文件命名并归入整理目录。',
                              targetPath: '整理/old_name.cpp',
                              templateId: named.id,
                            },
                          ]
                        : []),
                      ...(metadataTarget
                        ? [
                            {
                              kind: 'update-metadata',
                              metadata: {
                                commonMistakes: '注意递归深度。',
                                constraints: '适用于树或图遍历。',
                                notes: '',
                                prerequisites: '递归或显式栈。',
                                solves: '深度优先遍历。',
                                spaceComplexity: 'O(n)',
                                tags: ['搜索', 'DFS'],
                                timeComplexity: 'O(n + m)',
                              },
                              reason: '补充缺失的算法卡片信息。',
                              templateId: metadataTarget.id,
                            },
                          ]
                        : []),
                    ],
                  },
                })}\n\`\`\`\n请在执行前检查。`,
              },
            },
          ],
        }),
      )
    })
  })
  await new Promise<void>(resolveListen => mockServer.listen(0, '127.0.0.1', resolveListen))
  const address = mockServer.address()
  if (!address || typeof address === 'string') throw new Error('mock server did not start')
  mockBaseUrl = `http://127.0.0.1:${address.port}/v1`

  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-files-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  workspaceRoot = join(temporaryRoot, 'workspace')
  await mkdir(userDataDirectory)
  await mkdir(workspaceRoot)
  await writeFile(join(workspaceRoot, 'copy.cpp'), 'duplicate source\n', 'utf8')
  await writeFile(join(workspaceRoot, 'keep.cpp'), 'duplicate source\n', 'utf8')
  await writeFile(join(workspaceRoot, 'Old Name.cpp'), 'void oldName() {}\n', 'utf8')
  await writeFile(join(workspaceRoot, 'plain.py'), 'def dfs():\n    pass\n', 'utf8')
  await launchApplication()
})

test.afterAll(async () => {
  await electronApp?.close()
  await new Promise<void>((resolveClose, reject) =>
    mockServer?.close(error => (error ? reject(error) : resolveClose())),
  )
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

test('creates a problem relation before the AI file move', async () => {
  await setNextSelection(workspaceRoot)
  await page.getByRole('button', { name: '选择目录' }).click()
  await page.getByRole('button', { name: '题目', exact: true }).click()
  await page.getByRole('button', { name: '新建题目' }).click()
  await page.getByLabel('题目标题').fill('关系迁移验证')
  await page.getByRole('button', { name: '创建题目' }).click()
  await page.getByRole('button', { name: '添加关联' }).click()
  await page
    .getByLabel('算法模板', { exact: true })
    .selectOption({ label: 'Old Name · Old Name.cpp' })
  await page.getByRole('button', { name: '保存关联' }).click()
  await expect(page.getByText('1 个已确认关联')).toBeVisible()
})

test('cancels a generated plan without changing files', async () => {
  await page.getByRole('button', { name: 'AI 设置' }).click()
  await page.getByLabel('Provider 显示名称').fill('文件管理测试')
  await page.getByLabel('Base URL').fill(mockBaseUrl)
  await page.getByLabel('模型名称').fill('fixture-workspace')
  await page.getByLabel('API Key').fill('files-e2e-secret')
  await page.getByRole('button', { name: '保存 Provider' }).click()
  await page.getByRole('button', { name: /总体文件 AI 管理/ }).click()
  await page.getByRole('button', { name: 'AI 管理', exact: true }).click()

  await page.getByRole('button', { name: '只读扫描' }).click()
  await expect(page.getByRole('status').filter({ hasText: '只读扫描完成' })).toBeVisible()
  await page.getByRole('button', { name: '关闭文件管理提示' }).click()
  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await expect(page.getByRole('status').filter({ hasText: '尚未修改文件' })).toBeVisible()
  await expect(page.getByText('移动 / 重命名')).toBeVisible()
  await expect(page.getByText('删除重复文件')).toBeVisible()
  await page.getByRole('button', { name: '取消计划' }).click()
  await expect(page.getByRole('status').filter({ hasText: '工作区文件未发生变化' })).toBeVisible()
  expect(await pathExists(join(workspaceRoot, 'Old Name.cpp'))).toBe(true)
  expect(await pathExists(join(workspaceRoot, 'copy.cpp'))).toBe(true)
  expect(await pathExists(join(workspaceRoot, 'keep.cpp'))).toBe(true)
})

test('applies a selected plan with backup, relation remap, and rollback', async () => {
  await page.getByRole('button', { name: '关闭文件管理提示' }).click()
  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await expect(page.getByText('移动 / 重命名')).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage5-file-plan-light.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage5-file-plan-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage5-file-plan-dark.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  await page.getByRole('button', { name: '预览并执行' }).click()
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByRole('status').filter({ hasText: '保留撤销备份' })).toBeVisible()

  expect(await pathExists(join(workspaceRoot, 'Old Name.cpp'))).toBe(false)
  expect(await pathExists(join(workspaceRoot, '整理', 'old_name.cpp'))).toBe(true)
  const duplicateCount =
    Number(await pathExists(join(workspaceRoot, 'copy.cpp'))) +
    Number(await pathExists(join(workspaceRoot, 'keep.cpp')))
  expect(duplicateCount).toBe(1)

  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByText('1 个已确认关联')).toBeVisible()
  await expect(page.getByRole('button', { name: /old_name 实际使用/ })).toBeVisible()
  await page.getByRole('button', { name: 'AI 管理' }).click()
  await page.getByRole('button', { name: '从备份撤销' }).click()
  await page.getByRole('button', { name: '确认撤销' }).click()
  await expect(page.getByRole('status').filter({ hasText: '已从备份撤销' })).toBeVisible()

  expect(await readFile(join(workspaceRoot, 'Old Name.cpp'), 'utf8')).toBe('void oldName() {}\n')
  expect(await pathExists(join(workspaceRoot, '整理', 'old_name.cpp'))).toBe(false)
  expect(await pathExists(join(workspaceRoot, 'copy.cpp'))).toBe(true)
  expect(await pathExists(join(workspaceRoot, 'keep.cpp'))).toBe(true)
  expect(await readdir(join(userDataDirectory, 'file-plan-backups'))).toEqual([])
})
