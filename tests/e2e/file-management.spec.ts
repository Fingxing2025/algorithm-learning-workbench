import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

import type { DesktopApi } from '@core/contracts/desktop-api'

import { dismissGettingStartedGuideIfNeeded } from './helpers/getting-started'

declare const window: { desktop: DesktopApi }

let electronApp: ElectronApplication
let mockBaseUrl: string
let mockServer: Server
let page: Page
let temporaryRoot: string
let templateRoot: string
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
  await dismissGettingStartedGuideIfNeeded(page)
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
    dialog.showMessageBox = (async () => ({
      checkboxChecked: false,
      response: 1,
    })) as typeof dialog.showMessageBox
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

async function sha256File(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

function seedInvalidExecutionScenario(input: {
  currentWorkspaceId: string
  invalidExecutionId: string
  invalidPlanId: string
  validExecutionId: string
  validPlanId: string
}): void {
  const script = String.raw`
    const Database = require('better-sqlite3');
    const db = new Database(process.env.SEED_DB);
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    const now = '2026-07-24T12:00:00.000Z';
    db.prepare('INSERT INTO file_change_plans (id, workspace_id, provider_name, model, status, operations_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(process.env.INVALID_PLAN_ID, process.env.CURRENT_WORKSPACE_ID, 'fixture', 'fixture-model', 'applied', '[]', now, now);
    db.prepare('INSERT INTO file_change_plans (id, workspace_id, provider_name, model, status, operations_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(process.env.VALID_PLAN_ID, process.env.CURRENT_WORKSPACE_ID, 'fixture', 'fixture-model', 'applied', '[]', now, now);
    db.prepare('INSERT INTO file_change_executions (id, plan_id, operations_json, backup_directory, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(process.env.INVALID_EXECUTION_ID, process.env.INVALID_PLAN_ID, '{damaged', 'file-plan-backups/' + process.env.INVALID_EXECUTION_ID, 'applied', now);
    db.prepare('INSERT INTO file_change_executions (id, plan_id, operations_json, backup_directory, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(process.env.VALID_EXECUTION_ID, process.env.VALID_PLAN_ID, '[{}]', 'file-plan-backups/' + process.env.VALID_EXECUTION_ID, 'applied', '2026-07-24T11:00:00.000Z');
    db.close();
  `
  const executable = readFileSync(resolve('node_modules/electron/path.txt'), 'utf8')
  const result = spawnSync(
    resolve('node_modules/electron/dist', executable.trim()),
    ['-e', script],
    {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: {
        ...process.env,
        CURRENT_WORKSPACE_ID: input.currentWorkspaceId,
        ELECTRON_RUN_AS_NODE: '1',
        INVALID_EXECUTION_ID: input.invalidExecutionId,
        INVALID_PLAN_ID: input.invalidPlanId,
        SEED_DB: join(workspaceRoot, '.awb', 'workspace.sqlite'),
        VALID_EXECUTION_ID: input.validExecutionId,
        VALID_PLAN_ID: input.validPlanId,
      },
    },
  )
  expect(result.status, result.stderr || result.stdout).toBe(0)
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
      const invalidNamePaths = input.audit.issues
        .filter(issue => issue.kind === 'invalid-name')
        .flatMap(issue => issue.paths)
      const invalidNames = input.templates.filter(template =>
        invalidNamePaths.includes(template.path),
      )
      const metadataTarget = input.templates.find(
        template => template.path === 'bulk/fixture-01.cpp',
      )
      const renameTargets: Record<string, string> = {
        'Old Name.cpp': '整理/旧名称.cpp',
        'plain copy.py': '整理/深度优先搜索.py',
        '锟斤拷.cpp': '整理/并查集.cpp',
      }
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
                      ...invalidNames.flatMap(template => {
                        const targetPath = renameTargets[template.path]
                        return targetPath
                          ? [
                              {
                                alternatives: ['保留现有命名。'],
                                applicability: ['本地审计确认文件名异常。'],
                                confidence: 0.92,
                                evidence: ['源码、元数据和目录语义能够确定可读名称。'],
                                kind: 'move',
                                reason: '修复异常文件名并归入整理目录。',
                                risk: 'medium',
                                targetPath,
                                templateId: template.id,
                              },
                            ]
                          : []
                      }),
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
  templateRoot = join(workspaceRoot, 'templates')
  await mkdir(userDataDirectory)
  await mkdir(workspaceRoot)
  await writeFile(join(workspaceRoot, 'copy.cpp'), 'duplicate source\n', 'utf8')
  await writeFile(join(workspaceRoot, 'keep.cpp'), 'duplicate source\n', 'utf8')
  await writeFile(join(workspaceRoot, 'Old Name.cpp'), 'void oldName() {}\n', 'utf8')
  await writeFile(join(workspaceRoot, 'plain copy.py'), 'def dfs():\n    pass\n', 'utf8')
  await writeFile(join(workspaceRoot, '锟斤拷.cpp'), 'void unionFind() {}\n', 'utf8')
  await mkdir(join(workspaceRoot, 'bulk'))
  for (let index = 0; index < 20; index += 1) {
    await writeFile(
      join(workspaceRoot, 'bulk', `fixture-${String(index + 1).padStart(2, '0')}.cpp`),
      `void bulk_${index + 1}() {\n${'  // optional source context\n'.repeat(360)}}\n`,
      'utf8',
    )
  }
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
  await expect(page.getByRole('heading', { level: 1, name: '模板库' })).toBeVisible()
  await expect(page.getByText('27 个模板').first()).toBeVisible()
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
  await page.getByText('plain copy.py', { exact: true }).click()
  await page.getByRole('button', { name: /^(编辑|补充元数据)$/ }).click()
  await page.getByLabel('模板用户笔记').fill('DFS 在任何情况下都只需要 O(1) 额外空间。')
  await page.getByRole('button', { name: '保存元数据' }).click()
  await expect(page.getByText('DFS 在任何情况下都只需要 O(1) 额外空间。')).toBeVisible()
  await page.getByText('Old Name.cpp', { exact: true }).click()
  await page.getByRole('button', { name: /^(编辑|补充元数据)$/ }).click()
  await page.getByLabel('模板用户笔记').fill('移动候选的本地用户笔记。')
  await page.getByRole('button', { name: '保存元数据' }).click()
  await expect(page.getByText('移动候选的本地用户笔记。')).toBeVisible()
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
  await expect(page.getByText('锟斤拷.cpp', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/乱码或错误解码痕迹/)).toBeVisible()
  await page.getByRole('button', { name: '关闭文件管理提示' }).click()
  const generatePlanButton = page.getByRole('button', { name: '生成 AI 计划' })
  await generatePlanButton.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await expect(page.getByRole('region', { name: '完整工作区目录覆盖' })).toContainText('27 / 27')
  await page.getByRole('region', { name: '文件计划发送快照' }).scrollIntoViewIfNeeded()
  await expect(page.getByText(/完整目录、模板 ID、名称、相对路径和语言仍全部保留/)).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/workspace-file-ai-preview-notes-off-light-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/workspace-file-ai-preview-notes-off-dark-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 640),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/workspace-file-ai-preview-notes-off-light-1024x640.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.getByRole('button', { name: '返回修改' }).click()
  await page.getByRole('checkbox', { name: '允许发送模板用户笔记' }).check()
  await generatePlanButton.click()
  await page.getByRole('region', { name: '文件计划发送快照' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('region', { name: '文件计划发送快照' })).toContainText(
    /用户笔记[1-9]/,
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/workspace-file-ai-preview-notes-on-light-1440x900.png'),
  })
  await page.getByRole('button', { name: '返回修改' }).click()
  await page.getByRole('checkbox', { name: '允许发送模板用户笔记' }).uncheck()
  await generatePlanButton.click()
  holdNextFilePlanResponse = true
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect.poll(() => heldFilePlanResponseStarted).toBe(true)
  await page.getByRole('button', { name: '取消生成' }).click()
  await expect.poll(() => heldFilePlanResponseClosed).toBe(true)
  await expect(generatePlanButton).toBeEnabled()
  await expect(generatePlanButton).toBeFocused()
  await expect(page.getByRole('status')).toContainText('AI 生成已取消')
  await expect(page.getByText('移动 / 重命名', { exact: true })).toHaveCount(0)

  invalidFilePlanResponsesRemaining = 2
  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByRole('status').filter({ hasText: '尚未修改文件' })).toBeVisible()
  await expect(page.getByText('移动 / 重命名', { exact: true })).toHaveCount(3)
  expect(await pathExists(join(templateRoot, '整理', '旧名称.cpp'))).toBe(false)
  await page.getByRole('button', { name: '取消计划' }).click()
  await expect(page.getByRole('status').filter({ hasText: '工作区文件未发生变化' })).toBeVisible()

  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByRole('status').filter({ hasText: '尚未修改文件' })).toBeVisible()
  await expect(page.getByText('移动 / 重命名', { exact: true })).toHaveCount(3)
  const mojibakeRename = page.getByRole('checkbox', { name: '选择操作 锟斤拷.cpp' })
  await expect(mojibakeRename).toBeVisible()
  await expect(mojibakeRename.locator('..')).toContainText('整理/并查集.cpp')
  await expect(page.getByText('删除重复文件').first()).toBeVisible()
  await expect(page.getByText('需手动选择')).toHaveCount(3)
  await page.getByRole('button', { name: '取消计划' }).click()
  await expect(page.getByRole('status').filter({ hasText: '工作区文件未发生变化' })).toBeVisible()
  expect(await pathExists(join(templateRoot, 'Old Name.cpp'))).toBe(true)
  expect(await pathExists(join(templateRoot, '锟斤拷.cpp'))).toBe(true)
  expect(await pathExists(join(templateRoot, '整理', '并查集.cpp'))).toBe(false)
  expect(await pathExists(join(templateRoot, 'copy.cpp'))).toBe(true)
  expect(await pathExists(join(templateRoot, 'keep.cpp'))).toBe(true)
  await page.getByRole('button', { name: '复制为新计划' }).first().click()
  await expect(page.getByRole('status').filter({ hasText: '重新校验并创建' })).toBeVisible()
  await expect(page.getByText('移动 / 重命名', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '取消计划' }).click()
})

