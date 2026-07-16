import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('scrolls large template and problem lists and switches the code theme', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-scroll-e2e-'))
  const userDataDirectory = join(temporaryRoot, 'user-data')
  const workspaceRoot = join(temporaryRoot, 'workspace')
  await mkdir(userDataDirectory)
  await mkdir(workspaceRoot)
  for (let index = 0; index < 48; index += 1) {
    const directory = join(workspaceRoot, `分类-${String(index).padStart(2, '0')}`)
    await mkdir(directory)
    await writeFile(
      join(directory, `template_${String(index).padStart(2, '0')}.cpp`),
      index === 0
        ? `#include <bits/stdc++.h>\n\nusing namespace std;\n\nint solve(int value) {\n  vector<int> candidates = {1, 2, 3};\n  return value + candidates.front(); // 示例返回值\n}\n`
        : `int solve_${index}(int value) { return value + ${index}; }\n`,
      'utf8',
    )
  }

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

    const templateTree = page.getByRole('tree', { name: '模板树' })
    await expect(templateTree).toBeVisible()
    expect(
      await templateTree.evaluate(element => element.scrollHeight > element.clientHeight),
    ).toBe(true)
    await templateTree.evaluate(element => {
      element.scrollTop = element.scrollHeight
    })
    expect(await templateTree.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    await templateTree.evaluate(element => {
      element.scrollTop = 0
    })

    await page.getByText('template_00.cpp').click()
    const templateSummary = page.getByLabel('模板摘要')
    await expect(templateSummary).not.toContainText('时间复杂度')
    const codeViewer = page.getByLabel('模板代码查看器')
    expect((await codeViewer.boundingBox())?.height).toBeGreaterThanOrEqual(440)
    const highlightedSource = page.getByLabel('高亮模板源码')
    const firstCodeLine = highlightedSource.locator('.cm-line').first()
    await expect(firstCodeLine).toBeVisible()
    await expect(highlightedSource).toContainText('#include <bits/stdc++.h>')
    const codeToolbar = page.getByLabel('代码查看器工具栏')
    const toolbarBounds = await codeToolbar.boundingBox()
    const firstCodeLineBounds = await firstCodeLine.boundingBox()
    expect(firstCodeLineBounds?.y).toBeLessThanOrEqual(
      (toolbarBounds?.y ?? 0) + (toolbarBounds?.height ?? 0) + 3,
    )
    const switchToLight = page.getByRole('button', { name: '切换到浅色主题' })
    if (await switchToLight.count()) await switchToLight.click()
    await page.getByLabel('代码主题').selectOption('system')
    await expect(highlightedSource).toHaveAttribute('data-code-theme', 'vscode-light')
    await expect(codeToolbar).toHaveCSS('background-color', 'rgb(246, 248, 250)')
    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/code-viewer-system-light-1280x720.png'),
    })
    await page.getByLabel('代码主题').selectOption('vscode-dark')
    await expect(highlightedSource).toHaveAttribute('data-code-theme', 'vscode-dark')
    await expect(highlightedSource.locator('.cm-cpp-header').first()).toHaveCSS(
      'color',
      'rgb(206, 145, 120)',
    )
    await expect(highlightedSource.locator('.cm-cpp-primitive-type').first()).toHaveCSS(
      'color',
      'rgb(86, 156, 214)',
    )
    await expect(highlightedSource.locator('.cm-rainbow-bracket-0').first()).toBeVisible()
    await expect(highlightedSource.locator('.cm-indent-guides').first()).toBeVisible()
    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/code-theme-vscode-dark-1280x720.png'),
    })
    await page.getByRole('button', { name: '切换到深色主题' }).click()
    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/code-viewer-dark-1280x720.png'),
    })
    await page.getByRole('button', { name: '切换到浅色主题' }).click()
    await page.getByRole('button', { name: '进入代码专注模式' }).click()
    await expect(codeViewer).toHaveAttribute('data-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(codeViewer).toHaveAttribute('data-expanded', 'false')

    await page.evaluate(async () => {
      const renderer = globalThis as unknown as {
        desktop: {
          problems: {
            create: (request: {
              aiSummary: string
              analysis: {
                algorithmSignals: string[]
                constraints: string[]
                edgeCases: string[]
                examples: []
                inputDescription: string
                outputDescription: string
              }
              difficulty: string
              notes: string
              platform: string
              problemCode: string
              statement: string
              status: 'unattempted'
              tags: string[]
              title: string
              url: null
            }) => Promise<unknown>
          }
        }
      }
      for (let index = 0; index < 36; index += 1) {
        await renderer.desktop.problems.create({
          aiSummary: '',
          analysis: {
            algorithmSignals: [],
            constraints: [],
            edgeCases: [],
            examples: [],
            inputDescription: '',
            outputDescription: '',
          },
          difficulty: '测试',
          notes: '',
          platform: '滚动测试',
          problemCode: `SCROLL-${index}`,
          statement: '用于验证题目列表的独立滚动区域。',
          status: 'unattempted',
          tags: ['滚动'],
          title: `滚动测试题 ${String(index).padStart(2, '0')}`,
          url: null,
        })
      }
    })
    await page.reload()
    await page.getByRole('button', { name: '题目', exact: true }).click()
    const problemList = page.getByLabel('题目列表')
    await expect(problemList).toBeVisible()
    expect(await problemList.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(
      true,
    )
    await problemList.evaluate(element => {
      element.scrollTop = element.scrollHeight
    })
    expect(await problemList.evaluate(element => element.scrollTop)).toBeGreaterThan(0)

    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/scroll-and-code-theme-1280x720.png'),
    })
  } finally {
    await electronApp.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
