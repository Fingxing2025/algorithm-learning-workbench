import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Problem } from '@core/contracts/problem'
import type { TemplatePage, TemplateSummary } from '@core/contracts/workspace'

import { ProblemWorkspace } from './problem-workspace'

const problemId = '11111111-1111-4111-8111-111111111111'
const templateId = 'a'.repeat(64)

const template: TemplateSummary = {
  extension: '.cpp',
  fileName: 'dijkstra.cpp',
  id: templateId,
  language: 'C++',
  modifiedAt: '2026-07-19T00:00:00.000Z',
  name: 'Dijkstra',
  relativePath: '图论/最短路/dijkstra.cpp',
  sizeBytes: 120,
}

const problem: Problem = {
  aiSummary: '使用 Dijkstra 处理非负边权最短路。',
  analysis: {
    algorithmSignals: ['最短路'],
    constraints: ['n <= 100000'],
    edgeCases: [],
    examples: [],
    inputDescription: '输入图。',
    outputDescription: '输出距离。',
  },
  createdAt: '2026-07-19T00:00:00.000Z',
  difficulty: '提高',
  id: problemId,
  images: [],
  notes: '注意 long long。',
  platform: '洛谷',
  problemCode: 'P4779',
  relations: [
    {
      available: true,
      createdAt: '2026-07-19T00:00:00.000Z',
      language: 'C++',
      note: '主解法',
      relationType: 'used',
      source: 'manual',
      templateId,
      templateName: template.name,
      templatePath: template.relativePath,
      updatedAt: '2026-07-19T00:00:00.000Z',
    },
  ],
  statement: '给定一张非负边权图，求单源最短路。',
  status: 'attempted',
  tags: ['图论', '最短路'],
  title: '单源最短路径',
  updatedAt: '2026-07-19T00:00:00.000Z',
  url: 'https://example.com/problem',
}

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof ProblemWorkspace>> = {}) {
  const onAddImages = vi.fn().mockResolvedValue(problem)
  const onDelete = vi.fn().mockResolvedValue(true)
  const onOpenTemplate = vi.fn()
  const onRemoveImage = vi.fn().mockResolvedValue(problem)
  const onRemoveRelation = vi.fn().mockResolvedValue(problem)
  const onSearch = vi.fn().mockResolvedValue([problem])

  const templates: TemplateSummary[] = [template]
  const templatePage: TemplatePage = {
    items: templates,
    nextAction: null,
    nextCursor: null,
    processedCount: 1,
    totalCount: 1,
    truncated: false,
    truncatedReason: null,
  }

  render(
    <ProblemWorkspace
      error={null}
      hasMore={false}
      isBusy={false}
      isLoading={false}
      isLoadingMore={false}
      matchedCount={1}
      onAddImages={onAddImages}
      onAnalysisCreated={vi.fn()}
      onClearError={vi.fn()}
      onDelete={onDelete}
      onLoadMore={vi.fn().mockResolvedValue(null)}
      onOpenTemplate={onOpenTemplate}
      onRemoveImage={onRemoveImage}
      onRemoveRelation={onRemoveRelation}
      onSearch={onSearch}
      onSearchTemplates={vi.fn().mockResolvedValue(templatePage)}
      onSelect={vi.fn()}
      onUpdate={vi.fn().mockResolvedValue(problem)}
      onUpsertRelation={vi.fn().mockResolvedValue(problem)}
      problems={[problem]}
      selectedProblemId={problem.id}
      templateTotalCount={1}
      templates={templates}
      totalCount={1}
      {...overrides}
    />,
  )

  return { onAddImages, onDelete, onOpenTemplate, onRemoveRelation }
}

describe('ProblemWorkspace detail actions', () => {
  it('opens an available template and removes a relation only after confirmation', async () => {
    const callbacks = renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: /^Dijkstra实际使用/ }))
    expect(callbacks.onOpenTemplate).toHaveBeenCalledWith(templateId)

    fireEvent.click(screen.getByRole('button', { name: '解除与模板的关联 Dijkstra' }))
    fireEvent.click(screen.getByRole('button', { name: '确认解除' }))

    await waitFor(() =>
      expect(callbacks.onRemoveRelation).toHaveBeenCalledWith({
        problemId,
        templateId,
      }),
    )
  })

  it('delegates adding images for the selected problem', async () => {
    const callbacks = renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: '添加图片' }))

    await waitFor(() => expect(callbacks.onAddImages).toHaveBeenCalledWith(problemId))
  })

  it('requires confirmation before deleting the selected problem', async () => {
    const callbacks = renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: `删除题目 ${problem.title}` }))
    expect(callbacks.onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(callbacks.onDelete).toHaveBeenCalledWith(problemId))
  })
})
