import { describe, expect, it } from 'vitest'

import { normalizeFilePlanEnvelope, parseAiJson } from './ai-response-json'

describe('AI JSON response parsing', () => {
  it('accepts fenced JSON and surrounding explanation', () => {
    expect(parseAiJson('处理结果如下：\n```json\n{"operations":[]}\n```\n请审查。')).toEqual({
      operations: [],
    })
  })

  it('extracts balanced JSON without treating braces inside strings as structure', () => {
    expect(parseAiJson('prefix {"reason":"保留 { 符号","operations":[]} suffix')).toEqual({
      operations: [],
      reason: '保留 { 符号',
    })
  })

  it('normalizes common plan envelopes', () => {
    expect(normalizeFilePlanEnvelope([{ kind: 'delete' }])).toEqual({
      operations: [{ kind: 'delete' }],
    })
    expect(normalizeFilePlanEnvelope({ data: { operations: [] } })).toEqual({ operations: [] })
  })

  it('rejects truncated JSON', () => {
    expect(() => parseAiJson('{"operations": [')).toThrow(SyntaxError)
  })
})
