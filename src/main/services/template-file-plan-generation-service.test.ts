import { createHash } from 'node:crypto'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import iconv from 'iconv-lite'

import type { TemplateMetadata, WorkspaceAudit } from '@core/contracts/template-management'
import type { TemplateSummary } from '@core/contracts/workspace'

import { PublicError } from '../errors/public-error'
import type { AiCompletionRequest } from './ai-provider-adapters'
import { TemplateFilePlanGenerationService } from './template-file-plan-generation-service'

const workspaceId = '40000000-0000-4000-8000-000000000023'
const providerId = '40000000-0000-4000-8000-000000000024'

interface FixtureOptions {
  draftExists?: boolean
  notes?: string[]
  templateCount?: number
}

async function createFixture(rootPath: string, options: FixtureOptions = {}) {
  const templateCount = options.templateCount ?? 2
  const templates: TemplateSummary[] = []
  const metadata = new Map<string, TemplateMetadata>()
  for (let index = 0; index < templateCount; index += 1) {
    const fileName = `template-${index + 1}.cpp`
    const path = join(rootPath, fileName)
    const content = `void algorithm_${index + 1}() {}\n`
    await writeFile(path, content)
    const stats = await stat(path)
    const id = createHash('sha256').update(fileName).digest('hex')
    templates.push({
      extension: '.cpp',
      fileName,
      id,
      language: 'C++',
      modifiedAt: stats.mtime.toISOString(),
      name: `模板 ${index + 1}`,
      relativePath: fileName,
      sizeBytes: stats.size,
    })
    metadata.set(id, {
      notes: options.notes?.[index] ?? '',
      solves: `用途 ${index + 1}`,
      spaceComplexity: 'O(1)',
      tags: ['fixture'],
      templateId: id,
      timeComplexity: 'O(1)',
      updatedAt: '2026-07-23T00:00:00.000Z',
    })
  }
  const audit: WorkspaceAudit = {
    generatedAt: '2026-07-23T00:00:00.000Z',
    issues: templates.map(template => ({
      detail: '算法卡片尚未补充结构化元数据。',
      id: crypto.randomUUID(),
      kind: 'missing-metadata' as const,
      pathCount: 1,
      paths: [template.relativePath],
      pathsTruncated: false,
      severity: 'info' as const,
    })),
    nextAction: null,
    processedCount: templates.length,
    templateCount: templates.length,
    totalCount: templates.length,
    truncated: false,
    truncatedReason: null,
  }
  const stableContext = JSON.stringify({
    workspaceCatalog: {
      templates: templates.map(template => ({
        id: template.id,
        language: template.language,
        name: template.name,
        path: template.relativePath,
      })),
    },
  })
  const version = createHash('sha256').update(stableContext).digest('hex')
  const context = {
    cacheKey: `workspace:${version}`,
    catalogDirectoryCount: 0,
    catalogTemplateRefs: templates.map(template => ({
      id: template.id,
      language: template.language,
      name: template.name,
      path: template.relativePath,
    })),
    contextTruncated: false,
    estimatedCharacters: stableContext.length,
    estimatedInputTokens: Math.ceil(stableContext.length / 4),
    relatedContext: '{"relatedTemplates":[]}',
    relatedSourceCharacters: 0,
    relatedSourceTemplateCount: 0,
    relatedTemplateCount: templates.length,
    relatedTemplateRefs: templates.map(template => ({
      id: template.id,
      language: template.language,
      name: template.name,
      path: template.relativePath,
    })),
    sentTemplateNameCount: templates.length,
    sourceSnippetsOmitted: false,
    stableContext,
    summarizedTemplateCount: templates.length,
    summaryShortened: false,
    supplementalMetadataOmitted: false,
    templateCount: templates.length,
    templateNamesTruncated: false,
    version,
  }
  const target = {
    capabilities: {
      promptCaching: true,
      streaming: false,
      structuredOutput: true,
      vision: false,
    },
    endpointHost: 'fixture.invalid',
    id: providerId,
    model: 'fixture-model',
    protocol: 'openai-chat-completions' as const,
    providerName: 'Fixture Provider',
  }
  const capturedRequests: AiCompletionRequest[] = []
  const runTask = vi.fn(async (_task: string, request: AiCompletionRequest) => {
    capturedRequests.push(request)
    return {
      model: target.model,
      providerName: target.providerName,
      text: JSON.stringify({ operations: [], summary: '无需调整' }),
    }
  })
  const build = vi.fn(async () => context)
  const auditWorkspace = vi.fn(async () => audit)
  let draftExists = options.draftExists ?? false
  const createPlan = vi.fn(
    (
      _workspaceId: string,
      providerName: string,
      model: string,
      operations: [],
      planOptions: Record<string, unknown>,
    ) => {
      draftExists = true
      const now = '2026-07-23T00:01:00.000Z'
      return {
        contextVersion: planOptions.contextVersion,
        createdAt: now,
        diagnostic: planOptions.diagnostic,
        id: crypto.randomUUID(),
        model,
        operations,
        outputLanguage: planOptions.outputLanguage,
        providerName,
        status: 'draft' as const,
        summary: planOptions.summary,
        updatedAt: now,
      }
    },
  )
  let activeWorkspaceId = workspaceId
  const workspaceRepository = {
    getActiveWorkspace: () => ({ id: activeWorkspaceId, name: '快照工作区', rootPath }),
    listTemplates: () => templates,
  }
  const metadataRepository = {
    createPlan,
    getMetadata: (templateId: string) => metadata.get(templateId) ?? null,
    getPlan: () => null,
    hasDraftPlan: () => draftExists,
  }
  const workspaceAiContextService = {
    build,
    getCurrentVersion: () => ({ version, workspaceId }),
  }
  const aiProviderService = {
    getTaskTarget: () => target,
    runTask,
  }
  const finish = vi.fn()
  const controller = new AbortController()
  const aiTaskRunRegistry = {
    cancel: vi.fn(() => controller.abort()),
    start: () => ({
      finish,
      signal: controller.signal,
      throwIfCancelled: () => {
        if (controller.signal.aborted) throw new Error('cancelled')
      },
    }),
  }
  const service = new TemplateFilePlanGenerationService(
    aiProviderService as never,
    metadataRepository as never,
    workspaceRepository as never,
    workspaceAiContextService as never,
    aiTaskRunRegistry as never,
    { auditWorkspace } as never,
  )
  return {
    audit,
    auditWorkspace,
    build,
    capturedRequests,
    context,
    createPlan,
    metadata,
    runTask,
    setActiveWorkspaceId: (value: string) => {
      activeWorkspaceId = value
    },
    service,
    target,
    templates,
  }
}

