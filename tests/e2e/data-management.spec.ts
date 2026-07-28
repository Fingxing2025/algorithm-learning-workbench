import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

import type { DesktopApi } from '@core/contracts/desktop-api'
import type { BackupManifestV2 } from '@core/contracts/data-management'
import iconv from 'iconv-lite'
import {
  createPortableBackupArchive,
  extractPortableBackupArchive,
  type PortableArchiveSource,
} from '../../src/main/services/portable-backup-archive'

declare const window: { desktop: DesktopApi }

let electronApp: ElectronApplication
let page: Page
let temporaryRoot: string
let userDataDirectory: string
let blankWorkspacePath: string
let workspaceBPath: string

test.describe.configure({ mode: 'serial' })

async function launchApplication(extraEnv: Record<string, string> = {}) {
  electronApp = await electron.launch({
    args: [resolve('.')],
    env: { ...process.env, ...extraEnv, E2E_USER_DATA_DIR: userDataDirectory, NODE_ENV: 'test' },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
}

async function seedV2Data(
  workspacePath: string,
  imagePath: string,
  options: { createProvider?: boolean; label?: string } = {},
) {
  const label = options.label ?? 'Restore E2E'
  await setNextSelection(workspacePath)
  const snapshot = await page.evaluate(() => window.desktop.workspace.choose({ intent: 'open' }))
  const template = snapshot?.templates[0]
  if (!template) throw new Error('seed workspace did not produce a template')
  const problem = await page.evaluate(
    async ({ label, templateId }) => {
      const createdProblem = await window.desktop.problems.create({
        aiSummary: `${label} summary`,
        analysis: {
          algorithmSignals: ['graph'],
          constraints: [],
          edgeCases: [],
          examples: [],
          inputDescription: '',
          outputDescription: '',
        },
        difficulty: 'easy',
        notes: `${label} note`,
        platform: 'local',
        problemCode: label.toUpperCase().replaceAll(' ', '-'),
        statement: `${label} statement`,
        status: 'attempted',
        tags: ['restore'],
        title: `${label} Problem`,
        url: null,
      })
      await window.desktop.problems.upsertRelation({
        note: 'restore relation',
        problemId: createdProblem.id,
        relationType: 'used',
        templateId,
      })
      return createdProblem
    },
    { label, templateId: template.id },
  )
  await setNextSelection(imagePath)
  const problemWithImage = await page.evaluate(
    problemId => window.desktop.problems.addImages(problemId),
    problem.id,
  )
  if (options.createProvider !== false) {
    const provider = await page.evaluate(() =>
      window.desktop.aiProviders.create({
        apiKey: 'restore-e2e-secret-key',
        baseUrl: 'https://example.invalid/v1',
        capabilities: {
          promptCaching: false,
          streaming: false,
          structuredOutput: true,
          vision: true,
        },
        customHeaders: {},
        model: 'restore-e2e-model',
        name: 'Restore E2E Provider',
        protocol: 'openai-chat-completions',
        timeoutMs: 30000,
      }),
    )
    await page.evaluate(
      providerId =>
        window.desktop.aiProviders.upsertRoute({
          providerId,
          task: 'problem-image-analysis',
        }),
      provider.id,
    )
  }
  return { problem: problemWithImage ?? problem, snapshot }
}

async function setNextSavePath(path: string) {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: selectedPath,
    })) as typeof dialog.showSaveDialog
  }, path)
}

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

async function expectCurrentWorkspace(workspaceId: string) {
  await expect
    .poll(
      () => page.evaluate(() => window.desktop.workspace.getCurrent()).then(value => value?.id),
      {
        message: `等待工作区 ${workspaceId} 切换完成`,
        timeout: 30_000,
      },
    )
    .toBe(workspaceId)
}

