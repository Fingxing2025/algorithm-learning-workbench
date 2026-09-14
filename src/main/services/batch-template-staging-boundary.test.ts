// @vitest-environment node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AiProviderService } from './ai-provider-service'
import type { AiTaskRunRegistry } from './ai-task-run-registry'
import { BatchTemplateStagingService } from './batch-template-staging-service'
import { createDatabaseAtPath } from '../database/database'
import { BatchTemplateStagingRepository } from '../database/batch-template-staging-repository'
import { TemplateManagementRepository } from '../database/template-management-repository'
import { appState, workspaces } from '../database/schema'
import { WorkspaceRepository } from '../database/workspace-repository'
import { WorkspaceStorageManager } from './workspace-storage'
import { WorkspaceService } from './workspace-service'

const workspaceId = '70000000-0000-4000-8000-000000000001'
const sourceId = '70000000-0000-4000-8000-000000000002'
const workspaceVersion = 'b'.repeat(64)

type Harness = {
  database: ReturnType<typeof createDatabaseAtPath>
  repository: BatchTemplateStagingRepository
  service: BatchTemplateStagingService
  storage: WorkspaceStorageManager
  temporaryRoot: string
  templatesRoot: string
}

type ManifestFixture = {
  baseTemplatePaths: string[]
  items: unknown[]
}

const harnesses: Harness[] = []

async function createHarness(): Promise<Harness> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-staging-boundary-'))
  const containerRoot = join(temporaryRoot, 'workspace')
  await mkdir(containerRoot, { recursive: true })
  const storage = new WorkspaceStorageManager()
  const paths = await storage.initialize(containerRoot, {
    createdAt: '2026-09-03T00:00:00.000Z',
    formatVersion: 2,
    name: '暂存边界测试工作区',
    templateDirectory: 'templates',
    workspaceId,
  })
  storage.activate(paths)
  const templatesRoot = paths.templateRoot
  await writeFile(join(templatesRoot, 'base.cpp'), 'int base() { return 1; }\n', 'utf8')

  const database = createDatabaseAtPath(paths.databasePath)
  database.orm
    .insert(workspaces)
    .values({
      createdAt: '2026-09-03T00:00:00.000Z',
      id: workspaceId,
      name: '暂存边界测试工作区',
      rootPath: templatesRoot,
    })
    .run()
  database.orm.insert(appState).values({ key: 'active_workspace_id', value: workspaceId }).run()

  const workspaceRepository = new WorkspaceRepository(database)
  const metadataRepository = new TemplateManagementRepository(database)
  const workspaceService = new WorkspaceService(
    workspaceRepository,
    metadataRepository,
    temporaryRoot,
  )
  const repository = new BatchTemplateStagingRepository(database)
  const service = new BatchTemplateStagingService({
    aiProviderService: {} as AiProviderService,
    aiTaskRunRegistry: { cancel: vi.fn() } as unknown as AiTaskRunRegistry,
    classify: vi.fn(),
    metadataRepository,
    repository,
    workspaceAiContextService: {
      getCurrentVersion: () => ({ version: workspaceVersion, workspaceId }),
    } as never,
    workspaceRepository,
    workspaceService,
    workspaceStorage: storage,
  })
  const harness = { database, repository, service, storage, temporaryRoot, templatesRoot }
  harnesses.push(harness)
  return harness
}

async function createReadyBatch(harness: Harness): Promise<string> {
  const created = await harness.service.create({
    outputLanguage: 'zh-CN',
    sources: [
      {
        content: 'int imported() { return 2; }\n',
        displayPath: 'imported.cpp',
        fileName: 'imported.cpp',
        id: sourceId,
        sourceEncoding: 'utf-8',
      },
    ],
  })
  const ready = await harness.service.continue({ runAi: false, stagingId: created.id })
  expect(ready.status).toBe('ready')
  return created.id
}

async function manifestPath(harness: Harness, stagingId: string): Promise<string> {
  return join(harness.storage.requireActive().dataRoot, 'staging', stagingId, 'manifest.json')
}

