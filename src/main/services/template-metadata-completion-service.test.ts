import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import type { TemplateMetadata, TemplateMetadataFields } from '@core/contracts/template-management'
import type { TemplateSummary } from '@core/contracts/workspace'

import {
  applyExistingMetadataFieldSelection,
  buildExistingMetadataProposal,
  TemplateMetadataCompletionService,
} from './template-metadata-completion-service'

const current: TemplateMetadataFields = {
  notes: '私密用户笔记',
  solves: '',
  spaceComplexity: null,
  tags: ['用户标签'],
  timeComplexity: null,
}

const generated = {
  solves: '解决非负权最短路',
  spaceComplexity: 'O(n + m)',
  tags: ['图论', '最短路'],
  timeComplexity: 'O((n + m) log n)',
}

const workspaceId = '40000000-0000-4000-8000-000000000101'
const providerId = '40000000-0000-4000-8000-000000000102'

function template(fileName: string): TemplateSummary {
  return {
    extension: '.cpp',
    fileName,
    id: createHash('sha256').update(fileName).digest('hex'),
    language: 'C++',
    modifiedAt: '2026-07-24T00:00:00.000Z',
    name: fileName.replace(/\.cpp$/u, ''),
    relativePath: `图论/${fileName}`,
    sizeBytes: 128,
  }
}

function completeMetadata(templateId: string): TemplateMetadata {
  return {
    notes: '不会发送的私密笔记',
    solves: '非负权最短路',
    spaceComplexity: 'O(n + m)',
    tags: ['图论'],
    templateId,
    timeComplexity: 'O((n + m) log n)',
    updatedAt: '2026-07-24T00:00:00.000Z',
  }
}

function createServiceFixture(options: { complete?: boolean; templateCount?: number } = {}) {
  const templates = Array.from({ length: options.templateCount ?? 1 }, (_, index) =>
    template(`template-${index + 1}.cpp`),
  )
  const sources = new Map(templates.map(item => [item.id, `void algorithm_${item.name}() {}\n`]))
  const metadata = new Map<string, TemplateMetadata>()
  for (const item of templates) {
    metadata.set(
      item.id,
      options.complete
        ? completeMetadata(item.id)
        : {
            ...current,
            templateId: item.id,
            updatedAt: '2026-07-24T00:00:00.000Z',
          },
    )
  }
  const version = 'c'.repeat(64)
  const context = {
    cacheKey: `workspace:${version}`,
    catalogDirectoryCount: 1,
    catalogTemplateRefs: templates.map(item => ({
      id: item.id,
      language: item.language,
      name: item.name,
      path: item.relativePath,
    })),
    contextTruncated: false,
    estimatedCharacters: 240,
    estimatedInputTokens: 60,
    relatedContext: '{"relatedTemplates":[]}',
    relatedSourceCharacters: 0,
    relatedSourceTemplateCount: 0,
    relatedTemplateCount: templates.length,
    relatedTemplateRefs: [],
    sentTemplateNameCount: templates.length,
    sourceSnippetsOmitted: false,
    stableContext: '{"workspaceCatalog":[]}',
    summarizedTemplateCount: templates.length,
    summaryShortened: false,
    supplementalMetadataOmitted: false,
    templateCount: templates.length,
    templateNamesTruncated: false,
    version,
  }
  const target = {
    capabilities: {
      promptCaching: false,
      streaming: false,
      structuredOutput: false,
      vision: false,
    },
    endpointHost: 'fixture.invalid',
    id: providerId,
    model: 'fixture-model',
    protocol: 'openai-responses' as const,
    providerName: 'Fixture Provider',
  }
  const capturedPayloads: string[] = []
  const runTask = vi.fn(async (_task, request: { text: string }) => {
    capturedPayloads.push(request.text)
    return {
      model: target.model,
      providerName: target.providerName,
      text: JSON.stringify(generated),
    }
  })
  const upsertMetadataBatch = vi.fn(
    (updates: Array<{ fields: TemplateMetadataFields; templateId: string }>) => {
      for (const update of updates) {
        metadata.set(update.templateId, {
          ...update.fields,
          templateId: update.templateId,
          updatedAt: '2026-07-24T00:01:00.000Z',
        })
      }
    },
  )
  const activeWorkspaceId = workspaceId
  const workspaceRepository = {
    getActiveWorkspace: () => ({ id: activeWorkspaceId, name: '测试工作区', rootPath: '/fixture' }),
    getTemplateWithWorkspace: (templateId: string) => {
      const found = templates.find(item => item.id === templateId)
      return found
        ? {
            template: { ...found, available: true },
            workspace: { id: workspaceId, name: '测试工作区', rootPath: '/fixture' },
          }
        : null
    },
  }
  const finish = vi.fn()
  const service = new TemplateMetadataCompletionService(
    { getTaskTarget: () => target, runTask } as never,
    {
      getMetadata: (templateId: string) => metadata.get(templateId) ?? null,
      upsertMetadataBatch,
    } as never,
    workspaceRepository as never,
    {
      readTemplateSource: async (templateId: string) => ({
        content: sources.get(templateId) ?? '',
      }),
    } as never,
    {
      build: vi.fn(async () => context),
      getCurrentVersion: () => ({ version, workspaceId: activeWorkspaceId }),
    } as never,
    {
      start: () => ({
        finish,
        signal: new AbortController().signal,
        throwIfCancelled: () => undefined,
      }),
    } as never,
  )
  return {
    capturedPayloads,
    finish,
    metadata,
    runTask,
    service,
    setMetadata: (templateId: string, value: TemplateMetadata) => metadata.set(templateId, value),
    setSource: (templateId: string, value: string) => sources.set(templateId, value),
    templates,
    upsertMetadataBatch,
  }
}