async function collectArchiveSources(root: string): Promise<PortableArchiveSource[]> {
  const sources: PortableArchiveSource[] = []
  const walk = async (directory: string) => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) await walk(absolutePath)
      if (entry.isFile()) {
        sources.push({
          absolutePath,
          archivePath: relative(root, absolutePath).split(sep).join('/'),
        })
      }
    }
  }
  await walk(root)
  return sources
}

async function rewritePortableManifest(root: string, update: (manifest: BackupManifestV2) => void) {
  const manifestPath = join(root, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as BackupManifestV2
  update(manifest)
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
  await writeFile(manifestPath, manifestText, 'utf8')
  const manifestHash = createHash('sha256').update(manifestText).digest('hex')
  await writeFile(
    join(root, 'checksums.sha256'),
    [
      `${manifestHash}  manifest.json\n`,
      ...manifest.files.map(file => `${file.sha256}  ${file.path}\n`),
    ].join(''),
    'utf8',
  )
}

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-data-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  blankWorkspacePath = join(temporaryRoot, 'blank-workspace')
  await mkdir(userDataDirectory)
  await mkdir(blankWorkspacePath)
  await launchApplication()
  await setNextSelection(blankWorkspacePath)
  await page.getByRole('button', { name: '选择目录' }).click()
  await expect
    .poll(() => page.evaluate(() => window.desktop.workspace.getCurrent()), {
      message: '等待空白工作区初始化完成',
      timeout: 30_000,
    })
    .not.toBeNull()
  await expect(page.getByText('工作区还是空的')).toBeVisible({ timeout: 30_000 })
})

test.afterAll(async () => {
  await electronApp?.close()
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

test('exports and verifies a blank user data backup, then rejects tampering', async () => {
  await page.getByRole('button', { name: '备份与恢复' }).click()
  await expect(page.getByRole('heading', { name: '备份与恢复' })).toBeVisible()
  await expect(page.locator('p').filter({ hasText: /^数据状态正常$/u })).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-light-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 640),
  )
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-light-1024x640.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.waitForTimeout(400)
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-dark-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-dark-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 640),
  )
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-dark-1024x640.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.waitForTimeout(250)
  await page.locator('html').evaluate(root => root.classList.remove('dark'))

  const backupPath = join(temporaryRoot, 'blank-export.awb-backup')
  await setNextSavePath(backupPath)
  await page.getByRole('button', { name: '导出当前工作区备份' }).click()
  await expect(page.getByRole('status').filter({ hasText: '备份已导出并通过校验' })).toBeVisible()
  await expect(page.getByText('当前工作区备份已导出并通过校验')).toBeVisible()

  const extractedBackupPath = join(temporaryRoot, 'blank-export-extracted')
  await extractPortableBackupArchive(backupPath, extractedBackupPath)
  const manifest = JSON.parse(
    await readFile(join(extractedBackupPath, 'manifest.json'), 'utf8'),
  ) as {
    counts: { problems: number; templates: number }
    formatVersion: string
    privacy: { excluded: string[]; providerSecrets: string }
  }
  expect(manifest.formatVersion).toBe('v2')
  expect(manifest.counts.problems).toBe(0)
  expect(manifest.counts.templates).toBe(0)
  expect(manifest.privacy.providerSecrets).toBe('omitted')
  expect(manifest.privacy.excluded).not.toContain('template-sources')
  await expect(
    stat(join(extractedBackupPath, 'data', 'sqlite', 'algorithm-workbench.sqlite')),
  ).resolves.toBeTruthy()
  await expect(stat(join(extractedBackupPath, 'secrets'))).rejects.toThrow()

  await expect(page.getByLabel('包含模板源码')).toHaveCount(0)
  await expect(page.getByText('完整深拷贝')).toBeVisible()

  await writeFile(join(extractedBackupPath, 'unexpected.txt'), 'not declared by manifest\n')
  const extraFileBackupPath = join(temporaryRoot, 'blank-export-extra-file.awb-backup')
  await createPortableBackupArchive(
    extraFileBackupPath,
    await collectArchiveSources(extractedBackupPath),
  )
  await setNextSelection(extraFileBackupPath)
  await page.getByRole('button', { name: '选择备份并恢复' }).click()
  await expect(page.getByText('这个备份暂时无法恢复')).toBeVisible()
  await expect(page.getByText('备份包包含 manifest 清单外文件。')).toBeVisible()
  await rm(join(extractedBackupPath, 'unexpected.txt'))

  await writeFile(join(extractedBackupPath, 'COMPLETED'), 'tampered\n', 'utf8')
  const tamperedBackupPath = join(temporaryRoot, 'blank-export-tampered.awb-backup')
  await createPortableBackupArchive(
    tamperedBackupPath,
    await collectArchiveSources(extractedBackupPath),
  )
  await setNextSelection(tamperedBackupPath)
  await page.getByRole('button', { name: '选择备份并恢复' }).click()
  await expect(page.getByText('这个备份暂时无法恢复')).toBeVisible()
  await expect(page.getByText(/文件哈希不匹配/)).toBeVisible()
})

