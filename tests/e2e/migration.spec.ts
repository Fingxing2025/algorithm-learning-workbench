import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

test('upgrades a stage 1 database without losing the existing workspace or template index', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-migration-'))
  const userDataDirectory = join(temporaryRoot, 'user-data')
  const workspaceRoot = join(temporaryRoot, 'legacy-workspace')
  await mkdir(userDataDirectory)
  await mkdir(workspaceRoot)
  await writeFile(join(workspaceRoot, 'legacy.cpp'), 'void legacy() {}\n', 'utf8')
  const canonicalWorkspace = await realpath(workspaceRoot)
  const initialMigrationPath = resolve('drizzle/0000_initial.sql')
  const databasePath = join(userDataDirectory, 'algorithm-workbench.sqlite')
  const electronExecutable = (
    await readFile(resolve('node_modules/electron/path.txt'), 'utf8')
  ).trim()
  const electronPath = resolve('node_modules/electron/dist', electronExecutable)

  const seedScript = String.raw`
    const fs = require('node:fs');
    const Database = require('better-sqlite3');
    const db = new Database(process.env.SEED_DB);
    db.pragma('foreign_keys = ON');
    db.exec(fs.readFileSync(process.env.SEED_SQL, 'utf8'));
    db.exec('CREATE TABLE app_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);');
    db.prepare('INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)').run('0000_initial', new Date().toISOString());
    const workspaceId = '40000000-0000-4000-8000-000000000099';
    db.prepare('INSERT INTO workspaces (id, name, root_path, created_at, scanned_at, template_count) VALUES (?, ?, ?, ?, ?, ?)').run(workspaceId, '阶段 1 工作区', process.env.SEED_WORKSPACE, new Date().toISOString(), new Date().toISOString(), 1);
    db.prepare('INSERT INTO templates (id, workspace_id, relative_path, file_name, name, extension, language, size_bytes, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('a'.repeat(64), workspaceId, 'legacy.cpp', 'legacy.cpp', 'legacy', '.cpp', 'C++', 17, new Date().toISOString());
    db.prepare('INSERT INTO app_state (key, value) VALUES (?, ?)').run('active_workspace_id', workspaceId);
    db.close();
  `
  const seeded = spawnSync(electronPath, ['-e', seedScript], {
    cwd: resolve('.'),
    encoding: 'utf8',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      SEED_DB: databasePath,
      SEED_SQL: initialMigrationPath,
      SEED_WORKSPACE: canonicalWorkspace,
    },
  })
  expect(seeded.status, seeded.stderr || seeded.stdout).toBe(0)

  let electronApp: ElectronApplication | null = null
  try {
    electronApp = await electron.launch({
      args: [resolve('.')],
      env: {
        ...process.env,
        E2E_USER_DATA_DIR: userDataDirectory,
        NODE_ENV: 'test',
      },
    })
    const page = await electronApp.firstWindow()
    await expect(page.getByText('阶段 1 工作区').first()).toBeVisible()
    await page.getByRole('button', { name: '模板库', exact: true }).click()
    await expect(page.getByText('legacy.cpp')).toBeVisible()
    await page.getByRole('button', { name: '题目', exact: true }).click()
    await expect(page.getByText('还没有题目卡片')).toBeVisible()
    expect(await readFile(join(workspaceRoot, 'legacy.cpp'), 'utf8')).toBe('void legacy() {}\n')
    await electronApp.close()
    electronApp = null

    const inspectScript = String.raw`
      const Database = require('better-sqlite3');
      const db = new Database(process.env.SEED_DB, { readonly: true });
      const migration = db.prepare('SELECT id FROM app_migrations WHERE id = ?').get('0006_performance_indexing');
      const templateColumns = db.prepare('PRAGMA table_info(templates)').all().map(row => row.name);
      const workspaceColumns = db.prepare('PRAGMA table_info(workspaces)').all().map(row => row.name);
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(row => row.name);
      const template = db.prepare('SELECT id, available, index_version, content_hash FROM templates').get();
      process.stdout.write(JSON.stringify({ indexes, migration, template, templateColumns, workspaceColumns }));
      db.close();
    `
    const inspected = spawnSync(electronPath, ['-e', inspectScript], {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', SEED_DB: databasePath },
    })
    expect(inspected.status, inspected.stderr || inspected.stdout).toBe(0)
    const result = JSON.parse(inspected.stdout) as {
      indexes: string[]
      migration: { id: string }
      template: {
        available: number
        content_hash: string | null
        id: string
        index_version: number
      }
      templateColumns: string[]
      workspaceColumns: string[]
    }
    expect(result.migration.id).toBe('0006_performance_indexing')
    expect(result.templateColumns).toEqual(
      expect.arrayContaining([
        'content_hash',
        'file_identity',
        'change_token',
        'normalized_content_hash',
        'similarity_signature_json',
        'index_version',
      ]),
    )
    expect(result.workspaceColumns).toContain('scan_stats_json')
    expect(result.indexes).toEqual(
      expect.arrayContaining([
        'templates_workspace_available_path_index',
        'problems_updated_id_index',
      ]),
    )
    expect(result.template).toEqual({
      available: 1,
      content_hash: null,
      id: 'a'.repeat(64),
      index_version: 0,
    })
  } finally {
    await electronApp?.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})

