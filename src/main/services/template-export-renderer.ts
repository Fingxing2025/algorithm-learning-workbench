import type { TemplateMetadata } from '@core/contracts/template-management'
import type { TemplateSummary } from '@core/contracts/workspace'
import hljs from 'highlight.js/lib/common'

export interface TemplateExportDocument {
  metadata?: TemplateMetadata | null
  source: string
  template: TemplateSummary
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

export function escapeLatexText(value: string): string {
  const escaped: string[] = []
  for (const character of value.replace(/\r\n|\r/gu, '\n')) {
    const replacement: Record<string, string> = {
      '#': '\\#',
      $: '\\$',
      '%': '\\%',
      '&': '\\&',
      _: '\\_',
      '{': '\\{',
      '}': '\\}',
      '^': '\\textasciicircum{}',
      '~': '\\textasciitilde{}',
      '\\': '\\textbackslash{}',
    }
    escaped.push(replacement[character] ?? character)
  }
  return escaped.join('')
}

function escapeVerbatimSource(source: string): string {
  const normalized = source.replace(/\r\n|\r/gu, '\n')
  return normalized.replace(
    /\\end\{Verbatim\}/gu,
    '\\end{Verbatim}\\textbackslash{}end\\{Verbatim\\}\\begin{Verbatim}',
  )
}

function categoryFor(template: TemplateSummary): string {
  const parts = template.relativePath.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join(' / ') : '未分类'
}

export function orderTemplateExportDocuments(
  documents: TemplateExportDocument[],
): TemplateExportDocument[] {
  return [...documents].sort((left, right) => {
    const categoryOrder = compareText(categoryFor(left.template), categoryFor(right.template))
    if (categoryOrder !== 0) return categoryOrder
    const pathOrder = compareText(left.template.relativePath, right.template.relativePath)
    return pathOrder !== 0 ? pathOrder : left.template.id.localeCompare(right.template.id)
  })
}

export function templateExportCategory(template: TemplateSummary): string {
  return categoryFor(template)
}

function metadataEntries(metadata: TemplateMetadata | null | undefined): Array<[string, string]> {
  if (!metadata) return []
  const tags = metadata.tags.length > 0 ? metadata.tags.join('、') : '未记录'
  return [
    ['解决的问题', metadata.solves || '未记录'],
    ['时间复杂度', metadata.timeComplexity || '未记录'],
    ['空间复杂度', metadata.spaceComplexity || '未记录'],
    ['输入输出格式', '未记录'],
    ['标签', tags],
  ]
}

function compactMetadataEntries(
  metadata: TemplateMetadata | null | undefined,
): Array<[string, string]> {
  return metadataEntries(metadata).filter(([, value]) => value !== '未记录' && value.trim() !== '')
}

function metadataLines(metadata: TemplateMetadata | null | undefined): string[] {
  return metadataEntries(metadata).map(
    ([label, value]) => `\\textbf{${label}}：${escapeLatexText(value)}`,
  )
}

export function renderTemplateExportDocument(
  documents: TemplateExportDocument[],
  includeMetadata: boolean,
): string {
  const ordered = orderTemplateExportDocuments(documents)
  const lines = [
    '% Algorithm Learning Workbench template export',
    '% Stable export: generated from the current workspace selection.',
    '\\documentclass[UTF8,a4paper,10pt]{ctexart}',
    '\\usepackage{geometry}',
    '\\usepackage{fancyvrb}',
    '\\usepackage{xcolor}',
    '\\geometry{margin=2cm}',
    '\\setlength{\\parindent}{0pt}',
    '\\setlength{\\parskip}{0pt}',
    '\\setcounter{tocdepth}{2}',
    '\\begin{document}',
    '\\tableofcontents',
    '\\clearpage',
  ]
  let currentCategory = ''
  for (const document of ordered) {
    const category = categoryFor(document.template)
    if (category !== currentCategory) {
      currentCategory = category
      lines.push(`\\section{${escapeLatexText(category)}}`)
    }
    lines.push(`\\subsection{${escapeLatexText(document.template.name)}}`)
    if (includeMetadata) lines.push(...metadataLines(document.metadata), '\\medskip')
    lines.push('\\begin{Verbatim}[fontsize=\\scriptsize,breaklines=true]')
    lines.push(escapeVerbatimSource(document.source))
    lines.push('\\end{Verbatim}', '\\smallskip')
  }
  lines.push('\\end{document}', '')
  return lines.join('\n')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      "'": '&#39;',
      '"': '&quot;',
      '<': '&lt;',
      '>': '&gt;',
    }
    return replacements[character] ?? character
  })
}

function highlightLanguage(language: string): string {
  const normalized = language.toLowerCase()
  if (normalized.includes('python')) return 'python'
  if (normalized.includes('java')) return 'java'
  if (
    normalized.includes('javascript') ||
    normalized === 'js' ||
    normalized.includes('typescript')
  ) {
    return 'javascript'
  }
  if (normalized.includes('rust')) return 'rust'
  if (normalized.includes('go')) return 'go'
  return 'cpp'
}

function highlightSource(source: string, language: string): string {
  try {
    return hljs.highlight(source, { language: highlightLanguage(language), ignoreIllegals: true })
      .value
  } catch {
    return escapeHtml(source)
  }
}