test('rejects the whole batch when a source changes after plan generation', async () => {
  await page.getByRole('button', { name: '关闭文件管理提示' }).click()
  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByText('移动 / 重命名', { exact: true }).first()).toBeVisible()

  await writeFile(join(templateRoot, 'Old Name.cpp'), 'void changedOutsideApp() {}\n', 'utf8')
  await page.getByRole('button', { name: '预览并执行' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: '确认执行' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toContainText('文件或元数据已在计划生成后变更')

  expect(await pathExists(join(templateRoot, 'copy.cpp'))).toBe(true)
  expect(await pathExists(join(templateRoot, 'keep.cpp'))).toBe(true)
  expect(await pathExists(join(templateRoot, '整理', '旧名称.cpp'))).toBe(false)
  const diagnosticPath = join(temporaryRoot, 'safe-diagnostic.json')
  await setNextSavePath(diagnosticPath)
  await page.getByRole('button', { name: '导出安全诊断' }).click()
  const diagnostic = await readFile(diagnosticPath, 'utf8')
  expect(diagnostic).not.toContain(workspaceRoot)
  expect(diagnostic).not.toContain('changedOutsideApp')
  expect(diagnostic).not.toContain('files-e2e-secret')
  await writeFile(join(templateRoot, 'Old Name.cpp'), 'void oldName() {}\n', 'utf8')
  await page.getByRole('button', { name: '取消计划' }).click()
})

test('applies a selected plan with backup, stable relations, and rollback', async () => {
  await page.getByRole('button', { name: '关闭文件管理提示' }).click()
  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByText('移动 / 重命名', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('checkbox', { name: '选择操作 keep.cpp' })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: '选择操作 near_b.cpp' })).not.toBeChecked()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/workspace-file-ai-plan-review-light-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/workspace-file-ai-plan-review-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 640),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/workspace-file-ai-plan-review-light-1024x640.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/workspace-file-ai-plan-review-dark-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  await page
    .getByRole('checkbox', { name: '选择操作 bulk/fixture-01.cpp' })
    .scrollIntoViewIfNeeded()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/workspace-file-ai-metadata-diff-light-1440x900.png'),
  })
  await page.getByRole('checkbox', { name: '选择操作 keep.cpp' }).check()
  await page.getByRole('button', { name: '预览并执行' }).click()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/workspace-file-ai-second-confirmation-light-1440x900.png'),
  })
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByRole('status').filter({ hasText: '保留撤销备份' })).toBeVisible()
  await expect(page.getByRole('button', { name: '一键删除执行记录' })).toBeEnabled()
  const appliedExecutionId = await page.evaluate(async () => {
    const execution = (await window.desktop.templateManagement.listFileExecutions())[0]
    if (!execution) throw new Error('expected applied execution')
    return execution.id
  })
  const appliedDeletePreview = await page.evaluate(async executionId => {
    return window.desktop.templateManagement.previewDeleteFileExecutions({
      executionIds: [executionId],
    })
  }, appliedExecutionId)
  expect(appliedDeletePreview).toMatchObject({
    appliedExecutionCount: 1,
    rolledBackExecutionCount: 0,
  })

  expect(await pathExists(join(templateRoot, 'Old Name.cpp'))).toBe(false)
  expect(await pathExists(join(templateRoot, '整理', '旧名称.cpp'))).toBe(true)
  expect(await pathExists(join(templateRoot, '锟斤拷.cpp'))).toBe(false)
  expect(await pathExists(join(templateRoot, '整理', '并查集.cpp'))).toBe(true)
  const duplicateCount =
    Number(await pathExists(join(templateRoot, 'copy.cpp'))) +
    Number(await pathExists(join(templateRoot, 'keep.cpp')))
  expect(duplicateCount).toBe(1)
  const similarCount =
    Number(await pathExists(join(templateRoot, 'near_a.cpp'))) +
    Number(await pathExists(join(templateRoot, 'near_b.cpp')))
  expect(similarCount).toBe(2)

  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByText('1 个已确认关联')).toBeVisible()
  await expect(page.getByRole('button', { name: /旧名称 实际使用/ })).toBeVisible()
  await page.getByRole('button', { name: 'AI 管理' }).click()
  await page.getByRole('button', { name: '从备份撤销' }).click()
  await page.getByRole('button', { name: '确认撤销' }).click()
  await expect(page.getByRole('status').filter({ hasText: '已从备份撤销' })).toBeVisible()

  expect(await readFile(join(templateRoot, 'Old Name.cpp'), 'utf8')).toBe('void oldName() {}\n')
  expect(await pathExists(join(templateRoot, '整理', '旧名称.cpp'))).toBe(false)
  expect(await pathExists(join(templateRoot, 'copy.cpp'))).toBe(true)
  expect(await pathExists(join(templateRoot, 'keep.cpp'))).toBe(true)
  expect(await pathExists(join(templateRoot, 'near_a.cpp'))).toBe(true)
  expect(await pathExists(join(templateRoot, 'near_b.cpp'))).toBe(true)
  expect(await pathExists(join(templateRoot, '锟斤拷.cpp'))).toBe(true)
  expect(await pathExists(join(templateRoot, '整理', '并查集.cpp'))).toBe(false)
  expect(await readdir(join(workspaceRoot, '.awb', 'file-plan-backups'))).toEqual([])
  await page.getByRole('button', { name: '复制为新计划' }).first().click()
  await expect(page.getByRole('status').filter({ hasText: '重新校验并创建' })).toBeVisible()
  await expect(page.getByText('移动 / 重命名', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '取消计划' }).click()
  const history = page.getByLabel('文件计划历史列表')
  await history.scrollIntoViewIfNeeded()
  await expect(history).toHaveClass(/max-h-64/)
  await expect(history).toHaveClass(/overflow-y-auto/)
  expect(await history.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  await history.focus()
  await page.keyboard.press('End')
  await expect.poll(() => history.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-plan-select]:focus')).toHaveCount(1)
  await page
    .getByRole('button', { name: /删除计划记录 File Management Test/ })
    .first()
    .click()
  await expect(page.getByText(/将永久删除 1 份计划/)).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/file-plan-delete-confirm-light-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/file-plan-delete-confirm-light-1280x720.png'),
  })
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/file-plan-delete-confirm-dark-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/file-plan-delete-confirm-dark-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '切换到英文界面' }).click()
  await expect(page.getByText('Undone', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy as new plan' }).first()).toBeVisible()
  await expect(page.getByText('已撤销')).toHaveCount(0)
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/file-history-en-1440x900.png'),
  })
  await page.getByRole('button', { name: 'Switch to Chinese' }).click()

  const rolledBackExecutionId = await page.evaluate(async () => {
    const execution = (await window.desktop.templateManagement.listFileExecutions())[0]
    if (!execution || execution.status !== 'rolled-back') {
      throw new Error('expected rolled-back execution')
    }
    return execution.id
  })
  const mixedDeleteError = await page.evaluate(async executionId => {
    try {
      await window.desktop.templateManagement.previewDeleteFileExecutions({
        executionIds: [executionId, '40000000-0000-4000-8000-000000000099'],
      })
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, rolledBackExecutionId)
  expect(mixedDeleteError).toContain('执行记录不存在')
  await expect
    .poll(() => page.evaluate(() => window.desktop.templateManagement.listFileExecutions()))
    .toHaveLength(1)

  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  await expect(page.locator('p').filter({ hasText: /^数据状态正常$/u })).toBeVisible()
  expect(
    (await page.evaluate(() => window.desktop.dataManagement.diagnose())).counts
      .fileChangeExecutions,
  ).toBe(1)
  await page.getByRole('button', { name: 'AI 管理', exact: true }).click()

  const singleExecutionDelete = page.getByRole('button', { name: /^永久删除执行记录 ·/ })
  await singleExecutionDelete.click()
  await expect(page.getByRole('button', { name: '确认永久删除执行记录' })).toBeFocused()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(singleExecutionDelete).toBeFocused()

  await page.getByRole('button', { name: '一键删除执行记录' }).click()
  await expect(page.getByText(/将永久删除 1 条执行记录：0 条已执行、1 条已撤销/)).toBeVisible()
  await expect(page.getByRole('button', { name: '确认永久删除执行记录' })).toBeFocused()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/file-execution-delete-confirm-light-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/file-execution-delete-confirm-dark-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  await page.getByRole('button', { name: '确认永久删除执行记录' }).click()
  await expect(page.getByRole('status').filter({ hasText: '当前模板文件未修改' })).toBeVisible()
  await expect(page.getByText('暂无文件执行记录。')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.desktop.templateManagement.listFileExecutions()))
    .toHaveLength(0)

  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  expect(
    (await page.evaluate(() => window.desktop.dataManagement.diagnose())).counts
      .fileChangeExecutions,
  ).toBe(0)
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/file-execution-delete-data-sync-light-1440x900.png'),
  })
  expect(await readFile(join(templateRoot, 'Old Name.cpp'), 'utf8')).toBe('void oldName() {}\n')

  await page.getByRole('button', { name: 'AI 管理', exact: true }).click()
  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await page.getByRole('button', { name: '预览并执行' }).click()
  await page.getByRole('button', { name: '确认执行' }).click()
  await page.getByRole('button', { name: '从备份撤销' }).click()
  await page.getByRole('button', { name: '确认撤销' }).click()
  await expect(page.getByRole('status').filter({ hasText: '已从备份撤销' })).toBeVisible()
  const rolledBackPlanId = await page.evaluate(async () => {
    const execution = (await window.desktop.templateManagement.listFileExecutions())[0]
    if (!execution || execution.status !== 'rolled-back') {
      throw new Error('expected a rolled-back execution for plan deletion')
    }
    return execution.planId
  })
  await page
    .getByRole('button', { name: /删除计划记录 File Management Test/ })
    .first()
    .click()
  await expect(page.getByText(/1 份已撤销/)).toBeVisible()
  await expect(page.getByText(/同时永久删除 1 条子执行/)).toBeVisible()
  await page.getByRole('button', { name: '确认永久删除计划记录' }).click()
  await expect(page.getByRole('status').filter({ hasText: '当前模板文件未修改' })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        planId =>
          window.desktop.templateManagement
            .listFilePlans()
            .then(plans => plans.some(plan => plan.id === planId)),
        rolledBackPlanId,
      ),
    )
    .toBe(false)
  expect(await readFile(join(templateRoot, 'Old Name.cpp'), 'utf8')).toBe('void oldName() {}\n')

  await page.getByRole('button', { name: '生成 AI 计划' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await page.getByRole('button', { name: '预览并执行' }).click()
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByRole('status').filter({ hasText: '保留撤销备份' })).toBeVisible()
  const appliedRecord = await page.evaluate(async () => {
    const execution = (await window.desktop.templateManagement.listFileExecutions())[0]
    if (!execution || execution.status !== 'applied') throw new Error('expected applied execution')
    return execution
  })
  const appliedBackup = join(workspaceRoot, '.awb', 'file-plan-backups', appliedRecord.id)
  expect(await pathExists(appliedBackup)).toBe(true)
  const appliedWorkspaceState = {
    oldName: await pathExists(join(templateRoot, 'Old Name.cpp')),
    organized: await readFile(join(templateRoot, '整理', '旧名称.cpp'), 'utf8'),
  }
  await page.getByRole('button', { name: '一键删除执行记录' }).click()
  await expect(page.getByText(/1 条执行记录：1 条已执行、0 条已撤销/)).toBeVisible()
  await expect(page.getByText(/永久删除 1 份现存撤销备份/)).toBeVisible()
  await page.getByRole('button', { name: '确认永久删除执行记录' }).click()
  await expect(page.getByRole('button', { name: '从备份撤销' })).toHaveCount(0)
  expect(await pathExists(appliedBackup)).toBe(false)
  expect(await pathExists(join(templateRoot, 'Old Name.cpp'))).toBe(appliedWorkspaceState.oldName)
  expect(await readFile(join(templateRoot, '整理', '旧名称.cpp'), 'utf8')).toBe(
    appliedWorkspaceState.organized,
  )

  await page
    .getByRole('button', { name: /删除计划记录 File Management Test/ })
    .first()
    .click()
  await expect(page.getByText(/1 份已执行/)).toBeVisible()
  await page.getByRole('button', { name: '确认永久删除计划记录' }).click()
  const appliedPlanId = appliedRecord.planId
  await electronApp.close()
  await launchApplication()
  await page.getByRole('button', { name: 'AI 管理', exact: true }).click()
  const deletedRecordsStayDeleted = await page.evaluate(
    async ({ executionId, planId }) => {
      const [executions, plans] = await Promise.all([
        window.desktop.templateManagement.listFileExecutions(),
        window.desktop.templateManagement.listFilePlans(),
      ])
      return {
        executionPresent: executions.some(record => record.id === executionId),
        planPresent: plans.some(record => record.id === planId),
      }
    },
    { executionId: appliedRecord.id, planId: appliedPlanId },
  )
  expect(deletedRecordsStayDeleted).toEqual({ executionPresent: false, planPresent: false })

  const deleteAllPlans = page.getByRole('button', { name: '一键删除计划记录' })
  await expect(deleteAllPlans).toBeEnabled()
  await deleteAllPlans.click()
  await expect(page.getByText(/将永久删除 .* 份计划/)).toBeVisible()
  await page.getByRole('button', { name: '确认永久删除计划记录' }).click()
  await expect(page.getByText('暂无可删除计划记录。')).toBeVisible()
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  const finalDataCounts = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(finalDataCounts.counts.fileChangePlans).toBe(0)
  expect(finalDataCounts.counts.fileChangeExecutions).toBe(0)
  expect(await pathExists(join(templateRoot, 'Old Name.cpp'))).toBe(false)
  expect(await readFile(join(templateRoot, '整理', '旧名称.cpp'), 'utf8')).toBe(
    appliedWorkspaceState.organized,
  )
})

