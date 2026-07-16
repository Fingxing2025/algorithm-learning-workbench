import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
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

declare const window: { desktop: DesktopApi }

let electronApp: ElectronApplication
let page: Page
let temporaryRoot: string
let userDataDirectory: string

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

async function seedV2Data(workspacePath: string, imagePath: string) {
  await setNextSelection(workspacePath)
  const snapshot = await page.evaluate(() => window.desktop.workspace.choose({ intent: 'open' }))
  const template = snapshot?.templates[0]
  if (!template) throw new Error('seed workspace did not produce a template')
  const problem = await page.evaluate(async templateId => {
    const createdProblem = await window.desktop.problems.create({
      aiSummary: 'restore e2e summary',
      analysis: {
        algorithmSignals: ['graph'],
        constraints: [],
        edgeCases: [],
        examples: [],
        inputDescription: '',
        outputDescription: '',
      },
      difficulty: 'easy',
      notes: 'restore e2e note',
      platform: 'local',
      problemCode: 'RESTORE-E2E',
      statement: 'restore e2e statement',
      status: 'attempted',
      tags: ['restore'],
      title: 'Restore E2E Problem',
      url: null,
    })
    await window.desktop.problems.upsertRelation({
      note: 'restore relation',
      problemId: createdProblem.id,
      relationType: 'used',
      templateId,
    })
    return createdProblem
  }, template.id)
  await setNextSelection(imagePath)
  await page.evaluate(problemId => window.desktop.problems.addImages(problemId), problem.id)
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
  }, path)
}

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-data-e2e-'))
  userDataDirectory = join(temporaryRoot, 'user-data')
  await mkdir(userDataDirectory)
  await launchApplication()
})

test.afterAll(async () => {
  await electronApp?.close()
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

test('exports and verifies a blank user data backup, then rejects tampering', async () => {
  await page.getByRole('button', { name: '数据管理' }).click()
  await expect(page.getByRole('heading', { name: '数据管理' })).toBeVisible()
  await expect(page.getByText('未发现异常')).toBeVisible()
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
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.add('dark'))
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
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.remove('dark'))

  const backupPath = join(temporaryRoot, 'blank-export.awb-backup')
  await setNextSavePath(backupPath)
  await page.getByRole('button', { name: '导出备份' }).click()
  await expect(page.getByRole('alert')).toContainText('备份已导出并通过校验')
  await expect(page.getByText('备份包校验通过')).toBeVisible()

  const manifest = JSON.parse(await readFile(join(backupPath, 'manifest.json'), 'utf8')) as {
    counts: { problems: number; templates: number }
    privacy: { providerSecrets: string }
  }
  expect(manifest.counts.problems).toBe(0)
  expect(manifest.counts.templates).toBe(0)
  expect(manifest.privacy.providerSecrets).toBe('omitted')
  await expect(
    stat(join(backupPath, 'data', 'sqlite', 'algorithm-workbench.sqlite')),
  ).resolves.toBeTruthy()
  await expect(stat(join(backupPath, 'secrets'))).rejects.toThrow()

  await writeFile(join(backupPath, 'COMPLETED'), 'tampered\n', 'utf8')
  await setNextSelection(backupPath)
  await page.getByRole('button', { name: '验证备份包' }).click()
  await expect(page.getByText('备份包校验失败')).toBeVisible()
  await expect(page.getByText(/文件哈希不匹配/)).toBeVisible()
})

