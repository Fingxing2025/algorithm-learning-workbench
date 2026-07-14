import { createServer, type Server } from 'node:http'
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
let mockBaseUrl: string
let mockServer: Server
let page: Page
let sourcePath: string
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

test.beforeAll(async () => {
  mockServer = createServer((request, response) => {
    request.resume()
    request.on('end', () => {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  commonMistakes: '优先队列弹出后忘记判断过期距离。',
                  constraints: '边权非负。',
                  prerequisites: '邻接表、优先队列。',
                  solves: '单源非负权最短路径。',
                  spaceComplexity: 'O(n + m)',
                  suggestedRelativePath: '图论/最短路/dijkstra.cpp',
                  tags: ['图论', '最短路', 'Dijkstra'],
                  timeComplexity: 'O((n + m) log n)',
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

  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-intake-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  workspaceRoot = join(temporaryRoot, 'workspace')
  sourcePath = join(temporaryRoot, 'dijkstra.cpp')
  await mkdir(userDataDirectory)
  await mkdir(workspaceRoot)
  await writeFile(sourcePath, 'void dijkstra() { /* imported */ }\n', 'utf8')
  await launchApplication()
})

test.afterAll(async () => {
  await electronApp?.close()
  await new Promise<void>((resolveClose, reject) =>
    mockServer?.close(error => (error ? reject(error) : resolveClose())),
  )
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

test('imports a source file through an AI classification preview without overwriting', async () => {
  await setNextSelection(workspaceRoot)
  await page.getByRole('button', { name: '创建工作区' }).click()
  await page.getByRole('button', { name: 'AI 管理' }).click()
  await page.getByLabel('Provider 显示名称').fill('模板分类测试')
  await page.getByLabel('Base URL').fill(mockBaseUrl)
  await page.getByLabel('模型名称').fill('fixture-metadata')
  await page.getByLabel('API Key').fill('intake-e2e-secret')
  await page.getByRole('button', { name: '保存 Provider' }).click()
  await page.getByRole('button', { name: /模板元数据补全/ }).click()

  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await page.getByRole('button', { name: '新建模板' }).click()
  await setNextSelection(sourcePath)
  await page.getByRole('button', { name: '导入源码文件' }).click()
  await expect(page.getByLabel(/文件名/)).toHaveValue('dijkstra.cpp')
  await expect(page.getByLabel('模板源码')).toContainText('imported')
  await page.getByRole('button', { name: 'AI 分类并补全元数据' }).click()
  await expect(page.getByLabel(/文件名/)).toHaveValue('图论/最短路/dijkstra.cpp')
  await expect(page.getByText(/模板分类测试.*fixture-metadata/)).toBeVisible()
  await page.getByRole('button', { name: '确认创建' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'dijkstra' })).toBeVisible()
  await expect(page.getByText('O((n + m) log n)')).toBeVisible()
  await expect(page.getByText('单源非负权最短路径。')).toBeVisible()
  expect(await readFile(join(workspaceRoot, '图论', '最短路', 'dijkstra.cpp'), 'utf8')).toBe(
    'void dijkstra() { /* imported */ }\n',
  )
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
