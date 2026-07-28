import { describe, expect, it, vi } from 'vitest'

import type { AiCompletionRequest } from './ai-provider-adapters'
import { ProblemAnalysisService } from './problem-analysis-service'

const firstId = '1'.padStart(64, '0')
const outsideOldLimitId = 'e'.repeat(64)
const unavailableId = 'f'.repeat(64)

function modelCandidate(templateId: string, reason: string, confidence: number) {
  return {
    applicableWhen: [],
    confidence,
    evidence: [],
    matchedCapabilities: [],
    notApplicableWhen: [],
    reason,
    role: 'direct-solution' as const,
    templateId,
    warnings: [],
  }
}

function contextFixture() {
  const relatedTemplateRefs = Array.from({ length: 24 }, (_, index) => ({
    id: (index + 1).toString(16).padStart(64, '0'),
    language: 'C++',
    name: `旧候选-${String(index + 1).padStart(2, '0')}`,
    path: `常见分类/旧候选-${String(index + 1).padStart(2, '0')}.cpp`,
  }))
  return {
    cacheKey: 'workspace:catalog-v1:fixture',
    catalogDirectoryCount: 2,
    catalogTemplateRefs: [
      ...relatedTemplateRefs,
      {
        id: outsideOldLimitId,
        language: 'C++',
        name: '旧候选范围外的正确模板',
        path: '罕见分类/正确目录/正确模板.cpp',
      },
    ],
    contextTruncated: false,
    estimatedCharacters: 8_000,
    estimatedInputTokens: 2_000,
    relatedContext: JSON.stringify({
      relatedTemplates: relatedTemplateRefs.map(template => ({ ...template, sourceSnippet: '' })),
    }),
    relatedSourceCharacters: 0,
    relatedSourceTemplateCount: 0,
    relatedTemplateCount: 24,
    relatedTemplateRefs,
    sentTemplateNameCount: 25,
    stableContext: JSON.stringify({
      instruction: 'fixture',
      workspaceCatalog: {
        directories: [],
        rootTemplates: [],
        schemaVersion: 1,
        workspace: { directoryCount: 2, id: 'workspace-1', name: '测试', templateCount: 25 },
        workspaceContextVersion: 'catalog-version',
      },
    }),
    summarizedTemplateCount: 25,
    summaryShortened: false,
    supplementalMetadataOmitted: false,
    sourceSnippetsOmitted: false,
    templateCount: 25,
    templateNamesTruncated: false,
    version: 'catalog-version',
  }
}

function createService() {
  let capturedRequest: AiCompletionRequest | null = null
  const aiProviderService = {
    getTaskTarget: () => ({
      capabilities: {
        promptCaching: true,
        streaming: false,
        structuredOutput: true,
        vision: true,
      },
      endpointHost: 'fixture.invalid',
      id: '40000000-0000-4000-8000-000000000001',
      model: 'fixture-model',
      protocol: 'openai-chat-completions',
      providerName: 'fixture-provider',
    }),
    runTask: async (_task: string, request: AiCompletionRequest) => {
      capturedRequest = request
      return {
        model: 'fixture-model',
        providerName: 'fixture-provider',
        text: JSON.stringify({
          aiSummary: '需要使用罕见分类中的正确模板。',
          analysis: {
            algorithmSignals: ['罕见算法'],
            constraints: [],
            edgeCases: [],
            examples: [],
            inputDescription: '输入。',
            outputDescription: '输出。',
          },
          notes: '',
          status: 'unattempted',
          templateCandidates: [
            modelCandidate(outsideOldLimitId, '完整目录匹配。', 0.97),
            modelCandidate(outsideOldLimitId, '重复项。', 0.95),
            modelCandidate(unavailableId, '不可用伪造项。', 0.99),
            modelCandidate(firstId, '旧候选中的辅助项。', 0.7),
          ],
          title: '完整目录候选测试',
        }),
      }
    },
  }
  const run = {
    finish: () => undefined,
    signal: new AbortController().signal,
    throwIfCancelled: () => undefined,
  }
  const service = new ProblemAnalysisService(
    aiProviderService as never,
    {} as never,
    '/tmp/problem-analysis-service-test',
    { build: async () => contextFixture() } as never,
    { start: () => run } as never,
  )
  return { getCapturedRequest: () => capturedRequest, service }
}

