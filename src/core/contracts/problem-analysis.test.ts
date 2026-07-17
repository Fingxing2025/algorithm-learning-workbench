import { describe, expect, it } from 'vitest'

import {
  analyzeProblemRequestSchema,
  commitProblemAnalysisRequestSchema,
  modelProblemAnalysisSchema,
  problemAnalysisCandidateRoleSchema,
} from './problem-analysis'

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

  it('keeps candidate roles in the draft contract without changing persisted relation types', () => {
    expect(problemAnalysisCandidateRoleSchema.options).toEqual([
      'direct-solution',
      'subproblem',
      'prerequisite',
      'optimization',
      'alternative-solution',
    ])
    const parsed = modelProblemAnalysisSchema.parse({
      aiSummary: '',
      analysis: {
        algorithmSignals: [],
        constraints: [],
        edgeCases: [],
        examples: [],
        inputDescription: '',
        outputDescription: '',
      },
      templateCandidates: [
        {
          confidence: 0.8,
          reason: '直接解法',
          role: 'direct-solution',
          templateId: 'a'.repeat(64),
        },
        {
          confidence: 0.7,
          reason: '替代解法',
          role: 'alternative-solution',
          templateId: 'b'.repeat(64),
        },
      ],
      title: '多方向题目',
    })
    expect(parsed.templateCandidates?.map(candidate => candidate.role)).toEqual([
      'direct-solution',
      'alternative-solution',
    ])
    expect(() =>
      modelProblemAnalysisSchema.parse({
        ...parsed,
        templateCandidates: [
          {
            confidence: 0.9,
            role: 'database-relation-type',
            templateId: 'c'.repeat(64),
          },
        ],
      }),
    ).toThrow()
  })
})
