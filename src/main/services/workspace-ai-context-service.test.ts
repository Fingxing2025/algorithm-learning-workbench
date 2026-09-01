import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import iconv from 'iconv-lite'

import type { TemplateMetadata } from '@core/contracts/template-management'
import type { TemplateSummary } from '@core/contracts/workspace'

import type { ProblemRepository } from '../database/problem-repository'
import type { TemplateManagementRepository } from '../database/template-management-repository'
import type { WorkspaceRepository } from '../database/workspace-repository'
import { WorkspaceAiContextService } from './workspace-ai-context-service'

const workspaceId = '40000000-0000-4000-8000-000000000012'
const dijkstraId = 'a'.repeat(64)
const flowId = 'b'.repeat(64)
const dsuId = 'c'.repeat(64)

function template(id: string, relativePath: string, name: string): TemplateSummary {
  return {
    extension: '.cpp',
    fileName: relativePath.split('/').at(-1)!,
    id,
    language: 'C++',
    modifiedAt: '2026-07-16T01:00:00.000Z',
    name,
    relativePath,
    sizeBytes: 32,
  }
}

function metadata(templateId: string, solves: string, notes: string): TemplateMetadata {
  return {
    notes,
    solves,
    spaceComplexity: 'O(n + m)',
    tags: ['图论', '最短路'],
    templateId,
    timeComplexity: 'O(m log n)',
    updatedAt: '2026-07-16T02:00:00.000Z',
  }
}

