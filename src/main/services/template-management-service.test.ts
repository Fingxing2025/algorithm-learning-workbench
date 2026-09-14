import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import iconv from 'iconv-lite'

import { PublicError } from '../errors/public-error'
import type { AiCompletionRequest } from './ai-provider-adapters'
import { buildSimilaritySignature } from './template-content-index'
import { buildClassificationPath, normalizeAiDirectoryPath } from './template-management-helpers'
import { TemplateManagementService } from './template-management-service'
import type { TemplateIndexEntry } from './template-scanner'
import {
  AI_RESPONSE_SAFE_ESTIMATE_BYTES,
  BATCH_DETAIL_MAX_OUTPUT_TOKENS,
  BATCH_DETAIL_SIZE,
  BATCH_GLOBAL_FACTS_MAX_OUTPUT_TOKENS,
  estimateBatchClassificationResponseBytes,
} from './template-management-constants'

function createTemplate(
  workspaceId: string,
  relativePath: string,
  normalizedContentHash: string,
): TemplateIndexEntry {
  const id = `${workspaceId}-${relativePath}`.padEnd(64, '0').slice(0, 64)
  return {
    available: true,
    changeKind: 'unchanged',
    changeToken: 'token',
    contentHash: normalizedContentHash,
    extension: '.cpp',
    fileIdentity: null,
    fileName: relativePath.split('/').at(-1) ?? relativePath,
    id,
    indexVersion: 1,
    language: 'C++',
    modifiedAt: new Date(0).toISOString(),
    name: relativePath,
    normalizedContentHash,
    relativePath,
    similaritySignatureJson: JSON.stringify(buildSimilaritySignature('int a')),
    sizeBytes: 12,
  }
}

function createService(rootPath: string, templates: TemplateIndexEntry[]) {
  const workspace = { id: 'workspace-1', rootPath }
  const workspaceRepository = {
    getActiveWorkspace: () => workspace,
    listTemplateIndexEntries: () => templates,
  }
  const metadataRepository = {
    listMetadataMap: () => new Map(),
    listStaleTemplateRelationPaths: () => [],
  }
  return new TemplateManagementService(
    {} as never,
    metadataRepository as never,
    workspaceRepository as never,
    {} as never,
    rootPath,
    {} as never,
    {} as never,
  )
}

