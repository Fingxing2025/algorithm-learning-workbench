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

      expect(issues).toHaveLength(2)
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
            commonMistakes: '',
            confidence: 0.96,
            constraints: '',
            fileName: 'new-template.cpp',
            placement: {
              existingParentPath: '罕见分类/正确目录',
              mode: 'existing-directory',
              newDirectories: [],
              reason: '复用完整目录中的现有位置。',
              targetDirectory: '罕见分类/正确目录',
            },
            prerequisites: '',
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
        commonMistakes: '',
        constraints: '',
        notes: '绝对不能进入 AI 请求的用户笔记',
        prerequisites: '',
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
    expect(capturedRequest?.system).toContain('用户草稿中的非空字段是已确认内容，必须原样保留')
    expect(capturedRequest?.text).toContain('用户已填写的用途')
    expect(capturedRequest?.text).not.toContain('绝对不能进入 AI 请求的用户笔记')
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
