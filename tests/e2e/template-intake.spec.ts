import { createServer, type Server } from 'node:http'
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

import type { DesktopApi } from '@core/contracts/desktop-api'

import { dismissGettingStartedGuideIfNeeded } from './helpers/getting-started'

declare const window: { desktop: DesktopApi }

let electronApp: ElectronApplication
let mockBaseUrl: string
let mockServer: Server
let page: Page
let batchSourceRoot: string
let manualSourceRoot: string
let temporaryRoot: string
let userDataDirectory: string
let workspaceRoot: string
let lastTemplateMetadataSystem = ''
const templateMetadataBodies: Array<{ response_format?: unknown }> = []
let rejectedNativeStructuredOutput = false
let holdNextTemplateResponse = false
let heldTemplateResponseClosed = false
let heldTemplateResponseStarted = false
let invalidTemplateResponsesRemaining = 0

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

async function setNextSelection(path: string | string[]) {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: Array.isArray(selectedPath) ? selectedPath : [selectedPath],
    })) as typeof dialog.showOpenDialog
    dialog.showMessageBox = (async () => ({
      checkboxChecked: false,
      response: 1,
    })) as typeof dialog.showMessageBox
  }, path)
}

async function openBatchImportDialog() {
  await page.getByRole('button', { name: '新建模板' }).click()
  await expect(page.getByRole('heading', { name: '新建算法模板' })).toBeVisible()
  const batchImportButton = page.getByRole('button', { name: '批量导入 C++' })
  await expect(batchImportButton).toBeVisible()
  await expect(batchImportButton).toBeEnabled()
  // The lazily rendered source editor can replace the surrounding form while Playwright waits
  // for pointer-action stability. Dispatch only after the user-visible actionability checks pass.
  await batchImportButton.dispatchEvent('click')
  await expect(page.getByRole('heading', { name: '批量导入 C++ 模板' })).toBeVisible()
}

