import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Problem } from '@core/contracts/problem'
import type { TemplateSummary } from '@core/contracts/workspace'

import { TemplateProblemRelationDialog } from './template-problem-relation-dialog'

const template: TemplateSummary = {
  extension: '.cpp',
  fileName: 'dijkstra.cpp',
  id: 'a'.repeat(64),
  language: 'C++',
  modifiedAt: '2026-07-15T00:00:00.000Z',
  name: 'Dijkstra',
  relativePath: '图论/最短路/dijkstra.cpp',
  sizeBytes: 128,
}

function problem(id: string, title: string, related = false): Problem {
  return {
    aiSummary: '',
    analysis: {
      algorithmSignals: [],
      constraints: [],
      edgeCases: [],
      examples: [],
      inputDescription: '',
      outputDescription: '',
    },
    createdAt: '2026-07-15T00:00:00.000Z',
    difficulty: null,
    id,
    images: [],
    notes: '',
    platform: null,
    problemCode: null,
    relations: related
      ? [
          {
            available: true,
            createdAt: '2026-07-15T00:00:00.000Z',
            language: 'C++',
            note: '',
            relationType: 'used',
            source: 'manual',
            templateId: template.id,
            templateName: template.name,
            templatePath: template.relativePath,
            updatedAt: '2026-07-15T00:00:00.000Z',
          },
        ]
      : [],
    statement: '',
    status: 'unattempted',
    tags: [],
    title,
    updatedAt: '2026-07-15T00:00:00.000Z',
    url: null,
  }
}

describe('TemplateProblemRelationDialog', () => {
  it('offers only unassociated problems and saves the selected relation from the template card', () => {
    const onSave = vi.fn(async () => true)
    const onOpenChange = vi.fn()
    render(
      <TemplateProblemRelationDialog
        error={null}
        isBusy={false}
        onOpenChange={onOpenChange}
        onSave={onSave}
        open
        problems={[
          problem('11111111-1111-4111-8111-111111111111', '已关联题目', true),
          problem('22222222-2222-4222-8222-222222222222', '待关联题目'),
        ]}
        template={template}
      />,
    )

    expect(screen.getByRole('option', { name: '待关联题目' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '已关联题目' })).toBeNull()
    fireEvent.change(screen.getByLabelText('关系类型'), { target: { value: 'recommended' } })
    fireEvent.change(screen.getByLabelText('关联备注'), { target: { value: '优先练习' } })
    fireEvent.submit(screen.getByRole('button', { name: '保存关联' }).closest('form')!)

    expect(onSave).toHaveBeenCalledWith({
      note: '优先练习',
      problemId: '22222222-2222-4222-8222-222222222222',
      relationType: 'recommended',
      templateId: template.id,
    })
  })
})
