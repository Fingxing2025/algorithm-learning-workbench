import { describe, expect, it } from 'vitest'

import { compactAiSource } from './ai-input-budget'

describe('compactAiSource', () => {
  it('keeps short sources unchanged', () => {
    expect(compactAiSource('abcdef', 6)).toEqual({
      content: 'abcdef',
      originalCharacters: 6,
      truncated: false,
      truncationStrategy: 'none',
    })
  })

  it('retains both source boundaries and marks truncation', () => {
    const compacted = compactAiSource(`HEAD-${'x'.repeat(200)}-TAIL`, 80)

    expect(compacted.content).toHaveLength(80)
    expect(compacted.content).toContain('HEAD-')
    expect(compacted.content).toContain('-TAIL')
    expect(compacted.content).toContain('AI_INPUT_HEAD_TAIL_TRUNCATED')
    expect(compacted.truncated).toBe(true)
    expect(compacted.truncationStrategy).toBe('head-tail')
  })
})
