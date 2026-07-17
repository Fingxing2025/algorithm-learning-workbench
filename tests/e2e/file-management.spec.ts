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
let holdNextFilePlanResponse = false
let heldFilePlanResponseClosed = false
let heldFilePlanResponseStarted = false
let invalidFilePlanResponsesRemaining = 0

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

async function setNextSavePath(path: string) {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: selectedPath,
    })) as typeof dialog.showSaveDialog
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
      if (holdNextFilePlanResponse) {
        holdNextFilePlanResponse = false
        heldFilePlanResponseStarted = true
        response.on('close', () => {
          heldFilePlanResponseClosed = true
        })
        return
      }
      if (invalidFilePlanResponsesRemaining > 0) {
        invalidFilePlanResponsesRemaining -= 1
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({ choices: [{ message: { content: 'invalid-json-fixture' } }] }),
        )
        return
      }
      const input = JSON.parse(requestBody.messages.at(-1)?.content ?? '{}') as {
        audit: { issues: Array<{ kind: string; paths: string[] }> }
        templates: Array<{ id: string; path: string }>
      }
      const duplicatePaths = input.audit.issues
        .filter(issue => issue.kind === 'duplicate-content' || issue.kind === 'similar-content')
        .flatMap(issue => issue.paths.slice(1))
      const duplicates = input.templates.filter(template => duplicatePaths.includes(template.path))
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
                    summary: '工作区存在重复、命名和元数据整理建议。',
                    operations: [
                      ...duplicates.map(duplicate => ({
                        alternatives: ['保留全部文件。'],
                        applicability: ['源码相同或高度相似。'],
                        confidence: 0.9,
                        evidence: ['本地审计把源码列入重复或相似分组。'],
                        kind: 'delete',
                        reason: '与审计指定的保留文件相同或高度相似。',
                        risk: 'high',
                        templateId: duplicate.id,
                      })),
                      ...(named
                        ? [
                            {
                              alternatives: ['保留现有命名。'],
                              applicability: ['当前文件名不符合中文界面命名规则。'],
                              confidence: 0.92,
                              evidence: ['文件名包含空格且为英文通用名称。'],
                              kind: 'move',
                              reason: '统一文件命名并归入整理目录。',
                              risk: 'medium',
                              targetPath: '整理/旧名称.cpp',
                              templateId: named.id,
                            },
                          ]
                        : []),
                      ...(metadataTarget
                        ? [
                            {
                              alternatives: ['暂不补充元数据。'],
                              applicability: ['算法卡片元数据为空。'],
                              confidence: 0.88,
                              evidence: ['源码包含深度优先搜索函数。'],
                              kind: 'update-metadata',
                              metadata: {
                                commonMistakes: '注意递归深度。',
                                constraints: '适用于树或图遍历。',
                                notes:
                                  'DFS 的空间复杂度取决于递归深度或显式栈，并非任何情况下都是常数。',
                                prerequisites: '递归或显式栈。',
                                solves: '深度优先遍历。',
                                spaceComplexity: 'O(n)',
                                tags: ['搜索', 'DFS'],
                                timeComplexity: 'O(n + m)',
                              },
                              reason: '补充缺失的算法卡片信息。',
                              risk: 'low',
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
  const similarSource = [
    'long long score(const vector<int>& data) {',
    '  long long value = 0;',
    ...Array.from({ length: 40 }, (_, index) => `  value += data[${index}];`),
    '  return value;',
    '}',
  ].join('\n')
  await writeFile(join(workspaceRoot, 'near_a.cpp'), `${similarSource}\n`, 'utf8')
  await writeFile(
    join(workspaceRoot, 'near_b.cpp'),
    `${similarSource.replace('value += data[39];', 'value += data[38] + 1;')}\n`,
    'utf8',
  )
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
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await page.getByText('plain.py', { exact: true }).click()
  await page.getByRole('button', { name: /^(编辑|补充元数据)$/ }).click()
  await page.getByLabel('模板用户笔记').fill('DFS 在任何情况下都只需要 O(1) 额外空间。')
  await page.getByRole('button', { name: '保存元数据' }).click()
  await expect(page.getByText('DFS 在任何情况下都只需要 O(1) 额外空间。')).toBeVisible()
})

test('cancels a generated plan without changing files', async () => {
  await page.getByRole('button', { name: 'AI 设置' }).click()
  await page.getByLabel('Provider 显示名称').fill('File Management Test')
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
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  holdNextFilePlanResponse = true
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect.poll(() => heldFilePlanResponseStarted).toBe(true)
  await page.getByRole('button', { name: '取消生成' }).click()
  await expect.poll(() => heldFilePlanResponseClosed).toBe(true)
  await expect(page.getByRole('button', { name: '生成 AI 计划' })).toBeEnabled()
  await expect(page.getByText('移动 / 重命名', { exact: true })).toHaveCount(0)

  invalidFilePlanResponsesRemaining = 2
  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByRole('alert')).toContainText('连续两次未返回完整的结构化文件计划')
  await expect(page.getByText('移动 / 重命名', { exact: true })).toHaveCount(0)
  expect(await pathExists(join(workspaceRoot, '整理', '旧名称.cpp'))).toBe(false)

  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByRole('status').filter({ hasText: '尚未修改文件' })).toBeVisible()
  await expect(page.getByText('移动 / 重命名', { exact: true })).toBeVisible()
  await expect(page.getByText('删除重复文件').first()).toBeVisible()
  await expect(page.getByText('需手动选择')).toHaveCount(2)
  await page.getByRole('button', { name: '取消计划' }).click()
  await expect(page.getByRole('status').filter({ hasText: '工作区文件未发生变化' })).toBeVisible()
  expect(await pathExists(join(workspaceRoot, 'Old Name.cpp'))).toBe(true)
  expect(await pathExists(join(workspaceRoot, 'copy.cpp'))).toBe(true)
  expect(await pathExists(join(workspaceRoot, 'keep.cpp'))).toBe(true)
  await page.getByRole('button', { name: '复制为新计划' }).first().click()
  await expect(page.getByRole('status').filter({ hasText: '重新校验并创建' })).toBeVisible()
  await expect(page.getByText('移动 / 重命名', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '取消计划' }).click()
})