function addInvalidNameIssue(audit: WorkspaceAudit, template: TemplateSummary): void {
  audit.issues.push({
    detail: '文件名疑似包含乱码或错误解码痕迹；AI 文件计划必须提供安全改名，执行前仍需确认。',
    id: crypto.randomUUID(),
    kind: 'invalid-name',
    pathCount: 1,
    paths: [template.relativePath],
    pathsTruncated: false,
    severity: 'warning',
  })
}

function addPathInconsistencyIssue(audit: WorkspaceAudit, template: TemplateSummary): void {
  audit.issues.push({
    detail:
      '目录分类疑似重复（字符串、字符串算法）；建议统一到 字符串，AI 将根据源码与元数据重新规划子目录。',
    id: crypto.randomUUID(),
    kind: 'path-inconsistency',
    pathCount: 1,
    paths: [template.relativePath],
    pathsTruncated: false,
    severity: 'warning',
  })
}

function moveSuggestion(templateId: string, targetPath: string) {
  return {
    alternatives: ['保留原路径'],
    applicability: ['当前审计批次建议统一路径'],
    confidence: 0.8,
    evidence: ['路径与目录分类不一致'],
    kind: 'move' as const,
    reason: '统一分类路径',
    risk: 'medium' as const,
    targetPath,
    templateId,
  }
}

function metadataSuggestion(templateId: string, tags: string[]) {
  return {
    alternatives: ['保留当前元数据'],
    applicability: ['当前模板需要补充技术标签'],
    confidence: 0.9,
    evidence: ['源码中包含对应的数据结构或语言特性'],
    kind: 'update-metadata' as const,
    metadata: {
      solves: '用于高效维护和查询数据。',
      tags,
    },
    reason: '补充可检索的技术标签',
    risk: 'low' as const,
    templateId,
  }
}

