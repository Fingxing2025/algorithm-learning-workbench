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
      `int solve_${index}(int value) { return value + ${index}; }\n`,
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
    const highlightedSource = page.getByLabel('高亮模板源码')
    await expect(highlightedSource.locator('.hljs-type').first()).toBeVisible()
    await page.getByLabel('代码主题').selectOption('vscode-dark')
    await expect(highlightedSource).toHaveAttribute('data-code-theme', 'vscode-dark')
    await page.screenshot({
      animations: 'disabled',
      path: resolve('output/playwright/code-theme-vscode-dark-1280x720.png'),
    })

    await page.evaluate(async () => {
      const renderer = globalThis as unknown as {
        desktop: {
          problems: {
            create: (request: {
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
