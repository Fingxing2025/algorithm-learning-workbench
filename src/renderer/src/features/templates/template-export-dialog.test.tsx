import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { TemplateSummary } from '@core/contracts/workspace'

import { TemplateExportDialog } from './template-export-dialog'

const templates: TemplateSummary[] = [
  {
    extension: '.cpp',
    fileName: 'a.cpp',
    id: 'a'.repeat(64),
    language: 'C++',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    name: '模板 A',
    relativePath: '图论/a.cpp',
    sizeBytes: 10,
  },
  {
    extension: '.cpp',
    fileName: 'b.cpp',
    id: 'b'.repeat(64),
    language: 'C++',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    name: '模板 B',
    relativePath: '树/b.cpp',
    sizeBytes: 10,
  },
]

describe('TemplateExportDialog', () => {
  it('selects a category and sends only typed export options', async () => {
    const exportTemplates = vi.fn().mockResolvedValue({
      compileMessage: '已生成 LaTeX 文档。',
      docFileName: null,
      docStatus: 'not-requested',
      generatedFileCount: 2,
      pdfFileName: null,
      pdfStatus: 'not-requested',
      resourceDirectoryName: '算法模板册-resources',
      templateCount: 1,
      texBytes: 100,
      texFileName: '算法模板册.tex',
    })
    window.desktop = {
      templates: { export: exportTemplates, cancelExport: vi.fn() },
    } as unknown as typeof window.desktop
    render(
      <TemplateExportDialog
        onOpenChange={vi.fn()}
        open
        returnFocusTo={null}
        templates={templates}
      />,
    )

    const categoryButton = screen.getByText('图论').parentElement?.querySelector('button')
    expect(categoryButton).not.toBeNull()
    fireEvent.click(categoryButton!)
    fireEvent.click(screen.getByRole('button', { name: '选择位置并导出' }))
    await waitFor(() => expect(exportTemplates).toHaveBeenCalled())
    expect(exportTemplates.mock.calls[0]?.[0]).toMatchObject({
      compilePdf: false,
      generateDoc: false,
      includeMetadata: false,
      templateIds: ['a'.repeat(64)],
    })
    expect(screen.getByRole('status')).toHaveTextContent('算法模板册.tex')
  })
})
