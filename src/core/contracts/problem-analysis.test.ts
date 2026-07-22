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
          applicableWhen: [],
          confidence: 0.8,
          evidence: [],
          matchedCapabilities: [],
          notApplicableWhen: [],
          reason: '直接解法',
          role: 'direct-solution',
          templateId: 'a'.repeat(64),
          warnings: [],
        },
        {
          applicableWhen: [],
          confidence: 0.7,
          evidence: [],
          matchedCapabilities: [],
          notApplicableWhen: [],
          reason: '替代解法',
          role: 'alternative-solution',
          templateId: 'b'.repeat(64),
          warnings: [],
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
            applicableWhen: [],
            confidence: 0.9,
            evidence: [],
            matchedCapabilities: [],
            notApplicableWhen: [],
            reason: '无效角色',
            role: 'database-relation-type',
            templateId: 'c'.repeat(64),
            warnings: [],
          },
        ],
      }),
    ).toThrow()
  })

  it('allows an empty recommendation set but rejects more than eight model candidates', () => {
    const base = {
      aiSummary: '',
      analysis: {
        algorithmSignals: [],
        constraints: [],
        edgeCases: [],
        examples: [],
        inputDescription: '',
        outputDescription: '',
      },
      title: '候选上限测试',
    }
    expect(
      modelProblemAnalysisSchema.parse({ ...base, templateCandidates: [] }).templateCandidates,
    ).toEqual([])
    expect(() => modelProblemAnalysisSchema.parse(base)).toThrow()
    expect(() =>
      modelProblemAnalysisSchema.parse({
        ...base,
        templateCandidates: [{ templateId: 'a'.repeat(64) }],
      }),
    ).toThrow()
    expect(() =>
      modelProblemAnalysisSchema.parse({
        ...base,
        templateCandidates: Array.from({ length: 9 }, (_, index) => ({
          applicableWhen: [],
          confidence: 0.5,
          evidence: [],
          matchedCapabilities: [],
          notApplicableWhen: [],
          reason: '候选上限测试',
          role: 'direct-solution',
          templateId: (index + 1).toString(16).padStart(64, '0'),
          warnings: [],
        })),
      }),
    ).toThrow()
  })
})
