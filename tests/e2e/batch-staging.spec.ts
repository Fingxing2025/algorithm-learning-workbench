import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  _electron as electron,
  test,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import type { DesktopApi } from '@core/contracts/desktop-api'
import { dismissGettingStartedGuideIfNeeded } from './helpers/getting-started'

declare const window: { desktop: DesktopApi }
let app: ElectronApplication
let page: Page
let root: string
let workspace: string
let server: Server
let baseUrl: string
let requests: string[]

async function launch(extra: Record<string, string> = {}) {
  app = await electron.launch({
    args: [resolve('.')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      E2E_USER_DATA_DIR: join(root, 'data'),
      E2E_ALLOW_INSECURE_AI_LOOPBACK: '1',
      ...extra,
    },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await dismissGettingStartedGuideIfNeeded(page)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900))
}
async function select(path: string | string[]) {
  await app.evaluate(({ dialog }, value) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: Array.isArray(value) ? value : [value],
    })) as typeof dialog.showOpenDialog
    dialog.showMessageBox = (async () => ({
      checkboxChecked: false,
      response: 1,
    })) as typeof dialog.showMessageBox
  }, path)
}
async function openBatch() {
  await page.getByRole('button', { name: '新建模板', exact: true }).click()
  await page.getByRole('button', { name: '批量导入 C++', exact: true }).click()
  await expect(page.getByRole('heading', { name: '批量导入 C++ 模板' })).toBeVisible()
}
async function readyBatch(name = 'import.cpp') {
  return page.evaluate(
    async ({ name, sourceId }) => {
      const staging = await window.desktop.templateManagement.createBatchStaging({
        outputLanguage: 'zh-CN',
        sources: [
          {
            content: 'int imported() {return 2;}\n',
            displayPath: name,
            fileName: name,
            id: sourceId,
            sourceEncoding: 'utf-8',
          },
        ],
      })
      return window.desktop.templateManagement.continueBatchStaging({
        stagingId: staging.id,
        runAi: false,
      })
    },
    { name, sourceId: randomUUID() },
  )
}
async function screenshots(prefix: string) {
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1024, 640],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]?.setSize(size[0]!, size[1]!),
      [width!, height!],
    )
    for (const dark of [false, true]) {
      await page
        .locator('html')
        .evaluate((html, value) => html.classList.toggle('dark', value), dark)
      await page.screenshot({
        animations: 'disabled',
        path: resolve(
          `output/playwright/s1-${prefix}-${dark ? 'dark' : 'light'}-${width}x${height}.png`,
        ),
      })
    }
  }
  await page.locator('html').evaluate(html => html.classList.remove('dark'))
}

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'awb-s1-e2e-'))
  workspace = join(root, 'workspace')
  await mkdir(join(root, 'data'))
  await mkdir(workspace)
  requests = []
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      requests.push(body)
      const name = body.includes('second_source') ? '第二份.cpp' : '第一份.cpp'
      const classification = {
        categoryPath: ['基础算法', '示例分类'],
        fileName: name,
        classificationReason: '本地测试草稿，需要人工核对。',
        confidence: 0.75,
        alternatives: [],
        solves: '测试暂存行为',
        spaceComplexity: 'O(1)',
        timeComplexity: 'O(1)',
        tags: ['测试'],
        placement: {
          existingParentPath: '',
          mode: 'create-category-chain',
          newDirectories: ['基础算法', '示例分类'],
          targetDirectory: '基础算法/示例分类',
          reason: '测试目录',
        },
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      setTimeout(
        () =>
          res.end(
            JSON.stringify({
              choices: [
                {
                  message: { role: 'assistant', content: JSON.stringify(classification) },
                  finish_reason: 'stop',
                },
              ],
            }),
          ),
        300,
      )
    })
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing mock address')
  baseUrl = `http://127.0.0.1:${address.port}/v1`
  await launch()
  await select(workspace)
  await page.getByRole('button', { name: '选择目录', exact: true }).click()
  await expect(page.getByRole('button', { name: '新建模板', exact: true })).toBeVisible()
})
test.afterEach(async () => {
  await app?.close().catch(() => undefined)
  server.closeAllConnections()
  await new Promise<void>(done => server.close(() => done()))
  await rm(root, { recursive: true, force: true })
})

