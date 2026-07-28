import { describe, expect, it } from 'vitest'

import { analyzeTemplateFileName } from './template-file-name-analysis'

describe('analyzeTemplateFileName', () => {
  it.each(['锟斤拷.cpp', 'bad�name.cpp', 'Ã©-graph.cpp', 'ç®—æ³•.cpp'])(
    'detects conservative mojibake evidence in %s',
    fileName => {
      expect(analyzeTemplateFileName(fileName)).toMatchObject({
        kind: 'suspected-mojibake',
      })
    },
  )

  it('keeps the existing copy-marker and unusual-spacing audit', () => {
    expect(analyzeTemplateFileName('plain copy.py')).toMatchObject({
      kind: 'naming-inconsistency',
    })
  })

  it.each(['树状数组.cpp', 'Dijkstra.cpp', 'Aho–Corasick.cpp', 'café.cpp'])(
    'does not classify a valid algorithm file name as mojibake: %s',
    fileName => {
      expect(analyzeTemplateFileName(fileName)).toBeNull()
    },
  )
})
