import { describe, expect, it } from 'vitest'

import { analyzeProblemRequestSchema, commitProblemAnalysisRequestSchema } from './problem-analysis'

describe('problem analysis contracts', () => {
  it('requires text or an image before analysis', () => {
    expect(() => analyzeProblemRequestSchema.parse({ images: [], text: '' })).toThrow()
    expect(analyzeProblemRequestSchema.parse({ images: [], text: '题面' })).toEqual({
      images: [],
      text: '题面',
    })
  })

  it('rejects duplicate template relations at confirmation', () => {
    const templateId = 'a'.repeat(64)
    expect(() =>
      commitProblemAnalysisRequestSchema.parse({
        fields: {
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
