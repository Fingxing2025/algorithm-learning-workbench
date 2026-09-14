// @vitest-environment node

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { previewBatchStagingClassificationResultSchema } from '@core/contracts/template-management'

import type { AiProviderService } from './ai-provider-service'
import type { AiTaskRunRegistry } from './ai-task-run-registry'
import {
  BatchTemplateStagingService,
  type BatchTemplateStagingServiceOptions,
} from './batch-template-staging-service'
import { createDatabaseAtPath } from '../database/database'
import { TemplateManagementRepository } from '../database/template-management-repository'
import { appState, workspaces } from '../database/schema'
import { BatchTemplateStagingRepository } from '../database/batch-template-staging-repository'
import { WorkspaceRepository } from '../database/workspace-repository'
import { WorkspaceStorageManager } from './workspace-storage'
import { WorkspaceService } from './workspace-service'

const workspaceId = '60000000-0000-4000-8000-000000000001'
const sourceId = '60000000-0000-4000-8000-000000000002'
const secondSourceId = '60000000-0000-4000-8000-000000000003'
const workspaceVersion = 'b'.repeat(64)

describe('BatchTemplateStagingService apply commit barrier', () => {
  let temporaryRoot: string
  let database: ReturnType<typeof createDatabaseAtPath>
  let service: BatchTemplateStagingService
  let workspaceRepository: WorkspaceRepository
  let storage: WorkspaceStorageManager
  let templatesRoot: string
  let classify: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-batch-service-'))
    const containerRoot = join(temporaryRoot, 'workspace')
    await mkdir(containerRoot, { recursive: true })
    storage = new WorkspaceStorageManager()
    const paths = await storage.initialize(containerRoot, {
      createdAt: '2026-09-03T00:00:00.000Z',
      formatVersion: 2,
      name: '批量测试工作区',
      templateDirectory: 'templates',
      workspaceId,
    })
    storage.activate(paths)
    templatesRoot = paths.templateRoot
    await writeFile(join(templatesRoot, 'base.cpp'), 'int base() { return 1; }\n', 'utf8')

    database = createDatabaseAtPath(paths.databasePath)
    database.orm
      .insert(workspaces)
      .values({
        createdAt: '2026-09-03T00:00:00.000Z',
        id: workspaceId,
        name: '批量测试工作区',
        rootPath: templatesRoot,
      })
      .run()
    database.orm.insert(appState).values({ key: 'active_workspace_id', value: workspaceId }).run()

    workspaceRepository = new WorkspaceRepository(database)
    const metadataRepository = new TemplateManagementRepository(database)
    const workspaceService = new WorkspaceService(
      workspaceRepository,
      metadataRepository,
      temporaryRoot,
    )
    classify = vi.fn() as unknown as ReturnType<typeof vi.fn>
    service = new BatchTemplateStagingService({
      aiProviderService: {
        getTaskTarget: () => ({
          capabilities: {
            promptCaching: false,
            streaming: false,
            structuredOutput: true,
            vision: false,
          },
          endpointHost: 'api.example.test',
          id: '70000000-0000-4000-8000-000000000001',
          model: 'fixture-model',
          protocol: 'openai-responses',
          providerName: 'Fixture Provider',
        }),
      } as unknown as AiProviderService,
      aiTaskRunRegistry: { cancel: vi.fn() } as unknown as AiTaskRunRegistry,
      classify: classify as unknown as BatchTemplateStagingServiceOptions['classify'],
      metadataRepository,
      repository: new BatchTemplateStagingRepository(database),
      workspaceAiContextService: {
        build: vi.fn(async () => ({
          cacheKey: 'w'.repeat(196),
          catalogDirectoryCount: 0,
          catalogTemplateRefs: [],
          contextTruncated: false,
          estimatedCharacters: 64,
          estimatedInputTokens: 16,
          relatedContext: '{"relatedTemplates":[]}',
          relatedSourceCharacters: 0,
          relatedSourceTemplateCount: 0,
          relatedTemplateRefs: [],
          relatedTemplateCount: 0,
          sentTemplateNameCount: 0,
          sourceSnippetsOmitted: false,
          stableContext: JSON.stringify({
            workspaceCatalog: {
              directories: [],
              rootTemplates: [],
              workspace: { directoryCount: 0, templateCount: 0 },
            },
          }),
          summarizedTemplateCount: 0,
          summaryShortened: false,
          supplementalMetadataOmitted: false,
          templateCount: 0,
          templateNamesTruncated: false,
          version: 'e'.repeat(64),
        })),
        getCurrentVersion: () => ({ version: workspaceVersion, workspaceId }),
      } as never,
      workspaceRepository,
      workspaceService,
      workspaceStorage: storage,
    })
  })

  afterEach(async () => {
    database.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  })

  it('keeps the published tree and applied row when the committed journal cannot be written', async () => {
    const content = 'int imported() { return 2; }\n'
    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content,
          displayPath: 'imported.cpp',
          fileName: 'imported.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
      ],
    })
    const ready = await service.continue({ runAi: false, stagingId: created.id })
    expect(ready.status).toBe('ready')

    const originalWriteJournal = (
      service as unknown as {
        writeApplyJournal: (path: string, journal: { phase: string }) => Promise<void>
      }
    ).writeApplyJournal
    type JournalWriter = {
      writeApplyJournal: (path: string, journal: { phase: string }) => Promise<void>
    }
    const journalWriter = service as unknown as JournalWriter
    const journalSpy = vi.spyOn(journalWriter, 'writeApplyJournal')
    journalSpy.mockImplementation(async (path, journal) => {
      if (journal.phase === 'committed') throw new Error('injected committed journal failure')
      return originalWriteJournal.call(service, path, journal as never)
    })

    await expect(service.apply({ confirmed: true, stagingId: created.id })).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: '暂存批次已应用，但收尾日志未完成，请在数据管理中保留恢复证据。',
    })
    journalSpy.mockRestore()

    expect(await readFile(join(templatesRoot, 'imported.cpp'), 'utf8')).toBe(content)
    expect(await readFile(join(templatesRoot, 'base.cpp'), 'utf8')).toBe(
      'int base() { return 1; }\n',
    )
    const persisted = workspaceRepository
      ? new BatchTemplateStagingRepository(database).get(workspaceId, created.id)
      : null
    expect(persisted?.session.status).toBe('applied')

    const recoveryRoot = storage.requireActive().recoveryRoot
    const recoveryEntries = await readdir(recoveryRoot, { withFileTypes: true })
    const batchRecovery = recoveryEntries.find(entry => entry.name === 'batch-staging')
    expect(batchRecovery?.isDirectory()).toBe(true)
    const operationEntries = await readdir(join(recoveryRoot, 'batch-staging'))
    expect(operationEntries).toHaveLength(1)
    const journalPath = join(recoveryRoot, 'batch-staging', operationEntries[0]!, 'journal.json')
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { phase: string }
    expect(journal.phase).toBe('recovery-required')

    // The source copy remains available as evidence/recovery input; it is not
    // deleted by the post-commit failure path.
    await expect(
      readFile(join(storage.requireActive().dataRoot, 'staging', created.id, 'manifest.json')),
    ).resolves.toBeTruthy()
  })

  it('puts the published staging tree back when apply rolls back before the commit point', async () => {
    const content = 'int retryable() { return 3; }\n'
    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content,
          displayPath: 'retryable.cpp',
          fileName: 'retryable.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
      ],
    })
    const ready = await service.continue({ runAi: false, stagingId: created.id })
    expect(ready.status).toBe('ready')

    process.env.E2E_BATCH_STAGING_FAIL_STAGE = 'after-index'
    try {
      try {
        await service.apply({ confirmed: true, stagingId: created.id })
        throw new Error('apply unexpectedly succeeded')
      } catch (error) {
        expect(error).toMatchObject({ code: 'FILE_UNAVAILABLE' })
      }
    } finally {
      delete process.env.E2E_BATCH_STAGING_FAIL_STAGE
    }

    const stagingTemplates = join(
      storage.requireActive().dataRoot,
      'staging',
      created.id,
      'templates',
    )
    expect(await readFile(join(stagingTemplates, 'retryable.cpp'), 'utf8')).toBe(content)
    expect(await readFile(join(templatesRoot, 'retryable.cpp')).catch(() => null)).toBeNull()

    const failed = new BatchTemplateStagingRepository(database).get(workspaceId, created.id)
    expect(failed?.session.status).toBe('failed')
    const resumed = await service.continue({ runAi: false, stagingId: created.id })
    expect(resumed.status).toBe('ready')
  })

  it('keeps the manifest synchronized after classification failure so retry can continue', async () => {
    const content = 'int failedOnce() { return 4; }\n'
    classify
      .mockRejectedValueOnce(new Error('provider temporarily unavailable'))
      .mockResolvedValueOnce({
        alternatives: [],
        categoryPath: ['动态规划', '基础'],
        classificationReason: '测试分类',
        confidence: 0.9,
        metadata: {
          notes: '',
          solves: '测试问题',
          spaceComplexity: 'O(1)',
          tags: ['测试'],
          timeComplexity: 'O(1)',
        },
        model: 'test-model',
        providerName: 'test-provider',
        suggestedRelativePath: '动态规划/基础/failed-once.cpp',
      })

    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content,
          displayPath: 'failed-once.cpp',
          fileName: 'failed-once.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
      ],
    })

    const progress = vi.fn()
    const failed = await service.continue({ runAi: true, stagingId: created.id }, progress)
    expect(progress.mock.calls.some(([value]) => value.processedCount === 0)).toBe(true)
    expect(failed.processedCount).toBe(0)
    expect(failed.status).toBe('failed')
    expect(failed.items[0]?.status).toBe('failed')
    const manifestPath = join(
      storage.requireActive().dataRoot,
      'staging',
      created.id,
      'manifest.json',
    )
    const failedManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      items: Array<{ status: string; targetRelativePath: string | null }>
    }
    expect(failedManifest.items[0]).toMatchObject({
      status: 'failed',
      targetRelativePath: null,
    })

    const retried = await service.retry({ runAi: true, stagingId: created.id })
    expect(retried.status).toBe('ready')
    expect(retried.items[0]?.status).toBe('completed')
    expect(retried.items[0]?.targetRelativePath).toBe('动态规划/基础/failed-once.cpp')
    const completedManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      items: Array<{ status: string; targetRelativePath: string | null }>
    }
    expect(completedManifest.items[0]).toMatchObject({
      status: 'completed',
      targetRelativePath: '动态规划/基础/failed-once.cpp',
    })
  })

  it('does not leave a database-only processing state when the start manifest write fails', async () => {
    const content = 'int manifestStartFailure() { return 5; }\n'
    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content,
          displayPath: 'manifest-start-failure.cpp',
          fileName: 'manifest-start-failure.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
      ],
    })

    type ManifestWriter = {
      writeManifest: (manifest: unknown) => Promise<void>
    }
    const writer = service as unknown as ManifestWriter
    const original = writer.writeManifest
    let writes = 0
    const spy = vi.spyOn(writer, 'writeManifest')
    spy.mockImplementation(async manifest => {
      writes += 1
      if (writes === 1) throw new Error('injected start manifest failure')
      return original.call(service, manifest)
    })

    const failed = await service.continue({ runAi: false, stagingId: created.id })
    expect(failed.status).toBe('failed')
    expect(failed.items[0]?.status).toBe('pending')
    const persisted = new BatchTemplateStagingRepository(database).get(workspaceId, created.id)
    expect(persisted?.items[0]?.status).toBe('pending')
    spy.mockRestore()

    const resumed = await service.retry({ runAi: false, stagingId: created.id })
    expect(resumed.status).toBe('ready')
    expect(resumed.items[0]?.status).toBe('completed')
  })

  it('rolls back a staged target when the completion manifest write fails', async () => {
    const content = 'int manifestCompletionFailure() { return 6; }\n'
    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content,
          displayPath: 'manifest-completion-failure.cpp',
          fileName: 'manifest-completion-failure.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
      ],
    })

    type ManifestWriter = {
      writeManifest: (manifest: unknown) => Promise<void>
    }
    const writer = service as unknown as ManifestWriter
    const original = writer.writeManifest
    let writes = 0
    const spy = vi.spyOn(writer, 'writeManifest')
    spy.mockImplementation(async manifest => {
      writes += 1
      // First write marks the item processing; fail the second write, which
      // is the completed-state publication after the target file is staged.
      if (writes === 2) throw new Error('injected completion manifest failure')
      return original.call(service, manifest)
    })

    const failed = await service.continue({ runAi: false, stagingId: created.id })
    expect(failed.status).toBe('failed')
    expect(failed.items[0]?.status).toBe('failed')
    const stagingTemplates = join(
      storage.requireActive().dataRoot,
      'staging',
      created.id,
      'templates',
    )
    await expect(
      readFile(join(stagingTemplates, 'manifest-completion-failure.cpp')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    spy.mockRestore()

    const resumed = await service.retry({ runAi: false, stagingId: created.id })
    expect(resumed.status).toBe('ready')
  })

  it('preserves earlier completed items when a later classification fails', async () => {
    const first = 'int firstBatchItem() { return 7; }\n'
    const second = 'int secondBatchItem() { return 8; }\n'
    classify
      .mockResolvedValueOnce({
        alternatives: [],
        categoryPath: ['图论', '基础'],
        classificationReason: '首项测试分类',
        confidence: 0.9,
        metadata: {
          notes: '',
          solves: '首项测试问题',
          spaceComplexity: 'O(1)',
          tags: ['测试'],
          timeComplexity: 'O(1)',
        },
        model: 'test-model',
        providerName: 'test-provider',
        suggestedRelativePath: '图论/基础/first.cpp',
      })
      .mockRejectedValueOnce(new Error('second item failed'))
      .mockResolvedValueOnce({
        alternatives: [],
        categoryPath: ['图论', '基础'],
        classificationReason: '第二项重试分类',
        confidence: 0.9,
        metadata: {
          notes: '',
          solves: '第二项测试问题',
          spaceComplexity: 'O(1)',
          tags: ['测试'],
          timeComplexity: 'O(1)',
        },
        model: 'test-model',
        providerName: 'test-provider',
        suggestedRelativePath: '图论/基础/second.cpp',
      })
    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content: first,
          displayPath: 'first.cpp',
          fileName: 'first.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
        {
          content: second,
          displayPath: 'second.cpp',
          fileName: 'second.cpp',
          id: secondSourceId,
          sourceEncoding: 'utf-8',
        },
      ],
    })

    const progress = vi.fn()
    const failed = await service.continue({ runAi: true, stagingId: created.id }, progress)
    expect(progress.mock.calls.some(([value]) => value.processedCount === 1)).toBe(true)
    expect(failed.processedCount).toBe(1)
    expect(failed.status).toBe('failed')
    expect(failed.items.map(item => item.status)).toEqual(['completed', 'failed'])
    const retried = await service.retry({ runAi: true, stagingId: created.id })
    expect(retried.status).toBe('ready')
    expect(retried.items.map(item => item.status)).toEqual(['completed', 'completed'])
  })

  it('ignores a successful late AI response after cancellation and keeps edits on resume', async () => {
    let finish!: (value: unknown) => void
    classify.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content: 'int x=1;',
          displayPath: 'late.cpp',
          fileName: 'late.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
      ],
    })
    const requestId = '60000000-0000-4000-8000-000000000010'
    const pending = service.continue({ runAi: true, stagingId: created.id, requestId })
    await vi.waitFor(() => expect(classify).toHaveBeenCalledOnce())
    service.cancel(requestId)
    finish({ suggestedRelativePath: 'wrong/late.cpp' })
    const stopped = await pending
    expect(stopped.items[0]).toMatchObject({
      status: 'pending',
      classification: null,
      targetRelativePath: null,
    })
    expect(stopped.processedCount).toBe(0)
    await service.updateItem({
      action: 'include',
      sourceId,
      stagingId: created.id,
      targetRelativePath: 'manual/late.cpp',
    })
    const resumed = await service.continue({ runAi: false, stagingId: created.id })
    expect(resumed.items[0]).toMatchObject({
      status: 'completed',
      classification: null,
      targetRelativePath: 'manual/late.cpp',
    })
    expect(
      await readFile(
        join(storage.requireActive().dataRoot, 'staging', created.id, 'templates/manual/late.cpp'),
        'utf8',
      ),
    ).toBe('int x=1;')
    expect(await readFile(join(templatesRoot, 'manual/late.cpp')).catch(() => null)).toBeNull()
  })

  it('rejects another workspace before reading or changing a staging session', async () => {
    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content: 'int x=1;',
          displayPath: 'scope.cpp',
          fileName: 'scope.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
      ],
    })
    const active = workspaceRepository.getActiveWorkspace()!
    vi.spyOn(workspaceRepository, 'getActiveWorkspace').mockReturnValue({
      ...active,
      id: '60000000-0000-4000-8000-000000000099',
    })
    expect(service.get({ stagingId: created.id })).toBeNull()
    await expect(service.continue({ runAi: false, stagingId: created.id })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    })
    await expect(service.apply({ confirmed: true, stagingId: created.id })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    })
    expect(
      new BatchTemplateStagingRepository(database).get(workspaceId, created.id)?.session
        .processedCount,
    ).toBe(0)
  })

  it('bounds the dynamic staging preview cache key for the IPC contract', async () => {
    const content = 'int previewKey() { return 9; }\n'
    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content,
          displayPath: 'preview-key.cpp',
          fileName: 'preview-key.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
      ],
    })

    const preview = await service.previewClassification({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content,
          displayPath: 'preview-key.cpp',
          fileName: 'preview-key.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
      ],
      stagingId: created.id,
    })

    const parsed = previewBatchStagingClassificationResultSchema.parse(preview)
    expect(parsed.cache.key).toMatch(/^staging:[a-f0-9]{64}$/u)
    expect(parsed.cache.key.length).toBeLessThanOrEqual(240)
  })

  it('applies selected AI move operations inside staging without touching main', async () => {
    const content = 'int stagedMove() { return 7; }\n'
    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content,
          displayPath: '旧分类/staged.cpp',
          fileName: 'staged.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
      ],
    })
    const ready = await service.continue({ runAi: false, stagingId: created.id })
    const draftId = '60000000-0000-4000-8000-000000000010'
    const auditService = (
      service as unknown as {
        auditService: { getDraft: () => unknown; discardDraft: ReturnType<typeof vi.fn> }
      }
    ).auditService
    auditService.getDraft = () => ({
      draftId,
      stagingId: ready.id,
      stagingVersion: ready.version,
      target: 'staging',
      operations: [
        {
          id: '60000000-0000-4000-8000-000000000011',
          kind: 'move',
          sourceId,
          targetPath: '背包问题/staged.cpp',
        },
      ],
    })
    auditService.discardDraft = vi.fn()

    const result = await service.applyAiPlan({
      confirmed: true,
      draftId,
      operationIds: ['60000000-0000-4000-8000-000000000011'],
    })

    expect(result.appliedOperationCount).toBe(1)
    expect(result.staging.items[0]?.targetRelativePath).toBe('背包问题/staged.cpp')
    expect(auditService.discardDraft).toHaveBeenCalledWith(draftId)
    expect(await readFile(join(templatesRoot, 'base.cpp'), 'utf8')).toContain('int base')
    await expect(readFile(join(templatesRoot, '背包问题', 'staged.cpp'), 'utf8')).rejects.toThrow()
  })

  it('rolls back every selected staging operation when a later move conflicts', async () => {
    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [sourceId, secondSourceId].map((id, index) => ({
        content: `int item${index}() { return ${index}; }\n`,
        displayPath: `item${index}.cpp`,
        fileName: `item${index}.cpp`,
        id,
        sourceEncoding: 'utf-8' as const,
      })),
    })
    const ready = await service.continue({ runAi: false, stagingId: created.id })
    const draftId = '60000000-0000-4000-8000-000000000010'
    const operations = [
      {
        id: '60000000-0000-4000-8000-000000000011',
        kind: 'move',
        sourceId,
        targetPath: '整理/item0.cpp',
      },
      {
        id: '60000000-0000-4000-8000-000000000012',
        kind: 'move',
        sourceId: secondSourceId,
        targetPath: 'base.cpp',
      },
    ]
    const audit = (service as unknown as { auditService: { getDraft: () => unknown } }).auditService
    audit.getDraft = () => ({
      draftId,
      stagingId: ready.id,
      stagingVersion: ready.version,
      target: 'staging',
      operations,
    })
    await expect(
      service.applyAiPlan({
        confirmed: true,
        draftId,
        operationIds: operations.map(operation => operation.id),
      }),
    ).rejects.toThrow()
    const restored = new BatchTemplateStagingRepository(database).get(workspaceId, ready.id)!
    expect(restored.items.map(item => item.targetRelativePath)).toEqual(['item0.cpp', 'item1.cpp'])
    expect(restored.items.map(item => item.status)).toEqual(['completed', 'completed'])
    // A successful final apply checks the restored manifest and byte hashes,
    // and also proves the failed plan released its session lock.
    await service.apply({ confirmed: true, stagingId: ready.id })
    expect(await readFile(join(templatesRoot, 'item0.cpp'), 'utf8')).toContain('int item0')
    expect(await readFile(join(templatesRoot, 'item1.cpp'), 'utf8')).toContain('int item1')
    await expect(readFile(join(templatesRoot, '整理', 'item0.cpp'))).rejects.toThrow()
  })

  it('preserves a failed backup preparation without blocking the next confirmed apply', async () => {
    const created = await service.create({
      outputLanguage: 'zh-CN',
      sources: [
        {
          content: 'int pending() { return 1; }\n',
          displayPath: 'pending.cpp',
          fileName: 'pending.cpp',
          id: sourceId,
          sourceEncoding: 'utf-8',
        },
      ],
    })
    await service.continue({ runAi: false, stagingId: created.id })
    const writer = service as unknown as {
      writeApplyJournal: (path: string, journal: unknown) => Promise<void>
    }
    const spy = vi
      .spyOn(writer, 'writeApplyJournal')
      .mockRejectedValueOnce(new Error('disk refused preparation journal'))
    await expect(service.apply({ confirmed: true, stagingId: created.id })).rejects.toThrow()
    spy.mockRestore()
    expect(await readFile(join(templatesRoot, 'base.cpp'), 'utf8')).toContain('int base')
    expect(await service.inspectRecoveries()).toEqual([])
    await service.apply({ confirmed: true, stagingId: created.id })
    expect(await readFile(join(templatesRoot, 'pending.cpp'), 'utf8')).toContain('int pending')
    expect(await service.inspectRecoveries()).toEqual([])
    expect(await readdir(join(storage.requireActive().recoveryRoot, 'batch-staging'))).toHaveLength(
      2,
    )
  })
})
