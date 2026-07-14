import { describe, expect, it } from 'vitest'

import { normalizeTemplateRelativePath } from './template-path'

describe('normalizeTemplateRelativePath', () => {
  it('normalizes portable nested source paths', () => {
    expect(normalizeTemplateRelativePath(' 图论\\最短路\\dijkstra.cpp ')).toBe(
      '图论/最短路/dijkstra.cpp',
    )
  })

  it('rejects traversal, absolute paths, and unsupported extensions', () => {
    expect(() => normalizeTemplateRelativePath('../outside.cpp')).toThrow()
    expect(() => normalizeTemplateRelativePath('/tmp/outside.cpp')).toThrow()
    expect(() => normalizeTemplateRelativePath('notes.txt')).toThrow()
  })
})
