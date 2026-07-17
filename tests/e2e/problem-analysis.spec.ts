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

interface WorkspaceTemplateInput {
  id: string
  name: string
  path: string
}

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

async function addManualRelation(optionLabel: string) {
  await page.getByLabel('选择本地模板').selectOption({ label: optionLabel })
  await page.getByRole('button', { name: '添加本地模板关联' }).click()
}

async function analyzeCurrentDraft() {
  await page.getByRole('button', { name: 'AI 分析并补全' }).click()
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
}

function candidate(template: WorkspaceTemplateInput, role: string, confidence: number) {
  return {
    applicableWhen: ['题面包含对应算法信号'],
    confidence,
    evidence: [`题面需要 ${template.name}`],
    matchedCapabilities: [template.name],
    notApplicableWhen: [],
    reason: `${template.name} 与当前题目方向相关。`,
    role,
    templateId: template.id,
    warnings: [],
  }
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
        problemText?: string
        relatedWorkspaceContext?: { relatedTemplates?: WorkspaceTemplateInput[] }
      }
      const problemText = input.problemText ?? ''
      const templates = input.relatedWorkspaceContext?.relatedTemplates ?? []

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

      const ordered = ['dijkstra', 'dsu', 'knapsack', 'mod', 'kmp']
        .map(name => templates.find(template => template.name === name))
        .filter((template): template is WorkspaceTemplateInput => Boolean(template))
      let templateCandidates: ReturnType<typeof candidate>[] = []
      if (problemText.includes('多方向')) {
        const roles = [
          'direct-solution',
          'subproblem',
          'prerequisite',
          'optimization',
          'alternative-solution',
        ]
        templateCandidates = ordered.map((template, index) =>
          candidate(template, roles[index]!, template.name === 'kmp' ? 0.42 : 0.92 - index * 0.04),
        )
        if (templateCandidates[0]) {
          templateCandidates.push({
            ...templateCandidates[0],
            reason: '重复候选必须由 Main 确定性去重。',
          })
        }
        templateCandidates.push(
          candidate(
            { id: 'f'.repeat(64), name: 'forged-template', path: '越界/forged.cpp' },
            'direct-solution',
            0.99,
          ),
        )
      } else if (!problemText.includes('无可靠候选')) {
        const dijkstra = ordered[0] ?? templates[0]
        if (dijkstra) templateCandidates = [candidate(dijkstra, 'direct-solution', 0.93)]
      }

      const multiDirection = problemText.includes('多方向')
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  aiSummary: multiDirection
                    ? '需要组合多个算法方向并比较替代方案。'
                    : '在带权有向图中求最短路及其方案数。',
                  analysis: {
                    algorithmSignals: multiDirection
                      ? ['最短路', '并查集', '动态规划', '数学', '字符串']
                      : ['单源最短路', '最短路计数'],
                    constraints: ['n 不超过 2000', '边权非负'],
                    edgeCases: ['多条边产生相同最短距离'],
                    examples: [],
                    inputDescription: '输入图与附加约束。',
                    outputDescription: '输出计算结果。',
                  },
                  difficulty: '提高',
                  notes: '',
                  platform: '洛谷',
                  problemCode: multiDirection ? 'P-MULTI' : 'P1608',
                  status: 'unattempted',
                  tags: multiDirection ? ['多方向', '组合算法'] : ['图论', '最短路', 'Dijkstra'],
                  templateCandidates,
                  title: problemText.includes('无可靠候选')
                    ? '无候选草稿'
                    : multiDirection
                      ? '跨方向算法题'
                      : '最短路计数',
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
  const templateFixtures = [
    ['图论', 'dijkstra.cpp', 'void dijkstra() {}\n'],
    ['数据结构', 'dsu.cpp', 'struct dsu {};\n'],
    ['动态规划', 'knapsack.cpp', 'void knapsack() {}\n'],
    ['数学', 'mod.cpp', 'long long mod_pow() { return 1; }\n'],
    ['字符串', 'kmp.cpp', 'void kmp() {}\n'],
  ] as const
  for (const [directory, fileName, source] of templateFixtures) {
    await mkdir(join(workspaceRoot, directory), { recursive: true })
    await writeFile(join(workspaceRoot, directory, fileName), source, 'utf8')
  }
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

