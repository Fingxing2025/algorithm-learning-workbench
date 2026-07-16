import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test, type Page } from '@playwright/test'

async function expectNoChineseInterfaceText(page: Page) {
  const visibleInterface = await page.evaluate(() => {
    const browser = globalThis as unknown as {
      document: {
        body: { innerText: string }
        querySelectorAll: (selector: string) => ArrayLike<{
          getAttribute: (attribute: string) => string | null
        }>
      }
    }
    const attributeText = [
      ...Array.from(browser.document.querySelectorAll('[aria-label], [placeholder], [title]')),
    ]
      .flatMap(element =>
        ['aria-label', 'placeholder', 'title']
          .map(attribute => element.getAttribute(attribute))
          .filter((value): value is string => Boolean(value)),
      )
      .join('\n')
    return `${browser.document.body.innerText}\n${attributeText}`
  })
  expect(visibleInterface).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u)
}

test('scrolls the dashboard, opens summary cards, and persists both interface languages', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-dashboard-e2e-'))
  const userDataDirectory = join(temporaryRoot, 'user-data')
  const workspaceRoot = join(temporaryRoot, 'workspace')
  await mkdir(userDataDirectory)
  await mkdir(workspaceRoot)
  await writeFile(join(workspaceRoot, 'dijkstra.cpp'), 'void dijkstra() {}\n', 'utf8')

  const electronApp = await electron.launch({
    args: [resolve('.')],
    env: { ...process.env, E2E_USER_DATA_DIR: userDataDirectory, NODE_ENV: 'test' },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await electronApp.evaluate(({ BrowserWindow, dialog }, selectedPath) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1280, 720)
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [selectedPath],
      })) as typeof dialog.showOpenDialog
    }, workspaceRoot)
    await page.getByRole('button', { name: '选择目录' }).click()
    await page.getByRole('button', { name: '工作台' }).click()

    const dashboard = page.getByTestId('dashboard-scroll-region')
    await expect(dashboard).toBeVisible()
    expect(await dashboard.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(
      true,
    )
    await dashboard.evaluate(element => {
      element.scrollTop = element.scrollHeight
    })
    expect(await dashboard.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    await dashboard.evaluate(element => {
      element.scrollTop = 0
    })

    await page.getByRole('button', { name: /算法模板.*打开模板库/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: '模板库' })).toBeVisible()
    await page.getByRole('button', { name: '工作台' }).click()
    await page.getByRole('button', { name: /题目卡片.*打开题目库/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: '题目卡片' })).toBeVisible()
    await page.getByRole('button', { name: '工作台' }).click()
    await page.getByRole('button', { name: /待确认计划.*打开 AI 管理/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: '总体文件 AI 管理' })).toBeVisible()
    await page.getByRole('button', { name: '工作台' }).click()

    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/dashboard-zh-light-1280x720.png'),
    })

    await page.getByRole('button', { name: '切换到英文界面' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Workbench' })).toBeVisible()
    await expect(page.getByRole('button', { exact: true, name: 'Templates' })).toBeVisible()
    await expect(page).toHaveTitle('Algorithm Learning Workbench V2')
    expect(await page.locator('html').getAttribute('lang')).toBe('en')
    expect(await page.evaluate(() => localStorage.getItem('ui:locale'))).toBe('en')
    await expectNoChineseInterfaceText(page)
    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/dashboard-en-light-1280x720.png'),
    })

    await page.getByRole('button', { exact: true, name: 'Templates' }).click()
    await expectNoChineseInterfaceText(page)
    await page.getByRole('button', { name: 'New template' }).last().click()
    await expectNoChineseInterfaceText(page)
    await expect(page.getByText('Problem solved', { exact: true })).toBeVisible()
    await expect(page.getByText('Applicable constraints', { exact: true })).toBeVisible()
    await expect(page.getByText('Prerequisites', { exact: true })).toBeVisible()
    await expect(page.getByText('Common mistakes', { exact: true })).toBeVisible()
    await expect(page.getByText('Template notes', { exact: true })).toBeVisible()
    await expect(
      page.getByPlaceholder('Describe the core problem this template solves…'),
    ).toBeVisible()
    await expect(
      page.getByPlaceholder('Data ranges, edge weights, or input conditions…'),
    ).toBeVisible()
    await expect(
      page.getByPlaceholder('Required data structures or algorithm concepts…'),
    ).toBeVisible()
    await expect(page.getByPlaceholder('Error-prone or commonly missed edge cases…')).toBeVisible()
    await expect(page.getByPlaceholder('Personal notes stored only on this device…')).toBeVisible()
    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/create-template-metadata-en-1280x720.png'),
    })
    const templateCloseButton = page.getByRole('button', { name: 'Close new template dialog' })
    const closeBounds = await templateCloseButton.boundingBox()
    expect(closeBounds?.width).toBeGreaterThanOrEqual(44)
    expect(closeBounds?.height).toBeGreaterThanOrEqual(44)
    const closeCornerHitDiagnostics = await templateCloseButton.evaluate(target => {
      const button = target as unknown as {
        contains: (node: unknown) => boolean
        getBoundingClientRect: () => { bottom: number; left: number; right: number; top: number }
      }
      const browser = globalThis as unknown as {
        document: {
          elementFromPoint: (
            x: number,
            y: number,
          ) => { getAttribute: (name: string) => string | null; tagName: string } | null
        }
      }
      const bounds = button.getBoundingClientRect()
      return (
        [
          ['top-left', bounds.left + 3, bounds.top + 3],
          ['top-right', bounds.right - 3, bounds.top + 3],
          ['bottom-left', bounds.left + 3, bounds.bottom - 3],
          ['bottom-right', bounds.right - 3, bounds.bottom - 3],
        ] as const
      ).map(([corner, x, y]) => {
        const hit = browser.document.elementFromPoint(x, y)
        return {
          className: hit?.getAttribute('class') ?? null,
          corner,
          hitButton: button.contains(hit),
          tagName: hit?.tagName ?? null,
        }
      })
    })
    expect(closeCornerHitDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ corner: 'top-left', hitButton: true }),
        expect.objectContaining({ corner: 'top-right', hitButton: true }),
        expect.objectContaining({ corner: 'bottom-left', hitButton: true }),
        expect.objectContaining({ corner: 'bottom-right', hitButton: true }),
      ]),
    )
    await page.mouse.click(
      closeBounds!.x + closeBounds!.width - 3,
      closeBounds!.y + closeBounds!.height - 3,
    )
    await expect(templateCloseButton).toHaveCount(0)

    await page.getByRole('button', { exact: true, name: 'Problems' }).click()
    await expectNoChineseInterfaceText(page)
    await page.getByRole('button', { name: 'New problem' }).click()
    await expectNoChineseInterfaceText(page)
    await page.getByRole('button', { name: 'Close problem editor' }).click()

    await page.getByRole('button', { exact: true, name: 'AI Management' }).click()
    await page.getByRole('button', { name: 'Read-only scan' }).click()
    await expect(page.getByText(/Read-only scan complete/)).toBeVisible()
    await expectNoChineseInterfaceText(page)
    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/file-audit-en-1280x720.png'),
    })

    await page.evaluate(async () => {
      const scope = globalThis as unknown as {
        desktop: {
          aiProviders: {
            create: (request: {
              baseUrl: string
              capabilities: {
                promptCaching: boolean
                streaming: boolean
                structuredOutput: boolean
                vision: boolean
              }
              customHeaders: Record<string, string>
              model: string
              name: string
              protocol: 'ollama-chat'
              timeoutMs: number
            }) => Promise<unknown>
          }
        }
      }
      await scope.desktop.aiProviders.create({
        baseUrl: 'http://localhost:11434',
        capabilities: {
          promptCaching: false,
          streaming: true,
          structuredOutput: true,
          vision: false,
        },
        customHeaders: {},
        model: 'llama3',
        name: 'Test Ollama',
        protocol: 'ollama-chat',
        timeoutMs: 30_000,
      })
    })
    await page.reload()
    await page.getByRole('button', { name: 'AI Settings' }).click()
    await expectNoChineseInterfaceText(page)
    await page.getByRole('button', { name: /Test Ollama/ }).click()
    await expect(page.getByText('Problem image analysis')).toBeVisible()
    await expectNoChineseInterfaceText(page)
    await page.getByText('Problem image analysis').scrollIntoViewIfNeeded()
    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/ai-provider-en-1280x720.png'),
    })

    await page.getByRole('button', { exact: true, name: 'Workbench' }).click()

    await page.getByRole('button', { name: 'Switch to dark theme' }).click()
    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/dashboard-en-dark-1280x720.png'),
    })
    await page.getByRole('button', { name: 'Switch to Chinese' }).click()
    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/dashboard-zh-dark-1280x720.png'),
    })

    await page.getByRole('button', { name: '切换到浅色主题' }).click()
    await page.getByRole('button', { name: '切换到英文界面' }).click()
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900)
    })
    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/dashboard-en-light-1440x900.png'),
    })

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Workbench' })).toBeVisible()
    expect(await page.locator('html').getAttribute('lang')).toBe('en')
  } finally {
    await electronApp.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
