import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ApplyBatchTemplateStagingResult } from '@core/contracts/template-management'
import type {
  BatchTemplateImportSource,
  BatchTemplateStaging,
} from '@core/contracts/template-management'
import type { WorkspaceSnapshot } from '@core/contracts/workspace'

import { BatchTemplateImportDialog } from './batch-template-import-dialog'

const workspace: WorkspaceSnapshot = {
  available: true,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: '测试工作区',
  rootPath: '/tmp/staging-test',
  scannedAt: '2026-09-03T00:00:00.000Z',
  summary: {
    caseConflictCount: 0,
    issues: [],
    skippedSymlinkCount: 0,
    templateCount: 1,
    truncated: false,
    unsupportedFileCount: 0,
  },
  templatePage: {
    nextAction: null,
    nextCursor: null,
    processedCount: 1,
    totalCount: 1,
    truncated: false,
    truncatedReason: null,
  },
  templates: [],
}

const source: BatchTemplateImportSource = {
  content: 'int main() { return 0; }\n',
  displayPath: '来源/main.cpp',
  fileName: 'main.cpp',
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  sourceEncoding: 'utf-8',
}

function staging(status: BatchTemplateStaging['status']): BatchTemplateStaging {
  return {
    baseTreeHash: 'c'.repeat(64),
    baseWorkspaceVersion: 'd'.repeat(64),
    canResume: status !== 'applied' && status !== 'discarded',
    createdAt: '2026-09-03T00:00:00.000Z',
    currentItem: status === 'processing' ? source.displayPath : null,
    error: status === 'failed' ? '暂存失败，请重试。' : null,
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    items: [
      {
        classification:
          status === 'ready'
            ? {
                alternatives: [],
                categoryPath: ['测试', '示例'],
                classificationReason: '测试分类',
                confidence: 0.9,
                diagnostic: {
                  outputTokenBudgets: [256],
                  providerCallCount: 1,
                  stageTimings: [],
                  totalElapsedMs: 2,
                },
                metadata: {
                  notes: '',
                  solves: '',
                  spaceComplexity: null,
                  tags: [],
                  timeComplexity: null,
                },
                model: 'fixture-model',
                placement: {
                  existingParentPath: '',
                  mode: 'create-category-chain',
                  newDirectories: ['测试', '示例'],
                  reason: '测试',
                  targetDirectory: '测试/示例',
                },
                providerName: 'Fixture Provider',
                suggestedRelativePath: '测试/示例/main.cpp',
              }
            : null,
        displayPath: source.displayPath,
        error: status === 'failed' ? '暂存失败，请重试。' : null,
        fileName: source.fileName,
        ordinal: 0,
        sourceEncoding: source.sourceEncoding,
        sourceId: source.id,
        status: status === 'ready' ? 'completed' : status === 'failed' ? 'failed' : 'pending',
        targetRelativePath: status === 'ready' ? '测试/示例/main.cpp' : null,
      },
    ],
    outputLanguage: 'zh-CN',
    processedCount: status === 'ready' ? 1 : 0,
    status,
    totalCount: 1,
    updatedAt: '2026-09-03T00:00:00.000Z',
    version: 1,
    workspaceId: workspace.id,
  }
}

const classificationPreview = {
  capabilities: {
    promptCaching: false,
    streaming: false,
    structuredOutput: true,
    vision: false,
  },
  cache: { eligible: false, key: 'fixture', workspaceContextVersion: 'v1' },
  endpointHost: 'api.example.test',
  estimatedInputTokens: 12,
  items: [],
  model: 'fixture-model',
  outputLanguage: 'zh-CN' as const,
  protocol: 'openai-responses' as const,
  providerName: 'Fixture Provider',
  task: 'template-metadata' as const,
  truncated: false,
  workspaceCatalog: {
    directoryCount: 0,
    estimatedInputTokens: 0,
    relatedSourceCharacters: 0,
    relatedSourceTemplateCount: 0,
    schemaVersion: 1 as const,
    sentTemplateNameCount: 0,
    sourceSnippetsOmitted: false,
    summarizedTemplateCount: 0,
    summaryShortened: false,
    supplementalMetadataOmitted: false,
    templateCount: 0,
    templateNamesTruncated: false,
  },
}

