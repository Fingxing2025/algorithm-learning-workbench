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
  } finally {
    await electronApp?.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
