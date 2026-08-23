import { spawnSync } from 'node:child_process'
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

import type { DesktopApi } from '../../src/core/contracts/desktop-api'
import { TEMPLATE_INDEX_VERSION } from '../../src/main/services/template-content-index'
import { dismissGettingStartedGuideIfNeeded } from './helpers/getting-started'

let app: ElectronApplication
let databasePath: string
let page: Page
let temporaryRoot: string
let userDataPath: string
let workspacePath: string

interface IndexInspection {
  relations: Array<{ problemId: string; templateId: string }>
  scanStats: {
    addedCount: number
    hashedCount: number
    modifiedCount: number
    movedCount: number
    removedCount: number
    reusedCount: number
    unchangedCount: number
  }
  skippedSymlinkCount: number
  templates: Array<{
    available: number
    contentHash: string
    id: string
    indexVersion: number
    relativePath: string
  }>
}

async function selectDirectory(path: string): Promise<void> {
  await app.evaluate(({ dialog }, selectedPath) => {
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

async function inspectIndex(): Promise<IndexInspection> {
  const electronExecutable = (
    await readFile(resolve('node_modules/electron/path.txt'), 'utf8')
  ).trim()
  const electronPath = resolve('node_modules/electron/dist', electronExecutable)
  const script = String.raw`
    const Database = require('better-sqlite3');
    const db = new Database(process.env.SEED_DB, { readonly: true });
    const workspace = db.prepare('SELECT scan_stats_json, skipped_symlink_count FROM workspaces WHERE id = (SELECT value FROM app_state WHERE key = ?)').get('active_workspace_id');
    const templates = db.prepare('SELECT id, relative_path AS relativePath, available, content_hash AS contentHash, index_version AS indexVersion FROM templates ORDER BY relative_path').all();
    const relations = db.prepare('SELECT problem_id AS problemId, template_id AS templateId FROM template_problem_relations').all();
    process.stdout.write(JSON.stringify({ relations, scanStats: JSON.parse(workspace.scan_stats_json), skippedSymlinkCount: workspace.skipped_symlink_count, templates }));
    db.close();
  `
  const result = spawnSync(electronPath, ['-e', script], {
    cwd: resolve('.'),
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', SEED_DB: databasePath },
  })
  expect(result.status, result.stderr || result.stdout).toBe(0)
  return JSON.parse(result.stdout) as IndexInspection
}

async function seedPaginationRecords(relationTemplateId: string): Promise<void> {
  const script = String.raw`
    const Database = require('better-sqlite3');
    const db = new Database(process.env.SEED_DB);
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    const workspaceId = db.prepare('SELECT value FROM app_state WHERE key = ?').get('active_workspace_id').value;
    const timestamp = '2026-07-19T08:00:00.000Z';
    const templateId = index => index.toString(16).padStart(64, '0');
    const recordId = index => '40000000-0000-4000-8000-' + String(index).padStart(12, '0');
    const insertTemplate = db.prepare("INSERT INTO templates (id, workspace_id, relative_path, file_name, name, extension, language, size_bytes, modified_at) VALUES (?, ?, ?, ?, ?, '.cpp', 'C++', 32, ?)");
    const insertProblem = db.prepare("INSERT INTO problems (id, workspace_id, title, platform, tags_json, statement, notes, status, created_at, updated_at) VALUES (?, ?, ?, 'local', '[]', '', '', 'unattempted', ?, ?)");
    const insertRelation = db.prepare("INSERT INTO template_problem_relations (problem_id, template_id, relation_type, source, note, created_at, updated_at) VALUES (?, ?, 'used', 'manual', '', ?, ?)");
    const payload = JSON.stringify({ contextVersion: null, diagnostic: { auditIssueCount: 0, candidateTemplateCount: 0, contextTruncated: false, notesIncludedCount: 0, requestId: null, schemaVersion: 2 }, operations: [], outputLanguage: 'zh-CN', schemaVersion: 2, summary: '' });
    const insertPlan = db.prepare("INSERT INTO file_change_plans (id, workspace_id, provider_name, model, status, operations_json, created_at, updated_at) VALUES (?, ?, 'fixture', 'fixture-model', 'cancelled', ?, ?, ?)");
    const insertExecution = db.prepare("INSERT INTO file_change_executions (id, plan_id, operations_json, backup_directory, status, created_at) VALUES (?, ?, '[{}]', ?, 'rolled-back', ?)");
    db.transaction(() => {
      for (let index = 0; index < 525; index += 1) {
        const fileName = 'page-template-' + String(index).padStart(4, '0') + '.cpp';
        insertTemplate.run(templateId(10000 + index), workspaceId, 'pagination/' + fileName, fileName, index === 524 ? 'late-unique-template' : fileName.slice(0, -4), timestamp);
      }
      for (let index = 0; index < 125; index += 1) {
        const id = recordId(10000 + index);
        insertProblem.run(id, workspaceId, 'Problem ' + index, timestamp, timestamp);
        if (index < 110) insertRelation.run(id, process.env.RELATION_TEMPLATE_ID, timestamp, timestamp);
      }
      for (let index = 0; index < 105; index += 1) {
        const planId = recordId(20000 + index);
        insertPlan.run(planId, workspaceId, payload, timestamp, timestamp);
        insertExecution.run(recordId(30000 + index), planId, process.env.SEED_DB + '.backup', timestamp);
      }
      db.prepare('UPDATE workspaces SET template_count = (SELECT count(*) FROM templates WHERE workspace_id = ? AND available = 1) WHERE id = ?').run(workspaceId, workspaceId);
    })();
    db.close();
  `
  const electronExecutable = (
    await readFile(resolve('node_modules/electron/path.txt'), 'utf8')
  ).trim()
  const electronPath = resolve('node_modules/electron/dist', electronExecutable)
  const result = spawnSync(electronPath, ['-e', script], {
    cwd: resolve('.'),
    encoding: 'utf8',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      RELATION_TEMPLATE_ID: relationTemplateId,
      SEED_DB: databasePath,
    },
  })
  expect(result.status, result.stderr || result.stdout).toBe(0)
}

async function completeRescan(expectedTemplateCount: number): Promise<void> {
  const closeNotice = page.getByRole('button', { name: '关闭提示' })
  if (await closeNotice.isVisible().catch(() => false)) await closeNotice.click()
  await page.getByRole('button', { name: '重新扫描工作区' }).click()
  await expect(page.getByRole('button', { name: '取消扫描' })).toBeVisible()
  await expect(page.getByRole('button', { name: '取消扫描' })).toHaveCount(0)
  await expect(page.getByText(`扫描完成：发现 ${expectedTemplateCount} 个模板`)).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-performance-index-'))
  userDataPath = join(temporaryRoot, 'user-data')
  workspacePath = join(temporaryRoot, 'workspace')
  databasePath = join(workspacePath, '.awb', 'workspace.sqlite')
  await mkdir(userDataPath)
  await mkdir(workspacePath)
  for (let index = 0; index < 120; index += 1) {
    const directory = join(workspacePath, `group-${index % 6}`, `bucket-${index % 10}`)
    await mkdir(directory, { recursive: true })
    await writeFile(
      join(directory, `template_${index.toString().padStart(3, '0')}.cpp`),
      `void template_${index}() { return; }\n`,
      'utf8',
    )
  }
  app = await electron.launch({
    args: [resolve('.')],
    env: {
      ...process.env,
      E2E_SCAN_DELAY_MS: '3',
      E2E_USER_DATA_DIR: userDataPath,
      NODE_ENV: 'test',
    },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await dismissGettingStartedGuideIfNeeded(page)
})

test.afterAll(async () => {
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
})

test('publishes deterministic incremental changes and cancels without partial SQLite state', async () => {
  await selectDirectory(await realpath(workspacePath))
  await page.getByRole('button', { name: '选择目录' }).click()
  await expect(page.getByText('120 个模板').first()).toBeVisible()

  const initial = await inspectIndex()
  expect(initial.skippedSymlinkCount).toBe(0)
  expect(initial.templates).toHaveLength(120)
  expect(
    initial.templates.every(template => template.indexVersion === TEMPLATE_INDEX_VERSION),
  ).toBe(true)
  expect(initial.templates.every(template => /^[a-f0-9]{64}$/u.test(template.contentHash))).toBe(
    true,
  )
  const firstTemplate = initial.templates[0]!
  const firstSource = join(workspacePath, 'templates', firstTemplate.relativePath)
  const originalSource = await readFile(firstSource, 'utf8')

  const problemId = await page.evaluate(async templateId => {
    const desktop = (globalThis as unknown as { desktop: DesktopApi }).desktop
    const problem = await desktop.problems.create({
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
      platform: 'fixture',
      problemCode: 'PERF-1',
      statement: 'deterministic fixture',
      status: 'unattempted',
      tags: ['performance'],
      title: '增量索引关系夹具',
      url: null,
    })
    await desktop.problems.upsertRelation({
      note: '',
      problemId: problem.id,
      relationType: 'used',
      templateId,
    })
    return problem.id
  }, firstTemplate.id)

  const statsBeforeCancel = JSON.stringify(initial.scanStats)
  await page.getByRole('button', { name: '重新扫描工作区' }).click()
  await expect(page.getByRole('button', { name: '取消扫描' })).toBeVisible()
  await expect(page.getByText(/已处理 \d+/)).toBeVisible()
  await page.getByRole('button', { name: '取消扫描' }).click()
  await expect(page.getByRole('button', { name: '取消扫描' })).toHaveCount(0)
  expect(JSON.stringify((await inspectIndex()).scanStats)).toBe(statsBeforeCancel)
  expect(await readFile(firstSource, 'utf8')).toBe(originalSource)

  await completeRescan(120)
  const unchanged = await inspectIndex()
  expect(unchanged.scanStats).toMatchObject({
    hashedCount: 0,
    reusedCount: 120,
    unchangedCount: 120,
  })

  const originalStats = await stat(firstSource)
  const changedSource = originalSource.replace('template_', 'changed__')
  expect(changedSource).toHaveLength(originalSource.length)
  await writeFile(firstSource, changedSource, 'utf8')
  await utimes(firstSource, originalStats.atime, originalStats.mtime)
  await completeRescan(120)
  const modified = await inspectIndex()
  expect(modified.scanStats).toMatchObject({ hashedCount: 1, modifiedCount: 1, reusedCount: 119 })
  expect(
    modified.templates.find(template => template.id === firstTemplate.id)?.contentHash,
  ).not.toBe(firstTemplate.contentHash)

  const movedPath = join(workspacePath, 'templates', 'renamed', 'stable-template.cpp')
  await mkdir(join(workspacePath, 'templates', 'renamed'))
  await rename(firstSource, movedPath)
  await completeRescan(120)
  const moved = await inspectIndex()
  expect(moved.scanStats.movedCount).toBe(1)
  expect(moved.templates.find(template => template.id === firstTemplate.id)?.relativePath).toBe(
    'renamed/stable-template.cpp',
  )
  expect(moved.relations).toContainEqual({ problemId, templateId: firstTemplate.id })

  await unlink(movedPath)
  await completeRescan(119)
  const removed = await inspectIndex()
  expect(removed.scanStats.removedCount).toBe(1)
  expect(removed.templates.find(template => template.id === firstTemplate.id)?.available).toBe(0)
  expect(removed.relations).toContainEqual({ problemId, templateId: firstTemplate.id })
})

test('pages templates, problems, relations, plans, and executions without silent cutoffs', async () => {
  const availableTemplate = (await inspectIndex()).templates.find(
    template => template.available === 1,
  )
  expect(availableTemplate).toBeTruthy()
  await seedPaginationRecords(availableTemplate!.id)

  const evidence = await page.evaluate(async templateId => {
    const desktop = (globalThis as unknown as { desktop: DesktopApi }).desktop
    const collect = async <Item>(
      load: (cursor: string | null) => Promise<{ items: Item[]; nextCursor: string | null }>,
    ) => {
      const items: Item[] = []
      let cursor: string | null = null
      do {
        const next = await load(cursor)
        items.push(...next.items)
        cursor = next.nextCursor
      } while (cursor)
      return items
    }
    const checked = async <Item>(
      label: string,
      operation: () => Promise<Item[]>,
    ): Promise<Item[]> => {
      try {
        return await operation()
      } catch (error) {
        throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        })
      }
    }
    const templates = await checked('templates', () =>
      collect(cursor => desktop.templates.listPage({ cursor, limit: 500, query: '' })),
    )
    const problems = await checked('problems', () =>
      collect(cursor => desktop.problems.listPage({ cursor, limit: 100, query: '' })),
    )
    const relations = await checked('relations', () =>
      collect(cursor => desktop.problems.listByTemplate({ cursor, limit: 100, templateId })),
    )
    const plans = await checked('plans', () =>
      collect(cursor => desktop.templateManagement.listFilePlansPage({ cursor, limit: 50 })),
    )
    const executions = await checked('executions', () =>
      collect(cursor => desktop.templateManagement.listFileExecutionsPage({ cursor, limit: 50 })),
    )
    const lateSearch = await desktop.templates.listPage({
      cursor: null,
      limit: 200,
      query: 'late-unique',
    })
    return {
      executionIds: executions.map(item => item.id),
      lateSearch: lateSearch.items.map(item => item.name),
      planIds: plans.map(item => item.id),
      problemIds: problems.map(item => item.id),
      relationIds: relations.map(item => item.id),
      templateIds: templates.map(item => item.id),
    }
  }, availableTemplate!.id)

  expect(evidence.templateIds).toHaveLength(644)
  expect(new Set(evidence.templateIds).size).toBe(644)
  expect(evidence.lateSearch).toEqual(['late-unique-template'])
  expect(evidence.problemIds).toHaveLength(126)
  expect(new Set(evidence.problemIds).size).toBe(126)
  expect(evidence.relationIds).toHaveLength(110)
  expect(new Set(evidence.relationIds).size).toBe(110)
  expect(evidence.planIds).toHaveLength(105)
  expect(new Set(evidence.planIds).size).toBe(105)
  expect(evidence.executionIds).toHaveLength(105)
  expect(new Set(evidence.executionIds).size).toBe(105)

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900))
  await page.getByRole('button', { name: '算法模板，打开模板库' }).click()
  await expect(page.getByRole('button', { name: /加载更多模板.*500.*644/ })).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/session-e-template-page-1440x900-light.png'),
  })
  const templateSearch = page.getByRole('textbox', { name: '筛选模板树' })
  await templateSearch.fill('late-unique')
  await expect(page.getByRole('treeitem', { name: /page-template-0524/ })).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/session-e-template-search-1440x900-light.png'),
  })
  await templateSearch.fill('')
  await page.getByRole('button', { name: /加载更多模板.*500.*644/ }).click()
  await expect(page.getByRole('button', { name: /加载更多模板/ })).toHaveCount(0)

  await page.getByRole('button', { name: '题目', exact: true }).click()
  await expect(page.getByRole('button', { name: /加载更多题目.*100.*126/ })).toBeVisible()
  await page.getByRole('button', { name: /加载更多题目.*100.*126/ }).click()
  await expect(page.getByRole('button', { name: /加载更多题目/ })).toHaveCount(0)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1024, 640))
  const problemList = page.getByRole('listbox', { name: '题目列表' })
  await problemList.focus()
  await problemList.press('End')
  await problemList.press('Enter')
  expect(
    await page.evaluate(() => {
      const view = globalThis as unknown as {
        document: { documentElement: { scrollWidth: number } }
        innerWidth: number
      }
      return view.document.documentElement.scrollWidth <= view.innerWidth
    }),
  ).toBe(true)
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/session-e-problem-page-1024x640-light.png'),
  })
  await page.getByRole('button', { name: '切换到深色主题' }).click()
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/session-e-problem-page-1024x640-dark.png'),
  })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 720))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.screenshot({
    animations: 'disabled',
    path: resolve('output/playwright/session-e-problem-page-1280x720-reduced-motion.png'),
  })
})