test('shows and cleans a missing-backup execution only in its owning workspace', async () => {
  const invalidExecutionId = '91000000-0000-4000-8000-000000000001'
  const invalidPlanId = '91000000-0000-4000-8000-000000000002'
  const validExecutionId = '91000000-0000-4000-8000-000000000003'
  const validPlanId = '91000000-0000-4000-8000-000000000004'
  const workspaceBRoot = join(temporaryRoot, 'workspace-b')
  const workspaceBSource = join(workspaceBRoot, 'b.cpp')
  const workspaceASource = join(templateRoot, '整理', '旧名称.cpp')
  const currentWorkspace = await page.evaluate(() => window.desktop.workspace.getCurrent())
  if (!currentWorkspace) throw new Error('expected the original workspace')
  const workspaceAHashBefore = await sha256File(workspaceASource)
  await mkdir(workspaceBRoot)
  await writeFile(workspaceBSource, 'void workspace_b() {}\n', 'utf8')
  const workspaceBHashBefore = await sha256File(workspaceBSource)

  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await setNextSelection(workspaceBRoot)
  await page.getByRole('button', { name: '切换工作区' }).click()
  await expect(page.getByText('b.cpp', { exact: true })).toBeVisible()
  const currentWorkspaceBSource = join(workspaceBRoot, 'templates', 'b.cpp')
  await setNextSelection(workspaceRoot)
  await page.getByRole('button', { name: '切换工作区' }).click()
  await expect
    .poll(() => page.evaluate(() => window.desktop.workspace.getCurrent().then(value => value?.id)))
    .toBe(currentWorkspace.id)

  await electronApp.close()
  const validBackup = join(workspaceRoot, '.awb', 'file-plan-backups', validExecutionId)
  const invalidBackup = join(workspaceRoot, '.awb', 'file-plan-backups', invalidExecutionId)
  await mkdir(validBackup, { recursive: true })
  await writeFile(join(validBackup, 'fixture.txt'), 'valid rollback backup\n', 'utf8')
  seedInvalidExecutionScenario({
    currentWorkspaceId: currentWorkspace.id,
    invalidExecutionId,
    invalidPlanId,
    validExecutionId,
    validPlanId,
  })
  await launchApplication()

  // Workspace B must not expose workspace A history.
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await setNextSelection(workspaceBRoot)
  await page.getByRole('button', { name: '切换工作区' }).click()
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  await expect(page.locator('p').filter({ hasText: /^数据状态正常$/u })).toBeVisible()
  expect(
    (await page.evaluate(() => window.desktop.dataManagement.diagnose())).counts
      .fileChangeExecutions,
  ).toBe(0)
  await page.getByRole('button', { name: 'AI 管理', exact: true }).click()
  await expect(page.getByRole('heading', { name: '失效执行记录' })).toHaveCount(0)

  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await setNextSelection(workspaceRoot)
  await page.getByRole('button', { name: '切换工作区' }).click()
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  await expect(page.getByText('发现需要处理的数据问题')).toBeVisible()
  await page.getByText('查看检查详情').click()
  await expect(page.getByText('文件执行记录缺少撤销备份')).toBeVisible()
  await page.getByRole('button', { name: '前往 AI 管理处理失效执行记录' }).click()

  const invalidPanel = page
    .getByRole('heading', { name: '失效执行记录' })
    .locator('xpath=ancestor::section')
  await expect(invalidPanel).toBeVisible()
  await expect(invalidPanel.getByText(currentWorkspace.name, { exact: true })).toBeVisible()
  await expect(invalidPanel.getByText('操作数量未知')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.desktop.templateManagement.listFileExecutions()))
    .toEqual([expect.objectContaining({ id: validExecutionId })])
  await expect(invalidPanel.getByText('空白工作区 B')).toHaveCount(0)
  const selection = page.getByRole('checkbox', {
    name: `选择失效执行记录 ${currentWorkspace.name}`,
  })
  await expect(selection).not.toBeChecked()
  await expect(page.getByRole('button', { name: /清理所选失效记录/ })).toBeDisabled()

  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/invalid-file-executions-light-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/invalid-file-executions-dark-1280x720.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 640),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/invalid-file-executions-light-1024x640.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )

  await selection.check()
  await page.getByRole('button', { name: /清理所选失效记录/ }).click()
  await expect(page.getByRole('button', { name: '确认清理失效记录' })).toBeFocused()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/invalid-file-executions-confirm-light-1440x900.png'),
  })
  await mkdir(invalidBackup)
  await page.getByRole('button', { name: '确认清理失效记录' }).click()
  await expect(page.getByRole('alert')).toContainText('撤销备份在确认前发生变化')
  expect(
    (await page.evaluate(() => window.desktop.dataManagement.diagnose())).counts
      .fileChangeExecutions,
  ).toBe(2)

  await rm(invalidBackup, { recursive: true })
  await page.getByRole('button', { name: /清理所选失效记录/ }).click()
  await page.getByRole('button', { name: '确认清理失效记录' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: '已清理 1 条失效执行记录；当前工作区文件未修改。' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: '失效执行记录' })).toHaveCount(0)
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/invalid-file-executions-success-light-1440x900.png'),
  })

  const finalDiagnostics = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(finalDiagnostics.counts.fileChangeExecutions).toBe(1)
  expect(finalDiagnostics.counts.fileChangePlans).toBe(2)
  expect(
    finalDiagnostics.issues.some(issue => issue.kind === 'file-execution-backup-missing'),
  ).toBe(false)
  expect(await readFile(join(validBackup, 'fixture.txt'), 'utf8')).toBe('valid rollback backup\n')
  expect(await sha256File(workspaceASource)).toBe(workspaceAHashBefore)
  expect(await sha256File(currentWorkspaceBSource)).toBe(workspaceBHashBefore)

  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  await expect(page.locator('p').filter({ hasText: /^数据状态正常$/u })).toBeVisible()
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await setNextSelection(workspaceBRoot)
  await page.getByRole('button', { name: '切换工作区' }).click()
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  const workspaceBDiagnostics = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(workspaceBDiagnostics.counts.fileChangeExecutions).toBe(0)
  expect(workspaceBDiagnostics.counts.fileChangePlans).toBe(0)
  await expect(page.locator('p').filter({ hasText: /^数据状态正常$/u })).toBeVisible()
})