test('adds structured AI fields to existing V2 problems without changing user data', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-problem-migration-'))
  const userDataDirectory = join(temporaryRoot, 'user-data')
  const workspaceRoot = join(temporaryRoot, 'stage4-workspace')
  await mkdir(userDataDirectory)
  await mkdir(workspaceRoot)
  await writeFile(join(workspaceRoot, 'dijkstra.cpp'), 'void dijkstra() {}\n', 'utf8')
  const canonicalWorkspace = await realpath(workspaceRoot)
  const databasePath = join(userDataDirectory, 'algorithm-workbench.sqlite')
  const electronExecutable = (
    await readFile(resolve('node_modules/electron/path.txt'), 'utf8')
  ).trim()
  const electronPath = resolve('node_modules/electron/dist', electronExecutable)
  const migrationPaths = [0, 1, 2, 3].map(index =>
    resolve(
      index === 0
        ? 'drizzle/0000_initial.sql'
        : index === 1
          ? 'drizzle/0001_problems_relations.sql'
          : index === 2
            ? 'drizzle/0002_ai_providers.sql'
            : 'drizzle/0003_template_management.sql',
    ),
  )

  const seedScript = String.raw`
    const fs = require('node:fs');
    const Database = require('better-sqlite3');
    const db = new Database(process.env.SEED_DB);
    db.pragma('foreign_keys = ON');
    for (const path of JSON.parse(process.env.SEED_SQLS)) db.exec(fs.readFileSync(path, 'utf8'));
    db.exec('CREATE TABLE app_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);');
    const now = new Date().toISOString();
    for (const id of ['0000_initial', '0001_problems_relations', '0002_ai_providers', '0003_template_management']) db.prepare('INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)').run(id, now);
    const workspaceId = '40000000-0000-4000-8000-000000000088';
    const templateId = 'c'.repeat(64);
    const problemId = '40000000-0000-4000-8000-000000000089';
    db.prepare('INSERT INTO workspaces (id, name, root_path, created_at, scanned_at, template_count) VALUES (?, ?, ?, ?, ?, ?)').run(workspaceId, '阶段 4 工作区', process.env.SEED_WORKSPACE, now, now, 1);
    db.prepare('INSERT INTO templates (id, workspace_id, relative_path, file_name, name, extension, language, size_bytes, modified_at, available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(templateId, workspaceId, 'dijkstra.cpp', 'dijkstra.cpp', 'dijkstra', '.cpp', 'C++', 19, now, 1);
    db.prepare('INSERT INTO problems (id, title, platform, problem_code, difficulty, tags_json, statement, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(problemId, '升级前题目', '洛谷', 'PTEST', '普及', '["图论"]', '这是用户保存的原始题面，升级时不得改写。', '用户笔记', 'attempted', now, now);
    db.prepare('INSERT INTO problem_images (id, problem_id, relative_path, original_name, media_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('40000000-0000-4000-8000-000000000090', problemId, 'problem-images/fixture.png', 'fixture.png', 'image/png', 68, now);
    db.prepare('INSERT INTO template_problem_relations (problem_id, template_id, relation_type, source, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(problemId, templateId, 'used', 'manual', '用户关联', now, now);
    db.prepare('INSERT INTO app_state (key, value) VALUES (?, ?)').run('active_workspace_id', workspaceId);
    db.close();
  `
  const seeded = spawnSync(electronPath, ['-e', seedScript], {
    cwd: resolve('.'),
    encoding: 'utf8',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      SEED_DB: databasePath,
      SEED_SQLS: JSON.stringify(migrationPaths),
      SEED_WORKSPACE: canonicalWorkspace,
    },
  })
  expect(seeded.status, seeded.stderr || seeded.stdout).toBe(0)

  let electronApp: ElectronApplication | null = null
  try {
    electronApp = await electron.launch({
      args: [resolve('.')],
      env: {
        ...process.env,
        E2E_USER_DATA_DIR: userDataDirectory,
        NODE_ENV: 'test',
      },
    })
    const page = await electronApp.firstWindow()
    await page.getByRole('button', { name: '题目', exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: '升级前题目' })).toBeVisible()
    await expect(page.getByText('这是用户保存的原始题面，升级时不得改写。')).toBeVisible()
    await expect(page.getByText('1 个已确认关联')).toBeVisible()
    await electronApp.close()
    electronApp = null

    const inspectScript = String.raw`
      const Database = require('better-sqlite3');
      const db = new Database(process.env.SEED_DB, { readonly: true });
      const problem = db.prepare('SELECT statement, ai_summary, analysis_json FROM problems').get();
      const counts = {
        images: db.prepare('SELECT COUNT(*) AS count FROM problem_images').get().count,
        relations: db.prepare('SELECT COUNT(*) AS count FROM template_problem_relations').get().count,
        templates: db.prepare('SELECT COUNT(*) AS count FROM templates').get().count,
      };
      process.stdout.write(JSON.stringify({ counts, problem }));
      db.close();
    `
    const inspected = spawnSync(electronPath, ['-e', inspectScript], {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', SEED_DB: databasePath },
    })
    expect(inspected.status, inspected.stderr || inspected.stdout).toBe(0)
    const result = JSON.parse(inspected.stdout) as {
      counts: { images: number; relations: number; templates: number }
      problem: { ai_summary: string; analysis_json: string; statement: string }
    }
    expect(result.problem.statement).toBe('这是用户保存的原始题面，升级时不得改写。')
    expect(result.problem.ai_summary).toBe('')
    expect(JSON.parse(result.problem.analysis_json)).toEqual({
      algorithmSignals: [],
      constraints: [],
      edgeCases: [],
      examples: [],
      inputDescription: '',
      outputDescription: '',
    })
    expect(result.counts).toEqual({ images: 1, relations: 1, templates: 1 })
  } finally {
    await electronApp?.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