describe('TemplateManagementService feature contracts', () => {
  it('decodes Windows GBK batch imports while leaving the external file unchanged', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'template-management-service-'))
    const externalPath = join(rootPath, '中文模板.cpp')
    const sourceBytes = iconv.encode('// 算法模板\nint main() {}\n', 'gbk')
    await writeFile(externalPath, sourceBytes)
    try {
      const service = createService(rootPath, [])
      const sources = await (
        service as unknown as {
          readBatchCppSources(
            files: Array<{ displayPath: string; path: string }>,
          ): Promise<Array<{ content: string; sourceEncoding: string }>>
        }
      ).readBatchCppSources([{ displayPath: '中文模板.cpp', path: externalPath }])

      expect(sources[0]).toMatchObject({
        content: '// 算法模板\nint main() {}\n',
        sourceEncoding: 'gb18030',
      })
      expect(await readFile(externalPath)).toEqual(sourceBytes)
    } finally {
      await rm(rootPath, { force: true, recursive: true })
    }
  })

  it('reports normalized duplicate source groups with a deterministic keeper', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'template-management-service-'))
    try {
      await writeFile(join(rootPath, 'a.cpp'), 'int a;\n')
      await writeFile(join(rootPath, 'copy.cpp'), 'int a;\n')
      const service = createService(rootPath, [
        createTemplate('a', 'copy.cpp', 'same-hash'),
        createTemplate('b', 'a.cpp', 'same-hash'),
      ])

      const audit = await service.auditWorkspace()

      expect(audit.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'duplicate-content',
            paths: ['a.cpp', 'copy.cpp'],
          }),
        ]),
      )
      expect(audit.truncated).toBe(false)
      expect(audit.processedCount).toBe(2)
    } finally {
      await rm(rootPath, { force: true, recursive: true })
    }
  })

  it('marks duplicate groups with more than 20 paths as explicitly truncated', async () => {
    const templates = Array.from({ length: 21 }, (_, index) =>
      createTemplate(`workspace-${index}`, `group/item-${index + 1}.cpp`, 'same-hash'),
    )
    const service = createService('/tmp/template-management-service-test', templates)

    const audit = await service.auditWorkspace()
    const duplicateIssue = audit.issues.find(issue => issue.kind === 'duplicate-content')

    expect(duplicateIssue).toMatchObject({
      pathCount: 21,
      pathsTruncated: true,
    })
    expect(duplicateIssue?.paths).toHaveLength(20)
    expect(audit.truncated).toBe(true)
    expect(audit.truncatedReason).toContain(
      '1 个重复或相似组的路径超过 20 条，已在组内明确标记截断。',
    )
  })

  it('detects semantically duplicated category branches for AI file planning', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'template-management-service-'))
    try {
      await mkdir(join(rootPath, '字符串', '模式匹配'), { recursive: true })
      await mkdir(join(rootPath, '字符串算法', '回文串'), { recursive: true })
      await mkdir(join(rootPath, '算法', '二分查找'), { recursive: true })
      await mkdir(join(rootPath, '算法基础', '二分查找'), { recursive: true })
      await writeFile(join(rootPath, '字符串', '模式匹配', 'kmp.cpp'), 'int kmp() { return 1; }\n')
      await writeFile(
        join(rootPath, '字符串算法', '回文串', 'kmp2.cpp'),
        'int kmp2() { return 2; }\n',
      )
      await writeFile(
        join(rootPath, '算法', '二分查找', 'answer.cpp'),
        'int answer() { return 3; }\n',
      )
      await writeFile(
        join(rootPath, '算法基础', '二分查找', 'answer2.cpp'),
        'int answer2() { return 4; }\n',
      )
      const service = createService(rootPath, [
        createTemplate('a', '字符串/模式匹配/kmp.cpp', 'hash-a'),
        createTemplate('b', '字符串算法/回文串/kmp2.cpp', 'hash-b'),
        createTemplate('c', '算法/二分查找/answer.cpp', 'hash-c'),
        createTemplate('d', '算法基础/二分查找/answer2.cpp', 'hash-d'),
      ])

      const audit = await service.auditWorkspace()
      const issues = audit.issues.filter(issue => issue.kind === 'path-inconsistency')

      expect(issues.length).toBeGreaterThanOrEqual(2)
      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            detail: expect.stringContaining('字符串算法'),
            kind: 'path-inconsistency',
            paths: ['字符串算法/回文串/kmp2.cpp'],
          }),
          expect.objectContaining({
            detail: expect.stringContaining('算法基础'),
            kind: 'path-inconsistency',
            paths: ['算法基础/二分查找/answer2.cpp'],
          }),
        ]),
      )
    } finally {
      await rm(rootPath, { force: true, recursive: true })
    }
  })

  it('does not equate a generic knapsack directory with the 01 subtype', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'template-management-service-'))
    try {
      await mkdir(join(rootPath, '背包问题'), { recursive: true })
      await mkdir(join(rootPath, '动态规划', '01背包', '二维01背包'), { recursive: true })
      await writeFile(join(rootPath, '背包问题', '多重背包.cpp'), 'int multiple() { return 1; }\n')
      await writeFile(join(rootPath, '背包问题', '完全背包.cpp'), 'int complete() { return 2; }\n')
      await writeFile(
        join(rootPath, '动态规划', '01背包', '二维01背包', 'two-dimensional.cpp'),
        'int two() { return 3; }\n',
      )
      const service = createService(rootPath, [
        createTemplate('a', '背包问题/多重背包.cpp', 'hash-a'),
        createTemplate('b', '背包问题/完全背包.cpp', 'hash-b'),
        createTemplate('c', '动态规划/01背包/二维01背包/two-dimensional.cpp', 'hash-c'),
      ])

      const audit = await service.auditWorkspace()
      expect(audit.issues.filter(issue => issue.kind === 'path-inconsistency')).toEqual([])
    } finally {
      await rm(rootPath, { force: true, recursive: true })
    }
  })

  it('does not turn an algorithm name in metadata into a forced source classification', async () => {
    const template = createTemplate('a', '图论/通用图算法/图论基础/kruskal.cpp', 'hash-a')
    const service = new TemplateManagementService(
      {} as never,
      {
        listMetadataMap: () =>
          new Map([
            [
              template.id,
              {
                notes: '',
                solves: '使用 Kruskal 求最小生成树',
                spaceComplexity: 'O(n)',
                tags: ['Kruskal'],
                timeComplexity: 'O(m log m)',
                templateId: template.id,
                updatedAt: new Date(0).toISOString(),
              },
            ],
          ]),
        listStaleTemplateRelationPaths: () => [],
      } as never,
      {
        getActiveWorkspace: () => ({ id: 'workspace-1', rootPath: '/tmp/workspace' }),
        listTemplateIndexEntries: () => [template],
      } as never,
      {} as never,
      '/tmp/workspace',
      {} as never,
      {} as never,
    )

    const issue = (await service.auditWorkspace()).issues.find(
      candidate => candidate.kind === 'path-inconsistency',
    )
    expect(issue).toBeUndefined()
  })

  it('reports decoding artifacts separately from ordinary naming inconsistencies', async () => {
    const service = createService('/tmp/template-management-service-test', [
      createTemplate('a', '锟斤拷.cpp', 'hash-a'),
      createTemplate('b', 'plain copy.py', 'hash-b'),
      createTemplate('c', '树状数组.cpp', 'hash-c'),
    ])

    const audit = await service.auditWorkspace()
    const invalidNames = audit.issues.filter(issue => issue.kind === 'invalid-name')

    expect(invalidNames).toHaveLength(2)
    expect(invalidNames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringContaining('乱码或错误解码'),
          paths: ['锟斤拷.cpp'],
        }),
        expect.objectContaining({
          detail: expect.stringContaining('副本标记或异常空格'),
          paths: ['plain copy.py'],
        }),
      ]),
    )
  })

  it('stops audit work before publishing results when cancelled', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'template-management-service-'))
    try {
      const service = createService(rootPath, [createTemplate('a', 'a.cpp', 'hash')])
      const controller = new AbortController()
      controller.abort()

      await expect(service.auditWorkspace({ signal: controller.signal })).rejects.toMatchObject({
        code: 'TASK_CANCELLED',
      } satisfies Partial<PublicError>)
    } finally {
      await rm(rootPath, { force: true, recursive: true })
    }
  })

  it('uses the complete catalog to accept a valid existing directory outside the related-24 details', async () => {
    const existingTemplates = Array.from({ length: 25 }, (_, index) => ({
      id: (index + 1).toString(16).padStart(64, '0'),
      language: 'C++',
      name: index === 24 ? '旧候选范围外的目录依据' : `常见模板-${index + 1}`,
      relativePath:
        index === 24 ? '罕见分类/正确目录/已有模板.cpp' : `常见分类/目录-${index + 1}/模板.cpp`,
    }))
    const capturedRequests: AiCompletionRequest[] = []
    const aiProviderService = {
      getTaskTarget: () => ({
        capabilities: {
          promptCaching: true,
          streaming: false,
          structuredOutput: true,
          vision: false,
        },
        endpointHost: 'fixture.invalid',
        id: '40000000-0000-4000-8000-000000000001',
        model: 'fixture-model',
        protocol: 'openai-chat-completions',
        providerName: 'fixture-provider',
      }),
      runTask: async (_task: string, request: AiCompletionRequest) => {
        capturedRequests.push(request)
        return {
          model: 'fixture-model',
          providerName: 'fixture-provider',
          text: JSON.stringify({
            alternatives: [],
            categoryPath: ['罕见分类', '正确目录'],
            classificationReason: '完整目录中已有语义匹配的位置。',
            confidence: 0.96,
            fileName: 'new-template.cpp',
            placement: {
              existingParentPath: '罕见分类/正确目录',
              mode: 'existing-directory',
              newDirectories: [],
              reason: '复用完整目录中的现有位置。',
              targetDirectory: '罕见分类/正确目录',
            },
            solves: '用户已填写的用途',
            spaceComplexity: null,
            tags: ['用户标签'],
            timeComplexity: null,
          }),
        }
      },
    }
    const workspaceContext = {
      build: async () => ({
        cacheKey: 'workspace:complete-catalog',
        catalogDirectoryCount: 27,
        catalogTemplateRefs: existingTemplates.map(template => ({
          id: template.id,
          language: template.language,
          name: template.name,
          path: template.relativePath,
        })),
        contextTruncated: false,
        estimatedCharacters: 8_000,
        estimatedInputTokens: 2_000,
        relatedContext: JSON.stringify({
          relatedTemplates: existingTemplates.slice(0, 24).map(template => ({
            id: template.id,
            name: template.name,
            path: template.relativePath,
          })),
        }),
        relatedSourceCharacters: 0,
        relatedSourceTemplateCount: 0,
        relatedTemplateCount: 24,
        relatedTemplateRefs: existingTemplates.slice(0, 24).map(template => ({
          id: template.id,
          language: template.language,
          name: template.name,
          path: template.relativePath,
        })),
        sentTemplateNameCount: 25,
        stableContext: JSON.stringify({ workspaceCatalog: { directories: [] } }),
        summarizedTemplateCount: 25,
        summaryShortened: false,
        supplementalMetadataOmitted: false,
        sourceSnippetsOmitted: false,
        templateCount: 25,
        templateNamesTruncated: false,
        version: 'complete-catalog-version',
      }),
    }
    const run = {
      finish: () => undefined,
      signal: new AbortController().signal,
      throwIfCancelled: () => undefined,
    }
    const service = new TemplateManagementService(
      aiProviderService as never,
      {} as never,
      {
        getActiveWorkspace: () => ({ id: 'workspace-1', rootPath: '/tmp/workspace' }),
        listTemplates: () => existingTemplates,
      } as never,
      {} as never,
      '/tmp/template-management-service-test',
      workspaceContext as never,
      { start: () => run } as never,
    )

    const result = await service.classify({
      content: 'void new_template() {}',
      fileName: 'new-template.cpp',
      metadata: {
        notes: '绝对不能进入 AI 请求的用户笔记',
        solves: '用户已填写的用途',
        spaceComplexity: null,
        tags: ['用户标签'],
        timeComplexity: null,
      },
      outputLanguage: 'zh-CN',
      requestId: '40000000-0000-4000-8000-000000000002',
    })

    expect(result.placement).toMatchObject({
      mode: 'existing-directory',
      targetDirectory: '罕见分类/正确目录',
    })
    expect(result.metadata.solves).toBe('用户已填写的用途')
    const capturedRequest = capturedRequests.at(-1)
    expect(capturedRequest?.cache?.stableContext).toContain('workspaceCatalog')
    expect(capturedRequest?.system).toContain('workspaceCatalog 中的全部目录和模板名称')
    expect(capturedRequest?.system).toContain('不得只根据 relatedTemplates')
    expect(capturedRequest?.system).toContain('用户草稿中的非空字段只用于 Renderer 的差异确认')
    expect(capturedRequest?.text).toContain('用户已填写的用途')
    expect(capturedRequest?.text).not.toContain('绝对不能进入 AI 请求的用户笔记')
  })

  it('classifies a batch in one global request and preserves source coverage', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'template-management-service-'))
    const firstId = '40000000-0000-4000-8000-000000000101'
    const secondId = '40000000-0000-4000-8000-000000000102'
    const requests: AiCompletionRequest[] = []
    const aiProviderService = {
      getTaskTarget: () => ({
        capabilities: {
          promptCaching: true,
          streaming: false,
          structuredOutput: true,
          vision: false,
        },
        endpointHost: 'fixture.invalid',
        id: '40000000-0000-4000-8000-000000000103',
        model: 'fixture-model',
        protocol: 'openai-chat-completions',
        providerName: 'fixture-provider',
      }),
      runTask: async (_task: string, request: AiCompletionRequest) => {
        requests.push(request)
        return {
          model: 'fixture-model',
          providerName: 'fixture-provider',
          text: JSON.stringify({
            classifications: [
              {
                sourceId: firstId,
                classification: {
                  algorithmFamily: 'Kruskal',
                  categoryId: 'graph.mst',
                  categoryPath: ['图论', '生成树', '最小生成树'],
                  classificationReason: '按边权排序并使用并查集。',
                  confidence: 0.95,
                  evidence: ['排序边', '并查集'],
                  fileName: 'kruskal.cpp',
                  solves: '求最小生成树。',
                  spaceComplexity: 'O(n)',
                  tags: ['最小生成树'],
                  timeComplexity: 'O(m log m)',
                },
              },
              {
                sourceId: secondId,
                classification: {
                  algorithmFamily: 'Kruskal',
                  categoryId: 'graph.mst',
                  categoryPath: ['图论', '生成树', '最小生成树'],
                  classificationReason: '与同批 Kruskal 统一。',
                  confidence: 0.94,
                  evidence: ['并查集'],
                  fileName: 'kruskal2.cpp',
                  solves: '求最小生成树。',
                  spaceComplexity: 'O(n)',
                  tags: ['最小生成树'],
                  timeComplexity: 'O(m log m)',
                },
              },
            ],
          }),
        }
      },
    }
    const service = new TemplateManagementService(
      aiProviderService as never,
      {} as never,
      {
        getActiveWorkspace: () => ({ id: 'workspace-1', rootPath }),
        listTemplates: () => [],
      } as never,
      {} as never,
      rootPath,
      {
        build: async () => ({
          cacheKey: 'batch-global',
          catalogTemplateRefs: [],
          relatedContext: JSON.stringify({ relatedTemplates: [] }),
          sentTemplateNameCount: 0,
          stableContext: JSON.stringify({ workspaceCatalog: { directories: [] } }),
          templateCount: 0,
          templateNamesTruncated: false,
        }),
      } as never,
      {
        start: () => ({
          finish: () => undefined,
          signal: new AbortController().signal,
          throwIfCancelled: () => undefined,
        }),
      } as never,
    )
    try {
      const result = await service.classifyBatch({
        outputLanguage: 'zh-CN',
        requestId: '40000000-0000-4000-8000-000000000104',
        sources: [
          {
            content: 'int kruskal(){}',
            displayPath: 'a.cpp',
            fileName: 'a.cpp',
            id: firstId,
            sourceEncoding: 'utf-8',
          },
          {
            content: 'int kruskal2(){}',
            displayPath: 'b.cpp',
            fileName: 'b.cpp',
            id: secondId,
            sourceEncoding: 'utf-8',
          },
        ],
      })
      expect(requests).toHaveLength(1)
      expect(requests[0]?.maxOutputTokens).toBe(BATCH_DETAIL_MAX_OUTPUT_TOKENS)
      expect(result.classifications).toHaveLength(2)
      expect(result.classifications.map(item => item.classification.categoryId)).toEqual([
        'graph.mst',
        'graph.mst',
      ])
      expect(result.classifications[0]?.classification.placement.mode).toBe('create-category-chain')
    } finally {
      await rm(rootPath, { force: true, recursive: true })
    }
  })

  it('bounds 49-file batches with a compact global pass and four-source detail requests', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'template-management-service-large-'))
    const sources = Array.from({ length: 49 }, (_, index) => ({
      content: `int algorithm_${index}() { return ${index}; }`,
      displayPath: `source-${index}.cpp`,
      fileName: `source-${index}.cpp`,
      id: `40000000-0000-4000-8000-${String(index + 200).padStart(12, '0')}`,
      sourceEncoding: 'utf-8' as const,
    }))
    const requests: AiCompletionRequest[] = []
    const aiProviderService = {
      getTaskTarget: () => ({
        capabilities: {
          promptCaching: false,
          streaming: false,
          structuredOutput: true,
          vision: false,
        },
        endpointHost: 'fixture.invalid',
        id: '40000000-0000-4000-8000-000000000203',
        model: 'fixture-model',
        protocol: 'openai-chat-completions',
        providerName: 'fixture-provider',
      }),
      runTask: async (_task: string, request: AiCompletionRequest) => {
        requests.push(request)
        const payload = JSON.parse(request.text) as { sources?: Array<{ id: string }> }
        const requestSources = payload.sources ?? sources.map(source => ({ id: source.id }))
        const compact = request.system?.includes('全局分类事实提取器') ?? false
        return {
          model: 'fixture-model',
          providerName: 'fixture-provider',
          text: JSON.stringify({
            classifications: requestSources.map(source => ({
              sourceId: source.id,
              classification: compact
                ? {
                    algorithmFamily: 'array',
                    primaryTechnique: 'two-pointer',
                    variant: 'iterative',
                    timeComplexity: 'O(n)',
                    spaceComplexity: 'O(1)',
                    complexitySignals: { time: 'O(n)', space: 'O(1)' },
                    categoryDecision: 'reuse-existing',
                    categoryId: 'basic.search.binary',
                    confidence: 0.9,
                    evidence: ['数组遍历'],
                  }
                : {
                    algorithmFamily: 'array',
                    categoryId: 'basic.search.binary',
                    categoryPath: ['基础算法', '搜索', '二分查找'],
                    classificationReason: '数组遍历。',
                    confidence: 0.9,
                    evidence: ['数组遍历'],
                    fileName: '数组模板.cpp',
                    solves: '处理数组。',
                    spaceComplexity: 'O(1)',
                    tags: ['数组'],
                    timeComplexity: 'O(n)',
                  },
            })),
          }),
        }
      },
    }
    const service = new TemplateManagementService(
      aiProviderService as never,
      {} as never,
      {
        getActiveWorkspace: () => ({ id: 'workspace-1', rootPath }),
        listTemplates: () => [],
      } as never,
      {} as never,
      rootPath,
      {
        build: async () => ({
          cacheKey: 'batch-large',
          catalogTemplateRefs: [],
          relatedContext: JSON.stringify({ relatedTemplates: [] }),
          sentTemplateNameCount: 0,
          stableContext: JSON.stringify({ workspaceCatalog: { directories: [] } }),
          templateCount: 0,
          templateNamesTruncated: false,
        }),
      } as never,
      {
        start: () => ({
          finish: () => undefined,
          signal: new AbortController().signal,
          throwIfCancelled: () => undefined,
        }),
      } as never,
    )
    try {
      const result = await service.classifyBatch({
        outputLanguage: 'zh-CN',
        requestId: '40000000-0000-4000-8000-000000000204',
        sources,
      })
      expect(result.classifications).toHaveLength(sources.length)
      expect(result.classifications[0]?.classification).toMatchObject({
        primaryTechnique: '',
        variant: null,
        metadata: { timeComplexity: 'O(n)', spaceComplexity: 'O(1)' },
      })
      expect(requests).toHaveLength(1 + Math.ceil(sources.length / BATCH_DETAIL_SIZE))
      expect(
        requests.every(
          request =>
            request.maxOutputTokens <=
            Math.max(BATCH_GLOBAL_FACTS_MAX_OUTPUT_TOKENS, BATCH_DETAIL_MAX_OUTPUT_TOKENS),
        ),
      ).toBe(true)
      expect(
        requests.every(
          request =>
            estimateBatchClassificationResponseBytes(request.maxOutputTokens) <
            AI_RESPONSE_SAFE_ESTIMATE_BYTES,
        ),
      ).toBe(true)
      expect(requests.slice(1).every(request => request.text.includes('globalBatchManifest'))).toBe(
        true,
      )
    } finally {
      await rm(rootPath, { force: true, recursive: true })
    }
  })

  it('locally corrects a review-only graph fallback from the extracted algorithm family', async () => {
    const aiProviderService = {
      getTaskTarget: () => ({
        capabilities: {
          promptCaching: true,
          streaming: false,
          structuredOutput: true,
          vision: false,
        },
        endpointHost: 'fixture.invalid',
        id: '40000000-0000-4000-8000-000000000011',
        model: 'fixture-model',
        protocol: 'openai-chat-completions',
        providerName: 'fixture-provider',
      }),
      runTask: async () => ({
        model: 'fixture-model',
        providerName: 'fixture-provider',
        text: JSON.stringify({
          algorithmFamily: 'Kruskal',
          alternatives: [],
          categoryId: 'graph',
          categoryPath: ['图论', '通用图算法', '图论基础'],
          classificationReason: '按边权排序并借助并查集选边。',
          confidence: 0.92,
          evidence: ['排序边', '并查集'],
          fileName: 'kruskal最小生成树.cpp',
          solves: '求最小生成树。',
          spaceComplexity: 'O(n + m)',
          tags: ['最小生成树', '并查集'],
          timeComplexity: 'O(m log m)',
        }),
      }),
    }
    const workspaceContext = {
      build: async () => ({
        cacheKey: 'workspace:semantic-correction',
        relatedContext: JSON.stringify({ relatedTemplates: [] }),
        stableContext: JSON.stringify({ workspaceCatalog: { directories: [] } }),
      }),
    }
    const run = {
      finish: () => undefined,
      signal: new AbortController().signal,
      throwIfCancelled: () => undefined,
    }
    const service = new TemplateManagementService(
      aiProviderService as never,
      {} as never,
      {
        getActiveWorkspace: () => ({ id: 'workspace-1', rootPath: '/tmp/workspace' }),
        listTemplates: () => [],
      } as never,
      {} as never,
      '/tmp/template-management-service-test',
      workspaceContext as never,
      { start: () => run } as never,
    )

    const result = await service.classify({
      content: 'int kruskal() { return 0; }',
      fileName: 'kruskal最小生成树.cpp',
      metadata: {
        notes: '',
        solves: '',
        spaceComplexity: null,
        tags: [],
        timeComplexity: null,
      },
      outputLanguage: 'zh-CN',
      requestId: '40000000-0000-4000-8000-000000000012',
    })

    expect(result).toMatchObject({
      categoryAlias: '图论/通用图算法/图论基础',
      categoryId: 'graph.mst',
      categoryPath: ['图论', '生成树', '最小生成树'],
      needsReview: true,
      suggestedRelativePath: '图论/生成树/最小生成树/kruskal最小生成树.cpp',
      taxonomyVersion: 2,
    })
    expect(result.evidence).toContain(
      'Main 根据阶段 A 的已知算法族，将泛化分类收敛到具体 canonical 分类。',
    )
  })

  it('keeps absolute, traversal, and forged directory outputs behind Main path validation', () => {
    expect(normalizeAiDirectoryPath('/private/forged')).toBeNull()
    expect(normalizeAiDirectoryPath('../越界目录')).toBeNull()
    expect(normalizeAiDirectoryPath('合法目录/../越界目录')).toBeNull()
    expect(() => buildClassificationPath(['合法目录', '..'], '模板.cpp')).toThrowError(
      expect.objectContaining({ code: 'AI_INVALID_RESPONSE' }),
    )
    expect(() => buildClassificationPath(['合法目录'], '../模板.cpp')).toThrowError(
      expect.objectContaining({ code: 'AI_INVALID_RESPONSE' }),
    )
  })
})