test('deep-copies any valid workspace backup into the current workspace without changing its source', async () => {
  const imageBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
  const workspaceAImage = join(temporaryRoot, 'workspace-a.png')
  const workspaceASourceBytes = iconv.encode(
    '// 通用深拷贝中文模板\nvoid workspace_a() {}\n',
    'gbk',
  )
  await writeFile(workspaceAImage, imageBytes)
  await writeFile(join(blankWorkspacePath, 'templates', 'a-template.cpp'), workspaceASourceBytes)
  const seededA = await seedV2Data(blankWorkspacePath, workspaceAImage, {
    label: 'Workspace A',
  })
  if (!seededA.snapshot || !seededA.problem.images[0]) throw new Error('workspace A seed failed')
  const relocationPreview = await page.evaluate(
    templateId =>
      window.desktop.templateManagement.previewTemplateRelocation({
        targetRelativePath: 'algorithms/a-template.cpp',
        templateId,
      }),
    seededA.snapshot.templates[0]!.id,
  )
  const relocationResult = await page.evaluate(
    previewId =>
      window.desktop.templateManagement.applyTemplateRelocation({ confirmed: true, previewId }),
    relocationPreview.previewId,
  )
  const workspaceA = relocationResult.workspace
  const workspaceAImagePath = join(
    blankWorkspacePath,
    'problem-assets',
    'images',
    seededA.problem.id,
    `${seededA.problem.images[0].id}.png`,
  )
  const workspaceAImageBefore = await readFile(workspaceAImagePath)
  const workspaceADiagnostics = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  const workspaceAPlansBefore = await page.evaluate(() =>
    window.desktop.templateManagement.listFilePlans(),
  )
  const workspaceAExecutionsBefore = await page.evaluate(() =>
    window.desktop.templateManagement.listFileExecutions(),
  )
  expect(workspaceAPlansBefore).toHaveLength(1)
  expect(workspaceAExecutionsBefore).toHaveLength(1)
  const providersBefore = await page.evaluate(() => window.desktop.aiProviders.list())
  expect(providersBefore).toHaveLength(1)
  expect(providersBefore[0]?.hasSecret).toBe(true)

  await page.getByRole('button', { name: '备份与恢复' }).click()
  const workspaceABackupPath = join(temporaryRoot, 'workspace-a-portable.awb-backup')
  await setNextSavePath(workspaceABackupPath)
  await page.getByRole('button', { name: '导出当前工作区备份' }).click()
  await expect(page.getByRole('status').filter({ hasText: '备份已导出并通过校验' })).toBeVisible()
  const extractedPath = join(temporaryRoot, 'workspace-a-extracted')
  await extractPortableBackupArchive(workspaceABackupPath, extractedPath)
  const manifest = JSON.parse(
    await readFile(join(extractedPath, 'manifest.json'), 'utf8'),
  ) as BackupManifestV2
  expect(manifest.includeTemplateSources).toBe(true)
  expect(manifest.workspaces).toEqual([
    expect.objectContaining({ id: workspaceA.id, name: workspaceA.name }),
  ])
  expect(manifest.counts).toMatchObject({
    aiProviderProfiles: 0,
    aiTaskRoutes: 0,
    fileChangeExecutions: 1,
    fileChangePlans: 1,
    problemImages: 1,
    problems: 1,
    templateProblemRelations: 1,
    templates: 1,
    workspaces: 1,
  })
  const manifestPaths = manifest.files.map(file => file.path)
  expect(manifestPaths.some(path => path.includes(seededA.problem.id))).toBe(true)
  expect(
    manifestPaths.includes(`data/template-sources/${workspaceA.id}/algorithms/a-template.cpp`),
  ).toBe(true)
  const snapshotBytes = await readFile(
    join(extractedPath, 'data', 'sqlite', 'algorithm-workbench.sqlite'),
  )
  expect(snapshotBytes.includes(Buffer.from('Workspace A Problem'))).toBe(true)
  expect(snapshotBytes.includes(Buffer.from('Restore E2E Provider'))).toBe(false)

  workspaceBPath = join(temporaryRoot, 'workspace-b')
  const workspaceBImage = join(temporaryRoot, 'workspace-b.png')
  await mkdir(workspaceBPath)
  await writeFile(join(workspaceBPath, 'b-template.cpp'), 'void workspace_b() {}\n', 'utf8')
  await writeFile(workspaceBImage, imageBytes)
  const seededB = await seedV2Data(workspaceBPath, workspaceBImage, {
    createProvider: false,
    label: 'Workspace B',
  })
  if (!seededB.snapshot || !seededB.problem.images[0]) throw new Error('workspace B seed failed')
  const workspaceB = seededB.snapshot
  const workspaceBImagePath = join(
    workspaceBPath,
    'problem-assets',
    'images',
    seededB.problem.id,
    `${seededB.problem.images[0].id}.png`,
  )
  await page.getByRole('button', { name: '备份与恢复' }).click()
  const multiWorkspaceExtractedPath = join(temporaryRoot, 'workspace-a-multi-manifest')
  await extractPortableBackupArchive(workspaceABackupPath, multiWorkspaceExtractedPath)
  await rewritePortableManifest(multiWorkspaceExtractedPath, portableManifest => {
    portableManifest.workspaces.push({
      id: '40000000-0000-4000-8000-000000000077',
      name: '旧备份中的其他工作区',
      templateFileCount: 0,
    })
  })
  const multiWorkspaceBackupPath = join(temporaryRoot, 'workspace-a-multi.awb-backup')
  await createPortableBackupArchive(
    multiWorkspaceBackupPath,
    await collectArchiveSources(multiWorkspaceExtractedPath),
  )
  await setNextSelection(multiWorkspaceBackupPath)
  await page.getByRole('button', { name: '选择备份并恢复' }).click()
  await expect(page.getByText('这个备份暂时无法恢复')).toBeVisible()
  await expect(page.getByText(/备份 manifest 不是当前单工作区完整源码格式/u)).toBeVisible()

  await setNextSelection(workspaceABackupPath)
  await page.getByRole('button', { name: '选择备份并恢复' }).click()
  await expect(page.getByText('备份检查通过，可以恢复')).toBeVisible()
  await expect(page.getByTestId('restore-source-workspace')).toHaveText(workspaceA.name)
  await expect(page.getByTestId('restore-target-workspace')).toHaveText(workspaceB.name)
  await expect(page.getByLabel('我了解恢复会替换当前工作区，并确认继续。')).toBeFocused()
  await page.getByText('备份检查通过，可以恢复').scrollIntoViewIfNeeded()
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-restore-light-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.waitForTimeout(250)
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-restore-dark-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.remove('dark'))

  await page.getByLabel('我了解恢复会替换当前工作区，并确认继续。').check()
  await page.getByRole('button', { name: '确认恢复' }).click()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: '当前工作区恢复完成；其他工作区和 Provider 配置未修改' }),
  ).toBeVisible()

  const restoredWorkspaceB = await page.evaluate(() => window.desktop.workspace.getCurrent())
  expect(restoredWorkspaceB?.id).toBe(workspaceB.id)
  expect(restoredWorkspaceB?.name).toBe(workspaceB.name)
  expect(restoredWorkspaceB?.rootPath).toBe(await realpath(workspaceBPath))
  const restoredDiagnosticsB = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(restoredDiagnosticsB.counts).toMatchObject(manifest.counts)
  const restoredProblemsB = await page.evaluate(() => window.desktop.problems.list())
  expect(restoredProblemsB).toEqual([
    expect.objectContaining({
      id: expect.not.stringMatching(seededA.problem.id),
      title: 'Workspace A Problem',
    }),
  ])
  const restoredPlansB = await page.evaluate(() =>
    window.desktop.templateManagement.listFilePlans(),
  )
  const restoredExecutionsB = await page.evaluate(() =>
    window.desktop.templateManagement.listFileExecutions(),
  )
  expect(restoredPlansB).toHaveLength(1)
  expect(restoredExecutionsB).toHaveLength(1)
  expect(restoredPlansB[0]!.id).not.toBe(workspaceAPlansBefore[0]!.id)
  expect(restoredExecutionsB[0]!.id).not.toBe(workspaceAExecutionsBefore[0]!.id)
  expect(restoredExecutionsB[0]!.planId).toBe(restoredPlansB[0]!.id)
  expect(restoredPlansB[0]!.operations[0]!.templateId).toBe(restoredWorkspaceB!.templates[0]!.id)
  expect(restoredPlansB[0]!.operations[0]!.templateId).not.toBe(
    workspaceAPlansBefore[0]!.operations[0]!.templateId,
  )
  await expect(
    stat(join(blankWorkspacePath, '.awb', 'file-plan-backups', workspaceAExecutionsBefore[0]!.id)),
  ).resolves.toBeTruthy()
  await expect(
    stat(join(workspaceBPath, '.awb', 'file-plan-backups', restoredExecutionsB[0]!.id)),
  ).resolves.toBeTruthy()
  await expect(stat(workspaceBImagePath)).rejects.toThrow()
  const restoredProblemB = restoredProblemsB[0]!
  const restoredImageB = restoredProblemB.images[0]!
  const restoredImageDataB = await page.evaluate(
    imageId => window.desktop.problems.readImage(imageId),
    restoredImageB.id,
  )
  expect(Buffer.from(restoredImageDataB.dataUrl.split(',')[1]!, 'base64')).toEqual(
    workspaceAImageBefore,
  )
  await expect(
    readFile(join(workspaceBPath, 'templates', 'b-template.cpp'), 'utf8'),
  ).rejects.toThrow()
  expect(await readFile(join(workspaceBPath, 'templates', 'algorithms', 'a-template.cpp'))).toEqual(
    workspaceASourceBytes,
  )
  const providersAfter = await page.evaluate(() => window.desktop.aiProviders.list())
  expect(providersAfter).toEqual(providersBefore)

  await writeFile(
    join(workspaceBPath, 'templates', 'algorithms', 'a-template.cpp'),
    'void changed_only_in_workspace_b() {}\n',
    'utf8',
  )
  expect(
    await readFile(join(blankWorkspacePath, 'templates', 'algorithms', 'a-template.cpp')),
  ).toEqual(workspaceASourceBytes)

  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await setNextSelection(blankWorkspacePath)
  await page.getByRole('button', { name: '切换工作区' }).click()
  await expectCurrentWorkspace(workspaceA.id)
  const currentA = await page.evaluate(() => window.desktop.workspace.getCurrent())
  expect(currentA?.id).toBe(workspaceA.id)
  const diagnosticsAAfter = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(diagnosticsAAfter.counts).toEqual(workspaceADiagnostics.counts)
  expect(await readFile(workspaceAImagePath)).toEqual(workspaceAImageBefore)
  expect(
    await readFile(join(blankWorkspacePath, 'templates', 'algorithms', 'a-template.cpp')),
  ).toEqual(workspaceASourceBytes)
  await expect(page.evaluate(() => window.desktop.problems.list())).resolves.toEqual([
    expect.objectContaining({ id: seededA.problem.id }),
  ])
  await expect(
    page.evaluate(() => window.desktop.templateManagement.listFileExecutions()),
  ).resolves.toEqual(workspaceAExecutionsBefore)

  await page.getByRole('button', { name: '模板库', exact: true }).click()
  await setNextSelection(workspaceBPath)
  await page.getByRole('button', { name: '切换工作区' }).click()
  await expectCurrentWorkspace(workspaceB.id)
  const currentBAfterSwitch = await page.evaluate(() => window.desktop.workspace.getCurrent())
  expect(currentBAfterSwitch?.id).toBe(workspaceB.id)
  await expect(page.evaluate(() => window.desktop.problems.list())).resolves.toEqual([
    expect.objectContaining({ title: 'Workspace A Problem' }),
  ])
  expect(
    await readFile(join(workspaceBPath, 'templates', 'algorithms', 'a-template.cpp'), 'utf8'),
  ).toContain('changed_only_in_workspace_b')
  await electronApp.close()
  await launchApplication()
  const currentBAfterRestart = await page.evaluate(() => window.desktop.workspace.getCurrent())
  expect(currentBAfterRestart).toMatchObject({
    id: workspaceB.id,
    rootPath: await realpath(workspaceBPath),
  })
  await expect(page.evaluate(() => window.desktop.problems.list())).resolves.toEqual([
    expect.objectContaining({ title: 'Workspace A Problem' }),
  ])
  expect(
    await readFile(join(workspaceBPath, 'templates', 'algorithms', 'a-template.cpp'), 'utf8'),
  ).toContain('changed_only_in_workspace_b')
  const preflightRoot = join(workspaceBPath, '.awb', 'restore-preflight-backups')
  const preflightNames = await readdir(preflightRoot)
  expect(preflightNames.length).toBeGreaterThanOrEqual(1)
  await page.getByRole('button', { name: '备份与恢复' }).click()
  await setNextSelection(join(preflightRoot, preflightNames[0]!))
  await page.getByRole('button', { name: '选择备份并恢复' }).click()
  await expect(page.getByText('备份检查通过，可以恢复')).toBeVisible()
})

