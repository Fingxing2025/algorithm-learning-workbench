import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
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
let page: Page
let temporaryRoot: string
let userDataDirectory: string
let workspaceAPath: string
let workspaceBPath: string

async function setNextSelection(path: string) {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [selectedPath],
    })) as typeof dialog.showOpenDialog
    dialog.showMessageBox = (async () => ({
      checkboxChecked: false,
      response: 1,
    })) as typeof dialog.showMessageBox
  }, path)
}

async function switchWorkspace(path: string) {
  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await setNextSelection(path)
  await page.getByRole('button', { name: '切换工作区' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.desktop.workspace.getCurrent().then(value => value?.rootPath)),
    )
    .toBe(await realpath(path))
}

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-workspace-boundary-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  workspaceAPath = join(temporaryRoot, 'workspace-a')
  workspaceBPath = join(temporaryRoot, 'workspace-b')
  await mkdir(userDataDirectory)
  await mkdir(workspaceAPath)
  await mkdir(workspaceBPath)
  await writeFile(join(workspaceAPath, 'a-only.cpp'), 'void workspace_a_only() {}\n', 'utf8')
  await writeFile(join(workspaceBPath, 'b-only.cpp'), 'void workspace_b_only() {}\n', 'utf8')

  electronApp = await electron.launch({
    args: [resolve('.')],
    env: { ...process.env, E2E_USER_DATA_DIR: userDataDirectory, NODE_ENV: 'test' },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await dismissGettingStartedGuideIfNeeded(page)
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
})

