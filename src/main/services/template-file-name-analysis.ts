import { TextDecoder } from 'node:util'

export type TemplateFileNameIssueKind = 'naming-inconsistency' | 'suspected-mojibake'

export interface TemplateFileNameIssue {
  detail: string
  kind: TemplateFileNameIssueKind
}

const namingInconsistencyPattern = /\s|副本|copy(?:\s|\(|_|\d)/i
const knownMojibakePattern = /\uFFFD|锟斤拷|ðŸ|ï»¿|ï¿½/u
const cp1252Bytes = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
])

function looksLikeUtf8DecodedAsLegacyEncoding(value: string): boolean {
  const bytes: number[] = []
  let hasUtf8LeadByte = false
  for (const character of value) {
    const codePoint = character.codePointAt(0)!
    const byte = codePoint <= 0xff ? codePoint : cp1252Bytes.get(codePoint)
    if (byte === undefined) return false
    if (byte >= 0xc2 && byte <= 0xf4) hasUtf8LeadByte = true
    bytes.push(byte)
  }
  if (!hasUtf8LeadByte) return false
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
    return decoded !== value && [...decoded].some(character => character.codePointAt(0)! > 0x7f)
  } catch {
    return false
  }
}

export function analyzeTemplateFileName(fileName: string): TemplateFileNameIssue | null {
  if (knownMojibakePattern.test(fileName) || looksLikeUtf8DecodedAsLegacyEncoding(fileName)) {
    return {
      detail: '文件名疑似包含乱码或错误解码痕迹；AI 文件计划必须提供安全改名，执行前仍需确认。',
      kind: 'suspected-mojibake',
    }
  }
  if (namingInconsistencyPattern.test(fileName)) {
    return {
      detail: '文件名包含副本标记或异常空格；AI 文件计划必须提供安全改名，执行前仍需确认。',
      kind: 'naming-inconsistency',
    }
  }
  return null
}
