import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { PreviewTemplateAiPlanRequest } from '@core/contracts/template-management'

import { PublicError } from '../errors/public-error'
import {
  TemplateStagingAuditService,
  type TemplateStagingAuditItem,
  type TemplateStagingAuditSession,
} from './template-staging-audit-service'

const workspaceId = '50000000-0000-4000-8000-000000000001'
const stagingId = '50000000-0000-4000-8000-000000000002'
const sourceOne = '50000000-0000-4000-8000-000000000003'
const sourceTwo = '50000000-0000-4000-8000-000000000004'
const requestId = '50000000-0000-4000-8000-000000000005'

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function createSession(version = 2): TemplateStagingAuditSession {
  return {
    baseTreeHash: hash('main-tree'),
    baseWorkspaceVersion: hash('main-version'),
    createdAt: '2026-09-03T00:00:00.000Z',
    currentIndex: 1,
    error: null,
    id: stagingId,
    outputLanguage: 'zh-CN',
    processedCount: 2,
    stagingVersion: version,
    status: 'ready',
    totalCount: 2,
    updatedAt: '2026-09-03T00:00:01.000Z',
    workspaceId,
  }
}

function createItem(
  sourceId: string,
  sourceRelativePath: string,
  displayPath: string,
  targetRelativePath: string | null = null,
  sourceHash: string | null = null,
): TemplateStagingAuditItem {
  return {
    classificationJson: null,
    displayPath,
    error: null,
    fileName: displayPath.split('/').at(-1) ?? displayPath,
    ordinal: sourceId === sourceOne ? 0 : 1,
    sourceEncoding: 'utf-8',
    sourceHash,
    sourceId,
    sourceRelativePath,
    stagingId,
    status: 'completed',
    targetRelativePath,
    updatedAt: '2026-09-03T00:00:01.000Z',
  }
}

function createFixture() {
  let session = createSession()
  const items = [
    createItem(sourceOne, 'incoming/one.cpp', 'one.cpp', '字符串/one.cpp'),
    createItem(sourceTwo, 'incoming/two.cpp', 'two.cpp', '字符串/two.cpp'),
  ]
  const getSession = vi.fn(() => session)
  const listItems = vi.fn(() => items)
  const runTask = vi.fn(async (_task: string, request: { text: string; system?: string }) => {
    const payload = JSON.parse(request.text) as { templates: Array<{ id: string }> }
    return {
      model: 'fixture-model',
      providerName: 'Fixture Provider',
      text: JSON.stringify({
        operations: [
          {
            alternatives: ['保留原路径'],
            applicability: ['暂存分类建议'],
            confidence: 0.9,
            evidence: ['分类目录一致'],
            kind: 'move',
            reason: '统一暂存目录',
            risk: 'low',
            targetPath: '字符串/renamed.cpp',
            templateId: payload.templates[0]?.id,
          },
        ],
        summary: '已生成暂存审查建议',
      }),
    }
  })
  const provider = {
    getTaskTarget: () => ({
      capabilities: {
        promptCaching: true,
        streaming: false,
        structuredOutput: true,
        vision: false,
      },
      endpointHost: 'fixture.invalid',
      id: '50000000-0000-4000-8000-000000000006',
      model: 'fixture-model',
      protocol: 'openai-chat-completions' as const,
      providerName: 'Fixture Provider',
    }),
    runTask,
  }
  const service = new TemplateStagingAuditService({
    aiProviderService: provider,
    resolveTemplateRoot: () => fixtureRoot,
    stagingReader: { getSession, listItems },
    workspaceReader: { getActiveWorkspace: () => ({ id: workspaceId }) },
  })
  let fixtureRoot = ''
  return {
    getSession,
    items,
    listItems,
    provider,
    runTask,
    service,
    setRoot: (root: string) => {
      fixtureRoot = root
    },
    setVersion: (version: number) => {
      session = createSession(version)
    },
  }
}