function installDesktop(
  overrides: Record<string, unknown> = {},
  backgroundTasks?: { get: ReturnType<typeof vi.fn> },
) {
  const api = {
    applyBatchStaging: vi.fn().mockResolvedValue({
      applied: true,
      stagingId: staging('ready').id,
      workspace,
    } satisfies ApplyBatchTemplateStagingResult),
    cancelClassification: vi.fn().mockResolvedValue(undefined),
    chooseBatchImportFiles: vi.fn().mockResolvedValue([source]),
    continueBatchStaging: vi.fn().mockResolvedValue(staging('ready')),
    createBatchStaging: vi.fn().mockResolvedValue(staging('processing')),
    discardBatchStaging: vi.fn().mockResolvedValue(undefined),
    getBatchStaging: vi.fn().mockImplementation(async () => staging('ready')),
    listBatchStagings: vi.fn().mockResolvedValue([]),
    previewBatchClassification: vi.fn().mockResolvedValue(classificationPreview),
    previewBatchStagingClassification: vi.fn().mockResolvedValue(classificationPreview),
    retryBatchStaging: vi.fn().mockResolvedValue(staging('ready')),
    updateBatchStagingItem: vi.fn().mockImplementation(async () => staging('processing')),
    ...overrides,
  }
  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: { backgroundTasks, templateManagement: api },
  })
  return api
}

