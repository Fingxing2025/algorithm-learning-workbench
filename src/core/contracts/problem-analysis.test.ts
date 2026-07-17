import { describe, expect, it } from 'vitest'

import { analyzeProblemRequestSchema, commitProblemAnalysisRequestSchema } from './problem-analysis'

describe('problem analysis contracts', () => {
  it('requires text or an image before analysis', () => {
    const requestId = '10000000-0000-4000-8000-000000000001'
    expect(() =>
      analyzeProblemRequestSchema.parse({
        images: [],
        outputLanguage: 'zh-CN',
        requestId,
        text: '',
      }),
    ).toThrow()
    expect(
      analyzeProblemRequestSchema.parse({
        images: [],
        outputLanguage: 'zh-CN',
        requestId,
        text: '题面',
      }),
    ).toEqual({
      images: [],
      outputLanguage: 'zh-CN',
      requestId,
      text: '题面',
    })
  })

  it('rejects duplicate template relations at confirmation', () => {
    const templateId = 'a'.repeat(64)
    expect(() =>
      commitProblemAnalysisRequestSchema.parse({
        fields: {
          aiSummary: '',
          analysis: {
            algorithmSignals: [],
            constraints: [],
            edgeCases: [],
            examples: [],
            inputDescription: '',
            outputDescription: '',
          },
          difficulty: null,
          notes: '',
          platform: null,
          problemCode: null,
          statement: '',
          status: 'unattempted',
          tags: [],
          title: '测试题',
          url: null,
        },
        images: [],
        relations: [
          { note: '', relationType: 'recommended', templateId },
          { note: '', relationType: 'used', templateId },
        ],
      }),
    ).toThrow()
  })
})
