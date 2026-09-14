import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { templateClassificationSchema } from '@core/contracts/template-management'
import { BatchTemplateImportDialog } from './batch-template-import-dialog'

vi.mock('@/components/ai-request-preview-dialog', () => ({
  AiRequestPreviewDialog: ({ onConfirm }: { onConfirm: () => void }) => (
    <button onClick={onConfirm}>发送测试请求</button>
  ),
}))

const sources = [1, 2].map(n => ({
  id: `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  content: `int f${n}() { return ${n}; }`,
  fileName: `${n}.cpp`,
  displayPath: `${n}.cpp`,
  sourceEncoding: 'utf-8',
}))
const classification = (n: number) =>
  templateClassificationSchema.parse({
    algorithmFamily: 'unknown',
    alternatives: [],
    categoryId: 'basic',
    categoryPath: ['基础算法', '通用技巧', '算法基础'],
    classificationReason: '缺证据待审',
    confidence: 0.9,
    metadata: { solves: '', notes: '', tags: [], timeComplexity: null, spaceComplexity: null },
    model: 'mock',
    providerName: 'mock',
    needsReview: true,
    reviewReasons: ['missing-source-evidence'],
    suggestedRelativePath: `草稿/${n}.cpp`,
    placement: {
      mode: 'create-category-chain',
      existingParentPath: '',
      newDirectories: ['草稿'],
      targetDirectory: '草稿',
      reason: '测试',
    },
  })

it('requires review, preserves locked results across AI reruns, and unlocks on path edits', async () => {
  const classifyBatch = vi
    .fn()
    .mockImplementation(async ({ sources: selected }: { sources: typeof sources }) => ({
      classifications: selected.map(source => ({
        sourceId: source.id,
        classification: classification(Number(source.fileName[0])),
      })),
    }))
  const previewBatchClassification = vi.fn().mockResolvedValue({})
  window.desktop = {
    templateManagement: {
      chooseBatchImportFiles: vi.fn().mockResolvedValue(sources),
      previewBatchClassification,
      classifyBatch,
      cancelClassification: vi.fn(),
    },
  } as never
  render(<BatchTemplateImportDialog open onComplete={vi.fn()} onOpenChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '选择多个 C++ 文件' }))
  await screen.findByLabelText('工作区保存路径 1.cpp')
  fireEvent.click(screen.getByRole('button', { name: 'AI 补全所选模板' }))
  fireEvent.click(await screen.findByRole('button', { name: '发送测试请求', hidden: true }))
  await screen.findAllByRole('button', { name: '确认此分类' })
  expect(screen.getByRole('button', { name: '确认导入 2 份' })).toBeDisabled()
  fireEvent.click(screen.getAllByRole('button', { name: '确认此分类' })[0]!)
  fireEvent.click(screen.getByRole('button', { name: '重新生成所选元数据' }))
  fireEvent.click(await screen.findByRole('button', { name: '发送测试请求', hidden: true }))
  await waitFor(() => expect(classifyBatch).toHaveBeenCalledTimes(2))
  expect(
    classifyBatch.mock.calls[1]?.[0].sources.map((source: { id: string }) => source.id),
  ).toEqual([sources[1]!.id])
  expect(screen.getByRole('button', { name: '已锁定，点击解锁' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  fireEvent.click(await screen.findByRole('button', { name: '确认此分类' }))
  expect(screen.getByRole('button', { name: '重新生成所选元数据' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '确认导入 2 份' })).toBeEnabled()
  fireEvent.change(screen.getByLabelText('工作区保存路径 1.cpp'), {
    target: { value: '人工/1.cpp' },
  })
  expect(screen.getByRole('button', { name: '确认导入 2 份' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '重新生成所选元数据' })).toBeEnabled()
})

describe('late classification responses', () => {
  it('cancels on close and does not carry a late result into the next draft', async () => {
    let resolveRequest!: (value: unknown) => void
    const cancelClassification = vi.fn()
    window.desktop = {
      templateManagement: {
        chooseBatchImportFiles: vi.fn().mockResolvedValue(sources),
        previewBatchClassification: vi.fn().mockResolvedValue({}),
        classifyBatch: vi.fn().mockImplementation(
          () =>
            new Promise(resolve => {
              resolveRequest = resolve
            }),
        ),
        cancelClassification,
      },
    } as never
    const view = render(
      <BatchTemplateImportDialog open onComplete={vi.fn()} onOpenChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '选择多个 C++ 文件' }))
    await screen.findByLabelText('工作区保存路径 1.cpp')
    fireEvent.click(screen.getByRole('button', { name: 'AI 补全所选模板' }))
    fireEvent.click(await screen.findByRole('button', { name: '发送测试请求', hidden: true }))
    view.rerender(
      <BatchTemplateImportDialog open={false} onComplete={vi.fn()} onOpenChange={vi.fn()} />,
    )
    expect(cancelClassification).toHaveBeenCalledOnce()
    resolveRequest({
      classifications: [{ sourceId: sources[0]!.id, classification: classification(1) }],
    })
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '确认此分类' })).not.toBeInTheDocument(),
    )
    view.rerender(<BatchTemplateImportDialog open onComplete={vi.fn()} onOpenChange={vi.fn()} />)
    expect(screen.queryByLabelText('工作区保存路径 1.cpp')).not.toBeInTheDocument()
  })
})