const baseRequest = (): PreviewTemplateAiPlanRequest => ({
  includeNotes: false,
  outputLanguage: 'zh-CN',
  requestId,
  stagingId,
  target: 'staging',
})

describe('TemplateStagingAuditService', () => {
  it('builds a read-only staging catalog and diff without exposing the root path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'awb-staging-audit-'))
    await mkdir(join(root, 'incoming'), { recursive: true })
    const fixture = createFixture()
    await writeFile(join(root, 'incoming', 'one.cpp'), 'int one() { return 1; }\n')
    await writeFile(join(root, 'incoming', 'two.cpp'), 'int two() { return 2; }\n')
    fixture.setRoot(root)

    const preview = await fixture.service.preview(baseRequest())

    expect(preview.target).toBe('staging')
    expect(preview.staging).toMatchObject({ id: stagingId, version: 2 })
    expect(preview.workspaceCatalog.templateCount).toBe(2)
    expect(preview.stagingCatalog.templates.map(template => template.path)).toEqual([
      '字符串/one.cpp',
      '字符串/two.cpp',
    ])
    expect(preview.diff.every(change => change.requiresConfirmation)).toBe(true)
    expect(preview.diff.some(change => change.kind === 'move')).toBe(true)
    expect(JSON.stringify(preview)).not.toContain(root)
    expect(fixture.runTask).not.toHaveBeenCalled()
  })

  it('generates an in-memory staging draft and never mutates source files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'awb-staging-draft-'))
    await mkdir(join(root, 'incoming'), { recursive: true })
    await writeFile(join(root, 'incoming', 'one.cpp'), 'int one() { return 1; }\n')
    await writeFile(join(root, 'incoming', 'two.cpp'), 'int two() { return 2; }\n')
    const fixture = createFixture()
    fixture.setRoot(root)
    const preview = await fixture.service.preview(baseRequest())
    const before = await readFile(join(root, 'incoming', 'one.cpp'), 'utf8')

    const draft = await fixture.service.generate({
      previewId: preview.filePlan.previewId,
      requestId,
    })

    expect(draft).toMatchObject({
      reviewOnly: true,
      stagingId,
      stagingVersion: 2,
      target: 'staging',
      status: 'draft',
    })
    expect(draft.operations[0]).toMatchObject({
      kind: 'move',
      sourceId: sourceOne,
      needsReview: true,
      selectedByDefault: false,
      sourceCoverage: { complete: true },
      reviewReasons: ['missing-source-evidence'],
    })
    expect(await readFile(join(root, 'incoming', 'one.cpp'), 'utf8')).toBe(before)
    expect(fixture.runTask).toHaveBeenCalled()
    expect(fixture.runTask.mock.calls[0]?.[1]?.system).toContain(
      '不要把暂存项当前的 targetPath、目录名或分类结果当成正确答案',
    )
    expect(() => fixture.service.applyDraft(draft.draftId, true)).toThrow(PublicError)
  })

  it.each([
    ['01', 'for (int i=0;i<n;++i) for(int j=W;j>=w[i];--j) dp[j]=max(dp[j],dp[j-w[i]]+v[i]);'],
    [
      'unbounded',
      'for (int i=0;i<n;++i) for(int j=w[i];j<=W;++j) dp[j]=max(dp[j],dp[j-w[i]]+v[i]);',
    ],
    [
      'bounded',
      'for (int i=0;i<n;++i) for(int j=W;j>=0;--j) for(int k=1;k<=c[i] && k*w[i]<=j;++k) dp[j]=max(dp[j],dp[j-k*w[i]]+k*v[i]);',
    ],
    ['misleading-name', 'int gcd(int a,int b){return b?gcd(b,a%b):a;}'],
  ])(
    'does not infer a subtype from a folder or invent moves for %s source',
    async (_variant, content) => {
      const root = await mkdtemp(join(tmpdir(), 'awb-staging-backpack-'))
      await mkdir(join(root, 'incoming'), { recursive: true })
      await writeFile(join(root, 'incoming', 'one.cpp'), content)
      await writeFile(join(root, 'incoming', 'two.cpp'), 'int unrelated() {return 42;}')
      const fixture = createFixture()
      fixture.items.splice(
        0,
        fixture.items.length,
        createItem(sourceOne, 'incoming/one.cpp', '背包问题/多重背包.cpp', '背包问题/多重背包.cpp'),
        createItem(
          sourceTwo,
          'incoming/two.cpp',
          '动态规划/01背包/示例.cpp',
          '动态规划/01背包/示例.cpp',
        ),
      )
      fixture.runTask.mockImplementation(async () => ({
        model: 'fixture-model',
        providerName: 'Fixture Provider',
        text: JSON.stringify({ operations: [], summary: '需要人工复核' }),
      }))
      fixture.setRoot(root)
      const preview = await fixture.service.preview(baseRequest())
      expect(preview.audit.issues.filter(issue => issue.kind === 'path-inconsistency')).toEqual([])
      const draft = await fixture.service.generate({
        previewId: preview.filePlan.previewId,
        requestId,
      })
      expect(draft.operations).toEqual([])
      expect(await readFile(join(root, 'incoming', 'one.cpp'), 'utf8')).toBe(content)
    },
  )

  it('rejects main-target requests and invalidates a preview when staging changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'awb-staging-version-'))
    await mkdir(join(root, 'incoming'), { recursive: true })
    await writeFile(join(root, 'incoming', 'one.cpp'), 'int one() { return 1; }\n')
    await writeFile(join(root, 'incoming', 'two.cpp'), 'int two() { return 2; }\n')
    const fixture = createFixture()
    fixture.setRoot(root)

    await expect(
      fixture.service.preview({ ...baseRequest(), target: 'main', stagingId: null }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    const preview = await fixture.service.preview(baseRequest())
    fixture.setVersion(3)
    await expect(
      fixture.service.generate({ previewId: preview.filePlan.previewId }),
    ).rejects.toMatchObject({
      code: 'FILE_UNAVAILABLE',
    })
    expect(fixture.runTask).not.toHaveBeenCalled()
  })

  it('rejects a staging source whose persisted hash no longer matches the bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'awb-staging-hash-'))
    await mkdir(join(root, 'incoming'), { recursive: true })
    await writeFile(join(root, 'incoming', 'one.cpp'), 'int one() { return 999; }\n')
    await writeFile(join(root, 'incoming', 'two.cpp'), 'int two() { return 2; }\n')
    const fixture = createFixture()
    fixture.items[0]!.sourceHash = hash('int one() { return 1; }\n')
    fixture.setRoot(root)

    await expect(fixture.service.preview(baseRequest())).rejects.toMatchObject({
      code: 'FILE_UNAVAILABLE',
    })
    expect(fixture.runTask).not.toHaveBeenCalled()
  })

  it.skipIf(process.platform === 'win32')(
    'fails closed when a staging source resolves through a symbolic link',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'awb-staging-link-'))
      const outside = await mkdtemp(join(tmpdir(), 'awb-staging-outside-'))
      await mkdir(join(root, 'incoming'), { recursive: true })
      await writeFile(join(outside, 'one.cpp'), 'int outside() { return 1; }\n')
      await symlink(join(outside, 'one.cpp'), join(root, 'incoming', 'one.cpp'))
      await writeFile(join(root, 'incoming', 'two.cpp'), 'int two() { return 2; }\n')
      const fixture = createFixture()
      fixture.items[0]!.sourceHash = hash('int outside() { return 1; }\n')
      fixture.setRoot(root)

      await expect(fixture.service.preview(baseRequest())).rejects.toMatchObject({
        code: 'PATH_NOT_AUTHORIZED',
      })
      expect(fixture.runTask).not.toHaveBeenCalled()
    },
  )
})