test('rolls back current data when restore fails after file swap', async () => {
  await electronApp.close()
  userDataDirectory = join(temporaryRoot, 'rollback-user-data')
  await mkdir(userDataDirectory)
  await launchApplication({ E2E_RESTORE_FAIL_STAGE: 'after-file-swap' })

  const workspacePath = join(temporaryRoot, 'rollback-workspace')
  const imagePath = join(temporaryRoot, 'rollback-image.png')
  await mkdir(workspacePath)
  await writeFile(join(workspacePath, 'rollback-template.cpp'), 'void rollback_fixture() {}\n')
  await writeFile(
    imagePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  await seedV2Data(workspacePath, imagePath, { label: 'Rollback' })
  await page.getByRole('button', { name: '备份与恢复' }).click()
  const backupPath = join(temporaryRoot, 'rollback-current-workspace.awb-backup')
  await setNextSavePath(backupPath)
  await page.getByRole('button', { name: '导出当前工作区备份' }).click()
  await expect(page.getByRole('status').filter({ hasText: '备份已导出并通过校验' })).toBeVisible()
  await page.evaluate(() =>
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
      notes: '',
      platform: null,
      problemCode: null,
      statement: 'must survive failed restore',
      status: 'unattempted',
      tags: [],
      title: 'Rollback extra problem',
      url: null,
    }),
  )
  const beforeRestore = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  const providersBefore = await page.evaluate(() => window.desktop.aiProviders.list())

  await setNextSelection(backupPath)
  await page.getByRole('button', { name: '选择备份并恢复' }).click()
  await expect(page.getByText('备份检查通过，可以恢复')).toBeVisible()
  await page.getByLabel('我了解恢复会替换当前工作区，并确认继续。').check()
  await page.getByRole('button', { name: '确认恢复' }).click()
  await expect(page.getByRole('alert')).toContainText('模拟恢复失败，已回滚到操作前状态')

  const afterRestore = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(afterRestore.counts.problems).toBe(beforeRestore.counts.problems)
  expect(afterRestore.counts.templates).toBe(beforeRestore.counts.templates)
  expect(afterRestore.counts.problemImages).toBe(beforeRestore.counts.problemImages)
  expect(await page.evaluate(() => window.desktop.aiProviders.list())).toEqual(providersBefore)
  expect(await readFile(join(workspacePath, 'templates', 'rollback-template.cpp'), 'utf8')).toBe(
    'void rollback_fixture() {}\n',
  )
})

