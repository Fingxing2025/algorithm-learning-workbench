import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

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