test.afterAll(async () => {
  await electronApp?.close()
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

test('keeps templates, problems, images, relations, search, and diagnostics in the active workspace', async () => {
  await setNextSelection(workspaceAPath)
  await page.getByRole('button', { name: '选择目录' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.desktop.workspace.getCurrent().then(value => value?.rootPath)),
    )
    .toBe(await realpath(workspaceAPath))
  const workspaceA = await page.evaluate(() => window.desktop.workspace.getCurrent())
  const templateA = workspaceA?.templates[0]
  if (!workspaceA || !templateA) throw new Error('workspace A was not created')
  expect(workspaceA.rootPath).toBe(await realpath(workspaceAPath))

  const problemA = await page.evaluate(async templateId => {
    const problem = await window.desktop.problems.create({
      aiSummary: '',
      analysis: {
        algorithmSignals: [],
        constraints: [],
        edgeCases: [],
        examples: [],
        inputDescription: '',
        outputDescription: '',
      },
      difficulty: null,
      notes: 'workspace A note',
      platform: 'local',
      problemCode: 'A-ONLY',
      statement: 'workspace A statement',
      status: 'attempted',
      tags: ['workspace-a'],
      title: 'A-ONLY-PROBLEM',
      url: null,
    })
    return window.desktop.problems.upsertRelation({
      note: 'A relation',
      problemId: problem.id,
      relationType: 'used',
      templateId,
    })
  }, templateA.id)
  const imagePath = join(temporaryRoot, 'workspace-a-image.png')
  await writeFile(
    imagePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  await setNextSelection(imagePath)
  const problemAWithImage = await page.evaluate(
    problemId => window.desktop.problems.addImages(problemId),
    problemA.id,
  )
  const imageAId = problemAWithImage?.images[0]?.id
  if (!imageAId) throw new Error('workspace A image was not saved')

  await switchWorkspace(workspaceBPath)
  await expect(page.getByText('b-only.cpp', { exact: true })).toBeVisible()
  await expect(page.getByText('a-only.cpp', { exact: true })).toHaveCount(0)
  const workspaceB = await page.evaluate(() => window.desktop.workspace.getCurrent())
  const templateB = workspaceB?.templates[0]
  if (!workspaceB || !templateB) throw new Error('workspace B was not created')
  expect(workspaceB.id).not.toBe(workspaceA.id)
  expect(workspaceB.rootPath).toBe(await realpath(workspaceBPath))

  const problemB = await page.evaluate(() =>
    window.desktop.problems.create({
      aiSummary: '',
      analysis: {
        algorithmSignals: [],
        constraints: [],
        edgeCases: [],
        examples: [],
        inputDescription: '',
        outputDescription: '',
      },
      difficulty: null,
      notes: 'workspace B note',
      platform: 'local',
      problemCode: 'B-ONLY',
      statement: 'workspace B statement',
      status: 'unattempted',
      tags: ['workspace-b'],
      title: 'B-ONLY-PROBLEM',
      url: null,
    }),
  )
  await expect
    .poll(() => page.evaluate(() => window.desktop.problems.list()))
    .toEqual([expect.objectContaining({ id: problemB.id, title: 'B-ONLY-PROBLEM' })])

  const crossWorkspaceErrors = await page.evaluate(
    async ({ imageId, problemAId, problemBId, templateAId, templateBId }) => {
      const capture = async (operation: () => Promise<unknown>) => {
        try {
          await operation()
          return null
        } catch (error) {
          return error instanceof Error ? error.message : String(error)
        }
      }
      return {
        deleteProblem: await capture(() =>
          window.desktop.problems.delete({ problemId: problemAId }),
        ),
        getProblem: await capture(() => window.desktop.problems.get({ problemId: problemAId })),
        readImage: await capture(() => window.desktop.problems.readImage(imageId)),
        relateCurrentProblemToOtherTemplate: await capture(() =>
          window.desktop.problems.upsertRelation({
            note: '',
            problemId: problemBId,
            relationType: 'used',
            templateId: templateAId,
          }),
        ),
        relateOtherProblemToCurrentTemplate: await capture(() =>
          window.desktop.problems.upsertRelation({
            note: '',
            problemId: problemAId,
            relationType: 'used',
            templateId: templateBId,
          }),
        ),
      }
    },
    {
      imageId: imageAId,
      problemAId: problemA.id,
      problemBId: problemB.id,
      templateAId: templateA.id,
      templateBId: templateB.id,
    },
  )
  expect(crossWorkspaceErrors.getProblem).toContain('题目卡片不存在')
  expect(crossWorkspaceErrors.deleteProblem).toContain('题目卡片不存在')
  expect(crossWorkspaceErrors.readImage).toContain('题目图片不存在')
  expect(crossWorkspaceErrors.relateCurrentProblemToOtherTemplate).toContain('所选模板当前不可用')
  expect(crossWorkspaceErrors.relateOtherProblemToCurrentTemplate).toContain('题目卡片不存在')

  // The test creates through the typed preload API, so refresh the Renderer-owned page snapshot.
  await switchWorkspace(workspaceBPath)
  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'B-ONLY-PROBLEM' })).toBeVisible()
  await expect(page.getByText('A-ONLY-PROBLEM', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '工作台', exact: true }).click()
  await expect(page.getByText('A-ONLY-PROBLEM', { exact: true })).toHaveCount(0)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  const searchInput = page.getByRole('textbox', { name: '搜索模板、题目或操作' })
  await searchInput.fill('A-ONLY-PROBLEM')
  await expect(page.getByText('A-ONLY-PROBLEM', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')

  const diagnosticsB = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(diagnosticsB.counts).toMatchObject({
    problemImages: 0,
    problems: 1,
    templateProblemRelations: 0,
    templates: 1,
    workspaces: 1,
  })

  await switchWorkspace(workspaceAPath)
  await expect(page.getByText('a-only.cpp', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A-ONLY-PROBLEM' })).toBeVisible()
  await expect(page.getByText('B-ONLY-PROBLEM', { exact: true })).toHaveCount(0)
  const restoredA = await page.evaluate(
    ({ imageId, problemId }) =>
      Promise.all([
        window.desktop.problems.get({ problemId }),
        window.desktop.problems.readImage(imageId),
        window.desktop.dataManagement.diagnose(),
      ]),
    { imageId: imageAId, problemId: problemA.id },
  )
  expect(restoredA[0]).toMatchObject({ id: problemA.id, title: 'A-ONLY-PROBLEM' })
  expect(restoredA[1].dataUrl).toMatch(/^data:image\/png;base64,/u)
  expect(restoredA[2].counts).toMatchObject({
    problemImages: 1,
    problems: 1,
    templateProblemRelations: 1,
    templates: 1,
    workspaces: 1,
  })
  expect(await readFile(join(workspaceAPath, 'templates', 'a-only.cpp'), 'utf8')).toBe(
    'void workspace_a_only() {}\n',
  )
  expect(await readFile(join(workspaceBPath, 'templates', 'b-only.cpp'), 'utf8')).toBe(
    'void workspace_b_only() {}\n',
  )
  await expect(readFile(join(workspaceAPath, '.awb', 'workspace.sqlite'))).resolves.toBeTruthy()
  await expect(readFile(join(workspaceBPath, '.awb', 'workspace.sqlite'))).resolves.toBeTruthy()
})