test('recovers old data after a restore interruption before SQLite commit', async () => {
  await electronApp.close()
  userDataDirectory = join(temporaryRoot, 'restore-interrupted-user-data')
  await mkdir(userDataDirectory)
  await launchApplication({ E2E_RESTORE_INTERRUPT_STAGE: 'after-file-swap' })

  const workspacePath = join(temporaryRoot, 'interrupted-restore-workspace')
  const imagePath = join(temporaryRoot, 'interrupted-restore-image.png')
  await mkdir(workspacePath)
  await writeFile(join(workspacePath, 'template.cpp'), 'void interrupted_restore_fixture() {}\n')
  await writeFile(
    imagePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  await seedV2Data(workspacePath, imagePath, { label: 'Interrupted restore' })
  await page.getByRole('button', { name: '备份与恢复' }).click()
  const backupPath = join(temporaryRoot, 'interrupted-restore-current.awb-backup')
  await setNextSavePath(backupPath)
  await page.getByRole('button', { name: '导出当前工作区备份' }).click()
  await expect(page.getByRole('status').filter({ hasText: '备份已导出并通过校验' })).toBeVisible()
  await page.evaluate(() =>
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
      notes: '',
      platform: null,
      problemCode: null,
      statement: 'must survive interrupted restore rollback',
      status: 'unattempted',
      tags: [],
      title: 'Interrupted restore extra problem',
      url: null,
    }),
  )
  const before = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  const providersBefore = await page.evaluate(() => window.desktop.aiProviders.list())

  await setNextSelection(backupPath)
  await page.getByRole('button', { name: '选择备份并恢复' }).click()
  await page.getByLabel('我了解恢复会替换当前工作区，并确认继续。').check()
  await page.getByRole('button', { name: '确认恢复' }).click()
  await expect(page.getByRole('alert')).toContainText('模拟恢复异常中断')
  const interruptedRoots = (await readdir(join(workspacePath, '.awb'))).filter(
    entry => entry.startsWith('.restore-') && entry.endsWith('.tmp'),
  )
  expect(interruptedRoots).toEqual([expect.stringMatching(/^\.restore-.*\.tmp$/u)])
  const interruptedInventory = await page.evaluate(() =>
    window.desktop.dataManagement.inspectBackupLifecycle({ retentionPolicy: 'forever' }),
  )
  expect(interruptedInventory.interruptedOperations).toEqual([
    expect.objectContaining({ canRecover: true, reason: 'restore-preflight-ready' }),
  ])
  await electronApp.close()
  await launchApplication()
  await page.getByRole('button', { name: '备份与恢复' }).click()
  await expect(page.getByText('数据尚未替换，可以安全返回原状')).toBeVisible()
  await page.getByRole('button', { name: '查看处理方式' }).click()
  await page.getByLabel('我已查看处理方式，并确认让应用执行。').check()
  await page.getByRole('button', { name: '确认执行安全处理' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: '未完成的数据操作已按预览安全处理' }),
  ).toBeVisible()

  const after = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(after.counts.problems).toBe(before.counts.problems)
  expect(after.counts.templates).toBe(before.counts.templates)
  expect(after.counts.problemImages).toBe(before.counts.problemImages)
  expect(await page.evaluate(() => window.desktop.aiProviders.list())).toEqual(providersBefore)
  expect(await readFile(join(workspacePath, 'templates', 'template.cpp'), 'utf8')).toBe(
    'void interrupted_restore_fixture() {}\n',
  )
})

