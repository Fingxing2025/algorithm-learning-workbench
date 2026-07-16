import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { TemplateMetadata } from '@core/contracts/template-management'
import type { TemplateSummary } from '@core/contracts/workspace'

import type { ProblemRepository } from '../database/problem-repository'
import type { TemplateManagementRepository } from '../database/template-management-repository'
import type { WorkspaceRepository } from '../database/workspace-repository'
import { WorkspaceAiContextService } from './workspace-ai-context-service'

const workspaceId = '40000000-0000-4000-8000-000000000012'
const dijkstraId = 'a'.repeat(64)
const flowId = 'b'.repeat(64)

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
    commonMistakes: '检查过期状态',
    constraints: '边权非负',
    notes,
    prerequisites: '优先队列',
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
  let relatedPlatform = '洛谷'

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'workspace-ai-context-'))
    await mkdir(join(rootPath, '图论', '最短路'), { recursive: true })
    await mkdir(join(rootPath, '图论', '网络流'), { recursive: true })
    await writeFile(join(rootPath, '图论', '最短路', 'dijkstra.cpp'), 'void dijkstra() {}\n')
    await writeFile(join(rootPath, '图论', '网络流', 'dinic.cpp'), 'void dinic() {}\n')
    templates = [
      template(dijkstraId, '图论/最短路/dijkstra.cpp', 'dijkstra'),
      template(flowId, '图论/网络流/dinic.cpp', 'dinic'),
    ]
    dijkstraMetadata = metadata(dijkstraId, '单源非负权最短路', '绝对不得发送的用户笔记')
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
        templateId === dijkstraId ? dijkstraMetadata : metadata(flowId, '最大流', '私密笔记'),
    } as unknown as TemplateManagementRepository
    const problemRepository = {
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
      directories: Array<{ path: string }>
      workspaceContextVersion: string
    }
    const related = JSON.parse(context.relatedContext) as {
      relatedTemplates: Array<{
        metadata: Record<string, unknown>
        relationSummary: { platforms: string[]; problemCount: number }
        sourceSnippet: string
      }>
    }

    expect(stable.directories.map(directory => directory.path)).toEqual([
      '图论',
      '图论/最短路',
      '图论/网络流',
    ])
    expect(stable.workspaceContextVersion).toBe(context.version)
    expect(context.stableContext).not.toContain('绝对不得发送的用户笔记')
    expect(context.relatedContext).not.toContain('私密笔记')
    expect(related.relatedTemplates[0]?.sourceSnippet).toContain('dijkstra')
    expect(related.relatedTemplates[0]?.relationSummary).toEqual({
      platforms: ['洛谷'],
      problemCount: 1,
    })
    expect(context.cacheKey).toContain(context.version)
  })

  it('is deterministic and invalidates the version for metadata or relation changes', async () => {
    const first = await build()
    templates.reverse()
    const reordered = await build()
    expect(reordered.version).toBe(first.version)
    expect(reordered.stableContext).toBe(first.stableContext)

    dijkstraMetadata = { ...dijkstraMetadata, solves: '单源最短路与最短路计数' }
    const metadataChanged = await build()
    expect(metadataChanged.version).not.toBe(first.version)

    relatedPlatform = 'Codeforces'
    const relationChanged = await build()
    expect(relationChanged.version).not.toBe(metadataChanged.version)
  })
})