test('uses one new-problem entry and supports side-effect-free close plus manual multi-relations', async () => {
  await setNextFileSelection(workspaceRoot)
  await page.getByRole('button', { name: '选择目录' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '模板库' })).toBeVisible()
  await expect(page.getByText('5 个模板').first()).toBeVisible()

  await page.getByRole('button', { name: 'AI 设置' }).click()
  await page.getByLabel('Provider 显示名称').fill('题图分析测试')
  await page.getByLabel('Base URL').fill(mockBaseUrl)
  await page.getByLabel('模型名称').fill('fixture-vision')
  await page.getByLabel('API Key').fill('analysis-e2e-secret')
  await page.getByText('视觉输入', { exact: true }).click()
  await page.getByRole('button', { name: '保存 Provider' }).click()
  await page.getByRole('button', { name: /题目图片分析/ }).click()

  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByRole('button', { name: '新建题目' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'AI 分析题目' })).toHaveCount(0)

  await page.getByRole('button', { name: '新建题目' }).click()
  await page.getByLabel('题目标题').fill('关闭前不保存')
  await page.getByLabel('原始题面').fill('这个草稿必须保持在内存中。')
  await setNextFileSelection(fixtureImagePath)
  await page.getByRole('button', { name: '选择截图' }).click()
  await expect(page.getByRole('img', { name: 'problem.png' })).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/unified-problem-manual-light-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/unified-problem-manual-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.getByRole('button', { name: '关闭新建题目' }).click()
  await expect(page.getByText('还没有题目卡片')).toBeVisible()
  await expect(readdir(join(userDataDirectory, 'problem-images'))).rejects.toThrow()

  await page.getByRole('button', { name: '新建题目' }).click()
  await page.getByLabel('题目标题').fill('手动多模板题')
  await page.getByLabel('原始题面').fill('手动填写并关联多份本地模板。')
  await addManualRelation('dijkstra · 图论/dijkstra.cpp')
  await addManualRelation('dsu · 数据结构/dsu.cpp')
  await page.getByLabel('dijkstra 关联备注').fill('主算法')
  await page.getByRole('button', { name: '创建题目' }).click()

  await expect(page.getByRole('heading', { level: 2, name: '手动多模板题' })).toBeVisible()
  await expect(page.getByText('2 个已确认关联')).toBeVisible()
  await expect(page.getByText('主算法')).toBeVisible()
})

test('creates a pure-text AI draft with one validated local candidate', async () => {
  await page.getByRole('button', { name: '新建题目' }).click()
  await page.getByLabel('原始题面').fill('单一算法：使用 Dijkstra 求非负权最短路。')
  const requestCountBefore = requests.length
  await analyzeCurrentDraft()

  await expect(page.getByLabel('题目标题')).toHaveValue('最短路计数')
  await expect(page.getByRole('checkbox', { name: /选择候选模板/ })).toHaveCount(1)
  await expect(page.getByLabel('选择候选模板 dijkstra')).toBeChecked()
  expect(requests).toHaveLength(requestCountBefore + 1)
  expect(requests.at(-1)?.headers.authorization).toBe('Bearer analysis-e2e-secret')
  expect(requests.at(-1)?.body).not.toContain('analysis-e2e-secret')

  await page.getByRole('button', { name: '创建题目' }).click()
  await expect(page.getByRole('heading', { level: 2, name: '最短路计数' })).toBeVisible()
  await expect(page.getByText('1 个已确认关联')).toBeVisible()
})

test('preserves manual fields after cancellation and invalid JSON so creation can continue', async () => {
  await page.getByRole('button', { name: '新建题目' }).click()
  await page.getByLabel('题目标题').fill('取消后手动创建')
  await page.getByLabel('原始题面').fill('取消链路测试，不得清空字段。')
  await addManualRelation('dsu · 数据结构/dsu.cpp')
  await page.getByRole('button', { name: 'AI 分析并补全' }).click()
  holdNextAnalysisResponse = true
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect.poll(() => heldAnalysisResponseStarted).toBe(true)
  await page.getByRole('button', { name: '取消生成' }).click()
  await expect(page.getByRole('alert')).toContainText('AI 请求已取消')
  await expect(page.getByLabel('题目标题')).toHaveValue('取消后手动创建')
  await expect(page.getByLabel('原始题面')).toHaveValue('取消链路测试，不得清空字段。')
  await expect(page.getByLabel('选择候选模板 dsu')).toBeChecked()
  await expect.poll(() => heldAnalysisResponseClosed).toBe(true)
  await page.getByRole('button', { name: '创建题目' }).click()
  await expect(page.getByRole('heading', { level: 2, name: '取消后手动创建' })).toBeVisible()

  await page.getByRole('button', { name: '新建题目' }).click()
  await page.getByLabel('题目标题').fill('无效响应后继续')
  await page.getByLabel('原始题面').fill('无效 JSON 不得创建半成品，也不得清空字段。')
  await page.getByLabel('本地备注').fill('保留这段手工备注。')
  await page.getByRole('button', { name: 'AI 分析并补全' }).click()
  invalidAnalysisResponsesRemaining = 2
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByRole('alert')).toContainText('连续两次未返回完整的结构化题目草稿')
  await expect(page.getByLabel('题目标题')).toHaveValue('无效响应后继续')
  await expect(page.getByLabel('本地备注')).toHaveValue('保留这段手工备注。')
  await page.getByRole('button', { name: '创建题目' }).click()
  await expect(page.getByRole('heading', { level: 2, name: '无效响应后继续' })).toBeVisible()
  await expect(page.getByText('保留这段手工备注。')).toBeVisible()
})