describe('BatchTemplateImportDialog staging flow', () => {
  it('closes without discarding a resumable staging session', async () => {
    const api = installDesktop()
    const onOpenChange = vi.fn()
    render(<BatchTemplateImportDialog onComplete={vi.fn()} onOpenChange={onOpenChange} open />)

    await waitFor(() => expect(api.listBatchStagings).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '选择多个 C++ 文件' }))
    await waitFor(() => expect(api.createBatchStaging).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '关闭批量导入' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(api.discardBatchStaging).not.toHaveBeenCalled()
  })

  it('creates staging, persists a path edit, prepares it without AI, and applies only after ready', async () => {
    const api = installDesktop()
    const onOpenChange = vi.fn()
    const onStagingApplied = vi.fn()
    render(
      <BatchTemplateImportDialog
        onComplete={vi.fn()}
        onOpenChange={onOpenChange}
        onStagingApplied={onStagingApplied}
        open
      />,
    )

    await waitFor(() => expect(api.listBatchStagings).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '选择多个 C++ 文件' }))
    await waitFor(() => expect(api.createBatchStaging).toHaveBeenCalled())

    const target = await screen.findByLabelText('工作区保存路径 来源/main.cpp')
    fireEvent.change(target, { target: { value: '测试/手动/main.cpp' } })
    fireEvent.blur(target)
    await waitFor(() =>
      expect(api.updateBatchStagingItem).toHaveBeenCalledWith({
        action: 'include',
        sourceId: source.id,
        stagingId: staging('processing').id,
        targetRelativePath: '测试/手动/main.cpp',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '准备暂存 1 份' }))
    await waitFor(() =>
      expect(api.continueBatchStaging).toHaveBeenCalledWith(
        expect.objectContaining({ runAi: false, stagingId: staging('processing').id }),
      ),
    )
    fireEvent.click(await screen.findByRole('button', { name: '确认应用 1 份' }))
    await waitFor(() =>
      expect(api.applyBatchStaging).toHaveBeenCalledWith({
        confirmed: true,
        stagingId: staging('processing').id,
      }),
    )
    expect(onStagingApplied).toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('shows the AI request preview first and continues the staging session only after confirmation', async () => {
    const api = installDesktop()
    render(<BatchTemplateImportDialog onComplete={vi.fn()} onOpenChange={vi.fn()} open />)

    await waitFor(() => expect(api.listBatchStagings).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '选择多个 C++ 文件' }))
    await waitFor(() => expect(api.createBatchStaging).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'AI 补全所选模板' }))
    expect(await screen.findByRole('heading', { name: '确认发送给 AI' })).toBeTruthy()
    expect(api.previewBatchStagingClassification).toHaveBeenCalledWith(
      expect.objectContaining({ stagingId: staging('processing').id }),
    )
    expect(api.previewBatchClassification).not.toHaveBeenCalled()
    expect(api.continueBatchStaging).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认发送并生成' }))
    await waitFor(() =>
      expect(api.continueBatchStaging).toHaveBeenCalledWith(
        expect.objectContaining({ runAi: true, stagingId: staging('processing').id }),
      ),
    )
    expect(api.updateBatchStagingItem).not.toHaveBeenCalled()
  })

  it('polls tracked staging progress instead of leaving the AI counter at zero', async () => {
    const ready = staging('ready')
    let operationFinished = false
    const continueBatchStaging = vi.fn(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 300))
      operationFinished = true
      return ready
    })
    const backgroundTasks = {
      get: vi.fn().mockImplementation(async ({ taskId }: { taskId: string }) => ({
        error: null,
        finishedAt: null,
        id: taskId,
        kind: 'batch-operation',
        progress: {
          currentItem: source.displayPath,
          phase: 'processing',
          processedCount: 1,
          totalCount: 1,
        },
        result: null,
        startedAt: '2026-09-03T00:00:00.000Z',
        state: 'running',
      })),
    }
    const api = installDesktop({ continueBatchStaging }, backgroundTasks)
    render(<BatchTemplateImportDialog onComplete={vi.fn()} onOpenChange={vi.fn()} open />)

    await waitFor(() => expect(api.listBatchStagings).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '选择多个 C++ 文件' }))
    await waitFor(() => expect(api.createBatchStaging).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'AI 补全所选模板' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认发送并生成' }))

    expect(await screen.findByTestId(`batch-item-progress-${source.id}`)).toHaveTextContent(
      '处理中 1/1',
    )
    expect(await screen.findByText('正在补全 1/1')).toBeTruthy()
    expect(await screen.findByText('测试 / 示例')).toBeTruthy()
    expect(api.getBatchStaging).toHaveBeenCalledWith({ stagingId: ready.id })
    expect(operationFinished).toBe(false)
    await waitFor(() => expect(continueBatchStaging).toHaveBeenCalled())
  })

  it('labels a manually prepared item as unclassified instead of classified', async () => {
    const manual = staging('ready')
    manual.items[0] = { ...manual.items[0]!, classification: null }
    const api = installDesktop({
      getBatchStaging: vi.fn().mockResolvedValue(manual),
      listBatchStagings: vi.fn().mockResolvedValue([manual]),
    })
    render(<BatchTemplateImportDialog onComplete={vi.fn()} onOpenChange={vi.fn()} open />)

    fireEvent.click(await screen.findByRole('button', { name: '恢复批次' }))
    await waitFor(() => expect(api.getBatchStaging).toHaveBeenCalled())
    expect(screen.getByText('暂存项：已准备（未分类）')).toBeTruthy()
  })

  it('loads a recoverable session and discards it without touching the legacy import callback', async () => {
    const saved = staging('failed')
    const api = installDesktop({
      listBatchStagings: vi.fn().mockResolvedValue([saved]),
      getBatchStaging: vi.fn().mockResolvedValue(saved),
    })
    const onComplete = vi.fn()
    render(<BatchTemplateImportDialog onComplete={onComplete} onOpenChange={vi.fn()} open />)

    expect(await screen.findByText('发现可恢复的暂存批次')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '恢复批次' }))
    await waitFor(() => expect(api.getBatchStaging).toHaveBeenCalledWith({ stagingId: saved.id }))
    fireEvent.click(await screen.findByRole('button', { name: '放弃暂存' }))
    await waitFor(() =>
      expect(api.discardBatchStaging).toHaveBeenCalledWith({
        confirmed: true,
        stagingId: saved.id,
      }),
    )
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('falls back to the legacy atomic import API when the preload has no staging methods', async () => {
    const importTemplatesBatch = vi.fn().mockResolvedValue({
      imported: [
        {
          relativePath: source.displayPath,
          sourceId: source.id,
          templateId: 'f'.repeat(64),
        },
      ],
      workspace,
    })
    const api = installDesktop({
      applyBatchStaging: undefined,
      continueBatchStaging: undefined,
      createBatchStaging: undefined,
      discardBatchStaging: undefined,
      importTemplatesBatch,
      inspectBatchImport: vi.fn().mockResolvedValue({ conflicts: [] }),
      listBatchStagings: undefined,
      updateBatchStagingItem: undefined,
    })
    const onComplete = vi.fn()
    render(<BatchTemplateImportDialog onComplete={onComplete} onOpenChange={vi.fn()} open />)

    fireEvent.click(screen.getByRole('button', { name: '选择多个 C++ 文件' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '确认导入 1 份' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '确认导入 1 份' }))
    await waitFor(() => expect(importTemplatesBatch).toHaveBeenCalled())
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ workspace }))
    expect(api.createBatchStaging).toBeUndefined()
  })
})
