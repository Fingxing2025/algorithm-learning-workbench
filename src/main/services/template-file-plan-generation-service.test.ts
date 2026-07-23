import { createHash } from 'node:crypto'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TemplateMetadata, WorkspaceAudit } from '@core/contracts/template-management'
import type { TemplateSummary } from '@core/contracts/workspace'

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
      commonMistakes: `错误 ${index + 1}`,
      constraints: `约束 ${index + 1}`,
      notes: options.notes?.[index] ?? '',
      prerequisites: `前置 ${index + 1}`,
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
  const aiTaskRunRegistry = {
    cancel: vi.fn(),
    start: () => ({
      finish,
      signal: new AbortController().signal,
      throwIfCancelled: () => undefined,
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
    const plan = await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId })

    expect(fixture.auditWorkspace).toHaveBeenCalledTimes(1)
    expect(fixture.build).toHaveBeenCalledTimes(1)
    expect(fixture.runTask).toHaveBeenCalledTimes(1)
    expect(plan.diagnostic.inputHash).toBe(preview.filePlan.inputHash)
    expect(plan.diagnostic.previewId).toBe(preview.filePlan.previewId)
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
    await fixture.service.generateFilePlan({ previewId: preview.filePlan.previewId })
    expect(fixture.capturedRequests[0]!.text).toContain('允许发送的笔记')
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

  it('fails the total budget before network instead of dropping required audit candidates', async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-plan-snapshot-'))
    const fixture = await createFixture(rootPath, {
      notes: Array.from({ length: 4 }, () => 'n'.repeat(100_000)),
      templateCount: 4,
    })

    await expect(
      fixture.service.previewFilePlan({
        includeNotes: true,
        outputLanguage: 'zh-CN',
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'AI_CONTEXT_TOO_LARGE' })
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
    fixture.runTask.mockResolvedValueOnce({
      model: fixture.target.model,
      providerName: fixture.target.providerName,
      text: JSON.stringify({
        operations: fixture.templates.slice(2).map((template, index) => ({
          alternatives: ['保留原路径'],
          applicability: ['分类需要统一'],
          confidence: 0.8,
          evidence: ['路径分类证据'],
          kind: 'move',
          reason: '统一分类路径',
          risk: 'medium',
          targetPath: `整理/模板-${index + 3}.cpp`,
          templateId: template.id,
        })),
        summary: '批量整理',
      }),
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
