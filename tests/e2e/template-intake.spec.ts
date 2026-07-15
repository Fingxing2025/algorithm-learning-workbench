import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
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
let lastTemplateMetadataSystem = ''

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

test.beforeAll(async () => {
  mockServer = createServer((request, response) => {
    const bodyChunks: Buffer[] = []
    request.on('data', chunk => bodyChunks.push(Buffer.from(chunk)))
    request.on('end', () => {
      const parsedBody = JSON.parse(Buffer.concat(bodyChunks).toString('utf8')) as {
        messages?: unknown
      }
      const messages = Array.isArray(parsedBody.messages) ? parsedBody.messages : []
      const systemMessage = messages.find(
        message =>
          typeof message === 'object' &&
          message !== null &&
          (message as { role?: unknown }).role === 'system',
      ) as { content?: unknown } | undefined
      lastTemplateMetadataSystem =
        typeof systemMessage?.content === 'string' ? systemMessage.content : ''
      const english = lastTemplateMetadataSystem.includes('Use English for categoryPath')
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  {
                    text: JSON.stringify({
                      categoryPath: english
                        ? ['Graph Theory', 'Shortest Path', 'Dijkstra', 'Heap Optimized']
                        : ['图论', '最短路', 'Dijkstra', '堆优化'],
                      commonMistakes: english
                        ? 'Forgetting to discard stale priority queue entries.'
                        : '优先队列弹出后忘记判断过期距离。',
                      constraints: english ? 'Edge weights must be non-negative.' : '边权非负。',
                      fileName: 'dijkstra.cpp',
                      prerequisites: english
                        ? 'Adjacency lists and priority queues.'
                        : '邻接表、优先队列。',
                      solves: english
                        ? 'Single-source shortest paths with non-negative weights.'
                        : '单源非负权最短路径。',
                      spaceComplexity: 'O(n + m)',
                      tags: english
                        ? ['Graph Theory', 'Shortest Path', 'Dijkstra']
                        : ['图论', '最短路', 'Dijkstra'],
                      timeComplexity: 'O((n + m) log n)',
                    }),
                    type: 'text',
                  },
                ],
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

  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-intake-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  workspaceRoot = join(temporaryRoot, 'workspace')
  await mkdir(userDataDirectory)
  await mkdir(workspaceRoot)
  await launchApplication()
})

test.afterAll(async () => {
  await electronApp?.close()
  await new Promise<void>((resolveClose, reject) =>
    mockServer?.close(error => (error ? reject(error) : resolveClose())),
  )
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

test('merges pasted-source AI metadata without overwriting user fields', async () => {
  await setNextSelection(workspaceRoot)
  await page.getByRole('button', { name: '创建工作区' }).click()
  await page.getByRole('button', { name: 'AI 设置' }).click()
  await page.getByLabel('Provider 显示名称').fill('模板分类测试')
  await page.getByLabel('Base URL').fill(mockBaseUrl)
  await page.getByLabel('模型名称').fill('fixture-metadata')
  await page.getByLabel('API Key').fill('intake-e2e-secret')
  await page.getByRole('button', { name: '保存 Provider' }).click()
  await page.getByRole('button', { name: /模板元数据补全/ }).click()

  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await page.getByRole('button', { name: '新建模板' }).click()
  await page
    .getByRole('textbox', { name: '模板源码', exact: true })
    .fill('void dijkstra() { /* imported */ }\n')
  await page.getByLabel('模板标签').fill('我的图论, 手工标签')
  await page.getByLabel('时间复杂度').fill('O(n²)')
  await page.getByLabel('解决的问题').fill('用户定义的最短路问题。')
  await expect(page.getByLabel(/文件名/)).toHaveValue('')
  await page.getByLabel('补全语言').selectOption('en')
  await expect(page.getByRole('button', { name: '立即补全' })).toBeEnabled()
  await page.getByRole('button', { name: '立即补全' }).click()

  await expect
    .poll(() => lastTemplateMetadataSystem)
    .toContain('Use English for categoryPath, tags, and every natural-language metadata field')

  await expect(page.getByRole('heading', { name: '确认元数据冲突' })).toBeVisible()
  await expect(page.getByRole('button', { name: '标签 保留我的内容' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: '时间复杂度 保留我的内容' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/template-metadata-conflict-light.png'),
  })
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/template-metadata-conflict-dark.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  await page.getByRole('button', { name: '时间复杂度 使用 AI 建议' }).click()
  await page.getByRole('button', { name: '确认并应用选择' }).click()

  await expect(page.getByLabel(/文件名/)).toHaveValue(
    'Graph Theory/Shortest Path/Dijkstra/Heap Optimized/dijkstra.cpp',
  )
  await expect(page.getByLabel('模板标签')).toHaveValue('我的图论, 手工标签')
  await expect(page.getByLabel('时间复杂度')).toHaveValue('O((n + m) log n)')
  await expect(page.getByLabel('解决的问题')).toHaveValue('用户定义的最短路问题。')
  await expect(page.getByText(/模板分类测试.*fixture-metadata/)).toBeVisible()
  await page.getByRole('button', { name: '确认创建' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'dijkstra' })).toBeVisible()
  await expect(page.getByText('O((n + m) log n)')).toBeVisible()
  await expect(page.getByText('用户定义的最短路问题。')).toBeVisible()
  await expect(page.getByText('我的图论')).toBeVisible()
  await expect(page.getByText('手工标签')).toBeVisible()
  expect(
    await readFile(
      join(
        workspaceRoot,
        'Graph Theory',
        'Shortest Path',
        'Dijkstra',
        'Heap Optimized',
        'dijkstra.cpp',
      ),
      'utf8',
    ),
  ).toBe('void dijkstra() { /* imported */ }\n')
})

test('allows manual metadata correction and persists it after restart', async () => {
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByLabel('模板用户笔记').fill('这是用户确认后的本地笔记。')
  await page.getByRole('button', { name: '保存元数据' }).click()
  await expect(page.getByText('这是用户确认后的本地笔记。')).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage5-template-metadata-light.png'),
  })

  await electronApp.close()
  await launchApplication()
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await page.getByText('dijkstra.cpp').click()
  await expect(page.getByText('这是用户确认后的本地笔记。')).toBeVisible()
})