test('keeps multi-direction AI candidates editable, rejects forged and duplicate IDs, and saves only checked relations', async () => {
  await page.getByRole('button', { name: '新建题目' }).click()
  await page
    .getByLabel('原始题面')
    .fill('多方向题：组合最短路、并查集、动态规划、数学推导与字符串处理，并比较替代解法。')
  await setNextFileSelection(fixtureImagePath)
  await page.getByRole('button', { name: '选择截图' }).click()
  const requestCountBefore = requests.length
  await analyzeCurrentDraft()

  await expect(page.getByLabel('题目标题')).toHaveValue('跨方向算法题')
  await expect(page.getByRole('checkbox', { name: /选择候选模板/ })).toHaveCount(5)
  await expect(page.getByLabel('选择候选模板 dijkstra')).toBeChecked()
  await expect(page.getByLabel('选择候选模板 dsu')).toBeChecked()
  await expect(page.getByLabel('选择候选模板 knapsack')).toBeChecked()
  await expect(page.getByLabel('选择候选模板 mod')).toBeChecked()
  await expect(page.getByLabel('选择候选模板 kmp')).not.toBeChecked()
  await expect(page.getByText('forged-template')).toHaveCount(0)
  await expect(page.getByText('直接解法')).toBeVisible()
  await expect(page.getByText('子问题')).toBeVisible()
  await expect(page.getByText('前置能力')).toBeVisible()
  await expect(page.getByText('优化方向')).toBeVisible()
  await expect(page.getByText('替代解法', { exact: true })).toBeVisible()
  expect(requests).toHaveLength(requestCountBefore + 1)
  expect(requests.at(-1)?.body).toContain('image_url')
  expect(requests.at(-1)?.body).toContain('数据结构/dsu.cpp')
  expect(requests.at(-1)?.body).toContain('动态规划/knapsack.cpp')

  await page.getByLabel('题目标题').fill('修改后的跨方向题')
  await page.getByLabel('本地备注').fill('人工复核后只保存三个关系。')
  await page.getByLabel('dijkstra 关系类型').selectOption('alternative')
  await page.getByLabel('选择候选模板 mod').uncheck()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/unified-problem-multi-template-light-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/unified-problem-multi-template-light-1280x720.png'),
  })
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/unified-problem-multi-template-dark-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/unified-problem-multi-template-dark-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))

  await page.getByRole('button', { name: '创建题目' }).click()
  await expect(page.getByRole('heading', { level: 2, name: '修改后的跨方向题' })).toBeVisible()
  await expect(page.getByText('3 个已确认关联')).toBeVisible()
  await expect(page.getByText('人工复核后只保存三个关系。')).toBeVisible()
  await expect(page.getByRole('img', { name: 'problem.png' })).toBeVisible()
  const storedImages = await readdir(join(userDataDirectory, 'problem-images'), { recursive: true })
  expect(storedImages.filter(path => path.endsWith('.png'))).toHaveLength(1)
})

test('allows an empty candidate result and closing the AI draft writes nothing', async () => {
  await page.getByRole('button', { name: '新建题目' }).click()
  await page.getByLabel('原始题面').fill('无可靠候选：只验证允许返回空关联草稿。')
  await analyzeCurrentDraft()
  await expect(page.getByLabel('题目标题')).toHaveValue('无候选草稿')
  await expect(page.getByRole('checkbox', { name: /选择候选模板/ })).toHaveCount(0)
  await expect(page.getByText('尚未选择模板；没有可靠候选时可以保持为空。')).toBeVisible()
  await page.getByRole('button', { name: '关闭新建题目' }).click()
  await expect(page.getByRole('heading', { level: 2, name: '无候选草稿' })).toHaveCount(0)
})

test('persists multiple confirmed relations after a desktop restart', async () => {
  await electronApp.close()
  await launchApplication()
  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: '修改后的跨方向题' })).toBeVisible()
  await expect(page.getByText('3 个已确认关联')).toBeVisible()
  await expect(page.getByText('人工复核后只保存三个关系。')).toBeVisible()
  expect(await readFile(join(workspaceRoot, '图论', 'dijkstra.cpp'), 'utf8')).toBe(
    'void dijkstra() {}\n',
  )
})