describe('TemplateFilePlanGenerationService preview snapshots', () => {
  let rootPath = ''

  afterEach(async () => {
    vi.restoreAllMocks()
    if (rootPath) await rm(rootPath, { force: true, recursive: true })
    rootPath = ''
  })

  it('sends the exact prepared snapshot once and keeps local preconditions out of the payload', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { notes: ['private-note', ''] })
    const requestId = crypto.randomUUID()

    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId,
    })
    const onProgress = vi.fn()
    const plan = await fixture.service.generateFilePlan(
      { previewId: preview.filePlan.previewId, requestId },
      onProgress,
    )

    expect(fixture.auditWorkspace).toHaveBeenCalledTimes(1)
    expect(fixture.build).toHaveBeenCalledTimes(1)
    expect(fixture.runTask).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith({
      currentItem: '第 1/1 批 · template-1.cpp',
      phase: 'requesting-ai',
      processedCount: 0,
      totalCount: 1,
    })
    expect(onProgress).toHaveBeenLastCalledWith({
      currentItem: null,
      phase: 'publishing',
      processedCount: 0,
      totalCount: 0,
    })
    expect(plan.diagnostic.inputHash).toBe(preview.filePlan.inputHash)
    expect(plan.diagnostic.previewId).toBe(preview.filePlan.previewId)
    expect(fixture.capturedRequests[0]!.maxOutputTokens).toBe(4_096)
    expect(preview.filePlan.maxCandidatesPerBatch).toBe(4)
    expect(preview.filePlan.maxOutputTokensPerBatch).toBe(4_096)
    expect(preview.workspaceCatalog.sentTemplateNameCount).toBe(2)
    expect(preview.workspaceCatalog.templateNamesTruncated).toBe(false)
    const providerPayload = fixture.capturedRequests[0]!.text
    expect(providerPayload).toContain(fixture.templates[0]!.id)
    expect(providerPayload).not.toContain('private-note')
    expect(providerPayload).not.toContain(rootPath)
    expect(providerPayload).not.toContain('sourceSha256')
    expect(providerPayload).not.toContain('sourceModifiedAt')
    expect(providerPayload).not.toContain('sourceSizeBytes')
    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({ message: expect.stringContaining('已消费') })
  })

  it('only sends notes after explicit opt-in and accounts for their characters', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { notes: ['允许发送的笔记', ''] })
    const preview = await fixture.service.previewFilePlan({
      includeNotes: true,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    expect(preview.filePlan.notesIncludedCount).toBe(1)
    expect(preview.filePlan.notesCharacters).toBe('允许发送的笔记'.length)
    const onProgress = vi.fn()
    await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }, onProgress)
    expect(fixture.capturedRequests[0]!.text).toContain('允许发送的笔记')
  })

  it('includes decoded Windows GBK source in the locked AI snapshot', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath)
    const template = fixture.templates[0]!
    const path = join(rootPath, template.relativePath)
    await writeFile(path, iconv.encode('// 中文算法模板\nvoid algorithm_1() {}\n', 'gbk'))
    const stats = await stat(path)
    template.modifiedAt = stats.mtime.toISOString()
    template.sizeBytes = stats.size

    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })
    await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId })

    expect(fixture.capturedRequests[0]!.text).toContain('中文算法模板')
    expect(fixture.capturedRequests[0]!.text).not.toContain('�')
  })

  it('reports candidate source read failures in the preview instead of skipping them silently', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath)
    await rm(join(rootPath, fixture.templates[0]!.relativePath))

    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    expect(preview.filePlan.sourceReadFailureCount).toBe(1)
    expect(preview.filePlan.detailedCandidateCount).toBe(2)
  })

  it('rejects source changes before any provider request', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath)
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })
    await writeFile(join(rootPath, fixture.templates[0]!.relativePath), 'changed after preview\n')

    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({ code: 'FILE_UNAVAILABLE' })
    expect(fixture.runTask).not.toHaveBeenCalled()
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })

  it('rejects Provider, workspace, and metadata changes against their own previews', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))

    const providerChanged = await createFixture(rootPath)
    const providerPreview = await providerChanged.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })
    providerChanged.target.model = 'changed-model'
    await expect(
      providerChanged.service.generateFilePlan({ previewId: providerPreview.filePlan.previewId }),
    ).rejects.toMatchObject({ message: expect.stringContaining('Provider') })
    expect(providerChanged.runTask).not.toHaveBeenCalled()

    const workspaceChanged = await createFixture(rootPath)
    const workspacePreview = await workspaceChanged.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })
    workspaceChanged.setActiveWorkspaceId('40000000-0000-4000-8000-000000000025')
    await expect(
      workspaceChanged.service.generateFilePlan({ previewId: workspacePreview.filePlan.previewId }),
    ).rejects.toMatchObject({ message: expect.stringContaining('当前工作区') })
    expect(workspaceChanged.runTask).not.toHaveBeenCalled()

    const metadataChanged = await createFixture(rootPath, { notes: ['before', ''] })
    const metadataPreview = await metadataChanged.service.previewFilePlan({
      includeNotes: true,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })
    const templateId = metadataChanged.templates[0]!.id
    metadataChanged.metadata.set(templateId, {
      ...metadataChanged.metadata.get(templateId)!,
      notes: 'after',
      updatedAt: '2026-07-23T00:02:00.000Z',
    })
    await expect(
      metadataChanged.service.generateFilePlan({ previewId: metadataPreview.filePlan.previewId }),
    ).rejects.toMatchObject({ code: 'FILE_UNAVAILABLE' })
    expect(metadataChanged.runTask).not.toHaveBeenCalled()
  })

  it('rejects expired previews and existing active drafts', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const now = Date.now()
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now)
    const fixture = await createFixture(rootPath)
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })
    dateNow.mockReturnValue(now + 6 * 60 * 1_000)
    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/过期|不存在/) })

    const conflict = await createFixture(rootPath, { draftExists: true })
    await expect(
      conflict.service.previewFilePlan({
        includeNotes: false,
        outputLanguage: 'zh-CN',
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'TASK_CONFLICT' })
  })

  it('splits oversized total input into safe batches without dropping required candidates', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, {
      notes: Array.from({ length: 4 }, () => 'n'.repeat(60_000)),
      templateCount: 4,
    })

    const preview = await fixture.service.previewFilePlan({
      includeNotes: true,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })
    expect(preview.filePlan.batchCount).toBe(4)
    expect(preview.filePlan.largestBatchInputCharacters).toBeLessThanOrEqual(24_000 * 4)
    expect(preview.filePlan.totalBatchInputCharacters).toBeGreaterThan(24_000 * 4)

    const onProgress = vi.fn()
    await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }, onProgress)

    expect(fixture.runTask).toHaveBeenCalledTimes(4)
    for (const request of fixture.capturedRequests) {
      expect(request.cache?.stableContext).toBe(fixture.context.stableContext)
      for (const template of fixture.templates) {
        expect(request.cache?.stableContext).toContain(template.id)
      }
    }
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        currentItem: expect.stringContaining('第 4/4 批'),
        phase: 'requesting-ai',
        processedCount: 3,
        totalCount: 4,
      }),
    )
    expect(fixture.createPlan).toHaveBeenCalledTimes(1)
  })

  it('splits 31 small candidates into eight output-aware batches of at most four', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { templateCount: 31 })

    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    expect(preview.filePlan.batchCount).toBe(8)
    expect(preview.filePlan.maxCandidatesPerBatch).toBe(4)
    expect(preview.filePlan.maxOutputTokensPerBatch).toBe(4_096)
    await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId })

    expect(fixture.runTask).toHaveBeenCalledTimes(8)
    for (const request of fixture.capturedRequests) {
      const payload = JSON.parse(request.text) as { templates: Array<{ id: string }> }
      expect(payload.templates.length).toBeLessThanOrEqual(4)
      expect(request.maxOutputTokens).toBe(4_096)
      for (const template of fixture.templates) {
        expect(request.cache?.stableContext).toContain(template.id)
      }
    }
  })

  it('keeps a connected audit group in one batch even when it exceeds the normal candidate cap', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { templateCount: 5 })
    fixture.audit.issues.push({
      detail: '这些模板高度相似，需要在同一批中比较。',
      id: crypto.randomUUID(),
      kind: 'similar-content',
      pathCount: fixture.templates.length,
      paths: fixture.templates.map(template => template.relativePath),
      pathsTruncated: false,
      severity: 'warning',
    })

    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })
    await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId })

    expect(preview.filePlan.batchCount).toBe(1)
    const payload = JSON.parse(fixture.capturedRequests[0]!.text) as {
      audit: WorkspaceAudit
      templates: Array<{ id: string }>
    }
    expect(payload.templates).toHaveLength(5)
    expect(payload.audit.issues).toHaveLength(6)
  })

  it('creates no partial plan when a later batch fails', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, {
      notes: ['a'.repeat(60_000), 'b'.repeat(60_000)],
      templateCount: 2,
    })
    fixture.runTask
      .mockResolvedValueOnce({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: JSON.stringify({ operations: [], summary: '第一批完成' }),
      })
      .mockRejectedValueOnce(new Error('fixture provider timeout'))
    const preview = await fixture.service.previewFilePlan({
      includeNotes: true,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toThrow('fixture provider timeout')
    expect(fixture.runTask).toHaveBeenCalledTimes(2)
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })

  it('recovers an incomplete four-candidate response by splitting only that batch', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { templateCount: 4 })
    fixture.runTask
      .mockResolvedValueOnce({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: '{"summary":',
      })
      .mockResolvedValueOnce({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: 'still-not-json',
      })
      .mockImplementation(async () => ({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: JSON.stringify({ operations: [], summary: '子批次完成' }),
      }))
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })
    const onProgress = vi.fn()

    const plan = await fixture.service.generateFilePlan(
      { previewId: preview.filePlan.previewId },
      onProgress,
    )

    expect(preview.filePlan.batchCount).toBe(1)
    expect(fixture.runTask).toHaveBeenCalledTimes(4)
    const childRequests = fixture.runTask.mock.calls
      .slice(2)
      .map(call => call[1] as AiCompletionRequest)
    const childPayloads = childRequests.map(
      request => JSON.parse(request.text) as { templates: Array<{ id: string }> },
    )
    expect(childPayloads.map(payload => payload.templates.length)).toEqual([2, 2])
    expect(
      new Set(childPayloads.flatMap(payload => payload.templates.map(template => template.id))),
    ).toEqual(new Set(fixture.templates.map(template => template.id)))
    for (const request of childRequests) {
      for (const template of fixture.templates) {
        expect(request.cache?.stableContext).toContain(template.id)
      }
    }
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ currentItem: expect.stringContaining('自适应子批 1') }),
    )
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ currentItem: expect.stringContaining('自适应子批 2') }),
    )
    expect(plan.diagnostic).toMatchObject({
      adaptiveSplitCount: 1,
      effectiveBatchCount: 2,
      initialBatchCount: 1,
    })
    expect(fixture.createPlan).toHaveBeenCalledTimes(1)
  })

  it('accepts conventional algorithm and programming names in Chinese tags and paths', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { templateCount: 2 })
    const technicalMetadataSuggestion = metadataSuggestion(fixture.templates[0]!.id, [
      'Segment Tree',
      'Fenwick Tree',
      'Lambda',
      'String',
      'C++17',
      'Bitmask DP',
    ])
    fixture.runTask.mockResolvedValueOnce({
      model: fixture.target.model,
      providerName: fixture.target.providerName,
      text: JSON.stringify({
        operations: [
          technicalMetadataSuggestion,
          moveSuggestion(fixture.templates[1]!.id, '数据结构/Segment Tree/String.cpp'),
        ],
        summary: '补充技术标签并统一目录命名。',
      }),
    })
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    const plan = await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId })

    expect(fixture.runTask).toHaveBeenCalledTimes(1)
    expect(plan.operations).toHaveLength(2)
    expect(fixture.createPlan).toHaveBeenCalledTimes(1)
  })

  it('retries a language violation once and keeps the schema-valid batch for review', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { templateCount: 8 })
    const invalidLanguageSuggestion = metadataSuggestion(fixture.templates[4]!.id, ['Segment Tree'])
    invalidLanguageSuggestion.metadata.solves = 'Maintain range sums'
    fixture.runTask
      .mockResolvedValueOnce({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: JSON.stringify({ operations: [], summary: '第一批已经完成' }),
      })
      .mockResolvedValueOnce({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: JSON.stringify({
          operations: [invalidLanguageSuggestion],
          summary: '整理模板',
        }),
      })
      .mockResolvedValueOnce({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: JSON.stringify({
          operations: [invalidLanguageSuggestion],
          summary: '整理模板',
        }),
      })
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })
    const onProgress = vi.fn()
    const plan = await fixture.service.generateFilePlan(
      { previewId: preview.filePlan.previewId },
      onProgress,
    )

    expect(preview.filePlan.batchCount).toBe(2)
    expect(fixture.runTask).toHaveBeenCalledTimes(3)
    expect((fixture.runTask.mock.calls[2]![1] as AiCompletionRequest).system).toContain(
      'Segment Tree、Fenwick Tree、Lambda、String、C++',
    )
    const firstBatchText = (fixture.runTask.mock.calls[0]![1] as AiCompletionRequest).text
    expect(
      fixture.runTask.mock.calls.filter(
        call => (call[1] as AiCompletionRequest).text === firstBatchText,
      ),
    ).toHaveLength(1)
    expect(onProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ currentItem: expect.stringContaining('自适应子批') }),
    )
    expect(plan.diagnostic).toMatchObject({
      adaptiveSplitCount: 0,
      effectiveBatchCount: 2,
      initialBatchCount: 2,
      languageFallbackBatchCount: 1,
    })
    expect(plan.summary).toMatch(/语言提示：第 2\/2 批.*重点审查/)
    expect(fixture.createPlan).toHaveBeenCalledTimes(1)
  })

  it('keeps a one-candidate schema-valid result for review after its language retry', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { templateCount: 1 })
    const invalidLanguageSuggestion = metadataSuggestion(fixture.templates[0]!.id, ['C++'])
    invalidLanguageSuggestion.metadata.solves = 'Maintain range sums'
    fixture.runTask
      .mockResolvedValueOnce({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: JSON.stringify({
          operations: [invalidLanguageSuggestion],
          summary: '整理模板',
        }),
      })
      .mockResolvedValueOnce({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: 'semantic retry returned incomplete JSON',
      })
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    const plan = await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId })

    expect(fixture.runTask).toHaveBeenCalledTimes(2)
    expect(plan.operations).toHaveLength(1)
    expect(plan.summary).toMatch(/语言提示：第 1\/1 批.*重点审查/)
    expect(plan.diagnostic).toMatchObject({
      adaptiveSplitCount: 0,
      effectiveBatchCount: 1,
      initialBatchCount: 1,
      languageFallbackBatchCount: 1,
    })
    expect(fixture.createPlan).toHaveBeenCalledTimes(1)
  })

  it('fails safely after recursively reducing an incomplete response to one candidate', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { templateCount: 4 })
    fixture.runTask.mockResolvedValue({
      model: fixture.target.model,
      providerName: fixture.target.providerName,
      text: 'not-json',
    })
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      message: expect.stringContaining('已自动缩小到单个候选'),
      stage: 'structure-repair',
    })
    expect(fixture.runTask).toHaveBeenCalledTimes(6)
    const diagnostic = (
      fixture.service as unknown as {
        lastFilePlanDiagnostic: Record<string, unknown>
      }
    ).lastFilePlanDiagnostic
    expect(diagnostic).toMatchObject({
      adaptiveSplitCount: 2,
      completedAdaptiveSubBatchCount: 0,
      failedBatchCandidateCount: 1,
      failedBatchIndex: 1,
      failedBatchSplitDepth: 2,
      phase: 'failed',
    })
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })

  it('does not split a connected audit group when its response remains incomplete', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { templateCount: 5 })
    fixture.audit.issues.push({
      detail: '这些模板高度相似，需要在同一批中比较。',
      id: crypto.randomUUID(),
      kind: 'similar-content',
      pathCount: fixture.templates.length,
      paths: fixture.templates.map(template => template.relativePath),
      pathsTruncated: false,
      severity: 'warning',
    })
    fixture.runTask.mockResolvedValue({
      model: fixture.target.model,
      providerName: fixture.target.providerName,
      text: 'not-json',
    })
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      message: expect.stringContaining('不可拆分的关联审计组'),
    })
    expect(fixture.runTask).toHaveBeenCalledTimes(2)
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })

  it('adds safe batch details to a later timeout without creating a partial plan', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { templateCount: 5 })
    fixture.runTask
      .mockResolvedValueOnce({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: JSON.stringify({ operations: [], summary: '第一批完成' }),
      })
      .mockRejectedValueOnce(
        new PublicError('AI_RESPONSE_TIMEOUT', '等待 AI 响应超时。', 2_500, 'response-read'),
      )
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({
      code: 'AI_RESPONSE_TIMEOUT',
      message: expect.stringMatching(/第 2\/2 批.*输入 Token，1 个候选.*4,096 Token.*已完成 1 批/),
      retryAfterMs: 2_500,
      stage: 'response-read',
    })
    const diagnostic = (
      fixture.service as unknown as {
        lastFilePlanDiagnostic: Record<string, unknown>
      }
    ).lastFilePlanDiagnostic
    expect(diagnostic).toMatchObject({
      completedBatchCount: 1,
      errorCode: 'AI_RESPONSE_TIMEOUT',
      failedBatchCandidateCount: 1,
      failedBatchIndex: 2,
      failedBatchInputTokens: expect.any(Number),
      phase: 'failed',
    })
    expect(fixture.runTask).toHaveBeenCalledTimes(2)
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })

  it('rejects an operation that escapes its locked batch', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, {
      notes: ['a'.repeat(60_000), 'b'.repeat(60_000)],
      templateCount: 2,
    })
    for (let index = 0; index < 2; index += 1) {
      fixture.runTask.mockResolvedValueOnce({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: JSON.stringify({
          operations: [moveSuggestion(fixture.templates[0]!.id, '整理/重复建议.cpp')],
          summary: `第 ${index + 1} 批`,
        }),
      })
    }
    const preview = await fixture.service.previewFilePlan({
      includeNotes: true,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      message: expect.stringContaining('当前批次之外'),
    })
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })

  it('rejects conflicting move targets returned across batches', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, {
      notes: ['a'.repeat(60_000), 'b'.repeat(60_000)],
      templateCount: 2,
    })
    for (let index = 0; index < 2; index += 1) {
      fixture.runTask.mockResolvedValueOnce({
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: JSON.stringify({
          operations: [moveSuggestion(fixture.templates[index]!.id, '整理/冲突.cpp')],
          summary: `第 ${index + 1} 批`,
        }),
      })
    }
    const preview = await fixture.service.previewFilePlan({
      includeNotes: true,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      message: expect.stringContaining('冲突的目标路径'),
    })
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })

  it('stops sending later batches after cancellation', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, {
      notes: ['a'.repeat(60_000), 'b'.repeat(60_000)],
      templateCount: 2,
    })
    const requestId = crypto.randomUUID()
    fixture.runTask.mockImplementationOnce(async () => {
      fixture.service.cancelFilePlanGeneration(requestId)
      return {
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: JSON.stringify({ operations: [], summary: '第一批迟到响应' }),
      }
    })
    const preview = await fixture.service.previewFilePlan({
      includeNotes: true,
      outputLanguage: 'zh-CN',
      requestId,
    })

    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId, requestId }),
    ).rejects.toMatchObject({ code: 'AI_CANCELLED' })
    expect(fixture.runTask).toHaveBeenCalledTimes(1)
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })

  it('rejects the whole result when AI omits a required invalid-name rename', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath)
    addInvalidNameIssue(fixture.audit, fixture.templates[0]!)
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: expect.stringContaining('命名异常文件提供安全有效的改名操作'),
    })
    expect(fixture.runTask).toHaveBeenCalledTimes(1)
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })

  it('requires AI to move every template in a duplicated category branch', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath)
    addPathInconsistencyIssue(fixture.audit, fixture.templates[0]!)
    fixture.runTask.mockResolvedValueOnce({
      model: fixture.target.model,
      providerName: fixture.target.providerName,
      text: JSON.stringify({
        operations: [moveSuggestion(fixture.templates[0]!.id, '字符串/模式匹配/模板一.cpp')],
        summary: '合并重复分类目录',
      }),
    })

    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })
    const plan = await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId })

    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'move',
        sourcePath: fixture.templates[0]!.relativePath,
        targetPath: '字符串/模式匹配/模板一.cpp',
      }),
    ])
    expect(fixture.runTask.mock.calls[0]![1].system).toContain(
      '每个 path-inconsistency 审计项列出的模板都必须输出 move',
    )
  })

  it.each([
    { language: 'zh-CN' as const, targetPath: '整理/可读模板.cpp' },
    { language: 'en' as const, targetPath: 'organized/readable-template.cpp' },
  ])('accepts a safe required rename in $language output', async ({ language, targetPath }) => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath)
    addInvalidNameIssue(fixture.audit, fixture.templates[0]!)
    const localized =
      language === 'en'
        ? {
            alternatives: ['Keep the current name'],
            applicability: ['The audited file name contains decoding artifacts'],
            evidence: ['The source and metadata identify a readable algorithm name'],
            reason: 'Restore a readable file name',
            summary: 'Rename the malformed file name',
          }
        : {
            alternatives: ['保留当前名称'],
            applicability: ['审计确认文件名包含错误解码痕迹'],
            evidence: ['源码和元数据能够确定可读算法名称'],
            reason: '恢复可读文件名',
            summary: '改正异常文件名',
          }
    fixture.runTask.mockResolvedValueOnce({
      model: fixture.target.model,
      providerName: fixture.target.providerName,
      text: JSON.stringify({
        operations: [
          {
            alternatives: localized.alternatives,
            applicability: localized.applicability,
            confidence: 0.95,
            evidence: localized.evidence,
            kind: 'move',
            reason: localized.reason,
            risk: 'medium',
            targetPath,
            templateId: fixture.templates[0]!.id,
          },
        ],
        summary: localized.summary,
      }),
    })
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: language,
      requestId: crypto.randomUUID(),
    })

    const plan = await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId })

    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'move',
        sourcePath: fixture.templates[0]!.relativePath,
        targetPath,
      }),
    ])
    expect(fixture.runTask.mock.calls[0]![1].system).toContain(
      '每个 invalid-name 审计项都必须输出 move',
    )
  })

  it.each([
    ['the same path', 'template-1.cpp'],
    ['a changed extension', 'organized/template-1.py'],
    ['an occupied target', 'template-2.cpp'],
  ])('rejects %s instead of silently dropping a required rename', async (_label, targetPath) => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath)
    addInvalidNameIssue(fixture.audit, fixture.templates[0]!)
    fixture.runTask.mockResolvedValueOnce({
      model: fixture.target.model,
      providerName: fixture.target.providerName,
      text: JSON.stringify({
        operations: [
          {
            alternatives: ['Keep the current path'],
            applicability: ['The file name must be repaired'],
            confidence: 0.9,
            evidence: ['The audit found decoding artifacts'],
            kind: 'move',
            reason: 'Repair the file name',
            risk: 'medium',
            targetPath,
            templateId: fixture.templates[0]!.id,
          },
        ],
        summary: 'Repair the malformed file name',
      }),
    })
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'en',
      requestId: crypto.randomUUID(),
    })

    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: expect.stringContaining('命名异常文件提供安全有效的改名操作'),
    })
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })

  it('treats a deterministic exact-duplicate deletion as resolving the invalid file name', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath)
    addInvalidNameIssue(fixture.audit, fixture.templates[1]!)
    fixture.audit.issues.push({
      detail: `这些模板源码规范化后完全相同；建议仅保留 ${fixture.templates[0]!.relativePath}。`,
      id: crypto.randomUUID(),
      kind: 'duplicate-content',
      pathCount: 2,
      paths: [fixture.templates[0]!.relativePath, fixture.templates[1]!.relativePath],
      pathsTruncated: false,
      severity: 'warning',
    })
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    const plan = await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId })

    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'delete',
        source: 'local-audit',
        sourcePath: fixture.templates[1]!.relativePath,
      }),
    ])
  })

  it('fails before network when mandatory renames alone exceed the 100-operation plan limit', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { templateCount: 101 })
    for (const template of fixture.templates) addInvalidNameIssue(fixture.audit, template)

    await expect(
      fixture.service.previewFilePlan({
        includeNotes: false,
        outputLanguage: 'zh-CN',
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: expect.stringMatching(/101.*100/),
    })
    expect(fixture.runTask).not.toHaveBeenCalled()
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })

  it('reports a clear single-plan limit when local and AI operations exceed 100', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, { templateCount: 102 })
    fixture.audit.issues.push({
      detail: `这些模板源码规范化后完全相同；建议仅保留 ${fixture.templates[0]!.relativePath}。`,
      id: crypto.randomUUID(),
      kind: 'duplicate-content',
      pathCount: 2,
      paths: [fixture.templates[0]!.relativePath, fixture.templates[1]!.relativePath],
      pathsTruncated: false,
      severity: 'warning',
    })
    const duplicateIds = new Set(fixture.templates.slice(0, 2).map(template => template.id))
    const templateIndexById = new Map(
      fixture.templates.map((template, index) => [template.id, index + 1]),
    )
    fixture.runTask.mockImplementation(async (_task, request: AiCompletionRequest) => {
      const payload = JSON.parse(request.text) as { templates: Array<{ id: string }> }
      return {
        model: fixture.target.model,
        providerName: fixture.target.providerName,
        text: JSON.stringify({
          operations: payload.templates
            .filter(template => !duplicateIds.has(template.id))
            .map(template => ({
              alternatives: ['保留原路径'],
              applicability: ['分类需要统一'],
              confidence: 0.8,
              evidence: ['路径分类证据'],
              kind: 'move',
              reason: '统一分类路径',
              risk: 'medium',
              targetPath: `整理/模板-${templateIndexById.get(template.id) ?? 0}.cpp`,
              templateId: template.id,
            })),
          summary: '批量整理',
        }),
      }
    })
    const preview = await fixture.service.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
      requestId: crypto.randomUUID(),
    })

    await expect(
      fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: expect.stringMatching(/101.*100/),
    })
    expect(fixture.createPlan).not.toHaveBeenCalled()
  })
})