test('restores a verified backup with a preflight backup and skips external template sources', async () => {
  const blankBackupPath = join(temporaryRoot, 'blank-restore.awb-backup')
  await setNextSavePath(blankBackupPath)
  await page.getByRole('button', { name: '导出备份' }).click()
  await expect(page.getByRole('alert')).toContainText('备份已导出并通过校验')

  const workspacePath = join(temporaryRoot, 'restore-workspace')
  const imagePath = join(temporaryRoot, 'restore-image.png')
  await mkdir(workspacePath)
  await writeFile(join(workspacePath, 'restore-template.cpp'), 'void before_restore() {}\n')
  await writeFile(
    imagePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  await seedV2Data(workspacePath, imagePath)

  await page.getByRole('button', { name: '数据管理' }).click()
  const populatedBackupPath = join(temporaryRoot, 'populated-restore.awb-backup')
  await setNextSavePath(populatedBackupPath)
  await page.getByRole('button', { name: '导出备份' }).click()
  await expect(page.getByRole('alert')).toContainText('备份已导出并通过校验')
  const populatedManifest = JSON.parse(
    await readFile(join(populatedBackupPath, 'manifest.json'), 'utf8'),
  ) as {
    counts: {
      aiProviderProfiles: number
      aiTaskRoutes: number
      problemImages: number
      problems: number
      templateProblemRelations: number
      templates: number
      workspaces: number
    }
  }

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
      statement: 'restore e2e extra statement',
      status: 'unattempted',
      tags: [],
      title: 'Extra problem after backup',
      url: null,
    }),
  )
  await writeFile(join(workspacePath, 'restore-template.cpp'), 'void mutated_after_backup() {}\n')

  await setNextSelection(populatedBackupPath)
  await page.getByRole('button', { name: '恢复预览' }).click()
  await expect(page.getByText('恢复预览可继续')).toBeVisible()
  await page.getByText('恢复预览可继续').scrollIntoViewIfNeeded()
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-restore-light-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-restore-light-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-restore-dark-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-restore-dark-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.locator('html').evaluate(root => root.classList.remove('dark'))

  await page.getByLabel('我已确认恢复预览，并允许应用恢复 userData 中的数据副本。').check()
  await page.getByRole('button', { name: '确认恢复' }).click()
  await expect(page.getByRole('alert')).toContainText('Provider 密钥未恢复')

  const restoredDiagnostics = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(restoredDiagnostics.counts.workspaces).toBe(populatedManifest.counts.workspaces)
  expect(restoredDiagnostics.counts.templates).toBe(populatedManifest.counts.templates)
  expect(restoredDiagnostics.counts.problems).toBe(populatedManifest.counts.problems)
  expect(restoredDiagnostics.counts.problemImages).toBe(populatedManifest.counts.problemImages)
  expect(restoredDiagnostics.counts.templateProblemRelations).toBe(
    populatedManifest.counts.templateProblemRelations,
  )
  expect(restoredDiagnostics.counts.aiProviderProfiles).toBe(
    populatedManifest.counts.aiProviderProfiles,
  )
  expect(restoredDiagnostics.counts.aiTaskRoutes).toBe(populatedManifest.counts.aiTaskRoutes)
  const providers = await page.evaluate(() => window.desktop.aiProviders.list())
  expect(providers).toHaveLength(1)
  expect(providers[0]?.hasSecret).toBe(false)
  expect(await readFile(join(workspacePath, 'restore-template.cpp'), 'utf8')).toBe(
    'void mutated_after_backup() {}\n',
  )
  expect(await readdir(join(userDataDirectory, 'restore-preflight-backups'))).toHaveLength(1)

  await setNextSelection(blankBackupPath)
  await page.getByRole('button', { name: '恢复预览' }).click()
  await expect(page.getByText('恢复预览可继续')).toBeVisible()
  await page.getByLabel('我已确认恢复预览，并允许应用恢复 userData 中的数据副本。').check()
  await page.getByRole('button', { name: '确认恢复' }).click()
  await expect(page.getByRole('alert')).toContainText('恢复完成')
  const blankDiagnostics = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(blankDiagnostics.counts.problems).toBe(0)
  expect(blankDiagnostics.counts.templates).toBe(0)
  expect(blankDiagnostics.counts.aiProviderProfiles).toBe(0)
})

test('previews, quarantines, and undoes user-selected lifecycle items', async () => {
  const batchBackup = join(userDataDirectory, 'batch-import-backups', 'lifecycle-review')
  const imageTrash = join(userDataDirectory, 'problem-images', '.trash', 'lifecycle-residual')
  await mkdir(batchBackup, { recursive: true })
  await mkdir(imageTrash, { recursive: true })
  await writeFile(join(batchBackup, 'backup.bin'), 'lifecycle backup fixture')
  await writeFile(join(imageTrash, 'residual.bin'), 'lifecycle trash fixture')

  await page.getByRole('button', { name: '数据管理' }).click()
  await page.getByRole('button', { name: '重新诊断' }).click()
  await expect(page.getByRole('heading', { name: '备份生命周期' })).toBeVisible()
  await expect(page.getByText('批量导入备份，需要你判断')).toBeVisible()
  await expect(page.getByText('无当前记录的题目图片残留')).toBeVisible()
  await page.getByRole('heading', { name: '备份生命周期' }).scrollIntoViewIfNeeded()

  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-lifecycle-light-1440x900.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 720),
  )
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-lifecycle-light-1280x720.png'),
  })
  await page.locator('html').evaluate(root => root.classList.add('dark'))
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-lifecycle-dark-1280x720.png'),
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900),
  )
  await page.screenshot({
    fullPage: true,
    path: resolve('output/playwright/data-management-lifecycle-dark-1440x900.png'),
  })
  await page.locator('html').evaluate(root => root.classList.remove('dark'))

  await page.getByRole('button', { name: '选择全部可隔离项' }).click()
  await page.getByRole('button', { name: '预览隔离操作' }).click()
  await expect(page.getByText('隔离预览可继续')).toBeVisible()
  await expect(page.getByText(/将移动 2 项/)).toBeVisible()
  await page.getByLabel('我已核对清单，并允许应用把所选项目移入隔离区。').check()
  await page.getByRole('button', { name: '确认移入隔离区' }).click()
  await expect(page.getByRole('alert')).toContainText('没有永久删除文件')
  await expect(stat(batchBackup)).rejects.toThrow()
  await expect(stat(imageTrash)).rejects.toThrow()
  const quarantineOperations = await readdir(join(userDataDirectory, 'data-management-quarantine'))
  expect(quarantineOperations).toHaveLength(1)

  await page.getByRole('button', { name: '撤销隔离' }).click()
  await expect(page.getByRole('alert')).toContainText('已从隔离区恢复 2 项')
  await expect(stat(batchBackup)).resolves.toBeTruthy()
  await expect(stat(imageTrash)).resolves.toBeTruthy()
})

