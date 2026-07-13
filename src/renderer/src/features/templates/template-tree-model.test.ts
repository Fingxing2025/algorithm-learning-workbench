import { describe, expect, it } from 'vitest'

import type { TemplateSummary } from '@core/contracts/workspace'

import {
  buildTemplateTree,
  directoryRowId,
  flattenTemplateTree,
  getDefaultExpandedIds,
  getExpansionIdsForTemplate,
} from './template-tree-model'

function template(relativePath: string, idCharacter: string): TemplateSummary {
  const fileName = relativePath.split('/').at(-1) ?? relativePath
  return {
    extension: '.cpp',
    fileName,
    id: idCharacter.repeat(64),
    language: 'C++',
    modifiedAt: '2026-07-14T00:00:00.000Z',
    name: fileName.replace(/\.cpp$/, ''),
    relativePath,
    sizeBytes: 128,
  }
}

describe('template tree model', () => {
  it('folds single-child directories without changing real paths', () => {
    const bfs = template('基础算法/搜索/BFS/bfs.cpp', 'a')
    const dfs = template('基础算法/搜索/DFS/dfs.cpp', 'b')
    const root = buildTemplateTree([bfs, dfs])
    const expanded = getDefaultExpandedIds(root)
    const rows = flattenTemplateTree(root, expanded)

    expect(rows[0]).toMatchObject({
      kind: 'directory',
      label: '基础算法 / 搜索',
      relativePath: '基础算法/搜索',
    })
    expect(expanded.has(directoryRowId('基础算法/搜索'))).toBe(true)
    expect(bfs.relativePath).toBe('基础算法/搜索/BFS/bfs.cpp')
  })

  it('returns every folded directory needed to reveal a template', () => {
    const bfs = template('基础算法/搜索/BFS/bfs.cpp', 'a')
    const root = buildTemplateTree([bfs])

    expect(getExpansionIdsForTemplate(root, bfs)).toEqual([directoryRowId('基础算法/搜索/BFS')])
  })
})