describe('ProblemAnalysisService complete workspace catalog', () => {
  it('accepts a real template outside the old related-24 set and rejects duplicate or unavailable IDs', async () => {
    const { getCapturedRequest, service } = createService()

    const draft = await service.analyze({
      images: [],
      outputLanguage: 'zh-CN',
      requestId: '40000000-0000-4000-8000-000000000002',
      text: '这是一道只有罕见算法模板适用的题目。',
    })

    expect(draft.candidates.map(candidate => candidate.templateId)).toEqual([
      outsideOldLimitId,
      firstId,
    ])
    expect(draft.candidates[0]).toMatchObject({
      templateName: '旧候选范围外的正确模板',
      templatePath: '罕见分类/正确目录/正确模板.cpp',
    })
    expect(getCapturedRequest()?.cache?.stableContext).toContain('workspaceCatalog')
    expect(getCapturedRequest()?.system).toContain('workspaceCatalog 中的全部目录和模板')
    expect(getCapturedRequest()?.system).toContain('不得只从 relatedTemplates')
  })

  it('reports complete-catalog coverage and degradation facts in the request preview', async () => {
    const { service } = createService()

    const preview = await service.preview({ images: [], outputLanguage: 'zh-CN', text: '题面' })

    expect(preview.workspaceCatalog).toEqual({
      directoryCount: 2,
      estimatedInputTokens: 2_000,
      relatedSourceCharacters: 0,
      relatedSourceTemplateCount: 0,
      schemaVersion: 1,
      sentTemplateNameCount: 25,
      sourceSnippetsOmitted: false,
      summarizedTemplateCount: 25,
      summaryShortened: false,
      supplementalMetadataOmitted: false,
      templateCount: 25,
      templateNamesTruncated: false,
    })
  })
})

describe('ProblemAnalysisService current workspace commit boundary', () => {
  const workspaceId = '40000000-0000-4000-8000-000000000010'
  const templateId = 'a'.repeat(64)
  const fields = {
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
    platform: null,
    problemCode: null,
    statement: '',
    status: 'unattempted' as const,
    tags: [],
    title: '当前工作区题目',
    url: null,
  }

  function createCommitService(currentWorkspaceId: string | null) {
    const isTemplateAvailable = vi.fn(
      (targetWorkspaceId: string, targetTemplateId: string) =>
        targetWorkspaceId === workspaceId && targetTemplateId === templateId,
    )
    const createAnalyzedProblem = vi.fn((targetWorkspaceId: string, problemId: string) => ({
      ...fields,
      createdAt: '2026-07-24T00:00:00.000Z',
      id: problemId,
      images: [],
      relations: [],
      title: `${fields.title}-${targetWorkspaceId}`,
      updatedAt: '2026-07-24T00:00:00.000Z',
    }))
    const service = new ProblemAnalysisService(
      {} as never,
      { createAnalyzedProblem, isTemplateAvailable } as never,
      '/tmp/problem-analysis-workspace-boundary',
      { getCurrentWorkspaceId: () => currentWorkspaceId } as never,
      {} as never,
    )
    return { createAnalyzedProblem, isTemplateAvailable, service }
  }

  it('resolves the workspace in Main and passes it to relation validation and persistence', async () => {
    const { createAnalyzedProblem, isTemplateAvailable, service } = createCommitService(workspaceId)

    await service.commit({
      fields,
      images: [],
      relations: [{ note: '', relationType: 'recommended', templateId }],
    })

    expect(isTemplateAvailable).toHaveBeenCalledWith(workspaceId, templateId)
    expect(createAnalyzedProblem).toHaveBeenCalledWith(
      workspaceId,
      expect.any(String),
      fields,
      [],
      [{ note: '', relationType: 'recommended', templateId }],
    )
  })

  it('rejects commits without an active workspace before validating or persisting relations', async () => {
    const { createAnalyzedProblem, isTemplateAvailable, service } = createCommitService(null)

    await expect(
      service.commit({
        fields,
        images: [],
        relations: [{ note: '', relationType: 'recommended', templateId }],
      }),
    ).rejects.toThrow('请先创建或选择模板工作区')
    expect(isTemplateAvailable).not.toHaveBeenCalled()
    expect(createAnalyzedProblem).not.toHaveBeenCalled()
  })

  it('rejects a template outside the active workspace without writing a problem', async () => {
    const { createAnalyzedProblem, service } = createCommitService(workspaceId)

    await expect(
      service.commit({
        fields,
        images: [],
        relations: [{ note: '', relationType: 'recommended', templateId: 'b'.repeat(64) }],
      }),
    ).rejects.toThrow('候选模板已不可用')
    expect(createAnalyzedProblem).not.toHaveBeenCalled()
  })
})
