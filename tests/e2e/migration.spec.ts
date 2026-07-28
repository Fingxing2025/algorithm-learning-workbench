import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

import type { DesktopApi } from '@core/contracts/desktop-api'

import { dismissGettingStartedGuideIfNeeded } from './helpers/getting-started'

declare const window: { desktop: DesktopApi }

test('upgrades an existing folder into the only current workspace layout', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-folder-upgrade-'))
  const userDataDirectory = join(temporaryRoot, 'user-data')
  const workspaceRoot = join(temporaryRoot, '算法模板')
  const sourceBytes = Buffer.from('// 中文模板\r\nint shortest_path() { return 1; }\r\n', 'utf8')
  await mkdir(userDataDirectory)
  await mkdir(join(workspaceRoot, '图论'), { recursive: true })
  await writeFile(join(workspaceRoot, '图论', '最短路.cpp'), sourceBytes)
  await writeFile(join(workspaceRoot, 'README.md'), '# 工作区说明\n', 'utf8')

  let electronApp: ElectronApplication | null = null
  try {
    electronApp = await electron.launch({
      args: [resolve('.')],
      env: { ...process.env, E2E_USER_DATA_DIR: userDataDirectory, NODE_ENV: 'test' },
    })
    let page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await dismissGettingStartedGuideIfNeeded(page)
    await electronApp.evaluate(({ dialog }, selectedDirectory) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [selectedDirectory],
      })) as typeof dialog.showOpenDialog
      dialog.showMessageBox = (async () => ({
        checkboxChecked: false,
        response: 1,
      })) as typeof dialog.showMessageBox
    }, workspaceRoot)

    await page.getByRole('button', { name: '选择目录' }).click()
    await page.getByRole('treeitem', { name: '图论' }).click()
    await expect(page.getByText('最短路.cpp')).toBeVisible()
    const current = await page.evaluate(() => window.desktop.workspace.getCurrent())
    expect(current).toMatchObject({
      available: true,
      rootPath: await realpath(workspaceRoot),
    })

    const marker = JSON.parse(
      await readFile(join(workspaceRoot, 'workspace.awb.json'), 'utf8'),
    ) as Record<string, unknown>
    expect(marker).toMatchObject({
      formatVersion: 2,
      templateDirectory: 'templates',
    })
    await expect(stat(join(workspaceRoot, '.awb', 'workspace.sqlite'))).resolves.toBeTruthy()
    await expect(readFile(join(workspaceRoot, 'templates', '图论', '最短路.cpp'))).resolves.toEqual(
      sourceBytes,
    )
    await expect(readFile(join(workspaceRoot, 'templates', 'README.md'), 'utf8')).resolves.toBe(
      '# 工作区说明\n',
    )
    await expect(readFile(join(workspaceRoot, '图论', '最短路.cpp'))).rejects.toMatchObject({
      code: 'ENOENT',
    })

    await electronApp.close()
    electronApp = await electron.launch({
      args: [resolve('.')],
      env: { ...process.env, E2E_USER_DATA_DIR: userDataDirectory, NODE_ENV: 'test' },
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await dismissGettingStartedGuideIfNeeded(page)
    await page.getByRole('button', { name: '模板库', exact: true }).click()
    await expect(page.evaluate(() => window.desktop.workspace.getCurrent())).resolves.toMatchObject(
      {
        rootPath: await realpath(workspaceRoot),
        templates: [expect.objectContaining({ relativePath: '图论/最短路.cpp' })],
      },
    )
  } finally {
    await electronApp?.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})

test('rejects previous workspace markers instead of opening a compatibility path', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-old-marker-'))
  const userDataDirectory = join(temporaryRoot, 'user-data')
  const workspaceRoot = join(temporaryRoot, 'previous-workspace')
  await mkdir(userDataDirectory)
  await mkdir(workspaceRoot)
  await writeFile(join(workspaceRoot, 'old.cpp'), 'int old_format;\n')
  await writeFile(
    join(workspaceRoot, 'workspace.awb.json'),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      formatVersion: 1,
      name: '旧格式',
      templateDirectory: '.',
      workspaceId: '50000000-0000-4000-8000-000000000001',
    }),
  )

  let electronApp: ElectronApplication | null = null
  try {
    electronApp = await electron.launch({
      args: [resolve('.')],
      env: { ...process.env, E2E_USER_DATA_DIR: userDataDirectory, NODE_ENV: 'test' },
    })
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await dismissGettingStartedGuideIfNeeded(page)
    await electronApp.evaluate(({ dialog }, selectedDirectory) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [selectedDirectory],
      })) as typeof dialog.showOpenDialog
    }, workspaceRoot)

    await page.getByRole('button', { name: '选择目录' }).click()
    await expect(page.getByText('工作区标记已损坏或版本不受支持。')).toBeVisible()
    await expect(readFile(join(workspaceRoot, 'old.cpp'), 'utf8')).resolves.toBe(
      'int old_format;\n',
    )
    await expect(stat(join(workspaceRoot, 'templates'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await electronApp?.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