export function renderTemplateExportHtml(
  documents: TemplateExportDocument[],
  includeMetadata: boolean,
): string {
  const ordered = orderTemplateExportDocuments(documents)
  const toc: string[] = []
  let tocCategory = ''
  for (const [index, document] of ordered.entries()) {
    const category = templateExportCategory(document.template)
    if (category !== tocCategory) {
      tocCategory = category
      toc.push(`<li class="toc-category">${escapeHtml(category)}</li>`)
    }
    toc.push(`<li><span>${index + 1}. ${escapeHtml(document.template.name)}</span></li>`)
  }
  const sections: string[] = []
  let currentCategory = ''
  for (const document of ordered) {
    const category = templateExportCategory(document.template)
    if (category !== currentCategory) {
      currentCategory = category
      sections.push(`<h1 class="category">${escapeHtml(category)}</h1>`)
    }
    const metadata =
      includeMetadata && compactMetadataEntries(document.metadata).length > 0
        ? `<dl>${compactMetadataEntries(document.metadata)
            .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
            .join('')}</dl>`
        : ''
    sections.push(
      `<article><h2>${escapeHtml(document.template.name)}</h2>` +
        metadata +
        `<pre class="language-${escapeHtml(highlightLanguage(document.template.language))}"><code>${highlightSource(document.source, document.template.language)}</code></pre></article>`,
    )
  }
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>算法模板册</title><style>
@page{size:A4;margin:12mm 12mm}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#17191c;font-size:9pt;line-height:1.28;margin:0}.toc{height:calc(100vh - 24mm);page-break-after:always}.toc h1{font-size:16pt;margin:0 0 4mm;border-bottom:1px solid #aeb4bd;padding-bottom:2mm}.toc-list{columns:2;column-gap:10mm;margin:0;padding:0;list-style:none;font-size:8pt;line-height:1.3}.toc-list li{break-inside:avoid;margin:0 0 1mm}.toc-list .toc-category{font-size:9pt;font-weight:700;color:#1d4ed8;margin-top:2mm}.category{font-size:13pt;border-bottom:1px solid #c7ccd4;padding-bottom:1.5mm;margin:0 0 3mm;page-break-after:avoid}h2{font-size:10.5pt;margin:0 0 1.5mm;line-height:1.2}article{break-inside:avoid;margin:0 0 4mm}dl{display:grid;grid-template-columns:max-content 1fr;gap:.5mm 2.5mm;margin:0 0 2mm;font-size:7.5pt;line-height:1.2}dt{font-weight:700}dd{margin:0;white-space:pre-wrap}pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:7.1pt;line-height:1.17;white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8fa;border:1px solid #d5d9df;border-radius:1.2mm;padding:2mm;margin:0;color:#24292f}pre code{font-family:inherit}.hljs-comment,.hljs-quote{color:#6a737d}.hljs-keyword,.hljs-selector-tag,.hljs-built_in{color:#cf222e}.hljs-title,.hljs-title.function_,.hljs-type{color:#8250df}.hljs-string,.hljs-attr,.hljs-literal{color:#0a3069}.hljs-number{color:#0550ae}.hljs-meta{color:#953800}
</style></head><body><section class="toc"><h1>目录</h1><ol class="toc-list">${toc.join('')}</ol></section>${sections.join('')}</body></html>`
}

function escapeRtf(value: string): string {
  let output = ''
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 0x0a) {
      output += '\\line '
    } else if (code === 0x0d) {
      if (value.charCodeAt(index + 1) !== 0x0a) output += '\\line '
    } else if (code === 0x09) {
      output += '\\tab '
    } else if (code === 0x5c) {
      output += '\\\\'
    } else if (code === 0x7b) {
      output += '\\{'
    } else if (code === 0x7d) {
      output += '\\}'
    } else if (code >= 0x20 && code <= 0x7e) {
      output += String.fromCharCode(code)
    } else if (code > 0) {
      const signedCode = code > 0x7fff ? code - 0x10000 : code
      output += `\\u${signedCode}?`
    }
  }
  return output
}

export function renderTemplateExportDoc(
  documents: TemplateExportDocument[],
  includeMetadata: boolean,
): string {
  const lines = [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fnil Consolas;}}\\viewkind4\\uc1',
  ]
  for (const document of orderTemplateExportDocuments(documents)) {
    lines.push(`\\pard\\sa240\\b ${escapeRtf(templateExportCategory(document.template))}\\b0\\par`)
    lines.push(`\\pard\\sa160\\b ${escapeRtf(document.template.name)}\\b0\\par`)
    lines.push(`\\pard\\sa120 ${escapeRtf('文件：')}${escapeRtf(document.template.fileName)}\\par`)
    if (includeMetadata && document.metadata) {
      for (const [label, value] of metadataEntries(document.metadata)) {
        lines.push(`\\pard\\sa80\\b ${escapeRtf(label)}：\\b0 ${escapeRtf(value)}\\par`)
      }
    }
    lines.push(`\\pard\\sa200\\f0\\fs18 ${escapeRtf(document.source)}\\par\\page`)
  }
  lines.push('}')
  return lines.join('\n')
}