describe('WorkspaceAiContextService', () => {
  let rootPath = ''
  let templates: TemplateSummary[]
  let dijkstraMetadata: TemplateMetadata
  let fallbackMetadata: TemplateMetadata
  let relatedPlatform = '洛谷'

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'workspace-ai-context-'))
    await mkdir(join(rootPath, '图论', '最短路'), { recursive: true })
    await mkdir(join(rootPath, '图论', '网络流'), { recursive: true })
    await mkdir(join(rootPath, '数据结构', '并查集'), { recursive: true })
    await writeFile(join(rootPath, '图论', '最短路', 'dijkstra.cpp'), 'void dijkstra() {}\n')
    await writeFile(join(rootPath, '图论', '网络流', 'dinic.cpp'), 'void dinic() {}\n')
    await writeFile(join(rootPath, '数据结构', '并查集', 'dsu.cpp'), 'struct dsu {};\n')
    templates = [
      template(dijkstraId, '图论/最短路/dijkstra.cpp', 'dijkstra'),
      template(flowId, '图论/网络流/dinic.cpp', 'dinic'),
      template(dsuId, '数据结构/并查集/dsu.cpp', 'dsu'),
    ]
    dijkstraMetadata = metadata(dijkstraId, '单源非负权最短路', '绝对不得发送的用户笔记')
    fallbackMetadata = metadata(flowId, '最大流', '私密笔记')
  })

  afterEach(async () => {
    await rm(rootPath, { force: true, recursive: true })
  })

  function createService() {
    const workspaceRepository = {
      getActiveWorkspace: () => ({ id: workspaceId, name: '测试工作区', rootPath }),
      listTemplates: () => templates,
    } as unknown as WorkspaceRepository
    const metadataRepository = {
      getMetadata: (templateId: string) =>
        templateId === dijkstraId
          ? dijkstraMetadata
          : templateId === dsuId
            ? {
                ...metadata(dsuId, '维护连通性与集合合并', '并查集私密笔记'),
                prerequisites: '树结构',
                tags: ['数据结构', '并查集'],
              }
            : fallbackMetadata,
      listMetadataMap: (templateIds: readonly string[]) =>
        new Map(
          templateIds.map(templateId => [
            templateId,
            templateId === dijkstraId
              ? dijkstraMetadata
              : templateId === dsuId
                ? {
                    ...metadata(dsuId, '维护连通性与集合合并', '并查集私密笔记'),
                    prerequisites: '树结构',
                    tags: ['数据结构', '并查集'],
                  }
                : fallbackMetadata,
          ]),
        ),
    } as unknown as TemplateManagementRepository
    const problemRepository = {
      listTemplateUsage: () =>
        new Map([[dijkstraId, { platforms: [relatedPlatform], problemCount: 1 }]]),
      listProblems: () => [
        {
          platform: relatedPlatform,
          relations: [{ templateId: dijkstraId }],
        },
      ],
    } as unknown as ProblemRepository
    return new WorkspaceAiContextService(workspaceRepository, metadataRepository, problemRepository)
  }

  async function build() {
    return createService().build({
      model: 'fixture-model',
      outputLanguage: 'zh-CN',
      promptSchemaVersion: 'problem-analysis-v2',
      providerId: 'fixture-provider',
      query: '求单源最短路',
      task: 'problem-image-analysis',
    })
  }

  it('builds a valid taxonomy snapshot and excludes user notes', async () => {
    const context = await build()
    const stable = JSON.parse(context.stableContext) as {
      workspaceCatalog: {
        directories: Array<{ children: unknown[]; relativePath: string }>
        workspaceContextVersion: string
      }
    }
    const related = JSON.parse(context.relatedContext) as {
      relatedTemplates: Array<{
        metadata: Record<string, unknown>
        relationSummary: { platforms: string[]; problemCount: number }
        sourceSnippet: string
      }>
    }

    const directoryPaths = stable.workspaceCatalog.directories.flatMap(directory => [
      directory.relativePath,
      ...directory.children.flatMap(child =>
        typeof child === 'object' && child !== null && 'relativePath' in child
          ? [(child as { relativePath: string }).relativePath]
          : [],
      ),
    ])
    expect(directoryPaths).toEqual([
      '图论',
      '图论/最短路',
      '图论/网络流',
      '数据结构',
      '数据结构/并查集',
    ])
    expect(stable.workspaceCatalog.workspaceContextVersion).toBe(context.version)
    expect(context.stableContext).not.toContain('绝对不得发送的用户笔记')
    expect(context.relatedContext).not.toContain('私密笔记')
    expect(context.stableContext).not.toContain(rootPath)
    expect(context.relatedContext).not.toContain(rootPath)
    expect(related.relatedTemplates[0]?.sourceSnippet).toContain('dijkstra')
    expect(related.relatedTemplates[0]?.relationSummary).toEqual({
      platforms: ['洛谷'],
      problemCount: 1,
    })
    expect(context.cacheKey).toContain(context.version)
    expect(context.catalogTemplateRefs).toHaveLength(3)
    expect(context.sentTemplateNameCount).toBe(3)
    expect(context.templateNamesTruncated).toBe(false)
  })

  it('uses Chinese n-grams and keeps multiple algorithm directions in the candidate pool', async () => {
    const service = createService()
    const context = await service.build({
      model: 'fixture-model',
      outputLanguage: 'zh-CN',
      promptSchemaVersion: 'problem-analysis-v2',
      providerId: 'fixture-provider',
      query: '组合最短路径与并查集合并',
      task: 'problem-image-analysis',
    })

    expect(context.relatedTemplateRefs.map(template => template.id)).toEqual(
      expect.arrayContaining([dijkstraId, dsuId]),
    )
    expect(new Set(context.relatedTemplateRefs.map(template => template.id)).size).toBe(
      context.relatedTemplateRefs.length,
    )
  })

  it('sends decoded Windows GBK source snippets without replacement characters', async () => {
    await writeFile(
      join(rootPath, '图论', '最短路', 'dijkstra.cpp'),
      iconv.encode('// 中文最短路模板\nvoid dijkstra() {}\n', 'gbk'),
    )

    const context = await build()

    expect(context.relatedContext).toContain('中文最短路模板')
    expect(context.relatedContext).not.toContain('�')
  })

  it('keeps every indexed available template eligible when an optional source snippet is unreadable', async () => {
    await unlink(join(rootPath, '数据结构', '并查集', 'dsu.cpp'))
    const context = await createService().build({
      model: 'fixture-model',
      outputLanguage: 'zh-CN',
      promptSchemaVersion: 'problem-analysis-v2',
      providerId: 'fixture-provider',
      query: '并查集合并',
      task: 'problem-image-analysis',
    })

    expect(context.catalogTemplateRefs.some(template => template.id === dsuId)).toBe(true)
    expect(context.relatedTemplateRefs.some(template => template.id === dsuId)).toBe(true)
    expect(context.relatedContext).toContain(dsuId)
    expect(context.relatedSourceTemplateCount).toBeLessThan(context.relatedTemplateCount)
  })

  it('keeps all 500 template IDs, names, and relative paths visible beyond the detailed 24', async () => {
    templates = Array.from({ length: 500 }, (_, index) => {
      const suffix = String(index + 1).padStart(3, '0')
      return template(
        (index + 1).toString(16).padStart(64, '0'),
        `分类-${String(Math.floor(index / 25) + 1).padStart(2, '0')}/模板-${suffix}.cpp`,
        `完整目录模板-${suffix}`,
      )
    })

    const context = await createService().build({
      model: 'fixture-model',
      outputLanguage: 'zh-CN',
      promptSchemaVersion: 'problem-analysis-v3',
      providerId: 'fixture-provider',
      query: '',
      task: 'problem-image-analysis',
    })
    const last = templates.at(-1)!

    expect(context.templateCount).toBe(500)
    expect(context.sentTemplateNameCount).toBe(500)
    expect(context.catalogTemplateRefs).toHaveLength(500)
    expect(context.catalogTemplateRefs.at(-1)).toMatchObject({
      id: last.id,
      name: last.name,
      path: last.relativePath,
    })
    expect(context.relatedTemplateCount).toBeLessThanOrEqual(24)
    expect(context.relatedTemplateRefs.some(item => item.id === last.id)).toBe(false)
    expect(context.stableContext).toContain(last.id)
    expect(context.stableContext).toContain(last.name)
    expect(context.stableContext).toContain('分类-20')
    expect(context.stableContext).toContain(last.relativePath)
    expect(context.templateNamesTruncated).toBe(false)
  })

  it('drops optional metadata before names when the estimated input budget is tight', async () => {
    templates = Array.from({ length: 300 }, (_, index) => {
      const suffix = String(index + 1).padStart(3, '0')
      return template(
        (index + 1).toString(16).padStart(64, '0'),
        `预算分类-${String(Math.floor(index / 30) + 1).padStart(2, '0')}/模板-${suffix}.cpp`,
        `预算模板-${suffix}`,
      )
    })
    fallbackMetadata = {
      ...fallbackMetadata,
      solves: '能力摘要'.repeat(2_000),
      tags: Array.from({ length: 20 }, (_, index) => `超长标签-${index}-${'标'.repeat(30)}`),
    }

    const context = await createService().build({
      model: 'fixture-model',
      outputLanguage: 'en',
      promptSchemaVersion: 'template-placement-v3',
      providerId: 'fixture-provider',
      query: 'budget fixture',
      reservedInputTokens: 70_000,
      task: 'template-metadata',
    })

    expect(context.summaryShortened).toBe(true)
    expect(context.supplementalMetadataOmitted).toBe(true)
    expect(context.sentTemplateNameCount).toBe(300)
    expect(context.catalogTemplateRefs).toHaveLength(300)
    expect(context.templateNamesTruncated).toBe(false)
    expect(context.stableContext).toContain('预算模板-300')
    expect(context.estimatedInputTokens).toBeLessThanOrEqual(26_000)
  })

  it('accepts 301 short templates without a product-level count limit', async () => {
    templates = Array.from({ length: 301 }, (_, index) =>
      template(
        (index + 1).toString(16).padStart(64, '0'),
        `超限/模板-${String(index + 1).padStart(3, '0')}.cpp`,
        `超限模板-${String(index + 1).padStart(3, '0')}`,
      ),
    )

    const context = await build()

    expect(context.templateCount).toBe(301)
    expect(context.sentTemplateNameCount).toBe(301)
    expect(context.catalogTemplateRefs).toHaveLength(301)
    expect(context.templateNamesTruncated).toBe(false)
    expect(context.stableContext).toContain('超限模板-301')
    expect(context.stableContext).toContain('超限/模板-301.cpp')
  })

  it('uses the complete catalog for workspace file plans instead of representative names', async () => {
    templates = Array.from({ length: 301 }, (_, index) =>
      template(
        (index + 1).toString(16).padStart(64, '0'),
        `文件计划/模板-${String(index + 1).padStart(3, '0')}.cpp`,
        `文件计划模板-${String(index + 1).padStart(3, '0')}`,
      ),
    )

    const context = await createService().build({
      model: 'fixture-model',
      outputLanguage: 'zh-CN',
      promptSchemaVersion: 'workspace-plan-v2',
      providerId: 'fixture-provider',
      query: '检查文件计划',
      task: 'workspace-management',
    })

    expect(context.templateCount).toBe(301)
    expect(context.sentTemplateNameCount).toBe(301)
    expect(context.catalogTemplateRefs).toHaveLength(301)
    expect(context.relatedTemplateCount).toBeLessThanOrEqual(24)
    expect(context.stableContext).toContain('workspaceCatalog')
    expect(context.stableContext).toContain('文件计划模板-301')
    expect(context.stableContext).toContain('文件计划/模板-301.cpp')
    expect(context.templateNamesTruncated).toBe(false)
  })

  it('honors a task-specific context budget while retaining the complete minimal catalog', async () => {
    templates = Array.from({ length: 301 }, (_, index) =>
      template(
        (index + 1).toString(16).padStart(64, '0'),
        `预算文件计划/模板-${String(index + 1).padStart(3, '0')}.cpp`,
        `预算文件计划模板-${String(index + 1).padStart(3, '0')}`,
      ),
    )

    const context = await createService().build({
      maxEstimatedInputTokens: 20_000,
      model: 'fixture-model',
      outputLanguage: 'zh-CN',
      promptSchemaVersion: 'workspace-plan-v4-batched',
      providerId: 'fixture-provider',
      query: '检查文件计划',
      task: 'workspace-management',
    })

    expect(context.estimatedInputTokens).toBeLessThanOrEqual(20_000)
    expect(context.sentTemplateNameCount).toBe(301)
    expect(context.stableContext).toContain('预算文件计划模板-301')
  })

  it('rejects a task budget that cannot contain the complete minimal catalog', async () => {
    await expect(
      createService().build({
        maxEstimatedInputTokens: 100,
        model: 'fixture-model',
        outputLanguage: 'zh-CN',
        promptSchemaVersion: 'workspace-plan-v4-batched',
        providerId: 'fixture-provider',
        query: '检查文件计划',
        task: 'workspace-management',
      }),
    ).rejects.toMatchObject({ code: 'AI_CONTEXT_TOO_LARGE' })
  })

  it('is deterministic and invalidates the version for metadata or relation changes', async () => {
    const first = await build()
    templates.reverse()
    const reordered = await build()
    expect(reordered.version).toBe(first.version)
    expect(reordered.stableContext).toBe(first.stableContext)

    const english = await createService().build({
      model: 'fixture-model',
      outputLanguage: 'en',
      promptSchemaVersion: 'problem-analysis-v2',
      providerId: 'fixture-provider',
      query: '求单源最短路',
      task: 'problem-image-analysis',
    })
    expect(english.version).toBe(first.version)
    expect(english.stableContext).toBe(first.stableContext)

    dijkstraMetadata = {
      ...dijkstraMetadata,
      notes: '更新后仍不参与 AI 上下文的私密笔记',
      updatedAt: '2026-07-23T01:00:00.000Z',
    }
    const notesChanged = await build()
    expect(notesChanged.version).toBe(first.version)
    expect(notesChanged.stableContext).toBe(first.stableContext)

    dijkstraMetadata = { ...dijkstraMetadata, solves: '单源最短路与最短路计数' }
    const metadataChanged = await build()
    expect(metadataChanged.version).not.toBe(first.version)

    relatedPlatform = 'Codeforces'
    const relationChanged = await build()
    expect(relationChanged.version).not.toBe(metadataChanged.version)

    templates[0] = {
      ...templates[0]!,
      fileName: 'dijkstra-renamed.cpp',
      relativePath: '图论/最短路/dijkstra-renamed.cpp',
    }
    const pathChanged = await build()
    expect(pathChanged.version).not.toBe(relationChanged.version)

    templates = templates.filter(template => template.id !== flowId)
    const availabilityChanged = await build()
    expect(availabilityChanged.version).not.toBe(pathChanged.version)
  })
})
