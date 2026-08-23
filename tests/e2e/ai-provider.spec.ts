import { createServer, type IncomingMessage, type Server } from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

import { dismissGettingStartedGuideIfNeeded } from './helpers/getting-started'

let electronApp: ElectronApplication
let mockServer: Server
let mockBaseUrl: string
let page: Page
let temporaryRoot: string
let userDataDirectory: string
const requests: Array<{ body: string; headers: IncomingMessage['headers']; url: string }> = []

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

test.beforeAll(async () => {
  mockServer = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(Buffer.from(chunk)))
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      requests.push({ body, headers: request.headers, url: request.url ?? '' })
      const parsed = JSON.parse(body) as { model?: string }
      response.setHeader('content-type', 'application/json')
      if (parsed.model === 'missing-model') {
        response.statusCode = 404
        response.end('{}')
      } else if (request.url === '/v1/chat/completions') {
        response.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }))
      } else if (request.url === '/v1/messages') {
        response.end(JSON.stringify({ content: [{ text: 'OK', type: 'text' }] }))
      } else if (request.url === '/v1/responses') {
        response.end(JSON.stringify({ output_text: 'OK' }))
      } else {
        response.statusCode = 404
        response.end('{}')
      }
    })
  })
  await new Promise<void>(resolveListen => mockServer.listen(0, '127.0.0.1', resolveListen))
  const address = mockServer.address()
  if (!address || typeof address === 'string') throw new Error('mock server did not start')
  mockBaseUrl = `http://127.0.0.1:${address.port}/v1`

  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-ai-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  await mkdir(userDataDirectory)
  await launchApplication()
})

