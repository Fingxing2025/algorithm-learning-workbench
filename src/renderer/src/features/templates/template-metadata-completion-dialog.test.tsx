import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { TemplateSummary } from '@core/contracts/workspace'

import { TemplateMetadataCompletionDialog } from './template-metadata-completion-dialog'

const template: TemplateSummary = {
  extension: '.cpp',
  fileName: 'dijkstra.cpp',
  id: 'a'.repeat(64),
  language: 'C++',
  modifiedAt: '2026-07-24T00:00:00.000Z',
  name: 'Dijkstra',
  relativePath: '图论/最短路/dijkstra.cpp',
  sizeBytes: 128,
}

const emptyMetadata = {
  commonMistakes: '',
  constraints: '',
  notes: '用户笔记',
  prerequisites: '',
  solves: '',
  spaceComplexity: null,
  tags: [],
  timeComplexity: null,
}

function templateAt(index: number): TemplateSummary {
  return {
    ...template,
    fileName: `template-${index}.cpp`,
    id: index.toString(16).padStart(64, '0'),
    name: `template-${index}`,
    relativePath: `批量/template-${index}.cpp`,
  }
}

function preview(templateCount: number) {
  return {
    capabilities: {
      promptCaching: false,
      streaming: true,
      structuredOutput: false,
      vision: false,
    },
    cache: { eligible: false, key: 'fixture-cache', workspaceContextVersion: 'context-v1' },
    endpointHost: 'api.example.test',
    estimatedInputTokens: 1200,
    expiresAt: '2026-07-24T00:05:00.000Z',
    items: [],
    model: 'fixture-model',
    outputLanguage: 'zh-CN' as const,
    previewId: '10000000-0000-4000-8000-000000000001',
    protocol: 'openai-responses' as const,
    providerName: 'Fixture Provider',
    task: 'template-metadata' as const,
    templateCount,
    truncated: false,
  }
}

function page(items: TemplateSummary[]) {
  return {
    items,
    nextAction: null,
    nextCursor: null,
    processedCount: items.length,
    totalCount: items.length,
    truncated: false,
    truncatedReason: null,
  }
}

