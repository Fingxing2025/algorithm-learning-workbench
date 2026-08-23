import { describe, expect, it } from 'vitest'

import {
  normalizeFilePlanEnvelope,
  normalizeCommonAiEnvelope,
  normalizeTemplateClassificationEnvelope,
  parseAiJson,
} from './ai-response-json'

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
      summary: '',
    })
    expect(normalizeFilePlanEnvelope({ data: { operations: [], summary: '整理建议' } })).toEqual({
      operations: [],
      summary: '整理建议',
    })
  })

  it('unwraps single-key provider envelopes without discarding sibling metadata', () => {
    expect(normalizeCommonAiEnvelope({ data: { count: 2 } })).toEqual({ count: 2 })
    expect(normalizeCommonAiEnvelope({ data: { count: 2 }, summary: 'keep' })).toEqual({
      data: { count: 2 },
      summary: 'keep',
    })
  })

  it('rejects truncated JSON', () => {
    expect(() => parseAiJson('{"operations": [')).toThrow(SyntaxError)
  })

  it('normalizes common compatible-model template classification differences', () => {
    expect(
      normalizeTemplateClassificationEnvelope(
        {
          result: {
            analysis: '不应进入严格业务对象',
            category_path: '字符串算法 > BWT > 逆变换',
            common_mistakes: null,
            confidence: '92%',
            file_name: 'BWT变换.cpp',
            solves: '从 BWT 末列恢复原字符串。',
            space_complexity: 'O(n)',
            tags: '字符串，BWT，逆变换',
            time_complexity: 'O(n log n)',
          },
        },
        {
          existingDirectories: new Set(['字符串算法']),
          fallbackFileName: 'BWT变换.cpp',
          outputLanguage: 'zh-CN',
        },
      ),
    ).toEqual({
      alternatives: [],
      categoryPath: ['字符串算法', 'BWT', '逆变换'],
      classificationReason: '模型未提供分类理由，请在保存前重点核对建议目录。',
      commonMistakes: '',
      confidence: 0.92,
      constraints: undefined,
      fileName: 'BWT变换.cpp',
      placement: {
        existingParentPath: '字符串算法',
        mode: 'create-subdirectory',
        newDirectories: ['BWT', '逆变换'],
        reason: '放置方式已根据当前工作区真实目录在本地推导。',
        targetDirectory: '字符串算法/BWT/逆变换',
      },
      prerequisites: undefined,
      solves: '从 BWT 末列恢复原字符串。',
      spaceComplexity: 'O(n)',
      tags: ['字符串', 'BWT', '逆变换'],
      timeComplexity: 'O(n log n)',
    })
  })

  it('derives categories from a relative path and keeps only supported output fields', () => {
    expect(
      normalizeTemplateClassificationEnvelope(
        {
          confidence: 75,
          extra: 'ignored',
          relativePath: 'String Algorithms/BWT/BWT.cpp',
        },
        {
          existingDirectories: new Set(['String Algorithms', 'String Algorithms/BWT']),
          fallbackFileName: '',
          outputLanguage: 'en',
        },
      ),
    ).toMatchObject({
      categoryPath: ['String Algorithms', 'BWT'],
      confidence: 0.75,
      fileName: 'BWT.cpp',
      placement: {
        existingParentPath: 'String Algorithms/BWT',
        mode: 'existing-directory',
        newDirectories: [],
        targetDirectory: 'String Algorithms/BWT',
      },
    })
  })
})
