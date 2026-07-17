import { createServer, type IncomingMessage, type Server } from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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
let fixtureImagePath: string
let mockBaseUrl: string
let mockServer: Server
let page: Page
let temporaryRoot: string
let userDataDirectory: string
let workspaceRoot: string
let holdNextAnalysisResponse = false
let heldAnalysisResponseClosed = false
let heldAnalysisResponseStarted = false
let invalidAnalysisResponsesRemaining = 0
const requests: Array<{ body: string; headers: IncomingMessage['headers'] }> = []

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

async function setNextFileSelection(path: string) {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [selectedPath],
    })) as typeof dialog.showOpenDialog
  }, path)
}

test.beforeAll(async () => {
  mockServer = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(Buffer.from(chunk)))
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      requests.push({ body, headers: request.headers })
      const parsed = JSON.parse(body) as {
        messages: Array<{ content: string | Array<{ text?: string; type: string }> }>
      }
      const userContent = parsed.messages.at(-1)?.content
      const textPart = Array.isArray(userContent)
        ? userContent.find(part => part.type === 'text')?.text
        : userContent
      const input = JSON.parse(textPart ?? '{}') as {
        relatedWorkspaceContext?: { relatedTemplates?: Array<{ id: string }> }
      }
      const template = input.relatedWorkspaceContext?.relatedTemplates?.[0]
      if (holdNextAnalysisResponse) {
        holdNextAnalysisResponse = false
        heldAnalysisResponseStarted = true
        response.on('close', () => {
          heldAnalysisResponseClosed = true
        })
        return
      }
      response.setHeader('content-type', 'application/json')
      if (invalidAnalysisResponsesRemaining > 0) {
        invalidAnalysisResponsesRemaining -= 1
        response.end(
          JSON.stringify({ choices: [{ message: { content: 'invalid-json-fixture' } }] }),
        )
        return
      }
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  aiSummary: '在带权有向图中求最短路及其方案数。',
                  analysis: {
                    algorithmSignals: ['单源最短路', '最短路计数'],
                    constraints: ['n 不超过 2000', '边权非负'],
                    edgeCases: ['多条边产生相同最短距离'],
                    examples: [],
                    inputDescription: '带权有向图的点和边。',
                    outputDescription: '最短路长度和方案数。',
                  },
                  difficulty: '提高',
                  notes: '',
                  platform: '洛谷',
                  problemCode: 'P1608',
                  status: 'unattempted',
                  tags: ['图论', '最短路', 'Dijkstra'],
                  templateCandidates: template
                    ? [
                        {
                          applicableWhen: ['边权非负'],
                          confidence: 0.93,
                          evidence: ['题面要求单源最短路'],
                          matchedCapabilities: ['堆优化 Dijkstra'],
                          notApplicableWhen: ['存在负权边'],
                          reason: '题目要求单源最短路径及计数。',
                          templateId: template.id,
                          warnings: ['需要在松弛时累加方案数'],
                        },
                      ]
                    : [],
                  title: '最短路计数',
                  url: null,
                }),
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

  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-analysis-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  workspaceRoot = join(temporaryRoot, 'workspace')
  fixtureImagePath = join(temporaryRoot, 'problem.png')
  await mkdir(userDataDirectory)
  await mkdir(join(workspaceRoot, '图论'), { recursive: true })
  await writeFile(join(workspaceRoot, '图论', 'dijkstra.cpp'), 'void dijkstra() {}\n', 'utf8')
  await writeFile(
    fixtureImagePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
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

test('configures a visual route and keeps a cancelled AI draft out of user data', async () => {
  await setNextFileSelection(workspaceRoot)
  await page.getByRole('button', { name: '选择目录' }).click()
  await expect(page.getByText('dijkstra.cpp')).toBeVisible()

  await page.getByRole('button', { name: 'AI 设置' }).click()
  await page.getByLabel('Provider 显示名称').fill('题图分析测试')
  await page.getByLabel('Base URL').fill(mockBaseUrl)
  await page.getByLabel('模型名称').fill('fixture-vision')
  await page.getByLabel('API Key').fill('analysis-e2e-secret')
  await page.getByText('视觉输入', { exact: true }).click()
  await page.getByRole('button', { name: '保存 Provider' }).click()
  await page.getByRole('button', { name: /题目图片分析/ }).click()

  await page.getByRole('button', { name: '题目', exact: true }).click()
  await page.getByRole('button', { name: 'AI 分析题目' }).click()
  await page.getByLabel('待分析题面').fill('取消链路测试，不得保存。')
  await page.getByRole('button', { name: '生成草稿' }).click()
  holdNextAnalysisResponse = true
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect.poll(() => heldAnalysisResponseStarted).toBe(true)
  await page.getByRole('button', { name: '取消生成' }).click()
  await expect(page.getByRole('alert')).toContainText('AI 请求已取消')
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/ai-error-cancelled-light-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/ai-error-cancelled-light-1280x720.png'),
  })
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/ai-error-cancelled-dark-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/ai-error-cancelled-dark-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  await expect.poll(() => heldAnalysisResponseClosed).toBe(true)
  await page.getByRole('button', { name: '关闭 AI 题目分析' }).click()
  await expect(page.getByText('还没有题目卡片')).toBeVisible()

  await page.getByRole('button', { name: 'AI 分析题目' }).click()
  await page.getByLabel('待分析题面').fill('无效 JSON 不得创建题目。')
  await page.getByRole('button', { name: '生成草稿' }).click()
  invalidAnalysisResponsesRemaining = 2
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByRole('alert')).toContainText('连续两次未返回完整的结构化题目草稿')
  await page.getByRole('button', { name: '关闭 AI 题目分析' }).click()
  await expect(page.getByText('还没有题目卡片')).toBeVisible()
  await expect(readdir(join(userDataDirectory, 'problem-images'))).rejects.toThrow()

  await page.getByRole('button', { name: 'AI 分析题目' }).click()
  await page.getByLabel('待分析题面').fill('求最短路径和最短路径方案数，n 不超过 2000。')
  await setNextFileSelection(fixtureImagePath)
  await page.getByRole('button', { name: '选择截图' }).click()
  await expect(page.getByRole('img', { name: 'problem.png' })).toBeVisible()
  await page.getByRole('button', { name: '生成草稿' }).click()
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await expect(page.getByText('原始题面文本')).toBeVisible()
  await expect(
    page.getByText(`openai-chat-completions · ${new URL(mockBaseUrl).host}`),
  ).toBeVisible()
  const requestCountBeforeConfirmation = requests.length
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByRole('heading', { name: '确认 AI 题目草稿' })).toBeVisible()
  await expect(page.getByLabel('AI 草稿题目标题')).toHaveValue('最短路计数')
  await expect(page.getByLabel('AI 草稿原始题面')).toHaveValue(
    '求最短路径和最短路径方案数，n 不超过 2000。',
  )
  await expect(page.getByLabel('AI 草稿题目摘要')).toHaveValue('在带权有向图中求最短路及其方案数。')
  await expect(page.getByLabel('选择候选模板 dijkstra')).toBeChecked()
  expect(requests.at(-1)?.headers.authorization).toBe('Bearer analysis-e2e-secret')
  expect(requests.at(-1)?.body).toContain('image_url')
  expect(requests.at(-1)?.body).not.toContain('analysis-e2e-secret')
  expect(requests).toHaveLength(requestCountBeforeConfirmation + 1)

  await page.getByRole('button', { name: '关闭 AI 题目分析' }).click()
  await expect(page.getByText('还没有题目卡片')).toBeVisible()
  await expect(readdir(join(userDataDirectory, 'problem-images'))).rejects.toThrow()
})

