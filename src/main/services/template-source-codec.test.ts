// @vitest-environment node

import iconv from 'iconv-lite'
import { describe, expect, it } from 'vitest'

import {
  decodeTemplateSourceBuffer,
  encodeTemplateSource,
  TemplateSourceCodecError,
  type TemplateSourceEncoding,
} from './template-source-codec'

const source = '// 算法模板\nint main() { return 0; }\n'

describe('template source codec', () => {
  it.each<{
    bytes: Buffer
    encoding: TemplateSourceEncoding
  }>([
    { bytes: Buffer.from(source, 'utf8'), encoding: 'utf-8' },
    {
      bytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(source, 'utf8')]),
      encoding: 'utf-8-bom',
    },
    {
      bytes: Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(source, 'utf16-le')]),
      encoding: 'utf-16le-bom',
    },
    {
      bytes: Buffer.concat([Buffer.from([0xfe, 0xff]), iconv.encode(source, 'utf16-be')]),
      encoding: 'utf-16be-bom',
    },
    { bytes: iconv.encode(source, 'gb18030'), encoding: 'gb18030' },
  ])('strictly decodes $encoding Chinese source', ({ bytes, encoding }) => {
    expect(decodeTemplateSourceBuffer(bytes)).toEqual({ content: source, encoding })
  })

  it('decodes common GBK/CP936 Chinese bytes through GB18030 compatibility', () => {
    const bytes = iconv.encode('// 算法模板\n', 'gbk')
    expect(decodeTemplateSourceBuffer(bytes)).toEqual({
      content: '// 算法模板\n',
      encoding: 'gb18030',
    })
  })

  it('preserves CP936-only extension bytes that differ from standard GB18030', () => {
    const bytes = Buffer.from([0x2f, 0x2f, 0x20, 0x80, 0x0a])
    const decoded = decodeTemplateSourceBuffer(bytes)

    expect(decoded).toEqual({ content: '// €\n', encoding: 'gbk' })
    expect(encodeTemplateSource(decoded.content, decoded.encoding)).toEqual(bytes)
  })

  it.each<TemplateSourceEncoding>([
    'utf-8',
    'utf-8-bom',
    'utf-16le-bom',
    'utf-16be-bom',
    'gb18030',
  ])('round-trips edits without changing %s', encoding => {
    const bytes = encodeTemplateSource(source, encoding)
    expect(decodeTemplateSourceBuffer(bytes)).toEqual({ content: source, encoding })
  })

  it('rejects invalid byte sequences, NUL, and binary controls', () => {
    expect(() => decodeTemplateSourceBuffer(Buffer.from([0x81]))).toThrow(TemplateSourceCodecError)
    expect(() => decodeTemplateSourceBuffer(Buffer.from('code\0data'))).toThrow(
      TemplateSourceCodecError,
    )
    expect(() => decodeTemplateSourceBuffer(Buffer.from([0x01, 0x02, 0x03]))).toThrow(
      TemplateSourceCodecError,
    )
  })
})
