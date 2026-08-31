import { describe, expect, it } from 'vitest'

import {
  renderTemplateExportDoc,
  renderTemplateExportDocument,
  renderTemplateExportHtml,
} from './template-export-renderer'

const template = (id: string, relativePath: string, name: string) => ({
  extension: '.cpp',
  fileName: relativePath.split('/').at(-1) ?? name,
  id,
  language: 'C++',
  modifiedAt: '2026-01-01T00:00:00.000Z',
  name,
  relativePath,
  sizeBytes: 10,
})

describe('template export renderer', () => {
  it('sorts categories and templates deterministically and includes only base metadata', () => {
    const output = renderTemplateExportDocument(
      [
        {
          metadata: {
            commonMistakes: 'secret note',
            constraints: 'n <= 10',
            notes: 'must not leak',
            prerequisites: '',
            solves: '区间查询',
            spaceComplexity: 'O(n)',
            tags: ['树状数组'],
            templateId: 'a'.repeat(64),
            timeComplexity: 'O(log n)',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          source: '#include <bits/stdc++.h>\nint main() {}',
          template: template('a'.repeat(64), '树状数组/main.cpp', '树状数组 #1'),
        },
        {
          metadata: null,
          source: 'int x = 1; # $ % & _ { }',
          template: template('b'.repeat(64), '基础/other.cpp', '基础模板'),
        },
      ],
      true,
    )
    expect(output.indexOf('基础模板')).toBeLessThan(output.indexOf('树状数组 \\#1'))
    expect(output).toContain('解决的问题')
    expect(output).toContain('输入输出格式')
    expect(output).not.toContain('must not leak')
    expect(output).toContain('\\#')
    expect(output).toContain('\\begin{Verbatim}')
  })

  it('supports code-only exports and protects verbatim terminators', () => {
    const output = renderTemplateExportDocument(
      [
        {
          source: '\\end{Verbatim}\n中文',
          template: template('c'.repeat(64), 'x.cpp', '特殊 # 名称'),
        },
      ],
      false,
    )
    expect(output).not.toContain('解决的问题')
    expect(output).toContain('\\textbackslash{}end\\{Verbatim\\}')
  })

  it('renders safe built-in PDF and Word source documents without leaking notes', () => {
    const documents = [
      {
        metadata: {
          commonMistakes: '',
          constraints: '',
          notes: 'private note',
          prerequisites: '',
          solves: 'A & B',
          spaceComplexity: 'O(1)',
          tags: ['标签'],
          templateId: 'd'.repeat(64),
          timeComplexity: 'O(n)',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        source: '<script> & 中文',
        template: template('d'.repeat(64), '字符串/a.cpp', '中文模板'),
      },
    ]
    const html = renderTemplateExportHtml(documents, true)
    const doc = renderTemplateExportDoc(documents, true)
    expect(html).toContain('目录')
    expect(html).toContain('hljs-')
    expect(html).toContain('&lt;script&gt; &amp; 中文')
    expect(html).not.toContain('private note')
    expect(doc).toContain('\\u20013?')
    expect(doc).not.toContain('private note')
  })
})
