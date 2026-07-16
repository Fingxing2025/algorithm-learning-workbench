import { describe, expect, it } from 'vitest'

import { createProblemRequestSchema } from './problem'

const validProblem = {
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
  platform: '洛谷',
  problemCode: 'P3371',
  statement: '求单源最短路径。',
  status: 'unattempted' as const,
  tags: ['图论', '图论', '最短路'],
  title: '单源最短路径',
  url: 'https://www.luogu.com.cn/problem/P3371',
}

describe('problem contracts', () => {
  it('normalizes duplicate tags while preserving user fields', () => {
    const result = createProblemRequestSchema.parse(validProblem)

    expect(result.tags).toEqual(['图论', '最短路'])
    expect(result.title).toBe('单源最短路径')
  })

  it('rejects non-http links and unexpected fields', () => {
    expect(() =>
      createProblemRequestSchema.parse({ ...validProblem, url: 'file:///tmp/problem.txt' }),
    ).toThrow()
    expect(() => createProblemRequestSchema.parse({ ...validProblem, secret: 'nope' })).toThrow()
  })
})