async function tamperManifest(
  harness: Harness,
  stagingId: string,
  mutate: (manifest: ManifestFixture) => void,
): Promise<void> {
  const path = await manifestPath(harness, stagingId)
  const manifest = JSON.parse(await readFile(path, 'utf8')) as ManifestFixture
  mutate(manifest)
  await writeFile(path, `${JSON.stringify(manifest)}\n`, 'utf8')
}

afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    harness.database.close()
    await rm(harness.temporaryRoot, { force: true, recursive: true })
  }
})

describe('batch staging apply and manifest boundaries', () => {
  it('rejects an unregistered file in the staging tree before publishing main', async () => {
    const harness = await createHarness()
    const stagingId = await createReadyBatch(harness)
    const stagingTemplates = join(
      harness.storage.requireActive().dataRoot,
      'staging',
      stagingId,
      'templates',
    )
    await writeFile(join(stagingTemplates, 'unregistered.cpp'), 'int rogue() {}\n', 'utf8')

    await expect(harness.service.apply({ confirmed: true, stagingId })).rejects.toMatchObject({
      code: 'FILE_UNAVAILABLE',
      message: '暂存目录包含未登记文件，请重新创建批次。',
    })
    await expect(readFile(join(harness.templatesRoot, 'imported.cpp'), 'utf8')).rejects.toThrow()
    expect(harness.repository.get(workspaceId, stagingId)?.session.status).toBe('ready')
  })

  it('rejects case-folded baseline collisions in a tampered manifest', async () => {
    const harness = await createHarness()
    const stagingId = await createReadyBatch(harness)
    await tamperManifest(harness, stagingId, manifest => {
      manifest.baseTemplatePaths.push('BASE.cpp')
    })

    await expect(harness.service.apply({ confirmed: true, stagingId })).rejects.toMatchObject({
      code: 'FILE_UNAVAILABLE',
      message: '暂存清单缺失或已损坏，请重新选择源码。',
    })
    expect(harness.repository.get(workspaceId, stagingId)?.session.status).toBe('ready')
  })

  it('keeps the manifest and staging tree synchronized when editing or skipping an item', async () => {
    const harness = await createHarness()
    const stagingId = await createReadyBatch(harness)
    const renamed = await harness.service.updateItem({
      action: 'include',
      sourceId,
      stagingId,
      targetRelativePath: 'graphs/imported.cpp',
    })
    expect(renamed.items[0]).toMatchObject({
      status: 'completed',
      targetRelativePath: 'graphs/imported.cpp',
    })
    const stagingTemplates = join(
      harness.storage.requireActive().dataRoot,
      'staging',
      stagingId,
      'templates',
    )
    await expect(
      readFile(join(stagingTemplates, 'graphs', 'imported.cpp'), 'utf8'),
    ).resolves.toContain('int imported()')
    await expect(harness.service.continue({ runAi: false, stagingId })).resolves.toMatchObject({
      status: 'ready',
    })

    const skipped = await harness.service.updateItem({
      action: 'skip',
      sourceId,
      stagingId,
      targetRelativePath: null,
    })
    expect(skipped.items[0]?.status).toBe('skipped')
    await expect(
      readFile(join(stagingTemplates, 'graphs', 'imported.cpp'), 'utf8'),
    ).rejects.toThrow()
    await expect(harness.service.continue({ runAi: false, stagingId })).resolves.toMatchObject({
      status: 'ready',
    })
  })

  it.each([
    {
      label: 'more than 100 items',
      mutate: (manifest: ManifestFixture) => {
        manifest.items = Array.from({ length: 101 }, () => manifest.items[0])
      },
    },
    {
      label: 'a baseline path longer than 4096 characters',
      mutate: (manifest: ManifestFixture) => {
        manifest.baseTemplatePaths = ['a'.repeat(4097)]
      },
    },
  ])('fails closed when the manifest exceeds the $label limit', async ({ mutate }) => {
    const harness = await createHarness()
    const stagingId = await createReadyBatch(harness)
    await tamperManifest(harness, stagingId, mutate)

    await expect(harness.service.continue({ runAi: false, stagingId })).rejects.toMatchObject({
      code: 'FILE_UNAVAILABLE',
      message: '暂存清单缺失或已损坏，请重新选择源码。',
    })
    expect(harness.repository.get(workspaceId, stagingId)?.session.status).toBe('ready')
  })
})
