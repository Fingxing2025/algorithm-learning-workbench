// @vitest-environment node

import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabaseAtPath, WorkspaceDatabaseManager } from '../database/database'
import { WorkspaceRepository } from '../database/workspace-repository'
import { WorkspaceRuntimeManager } from './workspace-runtime-manager'
import { WorkspaceStorageManager } from './workspace-storage'

describe('WorkspaceRuntimeManager current workspace format', () => {
  let databaseManager: WorkspaceDatabaseManager
  let registryDatabase: ReturnType<typeof createDatabaseAtPath>
  let runtime: WorkspaceRuntimeManager
  let temporaryRoot: string

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-current-workspace-'))
    registryDatabase = createDatabaseAtPath(join(temporaryRoot, 'registry.sqlite'))
    databaseManager = new WorkspaceDatabaseManager()
    const repository = new WorkspaceRepository(databaseManager.database, registryDatabase)
    runtime = new WorkspaceRuntimeManager(
      databaseManager,
      repository,
      new WorkspaceStorageManager(),
    )
  })

  afterEach(async () => {
    databaseManager.close()
    registryDatabase.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  })

  it('creates only the current marker format with a fixed templates directory', async () => {
    const containerRoot = join(temporaryRoot, 'empty-workspace')
    await mkdir(containerRoot)

    const workspace = await runtime.activateContainer(containerRoot, {
      intent: 'create',
      name: '当前工作区',
    })

    expect(await realpath(workspace.rootPath)).toBe(
      await realpath(join(containerRoot, 'templates')),
    )
    const marker = JSON.parse(
      await readFile(join(containerRoot, 'workspace.awb.json'), 'utf8'),
    ) as Record<string, unknown>
    expect(marker).toMatchObject({
      formatVersion: 2,
      name: '当前工作区',
      templateDirectory: 'templates',
    })
    await expect(readFile(join(containerRoot, '.awb', 'workspace.sqlite'))).resolves.toBeTruthy()
  })

  it('upgrades an existing folder by moving its complete tree under templates without rewriting bytes', async () => {
    const containerRoot = join(temporaryRoot, 'existing-folder')
    const originalBytes = Buffer.from([0xff, 0xfe, 0x2f, 0x00, 0x2f, 0x00, 0x20, 0x00])
    await mkdir(join(containerRoot, '图论'), { recursive: true })
    await writeFile(join(containerRoot, '图论', '最短路.cpp'), originalBytes)
    await writeFile(join(containerRoot, 'README.md'), '# 模板说明\n', 'utf8')

    const workspace = await runtime.activateContainer(containerRoot, {
      intent: 'open',
      name: '升级工作区',
    })

    expect(await realpath(workspace.rootPath)).toBe(
      await realpath(join(containerRoot, 'templates')),
    )
    await expect(readFile(join(containerRoot, 'templates', '图论', '最短路.cpp'))).resolves.toEqual(
      originalBytes,
    )
    await expect(readFile(join(containerRoot, 'templates', 'README.md'), 'utf8')).resolves.toBe(
      '# 模板说明\n',
    )
    await expect(readFile(join(containerRoot, '图论', '最短路.cpp'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('keeps an existing templates tree and moves remaining root entries into it', async () => {
    const containerRoot = join(temporaryRoot, 'partially-arranged')
    await mkdir(join(containerRoot, 'templates', '动态规划'), { recursive: true })
    await mkdir(join(containerRoot, '图论'), { recursive: true })
    await writeFile(join(containerRoot, 'templates', '动态规划', '背包.cpp'), 'int dp;\n')
    await writeFile(join(containerRoot, '图论', '最短路.cpp'), 'int graph;\n')

    await runtime.activateContainer(containerRoot, { intent: 'open' })

    await expect(
      readFile(join(containerRoot, 'templates', '动态规划', '背包.cpp'), 'utf8'),
    ).resolves.toBe('int dp;\n')
    await expect(
      readFile(join(containerRoot, 'templates', '图论', '最短路.cpp'), 'utf8'),
    ).resolves.toBe('int graph;\n')
  })

  it('rejects symlinks before moving anything or publishing managed files', async () => {
    const containerRoot = join(temporaryRoot, 'symlink-folder')
    const outsidePath = join(temporaryRoot, 'outside.cpp')
    await mkdir(containerRoot)
    await writeFile(outsidePath, 'int outside;\n')
    await symlink(outsidePath, join(containerRoot, 'linked.cpp'))

    await expect(
      runtime.activateContainer(containerRoot, { intent: 'open' }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(readFile(join(containerRoot, 'linked.cpp'), 'utf8')).resolves.toBe(
      'int outside;\n',
    )
    await expect(readFile(join(containerRoot, 'workspace.awb.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('rejects previous marker versions instead of entering a compatibility mode', async () => {
    const containerRoot = join(temporaryRoot, 'previous-marker')
    await mkdir(containerRoot)
    await writeFile(
      join(containerRoot, 'workspace.awb.json'),
      JSON.stringify({
        createdAt: new Date().toISOString(),
        formatVersion: 1,
        name: '旧格式',
        templateDirectory: '.',
        workspaceId: '50000000-0000-4000-8000-000000000001',
      }),
      'utf8',
    )

    await expect(runtime.storage.inspect(containerRoot)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    })
  })
})
