import type { TemplateSourceEncoding } from '@core/contracts/workspace'

const labels: Record<TemplateSourceEncoding, string> = {
  gb18030: 'GB18030 / GBK / CP936',
  gbk: 'GBK / CP936',
  'utf-16be-bom': 'UTF-16 BE BOM',
  'utf-16le-bom': 'UTF-16 LE BOM',
  'utf-8': 'UTF-8',
  'utf-8-bom': 'UTF-8 BOM',
}

export function formatTemplateSourceEncoding(encoding: TemplateSourceEncoding): string {
  return labels[encoding]
}