describe('TemplateMetadataCompletionDialog', () => {
  it('previews, generates and applies only the checked AI fields for one existing template', async () => {
    const previewExistingMetadataCompletion = vi.fn().mockResolvedValue(preview(1))
    const generateExistingMetadataCompletion = vi.fn().mockResolvedValue({
      draftId: '20000000-0000-4000-8000-000000000002',
      expiresAt: '2026-07-24T00:10:00.000Z',
      items: [
        {
          changedFields: ['solves', 'tags'],
          previousMetadata: emptyMetadata,
          proposedMetadata: {
            ...emptyMetadata,
            solves: '解决非负权最短路',
            tags: ['图论', '最短路'],
          },
          template,
        },
      ],
      model: 'fixture-model',
      outputLanguage: 'zh-CN',
      providerName: 'Fixture Provider',
    })
    const applyExistingMetadataCompletion = vi.fn().mockResolvedValue({
      metadata: [
        {
          ...emptyMetadata,
          solves: '解决非负权最短路',
          templateId: template.id,
          updatedAt: '2026-07-24T00:01:00.000Z',
        },
      ],
      updatedFieldCount: 1,
      updatedTemplateCount: 1,
    })
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {
        templateManagement: {
          applyExistingMetadataCompletion,
          cancelClassification: vi.fn(),
          generateExistingMetadataCompletion,
          previewExistingMetadataCompletion,
        },
      },
    })
    const onApplied = vi.fn()
    render(
      <TemplateMetadataCompletionDialog
        initialTemplate={template}
        onApplied={onApplied}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '预览并补全' }))
    expect(await screen.findByText('确认发送给 AI')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认发送并生成' }))

    expect(await screen.findByText('解决非负权最短路')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Dijkstra 标签'))
    fireEvent.click(screen.getByRole('button', { name: '保存 1 个字段' }))

    await waitFor(() =>
      expect(applyExistingMetadataCompletion).toHaveBeenCalledWith({
        confirmed: true,
        draftId: '20000000-0000-4000-8000-000000000002',
        selections: [{ fields: ['solves'], templateId: template.id }],
      }),
    )
    expect(onApplied).toHaveBeenCalledWith([template.id])
    expect(previewExistingMetadataCompletion).toHaveBeenCalledWith({
      outputLanguage: 'zh-CN',
      templateIds: [template.id],
    })
  })

  it('searches the batch list and enforces the 20-template selection limit', async () => {
    const templates = Array.from({ length: 21 }, (_, index) => templateAt(index + 1))
    const listPage = vi.fn(async ({ query }: { query: string }) =>
      page(
        query
          ? templates.filter(item =>
              item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
            )
          : templates,
      ),
    )
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {
        templateManagement: {
          applyExistingMetadataCompletion: vi.fn(),
          cancelClassification: vi.fn(),
          generateExistingMetadataCompletion: vi.fn(),
          previewExistingMetadataCompletion: vi.fn(),
        },
        templates: { listPage },
      },
    })
    render(
      <TemplateMetadataCompletionDialog
        initialTemplate={null}
        onApplied={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByLabelText('选择模板 template-1')).toBeInTheDocument()
    for (const item of templates.slice(0, 20)) {
      fireEvent.click(screen.getByLabelText(`选择模板 ${item.name}`))
    }
    expect(screen.getByText('已选择 20 份模板')).toBeInTheDocument()
    expect(screen.getByLabelText('选择模板 template-21')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('搜索待补全模板'), {
      target: { value: 'template-21' },
    })
    await waitFor(() =>
      expect(listPage).toHaveBeenLastCalledWith({ cursor: null, limit: 100, query: 'template-21' }),
    )
    expect(screen.getByLabelText('选择模板 template-21')).toBeDisabled()
  })

  it('applies the exact per-template fields selected from a batch draft', async () => {
    const templates = [templateAt(1), templateAt(2)]
    const previewExistingMetadataCompletion = vi.fn().mockResolvedValue(preview(2))
    const generateExistingMetadataCompletion = vi.fn().mockResolvedValue({
      draftId: '20000000-0000-4000-8000-000000000002',
      expiresAt: '2026-07-24T00:10:00.000Z',
      items: templates.map(item => ({
        changedFields: ['solves', 'tags'],
        previousMetadata: emptyMetadata,
        proposedMetadata: {
          ...emptyMetadata,
          solves: `${item.name} 解决的问题`,
          tags: ['批量建议'],
        },
        template: item,
      })),
      model: 'fixture-model',
      outputLanguage: 'zh-CN',
      providerName: 'Fixture Provider',
    })
    const applyExistingMetadataCompletion = vi.fn().mockResolvedValue({
      metadata: templates.map(item => ({
        ...emptyMetadata,
        solves: `${item.name} 解决的问题`,
        templateId: item.id,
        updatedAt: '2026-07-24T00:01:00.000Z',
      })),
      updatedFieldCount: 2,
      updatedTemplateCount: 2,
    })
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {
        templateManagement: {
          applyExistingMetadataCompletion,
          cancelClassification: vi.fn(),
          generateExistingMetadataCompletion,
          previewExistingMetadataCompletion,
        },
        templates: { listPage: vi.fn().mockResolvedValue(page(templates)) },
      },
    })
    render(
      <TemplateMetadataCompletionDialog
        initialTemplate={null}
        onApplied={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    for (const item of templates) {
      fireEvent.click(await screen.findByLabelText(`选择模板 ${item.name}`))
    }
    fireEvent.click(screen.getByRole('button', { name: '预览并补全' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认发送并生成' }))
    expect(await screen.findByText('template-1 解决的问题')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('template-1 标签'))
    fireEvent.click(screen.getByLabelText('template-2 解决的问题'))
    fireEvent.click(screen.getByRole('button', { name: '保存 2 个字段' }))

    await waitFor(() =>
      expect(applyExistingMetadataCompletion).toHaveBeenCalledWith({
        confirmed: true,
        draftId: '20000000-0000-4000-8000-000000000002',
        selections: [
          { fields: ['solves'], templateId: templates[0]!.id },
          { fields: ['tags'], templateId: templates[1]!.id },
        ],
      }),
    )
  })
})