test('uses the desktop entry, stages AI results per item, restarts, and applies after review', async () => {
  await page.evaluate(async url => {
    const profile = await window.desktop.aiProviders.create({
      name: 'Local staging fixture',
      apiKey: 'fixture-local-staging-only',
      baseUrl: url,
      model: 'fixture',
      protocol: 'openai-chat-completions',
      timeoutMs: 10000,
      customHeaders: {},
      capabilities: {
        vision: false,
        streaming: false,
        structuredOutput: false,
        promptCaching: false,
      },
    })
    await window.desktop.aiProviders.upsertRoute({
      providerId: profile.id,
      task: 'template-metadata',
    })
  }, baseUrl)
  const paths = [join(root, 'one.cpp'), join(root, 'two.cpp')]
  await writeFile(paths[0]!, 'int first_source() {return 1;}\n')
  await writeFile(paths[1]!, 'int second_source() {return 2;}\n')
  await openBatch()
  await select(paths)
  await page.getByRole('button', { name: '选择多个 C++ 文件' }).click()
  await expect(page.getByLabel('选择导入 one.cpp')).toBeChecked()
  await page.getByRole('button', { name: 'AI 补全所选模板' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByLabel('工作区保存路径 one.cpp')).toHaveValue(
    '基础算法/示例分类/第一份.cpp',
  )
  await expect(page.getByLabel('工作区保存路径 two.cpp')).toHaveValue(
    '基础算法/示例分类/第二份.cpp',
  )
  await expect(page.getByRole('button', { name: '确认应用 2 份', exact: true })).toBeEnabled()
  expect(await readdir(join(workspace, 'templates'))).toEqual([])
  expect(requests.length).toBe(2)
  expect(requests[1]).toContain('第一份.cpp')
  await screenshots('staging-review')
  const before = await page.evaluate(() => window.desktop.templateManagement.listBatchStagings())
  expect(before[0]?.processedCount).toBe(2)
  const backupErrors = await page.evaluate(async () => {
    const attempts = [
      () => window.desktop.dataManagement.exportBackup({ includeTemplateSources: true }),
      () => window.desktop.dataManagement.previewRestore({}),
    ]
    return Promise.all(
      attempts.map(async attempt => {
        try {
          await attempt()
          return null
        } catch (error) {
          return (error as Error).message
        }
      }),
    )
  })
  expect(backupErrors.every(message => message?.includes('未完成的暂存导入'))).toBe(true)
  await app.close()
  await launch()
  await openBatch()
  await page.getByRole('button', { name: '恢复批次', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认应用 2 份', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '确认应用 2 份', exact: true }).click()
  await expect(page.getByRole('heading', { name: '批量导入 C++ 模板' })).toHaveCount(0)
  expect(
    await readFile(join(workspace, 'templates/基础算法/示例分类/第一份.cpp'), 'utf8'),
  ).toContain('first_source')
  expect(await readFile(paths[1]!, 'utf8')).toBe('int second_source() {return 2;}\n')
  const result = await page.evaluate(() => window.desktop.workspace.getCurrent())
  expect(result?.summary.templateCount).toBe(2)
})

for (const crash of ['after-main-move', 'after-file-swap', 'after-database-commit']) {
  test(`recovers a real process exit at ${crash} without losing existing relations`, async () => {
    const seed = await page.evaluate(async () => {
      const base = await window.desktop.templates.create({
        fileName: 'base.cpp',
        content: 'int base() {return 1;}\n',
      })
      await window.desktop.templateManagement.updateMetadata({
        templateId: base.templateId,
        notes: 'Local fixture notes',
        solves: 'Fixture base',
        spaceComplexity: 'O(1)',
        timeComplexity: 'O(1)',
        tags: ['fixture'],
      })
      const problem = await window.desktop.problems.create({
        title: 'Fixture problem',
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
        platform: null,
        problemCode: null,
        statement: 'Fixture statement',
        status: 'unattempted',
        tags: [],
        url: null,
      })
      await window.desktop.problems.upsertRelation({
        problemId: problem.id,
        templateId: base.templateId,
        relationType: 'used',
        note: 'Fixture relation',
      })
      return { templateId: base.templateId, problemId: problem.id }
    })
    const staging = await readyBatch()
    await app.close()
    await launch({ E2E_BATCH_STAGING_CRASH: crash })
    const exited = new Promise<void>(done => app.process().once('exit', () => done()))
    await page
      .evaluate(
        id =>
          window.desktop.templateManagement.applyBatchStaging({ confirmed: true, stagingId: id }),
        staging.id,
      )
      .catch(() => undefined)
    await exited
    await launch()
    const recovery = await page.evaluate(() =>
      window.desktop.templateManagement.inspectBatchStagingRecoveries(),
    )
    expect(recovery).toHaveLength(1)
    expect(recovery[0]?.action).toBe(crash === 'after-database-commit' ? 'finish' : 'rollback')
    // Loading is read-only: the interrupted directory layout still exists.
    if (crash === 'after-main-move')
      await expect(readFile(join(workspace, 'templates/base.cpp'))).rejects.toThrow()
    await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
    await expect(page.getByRole('button', { name: '确认恢复暂存导入' })).toBeDisabled()
    await page.getByLabel('我已了解恢复动作并确认继续').check()
    if (crash === 'after-file-swap') await screenshots('recovery')
    await page.getByRole('button', { name: '确认恢复暂存导入' }).click()
    await expect(page.getByRole('button', { name: '确认恢复暂存导入' })).toHaveCount(0)
    expect(await readFile(join(workspace, 'templates/base.cpp'), 'utf8')).toBe(
      'int base() {return 1;}\n',
    )
    const after = await page.evaluate(
      async data => ({
        problem: await window.desktop.problems.get({ problemId: data.problemId }),
        metadata: await window.desktop.templateManagement.getMetadata(data.templateId),
        workspace: await window.desktop.workspace.getCurrent(),
      }),
      seed,
    )
    expect(after.problem.relations[0]?.templateId).toBe(seed.templateId)
    expect(after.problem.relations[0]?.available).toBe(true)
    expect(after.metadata?.notes).toBe('Local fixture notes')
    expect(after.workspace?.summary.templateCount).toBe(crash === 'after-database-commit' ? 2 : 1)
    if (crash !== 'after-database-commit') {
      expect(
        await page.evaluate(
          id => window.desktop.templateManagement.getBatchStaging({ stagingId: id }),
          staging.id,
        ),
      ).toMatchObject({ status: 'ready' })
      await page.evaluate(
        id =>
          window.desktop.templateManagement.applyBatchStaging({ confirmed: true, stagingId: id }),
        staging.id,
      )
    }
    expect(await readFile(join(workspace, 'templates/import.cpp'), 'utf8')).toContain('imported')
  })
}
