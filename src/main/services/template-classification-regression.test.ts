import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { TemplateManagementService } from './template-management-service'
import type { AiCompletionRequest } from './ai-provider-adapters'

const content = readFileSync('tests/fixtures/classification-evidence/fenwick.cpp', 'utf8')
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const metadata = {
  notes: 'private-note-never-send',
  solves: '',
  timeComplexity: null,
  spaceComplexity: null,
  tags: [],
}
const proposal = () => ({
  algorithmFamily: 'Fenwick',
  categoryId: 'data-structure.fenwick',
  categoryPath: ['数据结构', '树状数组', 'Fenwick 树'],
  classificationReason: '循环沿低位更新',
  confidence: 0.9,
  fileName: '累加.cpp',
  solves: '前缀累加',
  tags: ['前缀'],
  timeComplexity: 'O(log n)',
  spaceComplexity: 'O(n)',
  sourceEvidence: [{ startLine: 8, endLine: 8, quote: 'i += i & -i', claim: '低位更新' }],
})
function harness(
  answer: (request: AiCompletionRequest) => unknown,
  stableContext = JSON.stringify({ workspaceCatalog: { directories: [] } }),
) {
  const requests: AiCompletionRequest[] = []
  const finish = vi.fn()
  const controller = new AbortController()
  const service = new TemplateManagementService(
    {
      getTaskTarget: () => ({
        capabilities: {
          promptCaching: false,
          streaming: false,
          structuredOutput: true,
          vision: false,
        },
        id: id(90),
        model: 'mock',
        providerName: 'mock',
        endpointHost: 'fixture.invalid',
        protocol: 'openai-chat-completions',
      }),
      runTask: async (_task: string, request: AiCompletionRequest) => {
        requests.push(request)
        return { model: 'mock', providerName: 'mock', text: JSON.stringify(answer(request)) }
      },
    } as never,
    {} as never,
    {
      getActiveWorkspace: () => ({ id: id(91), rootPath: '/not-used-by-classification' }),
      listTemplates: () => [],
    } as never,
    {} as never,
    '/not-used-by-classification',
    {
      build: async () => ({
        cacheKey: 'mock',
        catalogTemplateRefs: [],
        relatedContext: '{}',
        sentTemplateNameCount: 0,
        stableContext,
        templateCount: 0,
        templateNamesTruncated: false,
      }),
    } as never,
    {
      start: () => ({
        signal: controller.signal,
        finish,
        throwIfCancelled: () => {
          if (controller.signal.aborted) throw new Error('cancelled')
        },
      }),
    } as never,
  )
  return { service, requests, finish, controller }
}
const sources = (n: number) =>
  Array.from({ length: n }, (_, index) => ({
    id: id(index + 1),
    content,
    displayPath: `misleading-mst-${index}.cpp`,
    fileName: `misleading-mst-${index}.cpp`,
    sourceEncoding: 'utf-8' as const,
  }))

describe('classification source-backed response regressions', () => {
  it('keeps detailed source findings over wrong global titles and preserves total progress across batches', async () => {
    const { service, requests, finish } = harness(request => ({
      classifications: JSON.parse(request.text).sources.map((source: { id: string }) => ({
        sourceId: source.id,
        classification: request.system?.includes('全局分类事实提取器')
          ? {
              algorithmFamily: 'MST',
              categoryId: 'graph.mst',
              confidence: 1,
              timeComplexity: 'O(n log n)',
            }
          : proposal(),
      })),
    }))
    const progress: Array<{ processedCount: number; totalCount: number | null }> = []
    const result = await service.classifyBatch(
      { outputLanguage: 'zh-CN', requestId: id(99), sources: sources(9) },
      { onProgress: value => progress.push(value) },
    )
    expect(requests).toHaveLength(4)
    expect(finish).toHaveBeenCalledOnce()
    expect(
      result.classifications.every(
        item => item.classification.categoryId === 'data-structure.fenwick',
      ),
    ).toBe(true)
    for (const item of result.classifications) {
      expect(item.classification.reviewReasons).toContain('global-detail-disagreement')
      expect(item.classification.sourceEvidence?.[0]).toMatchObject({
        verified: true,
        containsImplementation: true,
      })
      expect(item.classification.metadata.timeComplexity).toBe('O(log n)')
      expect(item.classification.proposalHistory).toHaveLength(2)
    }
    expect(progress.every(item => item.totalCount === 9)).toBe(true)
    expect(progress.map(item => item.processedCount)).toEqual(
      [...progress.map(item => item.processedCount)].sort((a, b) => a - b),
    )
  })

  it.each(['unknown.category', '../../escape'])(
    'fails closed for explicit unknown category %s',
    async categoryId => {
      const { service } = harness(() => ({ ...proposal(), categoryId }))
      await expect(
        service.classify({
          content,
          fileName: '误导最小生成树.cpp',
          metadata,
          outputLanguage: 'zh-CN',
          requestId: id(99),
        }),
      ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
    },
  )

  it.each(['duplicate', 'missing', 'foreign'] as const)(
    'fails closed for %s source IDs',
    async kind => {
      const { service } = harness(() => ({
        classifications: (kind === 'duplicate'
          ? [id(1), id(1)]
          : kind === 'missing'
            ? [id(1)]
            : [id(1), id(80)]
        ).map(sourceId => ({ sourceId, classification: proposal() })),
      }))
      await expect(
        service.classifyBatch({ outputLanguage: 'zh-CN', requestId: id(99), sources: sources(2) }),
      ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
    },
  )

  it('rejects malformed evidence responses and blocks oversized serialized context before network', async () => {
    const { service } = harness(() => ({
      ...proposal(),
      sourceEvidence: [{ startLine: 'invented', quote: 'x' }],
    }))
    await expect(
      service.classify({
        content,
        fileName: '累加.cpp',
        metadata,
        outputLanguage: 'zh-CN',
        requestId: id(99),
      }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
    const oversized = harness(
      () => proposal(),
      JSON.stringify({ workspaceCatalog: { directories: ['x'.repeat(150000)] } }),
    )
    await expect(
      oversized.service.classifyBatch({
        outputLanguage: 'zh-CN',
        requestId: id(99),
        sources: sources(1),
      }),
    ).rejects.toMatchObject({ code: 'AI_CONTEXT_TOO_LARGE' })
    expect(oversized.requests).toHaveLength(0)
  })

  it('does not send notes or trust comment-only evidence as implementation', async () => {
    const { service, requests } = harness(() => ({
      ...proposal(),
      sourceEvidence: [
        {
          startLine: 2,
          endLine: 2,
          quote: '// Misleading title: Kruskal and minimum spanning tree. Inspect the code.',
          claim: '注释名称',
        },
      ],
    }))
    const result = await service.classify({
      content,
      fileName: '累加.cpp',
      metadata,
      outputLanguage: 'zh-CN',
      requestId: id(99),
    })
    expect(result.sourceEvidence?.[0]).toMatchObject({
      verified: true,
      containsImplementation: false,
    })
    expect(result.reviewReasons).toContain('missing-implementation-evidence')
    expect(result.needsReview).toBe(true)
    expect(JSON.stringify(requests)).not.toContain(metadata.notes)
  })
})