test('rolls back current data when restore fails after file swap', async () => {
  await electronApp.close()
  userDataDirectory = join(temporaryRoot, 'rollback-user-data')
  await mkdir(userDataDirectory)
  await launchApplication({ E2E_RESTORE_FAIL_STAGE: 'after-file-swap' })
  await page.getByRole('button', { name: '数据管理' }).click()

  const blankBackupPath = join(temporaryRoot, 'rollback-blank.awb-backup')
  await setNextSavePath(blankBackupPath)
  await page.getByRole('button', { name: '导出备份' }).click()
  await expect(page.getByRole('alert')).toContainText('备份已导出并通过校验')

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
  await seedV2Data(workspacePath, imagePath)
  await page.getByRole('button', { name: '数据管理' }).click()
  const beforeRestore = await page.evaluate(() => window.desktop.dataManagement.diagnose())

  await setNextSelection(blankBackupPath)
  await page.getByRole('button', { name: '恢复预览' }).click()
  await expect(page.getByText('恢复预览可继续')).toBeVisible()
  await page.getByLabel('我已确认恢复预览，并允许应用恢复 userData 中的数据副本。').check()
  await page.getByRole('button', { name: '确认恢复' }).click()
  await expect(page.getByRole('alert')).toContainText('模拟恢复失败，已回滚到操作前状态')

  const afterRestore = await page.evaluate(() => window.desktop.dataManagement.diagnose())
  expect(afterRestore.counts.problems).toBe(beforeRestore.counts.problems)
  expect(afterRestore.counts.templates).toBe(beforeRestore.counts.templates)
  expect(afterRestore.counts.problemImages).toBe(beforeRestore.counts.problemImages)
  expect(afterRestore.counts.aiProviderProfiles).toBe(beforeRestore.counts.aiProviderProfiles)
  expect(await readFile(join(workspacePath, 'rollback-template.cpp'), 'utf8')).toBe(
    'void rollback_fixture() {}\n',
  )
})

test('rolls back every lifecycle item when quarantine fails after the first move', async () => {
  await electronApp.close()
  userDataDirectory = join(temporaryRoot, 'cleanup-rollback-user-data')
  const first = join(userDataDirectory, 'batch-import-backups', 'first')
  const second = join(userDataDirectory, 'batch-import-backups', 'second')
  await mkdir(first, { recursive: true })
  await mkdir(second, { recursive: true })
  await writeFile(join(first, 'backup.bin'), 'first cleanup fixture')
  await writeFile(join(second, 'backup.bin'), 'second cleanup fixture')
  await launchApplication({ E2E_CLEANUP_FAIL_AFTER_MOVES: '1' })
  await page.getByRole('button', { name: '数据管理' }).click()
  await expect(page.getByText('批量导入备份，需要你判断')).toHaveCount(2)

  await page.getByRole('button', { name: '选择全部可隔离项' }).click()
  await page.getByRole('button', { name: '预览隔离操作' }).click()
  await page.getByLabel('我已核对清单，并允许应用把所选项目移入隔离区。').check()
  await page.getByRole('button', { name: '确认移入隔离区' }).click()
  await expect(page.getByRole('alert')).toContainText('模拟清理失败，已回滚到操作前状态')
  await expect(stat(first)).resolves.toBeTruthy()
  await expect(stat(second)).resolves.toBeTruthy()
  const inventory = await page.evaluate(() =>
    window.desktop.dataManagement.inspectBackupLifecycle({ retentionPolicy: 'forever' }),
  )
  expect(inventory.quarantineOperations).toHaveLength(0)
  expect(inventory.interruptedOperationCount).toBe(0)
})