async function generateDraft(
  fixture: ReturnType<typeof createServiceFixture>,
  templateIds = fixture.templates.map(item => item.id),
  onProgress?: Parameters<typeof fixture.service.generate>[1],
) {
  const preview = await fixture.service.preview({ outputLanguage: 'zh-CN', templateIds })
  return fixture.service.generate(
    {
      previewId: preview.previewId,
      requestId: crypto.randomUUID(),
    },
    onProgress,
  )
}

describe('existing template metadata completion merge', () => {
  it('fills only empty fields and always preserves existing values and notes', () => {
    const proposal = buildExistingMetadataProposal(current, generated)

    expect(proposal.changedFields).toEqual(['solves', 'spaceComplexity', 'timeComplexity'])
    expect(proposal.metadata.tags).toEqual(['用户标签'])
    expect(proposal.metadata.notes).toBe('私密用户笔记')
  })

  it('applies only user-selected suggestion fields', () => {
    const proposal = buildExistingMetadataProposal(current, generated)
    const applied = applyExistingMetadataFieldSelection(current, proposal.metadata, [
      'solves',
      'timeComplexity',
    ])

    expect(applied.solves).toBe('解决非负权最短路')
    expect(applied.timeComplexity).toBe('O((n + m) log n)')
    expect(applied.notes).toBe('私密用户笔记')
  })
})

describe('TemplateMetadataCompletionService guarded workflow', () => {
  it('never sends notes, preserves existing fields and writes multiple templates in one batch', async () => {
    const fixture = createServiceFixture({ templateCount: 2 })
    const onProgress = vi.fn()
    const draft = await generateDraft(fixture, undefined, onProgress)

    expect(fixture.runTask).toHaveBeenCalledTimes(2)
    expect(fixture.capturedPayloads.join('\n')).not.toContain('不会发送的私密笔记')
    expect(draft.items).toHaveLength(2)
    expect(onProgress).toHaveBeenCalledWith({
      currentItem: fixture.templates[1]!.relativePath,
      phase: 'processing',
      processedCount: 2,
      totalCount: 2,
    })
    expect(onProgress).toHaveBeenLastCalledWith({
      currentItem: null,
      phase: 'finalizing',
      processedCount: 2,
      totalCount: 2,
    })
    for (const item of draft.items) {
      expect(item.proposedMetadata.tags).toEqual(['用户标签'])
      expect(item.proposedMetadata.notes).toBe('私密用户笔记')
    }

    const result = await fixture.service.apply({
      confirmed: true,
      draftId: draft.draftId,
      selections: draft.items.map(item => ({ fields: ['solves'], templateId: item.template.id })),
    })

    expect(result).toMatchObject({ updatedFieldCount: 2, updatedTemplateCount: 2 })
    expect(fixture.upsertMetadataBatch).toHaveBeenCalledTimes(1)
    expect(fixture.upsertMetadataBatch).toHaveBeenCalledWith(
      fixture.templates.map(item => ({
        fields: expect.objectContaining({
          notes: '私密用户笔记',
          solves: '解决非负权最短路',
          tags: ['用户标签'],
        }),
        templateId: item.id,
      })),
    )
  })

  it('does not call the Provider when every completable field already has content', async () => {
    const fixture = createServiceFixture({ complete: true })
    const draft = await generateDraft(fixture)

    expect(fixture.runTask).not.toHaveBeenCalled()
    expect(draft.items[0]?.changedFields).toEqual([])
    expect(fixture.finish).toHaveBeenCalledTimes(1)
  })

  it('sends oversized source with explicit head-tail truncation metadata', async () => {
    const fixture = createServiceFixture()
    const source = `// SOURCE_HEAD\n${'x'.repeat(40_000)}\n// SOURCE_TAIL`
    fixture.setSource(fixture.templates[0]!.id, source)

    await generateDraft(fixture)

    const payload = JSON.parse(fixture.capturedPayloads[0]!) as {
      source: string
      sourceOriginalCharacters: number
      sourceTruncated: boolean
      sourceTruncationStrategy: string
    }
    expect(payload.source).toContain('SOURCE_HEAD')
    expect(payload.source).toContain('SOURCE_TAIL')
    expect(payload.source).toContain('AI_INPUT_HEAD_TAIL_TRUNCATED')
    expect(payload.sourceOriginalCharacters).toBe(source.length)
    expect(payload.sourceTruncated).toBe(true)
    expect(payload.sourceTruncationStrategy).toBe('head-tail')
  })

  it('rejects the whole apply when source content changed after generation', async () => {
    const fixture = createServiceFixture({ templateCount: 2 })
    const draft = await generateDraft(fixture)
    fixture.setSource(fixture.templates[1]!.id, 'void externally_changed() {}\n')

    await expect(
      fixture.service.apply({
        confirmed: true,
        draftId: draft.draftId,
        selections: draft.items.map(item => ({ fields: ['solves'], templateId: item.template.id })),
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('源码已变化') })
    expect(fixture.upsertMetadataBatch).not.toHaveBeenCalled()
  })

  it('rejects the whole apply when metadata changed after generation', async () => {
    const fixture = createServiceFixture({ templateCount: 2 })
    const draft = await generateDraft(fixture)
    const changedTemplate = fixture.templates[0]!
    fixture.setMetadata(changedTemplate.id, {
      ...fixture.metadata.get(changedTemplate.id)!,
      solves: '用户刚刚填写的内容',
      updatedAt: '2026-07-24T00:02:00.000Z',
    })

    await expect(
      fixture.service.apply({
        confirmed: true,
        draftId: draft.draftId,
        selections: draft.items.map(item => ({ fields: ['solves'], templateId: item.template.id })),
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('元数据已变化') })
    expect(fixture.upsertMetadataBatch).not.toHaveBeenCalled()
  })
})