test('finishes cleanup after a restore interruption following SQLite commit', async () => {
  await electronApp.close()
  userDataDirectory = join(temporaryRoot, 'restore-committed-user-data')
  await mkdir(userDataDirectory)
  await launchApplication({ E2E_RESTORE_INTERRUPT_STAGE: 'after-database-commit' })
  const workspacePath = join(temporaryRoot, 'committed-restore-workspace')
  const imagePath = join(temporaryRoot, 'committed-restore-image.png')
  await mkdir(workspacePath)
  await writeFile(join(workspacePath, 'template.cpp'), 'void committed_restore_fixture() {}\n')
  await writeFile(
    imagePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  await seedV2Data(workspacePath, imagePath, { label: 'Committed restore' })
  await page.getByRole('button', { name: '备份与恢复' }).click()
  const backupCounts = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  const providersBefore = await page.evaluate(() => window.desktop.aiProviders.list())
  const backupPath = join(temporaryRoot, 'committed-restore-current.awb-backup')
  await setNextSavePath(backupPath)
  await page.getByRole('button', { name: '导出当前工作区备份' }).click()
  await expect(page.getByRole('status').filter({ hasText: '备份已导出并通过校验' })).toBeVisible()
  await page.evaluate(() =>
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
      notes: '',
      platform: null,
      problemCode: null,
      statement: 'removed by committed restore',
      status: 'unattempted',
      tags: [],
      title: 'Committed restore extra problem',
      url: null,
    }),
  )
  await setNextSelection(backupPath)
  await page.getByRole('button', { name: '选择备份并恢复' }).click()
  await page.getByLabel('我了解恢复会替换当前工作区，并确认继续。').check()
  await page.getByRole('button', { name: '确认恢复' }).click()
  await expect(page.getByRole('alert')).toContainText('模拟恢复已提交但收尾中断')

  const committedDiagnostics = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(committedDiagnostics.counts).toEqual(backupCounts.counts)
  expect(await page.evaluate(() => window.desktop.aiProviders.list())).toEqual(providersBefore)
  await electronApp.close()
  await launchApplication()
  await page.getByRole('button', { name: '备份与恢复' }).click()
  await expect(page.getByText('主要数据已恢复，可以完成收尾')).toBeVisible()
  await page.getByRole('button', { name: '查看处理方式' }).click()
  await expect(page.getByText(/完成备份恢复后的安全收尾/)).toBeVisible()
  await page.getByLabel('我已查看处理方式，并确认让应用执行。').check()
  await page.getByRole('button', { name: '确认执行安全处理' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: '未完成的数据操作已按预览安全处理' }),
  ).toBeVisible()
  const inventory = await page.evaluate(() =>
    window.desktop.dataManagement.inspectBackupLifecycle({ retentionPolicy: 'forever' }),
  )
  expect(inventory.interruptedOperationCount).toBe(0)
  expect(await readFile(join(workspacePath, 'templates', 'template.cpp'), 'utf8')).toBe(
    'void committed_restore_fixture() {}\n',
  )
})