test('rejects the whole batch when a source changes after plan generation', async () => {
  await page.getByRole('button', { name: '关闭文件管理提示' }).click()
  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByText('移动 / 重命名', { exact: true })).toBeVisible()

  await writeFile(join(workspaceRoot, 'Old Name.cpp'), 'void changedOutsideApp() {}\n', 'utf8')
  await page.getByRole('button', { name: '预览并执行' }).click()
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByRole('alert')).toContainText('文件或元数据已在计划生成后变更')

  expect(await pathExists(join(workspaceRoot, 'copy.cpp'))).toBe(true)
  expect(await pathExists(join(workspaceRoot, 'keep.cpp'))).toBe(true)
  expect(await pathExists(join(workspaceRoot, '整理', '旧名称.cpp'))).toBe(false)
  const diagnosticPath = join(temporaryRoot, 'safe-diagnostic.json')
  await setNextSavePath(diagnosticPath)
  await page.getByRole('button', { name: '导出安全诊断' }).click()
  const diagnostic = await readFile(diagnosticPath, 'utf8')
  expect(diagnostic).not.toContain(workspaceRoot)
  expect(diagnostic).not.toContain('changedOutsideApp')
  expect(diagnostic).not.toContain('files-e2e-secret')
  await writeFile(join(workspaceRoot, 'Old Name.cpp'), 'void oldName() {}\n', 'utf8')
  await page.getByRole('button', { name: '取消计划' }).click()
})

test('applies a selected plan with backup, stable relations, and rollback', async () => {
  await page.getByRole('button', { name: '关闭文件管理提示' }).click()
  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByText('移动 / 重命名', { exact: true })).toBeVisible()
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
  expect(await pathExists(join(workspaceRoot, '整理', '旧名称.cpp'))).toBe(true)
  const duplicateCount =
    Number(await pathExists(join(workspaceRoot, 'copy.cpp'))) +
    Number(await pathExists(join(workspaceRoot, 'keep.cpp')))
  expect(duplicateCount).toBe(1)
  const similarCount =
    Number(await pathExists(join(workspaceRoot, 'near_a.cpp'))) +
    Number(await pathExists(join(workspaceRoot, 'near_b.cpp')))
  expect(similarCount).toBe(2)

  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByText('1 个已确认关联')).toBeVisible()
  await expect(page.getByRole('button', { name: /旧名称 实际使用/ })).toBeVisible()
  await page.getByRole('button', { name: 'AI 管理' }).click()
  await page.getByRole('button', { name: '从备份撤销' }).click()
  await page.getByRole('button', { name: '确认撤销' }).click()
  await expect(page.getByRole('status').filter({ hasText: '已从备份撤销' })).toBeVisible()

  expect(await readFile(join(workspaceRoot, 'Old Name.cpp'), 'utf8')).toBe('void oldName() {}\n')
  expect(await pathExists(join(workspaceRoot, '整理', '旧名称.cpp'))).toBe(false)
  expect(await pathExists(join(workspaceRoot, 'copy.cpp'))).toBe(true)
  expect(await pathExists(join(workspaceRoot, 'keep.cpp'))).toBe(true)
  expect(await pathExists(join(workspaceRoot, 'near_a.cpp'))).toBe(true)
  expect(await pathExists(join(workspaceRoot, 'near_b.cpp'))).toBe(true)
  expect(await readdir(join(userDataDirectory, 'file-plan-backups'))).toEqual([])
  await page.getByRole('button', { name: '复制为新计划' }).first().click()
  await expect(page.getByRole('status').filter({ hasText: '重新校验并创建' })).toBeVisible()
  await expect(page.getByText('移动 / 重命名', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '取消计划' }).click()
  await page.getByRole('button', { name: '切换到英文界面' }).click()
  await expect(page.getByText('Undone')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy as new plan' }).first()).toBeVisible()
  await expect(page.getByText('已撤销')).toHaveCount(0)
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/file-history-en-1440x900.png'),
  })
})