test('edits and confirms an AI draft with image and template relation', async () => {
  await page.getByRole('button', { name: 'AI 分析题目' }).click()
  await page.getByLabel('待分析题面').fill('求最短路径和最短路径方案数，n 不超过 2000。')
  await setNextFileSelection(fixtureImagePath)
  await page.getByRole('button', { name: '选择截图' }).click()
  await page.getByRole('button', { name: '生成草稿' }).click()
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByRole('heading', { name: '确认 AI 题目草稿' })).toBeVisible()

  await page.getByLabel('AI 草稿本地备注').fill('已检查 AI 字段后确认。')
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage4-problem-analysis-draft-light.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage4-problem-analysis-draft-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage4-problem-analysis-draft-dark.png'),
  })
  await page.getByRole('button', { name: '确认创建' }).click()

  await expect(page.getByRole('heading', { level: 2, name: '最短路计数' })).toBeVisible()
  await expect(page.getByText('1 个已确认关联')).toBeVisible()
  await expect(page.getByRole('img', { name: 'problem.png' })).toBeVisible()
  await expect(page.getByText('已检查 AI 字段后确认。')).toBeVisible()
  const storedImages = await readdir(join(userDataDirectory, 'problem-images'), { recursive: true })
  expect(storedImages.filter(path => path.endsWith('.png'))).toHaveLength(1)
})

test('persists the confirmed AI problem after a desktop restart', async () => {
  await electronApp.close()
  await launchApplication()
  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: '最短路计数' })).toBeVisible()
  await expect(page.getByText('1 个已确认关联')).toBeVisible()
  await expect(page.getByRole('img', { name: 'problem.png' })).toBeVisible()
  expect(await readFile(join(workspaceRoot, '图论', 'dijkstra.cpp'), 'utf8')).toBe(
    'void dijkstra() {}\n',
  )
})
