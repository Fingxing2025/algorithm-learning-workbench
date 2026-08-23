import { TextDecoder } from 'node:util'

import iconv from 'iconv-lite'

export const templateSourceEncodings = [
  'utf-8',
  'utf-8-bom',
  'utf-16le-bom',
  'utf-16be-bom',
  'gb18030',
  'gbk',
] as const

export type TemplateSourceEncoding = (typeof templateSourceEncodings)[number]

export interface DecodedTemplateSource {
  content: string
  encoding: TemplateSourceEncoding
}

export class TemplateSourceCodecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateSourceCodecError'
  }
}

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe])
const UTF16_BE_BOM = Buffer.from([0xfe, 0xff])

function decodeUtf8Strict(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new TemplateSourceCodecError('源码不是有效的 UTF-8 文本。')
  }
}

function decodeRoundTrip(
  bytes: Buffer,
  encoding: 'gb18030' | 'gbk' | 'utf16-be' | 'utf16-le',
): string {
  const content = iconv.decode(bytes, encoding)
  const encoded = iconv.encode(content, encoding)
  if (!encoded.equals(bytes)) {
    throw new TemplateSourceCodecError('源码字节无法按受支持的中文编码无损解码。')
  }
  return content
}

export function assertTemplateSourceText(content: string): void {
  if (content.includes('\0')) {
    throw new TemplateSourceCodecError('源码包含 NUL 字节，疑似二进制文件。')
  }
  for (const character of content) {
    const code = character.codePointAt(0) ?? 0
    const allowedWhitespace =
      character === '\t' || character === '\n' || character === '\r' || character === '\f'
    if ((!allowedWhitespace && code < 32) || (code >= 0x7f && code <= 0x9f)) {
      throw new TemplateSourceCodecError('源码包含二进制控制字符。')
    }
  }
}

export function decodeTemplateSourceBuffer(buffer: Buffer): DecodedTemplateSource {
  let content: string
  let encoding: TemplateSourceEncoding

  if (buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) {
    content = decodeUtf8Strict(buffer.subarray(UTF8_BOM.length))
    encoding = 'utf-8-bom'
  } else if (buffer.subarray(0, UTF16_LE_BOM.length).equals(UTF16_LE_BOM)) {
    const bytes = buffer.subarray(UTF16_LE_BOM.length)
    if (bytes.length % 2 !== 0) {
      throw new TemplateSourceCodecError('UTF-16LE 源码字节长度无效。')
    }
    content = decodeRoundTrip(bytes, 'utf16-le')
    encoding = 'utf-16le-bom'
  } else if (buffer.subarray(0, UTF16_BE_BOM.length).equals(UTF16_BE_BOM)) {
    const bytes = buffer.subarray(UTF16_BE_BOM.length)
    if (bytes.length % 2 !== 0) {
      throw new TemplateSourceCodecError('UTF-16BE 源码字节长度无效。')
    }
    content = decodeRoundTrip(bytes, 'utf16-be')
    encoding = 'utf-16be-bom'
  } else {
    try {
      content = decodeUtf8Strict(buffer)
      encoding = 'utf-8'
    } catch {
      try {
        content = decodeRoundTrip(buffer, 'gb18030')
        encoding = 'gb18030'
      } catch {
        content = decodeRoundTrip(buffer, 'gbk')
        encoding = 'gbk'
      }
    }
  }

  assertTemplateSourceText(content)
  return { content, encoding }
}

export function encodeTemplateSource(content: string, encoding: TemplateSourceEncoding): Buffer {
  assertTemplateSourceText(content)
  let encoded: Buffer
  switch (encoding) {
    case 'utf-8':
      encoded = Buffer.from(content, 'utf8')
      break
    case 'utf-8-bom':
      encoded = Buffer.concat([UTF8_BOM, Buffer.from(content, 'utf8')])
      break
    case 'utf-16le-bom':
      encoded = Buffer.concat([UTF16_LE_BOM, iconv.encode(content, 'utf16-le')])
      break
    case 'utf-16be-bom':
      encoded = Buffer.concat([UTF16_BE_BOM, iconv.encode(content, 'utf16-be')])
      break
    case 'gb18030':
      encoded = iconv.encode(content, 'gb18030')
      break
    case 'gbk':
      encoded = iconv.encode(content, 'gbk')
      break
  }

  const decoded =
    encoding === 'gbk'
      ? { content: decodeRoundTrip(encoded, 'gbk'), encoding }
      : decodeTemplateSourceBuffer(encoded)
  if (decoded.content !== content || (encoding !== 'gbk' && decoded.encoding !== encoding)) {
    throw new TemplateSourceCodecError('修改后的源码无法按原编码无损保存。')
  }
  return encoded
}