test.beforeAll(async () => {
  mockServer = createServer((request, response) => {
    const bodyChunks: Buffer[] = []
    request.on('data', chunk => bodyChunks.push(Buffer.from(chunk)))
    request.on('end', () => {
      const parsedBody = JSON.parse(Buffer.concat(bodyChunks).toString('utf8')) as {
        messages?: unknown
        response_format?: unknown
      }
      templateMetadataBodies.push(parsedBody)
      const messages = Array.isArray(parsedBody.messages) ? parsedBody.messages : []
      const lastUserMessage = [...messages]
        .reverse()
        .find(
          message =>
            typeof message === 'object' &&
            message !== null &&
            (message as { role?: unknown }).role === 'user',
        ) as { content?: unknown } | undefined
      const userContent =
        typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : ''
      const evidenceRegression = userContent.includes('S3_EVIDENCE_FIXTURE')
      const existingMetadataCompletion =
        userContent.includes('"existingMetadata"') && userContent.includes('"missingFields"')
      // Dynamic staging adds earlier source snippets to related context.
      // Match only the current source, not those reference templates.
      let currentSource = userContent
      try {
        const payload = JSON.parse(userContent) as { source?: unknown }
        if (typeof payload.source === 'string') currentSource = payload.source
      } catch {
        /* A semantic-retry message can contain plain text. */
      }
      const legacyBwtClassification = currentSource.includes('bwt_legacy_shape')
      const batchFileName = currentSource.includes('batch_one')
        ? '批量一.cpp'
        : currentSource.includes('batch_two')
          ? '批量二.cpp'
          : null
      const globalBatch =
        userContent.includes('"sources"') && userContent.includes('"originalCharacters"')
      const globalBatchSourceIds = [...userContent.matchAll(/"id":"([0-9a-f-]{36})"/g)].map(
        match => match[1]!,
      )
      const detailSourceIds = [
        ...(userContent.match(/"sources":\[(.*?)\],"workspaceCatalog"/su)?.[1] ?? '').matchAll(
          /"id":"([0-9a-f-]{36})"/g,
        ),
      ].map(match => match[1]!)
      const systemMessage = messages.find(
        message =>
          typeof message === 'object' &&
          message !== null &&
          (message as { role?: unknown }).role === 'system',
      ) as { content?: unknown } | undefined
      lastTemplateMetadataSystem =
        typeof systemMessage?.content === 'string' ? systemMessage.content : ''
      const globalFactsBatch =
        globalBatch && lastTemplateMetadataSystem.includes('全局分类事实提取器')
      if (holdNextTemplateResponse) {
        holdNextTemplateResponse = false
        heldTemplateResponseStarted = true
        response.on('close', () => {
          heldTemplateResponseClosed = true
        })
        return
      }
      if (invalidTemplateResponsesRemaining > 0) {
        invalidTemplateResponsesRemaining -= 1
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({ choices: [{ message: { content: 'invalid-json-fixture' } }] }),
        )
        return
      }
      if (parsedBody.response_format && !rejectedNativeStructuredOutput) {
        rejectedNativeStructuredOutput = true
        response.statusCode = 400
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({ error: { message: 'This response_format type is unavailable now' } }),
        )
        return
      }
      const english = lastTemplateMetadataSystem.includes('Use English for categoryPath')
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  {
                    text: JSON.stringify(
                      evidenceRegression
                        ? {
                            algorithmFamily: 'Fenwick',
                            categoryId: 'data-structure.fenwick',
                            categoryPath: ['数据结构', '树状数组', 'Fenwick 树'],
                            fileName: '累加.cpp',
                            classificationReason: '从实现引用提取的待复核提案',
                            confidence: 0.6,
                            sourceEvidence: [
                              { startLine: 8, endLine: 8, quote: 'i += i & -i', claim: '低位更新' },
                            ],
                            tags: ['前缀'],
                            solves: '前缀累加',
                            timeComplexity: 'O(log n)',
                            spaceComplexity: 'O(n)',
                            variant: '单点更新',
                          }
                        : globalFactsBatch
                          ? {
                              classifications: [...new Set(globalBatchSourceIds)].map(
                                (sourceId, index) => ({
                                  sourceId,
                                  classification: {
                                    algorithmFamily: 'Dijkstra',
                                    categoryDecision: 'reuse-existing',
                                    categoryId: 'graph.shortest-path.single-source',
                                    confidence: 0.96,
                                    evidence: [`全局事实 ${index + 1}`],
                                  },
                                }),
                              ),
                            }
                          : globalBatch
                            ? {
                                classifications: detailSourceIds.map((sourceId, index) => ({
                                  sourceId,
                                  classification: {
                                    algorithmFamily: 'Dijkstra',
                                    categoryId: 'graph.shortest-path.single-source',
                                    categoryPath: ['图论', '最短路', '单源最短路'],
                                    classificationReason: '该批次源码属于同一测试算法分类。',
                                    confidence: 0.96,
                                    fileName: index === 0 ? '批量一.cpp' : '批量二.cpp',
                                    alternatives: [],
                                    solves: '验证批量模板导入。',
                                    spaceComplexity: 'O(1)',
                                    tags: ['批量导入', '测试'],
                                    timeComplexity: 'O(1)',
                                  },
                                })),
                              }
                            : existingMetadataCompletion
                              ? {
                                  commonMistakes: 'AI 建议检查边界条件。',
                                  constraints: 'AI 建议的适用约束。',
                                  prerequisites: 'AI 建议的前置知识。',
                                  solves: 'AI 补全的用途。',
                                  spaceComplexity: 'O(n + m)',
                                  tags: ['AI补全', '回归测试'],
                                  timeComplexity: 'O((n + m) log n)',
                                }
                              : legacyBwtClassification
                                ? {
                                    result: {
                                      category_path: '字符串算法 > BWT > 逆变换',
                                      common_mistakes: '注意哨兵字符与下标范围。',
                                      confidence: '91%',
                                      constraints: '输入包含唯一哨兵字符。',
                                      prerequisites: '掌握后缀排序与 LF-mapping。',
                                      solves: '从 BWT 末列恢复原字符串。',
                                      space_complexity: 'O(n)',
                                      tags: '字符串，BWT，逆变换',
                                      time_complexity: 'O(n log n)',
                                    },
                                  }
                                : {
                                    categoryPath: batchFileName
                                      ? ['图论', '最短路', '单源最短路']
                                      : english
                                        ? [
                                            'Graph Theory',
                                            'Shortest Path',
                                            'Dijkstra',
                                            'Heap Optimized',
                                          ]
                                        : ['图论', '最短路', 'Dijkstra', '堆优化'],
                                    commonMistakes: batchFileName
                                      ? '注意测试边界条件。'
                                      : english
                                        ? 'Forgetting to discard stale priority queue entries.'
                                        : '优先队列弹出后忘记判断过期距离。',
                                    classificationReason: batchFileName
                                      ? '该源码属于批量导入测试算法。'
                                      : english
                                        ? 'The implementation belongs with the graph shortest-path taxonomy.'
                                        : '该实现属于图论最短路分类。',
                                    confidence: 0.96,
                                    constraints: batchFileName
                                      ? '用于本地测试。'
                                      : english
                                        ? 'Edge weights must be non-negative.'
                                        : '边权非负。',
                                    fileName: batchFileName ?? 'dijkstra.cpp',
                                    alternatives: [],
                                    placement: {
                                      existingParentPath: '',
                                      mode: 'create-category-chain',
                                      newDirectories: batchFileName
                                        ? ['图论', '最短路', '单源最短路']
                                        : english
                                          ? [
                                              'Graph Theory',
                                              'Shortest Path',
                                              'Dijkstra',
                                              'Heap Optimized',
                                            ]
                                          : ['图论', '最短路', 'Dijkstra', '堆优化'],
                                      reason: batchFileName
                                        ? '为批量导入创建明确分类。'
                                        : english
                                          ? 'The workspace is empty, so create a specific category chain.'
                                          : '工作区当前为空，需要新建明确的分类链。',
                                      targetDirectory: batchFileName
                                        ? '图论/最短路/单源最短路'
                                        : english
                                          ? 'Graph Theory/Shortest Path/Dijkstra/Heap Optimized'
                                          : '图论/最短路/Dijkstra/堆优化',
                                    },
                                    prerequisites: batchFileName
                                      ? '掌握基础 C++。'
                                      : english
                                        ? 'Adjacency lists and priority queues.'
                                        : '邻接表、优先队列。',
                                    solves: batchFileName
                                      ? '验证批量模板导入。'
                                      : english
                                        ? 'Single-source shortest paths with non-negative weights.'
                                        : '单源非负权最短路径。',
                                    spaceComplexity: 'O(n + m)',
                                    tags: batchFileName
                                      ? ['批量导入', '测试']
                                      : english
                                        ? ['Graph Theory', 'Shortest Path', 'Dijkstra']
                                        : ['图论', '最短路', 'Dijkstra'],
                                    timeComplexity: 'O((n + m) log n)',
                                  },
                    ),
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
  batchSourceRoot = join(temporaryRoot, 'batch-source')
  manualSourceRoot = join(temporaryRoot, 'manual-source')
  await mkdir(userDataDirectory)
  await mkdir(workspaceRoot)
  await mkdir(join(batchSourceRoot, 'nested'), { recursive: true })
  await mkdir(manualSourceRoot)
  await writeFile(join(batchSourceRoot, 'one.cpp'), 'void batch_one() {}\n', 'utf8')
  await writeFile(join(batchSourceRoot, 'nested', 'two.cpp'), 'void batch_two() {}\n', 'utf8')
  await writeFile(join(batchSourceRoot, 'ignored.py'), 'def ignored(): pass\n', 'utf8')
  await writeFile(join(manualSourceRoot, 'manual-one.cpp'), 'void manual_one_v1() {}\n', 'utf8')
  await writeFile(join(manualSourceRoot, 'manual-two.cpp'), 'void manual_two() {}\n', 'utf8')
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
  await expect(page.getByRole('heading', { level: 1, name: '模板库' })).toBeVisible()
  await page.getByRole('button', { name: 'AI 设置' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'AI 设置' })).toBeVisible()
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

  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await expect(page.getByText('完整工作区模板目录')).toBeVisible()
  await expect(page.getByLabel('完整工作区目录覆盖')).toContainText('0 / 0')
  const templatePreview = page.getByRole('dialog', { name: '确认发送给 AI' })
  await expect(templatePreview.locator(':focus')).toHaveCount(1)
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/ai-catalog-template-preview-light-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/ai-catalog-template-preview-dark-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/ai-catalog-template-preview-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 640),
  )
  const templatePreviewScroll = templatePreview.locator('div.overflow-y-auto').first()
  await expect
    .poll(() =>
      templatePreviewScroll.evaluate(element => element.scrollHeight > element.clientHeight),
    )
    .toBe(true)
  await templatePreviewScroll.evaluate(element => element.scrollTo({ top: element.scrollHeight }))
  await expect(page.getByText('模板名称完整，无不可接受裁剪。')).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/ai-catalog-template-preview-light-1024x640.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  holdNextTemplateResponse = true
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect.poll(() => heldTemplateResponseStarted).toBe(true)
  await page.getByRole('button', { name: '取消生成' }).click()
  await expect(page.getByRole('alert')).toContainText('AI 请求已取消')
  await expect.poll(() => heldTemplateResponseClosed).toBe(true)
  invalidTemplateResponsesRemaining = 2
  await page.getByRole('button', { name: '立即补全' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByRole('alert')).toContainText('连续两次未返回可用的模板分类')
  expect(await readdir(join(workspaceRoot, 'templates'))).toHaveLength(0)
  await page.getByRole('button', { name: '立即补全' }).click()
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await page.getByRole('button', { name: '确认发送并生成' }).click()

  await expect
    .poll(() => lastTemplateMetadataSystem)
    .toContain('Use English for categoryPath, fileName, tags, and solves')

  await expect(page.getByRole('heading', { name: '确认元数据冲突' })).toBeVisible()
  expect(templateMetadataBodies.at(-2)?.response_format).toBeDefined()
  expect(templateMetadataBodies.at(-1)?.response_format).toBeUndefined()
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
  await expect(page.getByText(/2 次 Provider 请求.*总耗时/)).toBeVisible()
  await expect(page.getByText(/首次生成.*Schema 降级/)).toBeVisible()
  await expect(page.getByRole('button', { name: '确认创建' })).toBeDisabled()
  await page.getByRole('button', { name: '确认此分类' }).click()
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
        'templates',
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
  await page.getByPlaceholder('筛选当前工作区').fill('dijkstra.cpp')
  await page.getByText('dijkstra.cpp').click()
  await expect(page.getByText('这是用户确认后的本地笔记。')).toBeVisible()
})

test('keeps the new-template close action outside the native title-bar drag region', async () => {
  const trigger = page.getByRole('button', { name: '新建模板' })
  const assertIconCenterCloses = async () => {
    const dialog = page.getByRole('dialog')
    const closeButton = page.getByRole('button', { name: '关闭新建模板' })
    await expect(closeButton).toBeEnabled()
    await expect(dialog).toHaveCSS('-webkit-app-region', 'no-drag')

    const closeIconBox = await closeButton.locator('svg').boundingBox()
    expect(closeIconBox).not.toBeNull()
    const closeIconCenter = {
      x: closeIconBox!.x + closeIconBox!.width / 2,
      y: closeIconBox!.y + closeIconBox!.height / 2,
    }
    expect(
      await page.evaluate(point => {
        const browser = globalThis as unknown as {
          document: { elementFromPoint: (x: number, y: number) => { tagName: string } | null }
        }
        return browser.document.elementFromPoint(point.x, point.y)?.tagName.toLowerCase()
      }, closeIconCenter),
    ).toBe('button')
    await page.mouse.click(closeIconCenter.x, closeIconCenter.y)
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }

  await trigger.click()
  await assertIconCenterCloses()

  await trigger.click()
  await page.getByLabel('补全语言').selectOption('en')
  await assertIconCenterCloses()
})

test('regenerates untouched AI metadata after switching completion language', async () => {
  await page.getByRole('button', { name: '新建模板' }).click()
  await page
    .getByRole('textbox', { name: '模板源码', exact: true })
    .fill('void dijkstra_language_switch() {}\n')
  await page.getByLabel('补全语言').selectOption('en')
  await page.getByRole('button', { name: '立即补全' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()

  await expect(page.getByLabel(/文件名/)).toHaveValue(
    'Graph Theory/Shortest Path/Dijkstra/Heap Optimized/dijkstra.cpp',
  )
  await expect(page.getByLabel('解决的问题')).toHaveValue(
    'Single-source shortest paths with non-negative weights.',
  )

  await page.getByLabel('补全语言').selectOption('zh-CN')
  await expect(page.getByLabel(/文件名/)).toHaveValue('')
  await expect(page.getByLabel('解决的问题')).toHaveValue('')
  await expect(page.getByRole('dialog').getByText('精细分类')).toHaveCount(0)

  await page.getByRole('button', { name: '立即补全' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByLabel(/文件名/)).toHaveValue('图论/最短路/Dijkstra/堆优化/dijkstra.cpp')
  await expect(page.getByLabel('解决的问题')).toHaveValue('单源非负权最短路径。')
  await expect(page.getByRole('alert')).toHaveCount(0)
  const closeIcon = page.getByRole('button', { name: '关闭新建模板' }).locator('svg')
  const closeIconBox = await closeIcon.boundingBox()
  expect(closeIconBox).not.toBeNull()
  await page.mouse.click(
    closeIconBox!.x + closeIconBox!.width / 2,
    closeIconBox!.y + closeIconBox!.height / 2,
  )
  await expect(page.getByRole('heading', { name: '新建算法模板' })).toHaveCount(0)
})

test('accepts a common legacy BWT classification shape and canonicalizes its path', async () => {
  await page.getByRole('button', { name: '新建模板' }).click()
  await page.getByLabel(/文件名/).fill('BWT变换.cpp')
  await page
    .getByRole('textbox', { name: '模板源码', exact: true })
    .fill('void bwt_legacy_shape() { /* LF-mapping */ }\n')
  await page.getByRole('button', { name: '立即补全' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()

  await expect(page.getByRole('heading', { name: '确认元数据冲突' })).toBeVisible()
  await page.getByRole('button', { name: '保存路径 使用 AI 建议' }).click()
  await page.getByRole('button', { name: '确认并应用选择' }).click()
  await expect(page.getByLabel(/文件名/)).toHaveValue('字符串/字符串变换/BWT/BWT变换.cpp')
  await expect(page.getByLabel('模板标签')).toHaveValue('字符串, BWT, 逆变换')
  await expect(page.getByLabel('解决的问题')).toHaveValue('从 BWT 末列恢复原字符串。')
  await expect(page.getByText('模型未提供分类理由，请在保存前重点核对建议目录。')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '关闭新建模板' }).click()
})

test('stages selected copies without AI and resolves collisions without overwriting existing files', async () => {
  const firstSource = join(manualSourceRoot, 'manual-one.cpp')
  const secondSource = join(manualSourceRoot, 'manual-two.cpp')
  const originalFirst = await readFile(firstSource, 'utf8')
  const originalSecond = await readFile(secondSource, 'utf8')

  await openBatchImportDialog()
  await setNextSelection([firstSource, secondSource])
  await page.getByRole('button', { name: '选择多个 C++ 文件' }).click()
  await expect(page.getByLabel('选择导入 manual-one.cpp')).toBeChecked()
  await expect(page.getByLabel('选择导入 manual-two.cpp')).toBeChecked()
  await page.getByLabel('选择导入 manual-two.cpp').uncheck()
  await page.getByRole('button', { name: '准备暂存 1 份', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认应用 1 份', exact: true })).toBeEnabled()
  await expect(readFile(join(workspaceRoot, 'templates', 'manual-one.cpp'))).rejects.toThrow()
  await page.getByRole('button', { name: '确认应用 1 份', exact: true }).click()
  await expect(page.getByRole('heading', { name: '批量导入 C++ 模板' })).toHaveCount(0)
  expect(await readFile(join(workspaceRoot, 'templates', 'manual-one.cpp'), 'utf8')).toBe(
    originalFirst,
  )
  await expect(readFile(join(workspaceRoot, 'templates', 'manual-two.cpp'))).rejects.toThrow()

  await openBatchImportDialog()
  await setNextSelection([firstSource, secondSource])
  await page.getByRole('button', { name: '选择多个 C++ 文件' }).click()
  await page.getByRole('button', { name: '准备暂存 2 份', exact: true }).click()
  await expect(page.getByText('处理失败', { exact: true })).toBeVisible()
  expect(await readFile(join(workspaceRoot, 'templates', 'manual-one.cpp'), 'utf8')).toBe(
    originalFirst,
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/batch-template-conflict-light.png'),
  })
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/batch-template-conflict-dark.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  await page.getByLabel('选择导入 manual-one.cpp').uncheck()
  await page.getByRole('button', { name: '准备暂存 1 份', exact: true }).click()
  await page.getByRole('button', { name: '确认应用 1 份', exact: true }).click()
  await expect(page.getByRole('heading', { name: '批量导入 C++ 模板' })).toHaveCount(0)
  expect(await readFile(join(workspaceRoot, 'templates', 'manual-two.cpp'), 'utf8')).toBe(
    originalSecond,
  )

  const revisedFirst = 'void manual_one_v2() {}\n'
  await writeFile(firstSource, revisedFirst, 'utf8')
  await openBatchImportDialog()
  await setNextSelection(firstSource)
  await page.getByRole('button', { name: '选择多个 C++ 文件' }).click()
  await page.getByLabel('工作区保存路径 manual-one.cpp').fill('manual-one-copy.cpp')
  await page.getByLabel('工作区保存路径 manual-one.cpp').blur()
  await page.getByRole('button', { name: '准备暂存 1 份', exact: true }).click()
  await page.getByRole('button', { name: '确认应用 1 份', exact: true }).click()
  await expect(page.getByRole('heading', { name: '批量导入 C++ 模板' })).toHaveCount(0)
  expect(await readFile(join(workspaceRoot, 'templates', 'manual-one-copy.cpp'), 'utf8')).toBe(
    revisedFirst,
  )
  expect(await readFile(join(workspaceRoot, 'templates', 'manual-one.cpp'), 'utf8')).toBe(
    originalFirst,
  )
  expect(await readFile(firstSource, 'utf8')).toBe(revisedFirst)
  const backups = await readdir(join(workspaceRoot, '.awb', 'recovery', 'batch-staging'), {
    recursive: true,
  })
  expect(backups.some(entry => entry.endsWith('journal.json'))).toBe(true)
})

test('scans a C++ folder, generates all metadata, and atomically imports copies', async () => {
  const originalOne = await readFile(join(batchSourceRoot, 'one.cpp'), 'utf8')
  const originalTwo = await readFile(join(batchSourceRoot, 'nested', 'two.cpp'), 'utf8')

  await openBatchImportDialog()
  await setNextSelection(batchSourceRoot)
  await page.getByRole('button', { name: '扫描 C++ 文件夹' }).click()
  await expect(page.getByText('one.cpp', { exact: true })).toBeVisible()
  await expect(page.getByText('nested/two.cpp', { exact: true })).toBeVisible()
  await expect(page.getByText('ignored.py', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'AI 补全所选模板' }).click()
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await expect(page.getByText(/2 份 \.cpp/)).toBeVisible()
  await page.getByRole('button', { name: '确认发送并生成' }).click()

  const firstPath = page.getByLabel('工作区保存路径 one.cpp')
  const secondPath = page.getByLabel('工作区保存路径 nested/two.cpp')
  await expect(firstPath).toHaveValue('图论/最短路/单源最短路/批量一.cpp')
  await expect(secondPath).toHaveValue('图论/最短路/单源最短路/批量二.cpp')
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/batch-template-import-light.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/batch-template-import-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/batch-template-import-dark.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))

  await expect(page.getByRole('button', { name: '确认应用 2 份' })).toBeDisabled()
  await secondPath.fill('图论/最短路/单源最短路/批量一.cpp')
  await secondPath.blur()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(
    readFile(join(workspaceRoot, 'templates', '图论', '最短路', '单源最短路', '批量一.cpp')),
  ).rejects.toThrow()

  await secondPath.fill('图论/最短路/单源最短路/批量二.cpp')
  await secondPath.blur()
  const confirms = page.getByRole('button', { name: '确认此分类', exact: true })
  while (await confirms.count()) await confirms.first().click()
  await page.getByRole('button', { name: '确认应用 2 份', exact: true }).click()
  await expect(page.getByRole('heading', { name: '批量导入 C++ 模板' })).toHaveCount(0)
  expect(
    await readFile(
      join(workspaceRoot, 'templates', '图论', '最短路', '单源最短路', '批量一.cpp'),
      'utf8',
    ),
  ).toBe(originalOne)
  expect(
    await readFile(
      join(workspaceRoot, 'templates', '图论', '最短路', '单源最短路', '批量二.cpp'),
      'utf8',
    ),
  ).toBe(originalTwo)
  expect(await readFile(join(batchSourceRoot, 'one.cpp'), 'utf8')).toBe(originalOne)
  expect(await readFile(join(batchSourceRoot, 'nested', 'two.cpp'), 'utf8')).toBe(originalTwo)
})

test('completes existing template metadata individually and in one guarded batch', async () => {
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  const templates = await page.evaluate(() =>
    window.desktop.templates.listPage({ cursor: null, limit: 500, query: '' }),
  )
  const dijkstra = templates.items.find(item => item.fileName === 'dijkstra.cpp')
  const batchTargets = templates.items.filter(item =>
    ['manual-one.cpp', 'manual-two.cpp'].includes(item.fileName),
  )
  expect(dijkstra).toBeDefined()
  expect(batchTargets).toHaveLength(2)

  await page.evaluate(async templateId => {
    const metadata = await window.desktop.templateManagement.getMetadata(templateId)
    if (!metadata) throw new Error('fixture metadata missing')
    await window.desktop.templateManagement.updateMetadata({
      notes: '这是不会发送给 AI 的现有用户笔记。',
      solves: '',
      spaceComplexity: metadata.spaceComplexity,
      tags: [],
      templateId,
      timeComplexity: metadata.timeComplexity,
    })
  }, dijkstra!.id)
  await page.getByPlaceholder('筛选当前工作区').fill('dijkstra.cpp')
  await page.getByText('dijkstra.cpp').click()
  await expect(page.getByText('这是不会发送给 AI 的现有用户笔记。')).toBeVisible()

  heldTemplateResponseClosed = false
  heldTemplateResponseStarted = false
  holdNextTemplateResponse = true
  const beforeCancel = await page.evaluate(
    templateId => window.desktop.templateManagement.getMetadata(templateId),
    dijkstra!.id,
  )
  await page.getByRole('button', { name: 'AI 补全空白字段' }).click()
  await page.getByRole('button', { name: '预览并补全' }).click()
  await expect(page.getByRole('heading', { name: '确认发送给 AI' })).toBeVisible()
  await expect(
    page.getByText('用户笔记、绝对路径、API Key、题目正文和非当前工作区数据不会发送'),
  ).toBeVisible()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect.poll(() => heldTemplateResponseStarted).toBe(true)
  await page.getByRole('button', { name: '取消生成' }).click()
  await expect.poll(() => heldTemplateResponseClosed).toBe(true)
  await expect(page.getByText(/AI 请求已取消/)).toBeVisible()
  const afterCancel = await page.evaluate(
    templateId => window.desktop.templateManagement.getMetadata(templateId),
    dijkstra!.id,
  )
  expect(afterCancel).toEqual(beforeCancel)

  await page.getByRole('button', { name: '预览并补全' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByText('AI 补全的用途。')).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/existing-metadata-completion-light-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/existing-metadata-completion-dark-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/existing-metadata-completion-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 640),
  )
  await expect(page.getByRole('dialog', { name: 'AI 补全模板元数据' })).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/existing-metadata-completion-light-1024x640.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.getByLabel(`${dijkstra!.name} 标签`).uncheck()
  await page.getByRole('button', { name: '保存 1 个字段' }).click()
  await expect(page.getByText('AI 补全的用途。')).toBeVisible()
  const singleMetadata = await page.evaluate(
    templateId => window.desktop.templateManagement.getMetadata(templateId),
    dijkstra!.id,
  )
  expect(singleMetadata).toMatchObject({
    notes: '这是不会发送给 AI 的现有用户笔记。',
    solves: 'AI 补全的用途。',
    tags: [],
  })

  await page.evaluate(
    async targets => {
      for (const target of targets) {
        const metadata = await window.desktop.templateManagement.getMetadata(target.id)
        await window.desktop.templateManagement.updateMetadata({
          notes: metadata?.notes ?? '',
          solves: '',
          spaceComplexity: metadata?.spaceComplexity || 'O(1)',
          tags: metadata?.tags.length ? metadata.tags : ['已有标签'],
          templateId: target.id,
          timeComplexity: metadata?.timeComplexity || 'O(1)',
        })
      }
    },
    batchTargets.map(item => ({ id: item.id })),
  )
  await page.getByRole('button', { name: '批量补全元数据' }).click()
  for (const target of batchTargets) {
    await page.getByLabel(`选择模板 ${target.name}`, { exact: true }).check()
  }
  await page.getByRole('button', { name: '预览并补全' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByRole('button', { name: '保存 2 个字段' })).toBeVisible()

  await page.evaluate(async templateId => {
    const metadata = await window.desktop.templateManagement.getMetadata(templateId)
    if (!metadata) throw new Error('fixture metadata missing')
    await window.desktop.templateManagement.updateMetadata({
      notes: `${metadata.notes}外部变更`,
      solves: metadata.solves,
      spaceComplexity: metadata.spaceComplexity,
      tags: metadata.tags,
      templateId,
      timeComplexity: metadata.timeComplexity,
    })
  }, batchTargets[0]!.id)
  await page.getByRole('button', { name: '保存 2 个字段' }).click()
  await expect(page.getByText(/模板元数据已变化/)).toBeVisible()
  const conflictedMetadata = await page.evaluate(
    templateId => window.desktop.templateManagement.getMetadata(templateId),
    batchTargets[1]!.id,
  )
  expect(conflictedMetadata?.solves).toBe('')

  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '批量补全元数据' }).click()
  for (const target of batchTargets) {
    await page.getByLabel(`选择模板 ${target.name}`, { exact: true }).check()
  }
  await page.getByRole('button', { name: '预览并补全' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await page.getByRole('button', { name: '保存 2 个字段' }).click()
  await expect(page.getByRole('dialog', { name: 'AI 补全模板元数据' })).toHaveCount(0)
  for (const target of batchTargets) {
    const metadata = await page.evaluate(
      templateId => window.desktop.templateManagement.getMetadata(templateId),
      target.id,
    )
    expect(metadata?.solves).toBe('AI 补全的用途。')
  }
})

test('reviews source citations and locks a classification until the draft changes', async () => {
  const source = await readFile(
    resolve('tests/fixtures/classification-evidence/fenwick.cpp'),
    'utf8',
  )
  await page.getByRole('button', { name: '新建模板' }).click()
  await page
    .getByRole('textbox', { name: '模板源码', exact: true })
    .fill(`${source}\n// S3_EVIDENCE_FIXTURE`)
  await page.getByRole('button', { name: '立即补全' }).click()
  await page.getByRole('button', { name: '确认发送并生成' }).click()
  await expect(page.getByText('待复核原因', { exact: false })).toBeVisible()
  await page.getByText('查看源码证据与提案版本', { exact: true }).click()
  await expect(page.getByText('源码引用已核对', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: '确认创建' })).toBeDisabled()
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1024, 640],
  ]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]?.setSize(size[0]!, size[1]!),
      [width!, height!],
    )
    for (const theme of ['light', 'dark']) {
      await page
        .locator('html')
        .evaluate((root, dark) => root.classList.toggle('dark', dark), theme === 'dark')
      await page.getByText('查看源码证据与提案版本', { exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({
        animations: 'disabled',
        path: resolve(`output/playwright/s3-evidence-${theme}-${width}x${height}.png`),
      })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
      ).toBe(true)
    }
  }
  await page.getByRole('button', { name: '确认此分类' }).click()
  await expect(page.getByRole('button', { name: '确认创建' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '立即补全' })).toBeDisabled()
  await page.getByLabel(/文件名/).fill('数据结构/树状数组/Fenwick 树/人工路径.cpp')
  await expect(page.getByRole('button', { name: '确认创建' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '立即补全' })).toBeEnabled()
  await page.getByRole('button', { name: '关闭新建模板' }).click()
  await expect(
    readFile(
      join(workspaceRoot, 'templates', '数据结构', '树状数组', 'Fenwick 树', '人工路径.cpp'),
    ),
  ).rejects.toThrow()
})