test.afterAll(async () => {
  await electronApp?.close()
  await new Promise<void>((resolveClose, reject) =>
    mockServer?.close(error => (error ? reject(error) : resolveClose())),
  )
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

async function fillProvider(values: {
  apiKey: string
  model: string
  name: string
  protocol: string
}) {
  await page.getByLabel('Provider 显示名称').fill(values.name)
  await page.getByLabel('Provider 协议').selectOption(values.protocol)
  await page.getByLabel('Base URL').fill(mockBaseUrl)
  await page.getByLabel('模型名称').fill(values.model)
  await page.getByLabel('API Key').fill(values.apiKey)
  await page.getByRole('button', { name: '保存 Provider' }).click()
  await expect(page.getByRole('status')).toContainText('Provider 已安全保存')
}

test('configures and tests two different provider protocols from a zero-data desktop', async () => {
  await page.getByRole('button', { name: 'AI 设置' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'AI 设置' })).toBeVisible()
  await expect(page.getByText('还没有 AI Provider')).toBeVisible()

  await page.getByRole('button', { name: '使用预设 DeepSeek' }).click()
  await expect(page.getByLabel('Provider 显示名称')).toHaveValue('DeepSeek')
  await expect(page.getByLabel('Provider 协议')).toHaveValue('openai-chat-completions')
  await expect(page.getByLabel('Base URL')).toHaveValue('https://api.deepseek.com/v1')
  await expect(page.getByLabel('模型名称')).toHaveValue('deepseek-v4-flash')

  await page.getByRole('button', { name: '使用预设 阿里云百炼' }).click()
  await expect(page.getByLabel('Provider 显示名称')).toHaveValue('阿里云百炼')
  await expect(page.getByLabel('Base URL')).toHaveValue(
    'https://ws-q88wpweukv7ai50n.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  )
  await expect(page.getByLabel('Base URL')).toHaveAttribute(
    'placeholder',
    'https://ws-q88wpweukv7ai50n.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  )
  await expect(page.getByLabel('模型名称')).toHaveValue('qwen3-vl-plus')
  await expect(page.getByLabel('视觉输入')).toBeChecked()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/provider-presets-light.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/provider-presets-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/provider-presets-dark.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))

  await fillProvider({
    apiKey: 'openai-e2e-secret',
    model: 'fixture-openai',
    name: 'OpenAI 测试服务',
    protocol: 'openai-chat-completions',
  })
  await page.getByRole('button', { name: '测试连接' }).click()
  await expect(page.getByRole('status')).toContainText('连接成功')
  expect(requests.at(-1)).toMatchObject({ url: '/v1/chat/completions' })
  expect(requests.at(-1)?.headers.authorization).toBe('Bearer openai-e2e-secret')
  expect(requests.at(-1)?.body).not.toContain('openai-e2e-secret')

  await page.getByRole('button', { name: '添加 Provider' }).click()
  await fillProvider({
    apiKey: 'anthropic-e2e-secret',
    model: 'fixture-anthropic',
    name: 'Anthropic 测试服务',
    protocol: 'anthropic-messages',
  })
  await page.getByRole('button', { name: '测试连接' }).click()
  await expect(page.getByRole('status')).toContainText('连接成功')
  expect(requests.at(-1)).toMatchObject({ url: '/v1/messages' })
  expect(requests.at(-1)?.headers['x-api-key']).toBe('anthropic-e2e-secret')

  const databaseBytes = await readFile(join(userDataDirectory, 'algorithm-workbench.sqlite'))
  expect(databaseBytes.includes(Buffer.from('openai-e2e-secret'))).toBe(false)
  expect(databaseBytes.includes(Buffer.from('anthropic-e2e-secret'))).toBe(false)
  const secretFiles = await readdir(join(userDataDirectory, 'secrets'))
  expect(secretFiles).toHaveLength(2)
  for (const file of secretFiles) {
    const encrypted = await readFile(join(userDataDirectory, 'secrets', file))
    expect(encrypted.includes(Buffer.from('e2e-secret'))).toBe(false)
  }
})

test('scrolls provider detail independently with wheel and keyboard at normal and compact sizes', async () => {
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await expect
    .poll(async () =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getSize()),
    )
    .toEqual([1280, 720])
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click()
  const detail = page.getByTestId('provider-detail-scroll')
  const providerList = page.getByTestId('provider-list-scroll')
  await expect(detail).toBeVisible()
  const initialMetrics = await detail.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }))
  expect(initialMetrics.scrollHeight).toBeGreaterThan(initialMetrics.clientHeight)
  await detail.evaluate(element => {
    element.scrollTop = 0
  })
  const listScrollTop = await providerList.evaluate(element => element.scrollTop)
  const bounds = await detail.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await page.mouse.wheel(0, 520)
  await expect.poll(() => detail.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  const afterWheel = await detail.evaluate(element => element.scrollTop)
  expect(await providerList.evaluate(element => element.scrollTop)).toBe(listScrollTop)

  await detail.focus()
  await page.keyboard.press('PageDown')
  await expect.poll(() => detail.evaluate(element => element.scrollTop)).toBeGreaterThan(afterWheel)
  await page.keyboard.press('End')
  await expect
    .poll(() =>
      detail.evaluate(element =>
        Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop),
      ),
    )
    .toBeLessThanOrEqual(2)
  await expect(page.getByRole('button', { name: '保存更改' })).toBeInViewport()
  await expect(page.getByRole('button', { name: '删除配置' })).toBeInViewport()
  await page.getByRole('button', { name: '保存更改' }).click()
  await expect(page.getByRole('status')).toContainText('Provider 配置已更新')
  await detail.focus()
  await page.keyboard.press('Home')
  await expect.poll(() => detail.evaluate(element => element.scrollTop)).toBe(0)

  await page.getByRole('button', { name: /OpenAI 测试服务/ }).click()
  await detail.evaluate(element => {
    element.scrollTop = 0
  })
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await page.mouse.wheel(0, 360)
  await expect.poll(() => detail.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/ai-provider-scroll-light-1280x720.png'),
  })

  await page.getByRole('button', { name: '添加 Provider' }).click()
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 640),
  )
  await expect
    .poll(async () =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getSize()),
    )
    .toEqual([1024, 640])
  expect(await detail.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  await page.getByRole('button', { name: '切换到深色主题' }).click()
  await detail.focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('button', { name: '保存 Provider' })).toBeInViewport()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/ai-provider-scroll-dark-1024x640.png'),
  })
  await page.getByRole('button', { name: '切换到浅色主题' }).click()
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.getByRole('button', { name: /Anthropic 测试服务/ }).click()
})

test('shows actionable model errors and captures light, compact, and dark provider states', async () => {
  await page.getByLabel('模型名称').fill('missing-model')
  await page.getByRole('button', { name: '保存更改' }).click()
  await expect(page.getByRole('status')).toContainText('Provider 配置已更新')
  await page.getByRole('button', { name: '测试连接' }).click()
  await expect(page.getByRole('alert')).toContainText('模型或接口不存在')

  await page.getByRole('button', { name: '关闭 AI 提示' }).click()
  await page.getByLabel('模型名称').fill('fixture-anthropic')
  await page.getByRole('button', { name: '保存更改' }).click()
  await page.getByRole('heading', { level: 2, name: 'Anthropic 测试服务' }).scrollIntoViewIfNeeded()
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage3-ai-providers-light.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage3-ai-providers-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.getByRole('button', { name: '切换到深色主题' }).click()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/stage3-ai-providers-dark.png'),
  })
})

test('restores provider metadata and decrypts the saved key after a desktop restart', async () => {
  await electronApp.close()
  await launchApplication()
  await page.getByRole('button', { name: 'AI 设置' }).click()
  await expect(page.getByText('2 个配置')).toBeVisible()
  await page.getByRole('button', { name: /Anthropic 测试服务/ }).click()
  await expect(page.getByText('密钥已保存')).toBeVisible()
  await page.getByRole('button', { name: '测试连接' }).click()
  await expect(page.getByRole('status')).toContainText('连接成功')
  expect(requests.at(-1)?.headers['x-api-key']).toBe('anthropic-e2e-secret')
})
