import { describe, expect, it } from 'vitest'

import {
  canonicalTaxonomy,
  normalizeTaxonomyAlias,
  taxonomyAliasCandidates,
  isForbiddenTaxonomyPath,
  reconcileBatchCategories,
  resolveCanonicalAlgorithmFamily,
  resolveCanonicalCategory,
} from './template-taxonomy'
import batchImportTaxonomyRegression from '../../../tests/fixtures/batch-import-taxonomy-v2.json'
import canonicalTaxonomyGolden from '../../../tests/fixtures/canonical-taxonomy-golden.json'

describe('canonical template taxonomy', () => {
  it('is versioned, has the required top-level domains, and uses only 3–4 levels', () => {
    expect(canonicalTaxonomy.schemaVersion).toBe(2)
    expect(new Set(canonicalTaxonomy.categories.map(item => item.path[0]))).toEqual(
      new Set([
        '基础算法',
        '数据结构',
        '图论',
        '字符串',
        '动态规划',
        '数学',
        '数值计算',
        'C++ 工具',
        '竞赛框架',
        '日期与时间',
      ]),
    )
    expect(
      canonicalTaxonomy.categories.every(item => item.path.length >= 3 && item.path.length <= 4),
    ).toBe(true)
    expect(new Set(canonicalTaxonomy.categories.map(item => item.categoryId)).size).toBe(
      canonicalTaxonomy.categories.length,
    )
  })

  it('normalizes known aliases and rejects unknown IDs', () => {
    expect(
      resolveCanonicalCategory(undefined, ['字符串算法', 'BWT', '逆变换'])?.category.categoryId,
    ).toBe('string.transform.bwt')
    expect(resolveCanonicalCategory(undefined, ['背包问题'])?.category.categoryId).toBe(
      'dp.knapsack',
    )
    expect(resolveCanonicalCategory('graph.mst', ['任意', '目录'])?.category.path).toEqual([
      '图论',
      '生成树',
      '最小生成树',
    ])
    expect(resolveCanonicalCategory('made.up.category', ['图论'])).toBeNull()
  })

  it('covers every template from the current 49-file batch-import regression sample precisely', () => {
    expect(batchImportTaxonomyRegression).toHaveLength(49)
    for (const expected of batchImportTaxonomyRegression) {
      const category = canonicalTaxonomy.categories.find(
        item => item.categoryId === expected.categoryId,
      )
      expect(category, expected.name).toBeDefined()
      expect(category?.path, expected.name).toEqual(expected.path)
      expect(category?.reviewRequired, expected.name).toBe(false)
    }
  })

  it('keeps the broader golden taxonomy fixture internally consistent', () => {
    for (const expected of canonicalTaxonomyGolden) {
      expect(
        canonicalTaxonomy.categories.find(item => item.categoryId === expected.categoryId)?.path,
        expected.name,
      ).toEqual(expected.path)
    }
  })

  it('maps an extracted algorithm family to a precise category instead of accepting a fallback', () => {
    expect(resolveCanonicalAlgorithmFamily('Kruskal')?.category.categoryId).toBe('graph.mst')
    expect(resolveCanonicalAlgorithmFamily('AC自动机')?.category.categoryId).toBe(
      'string.pattern.ac-automaton',
    )
    expect(resolveCanonicalCategory('graph', [])?.category.reviewRequired).toBe(true)
  })

  it('reconciles same-family batch results and marks disagreements for review', () => {
    const result = reconcileBatchCategories([
      {
        algorithmFamily: 'MST',
        categoryId: 'graph.mst',
        categoryPath: ['图论', '生成树', '最小生成树'],
        confidence: 0.9,
      },
      {
        algorithmFamily: 'MST',
        categoryId: 'basic',
        categoryPath: ['基础算法', '通用技巧', '算法基础'],
        confidence: 0.99,
      },
    ])
    expect(result[0]).toMatchObject({ categoryId: 'graph.mst', needsReview: true })
    expect(result[1]).toMatchObject({ categoryId: 'basic', needsReview: true })
  })

  it('flags forbidden free-form final categories', () => {
    expect(isForbiddenTaxonomyPath(['算法', '其他', '模板'])).toBe(true)
    expect(isForbiddenTaxonomyPath(['图论', '最短路', 'Dijkstra'])).toBe(false)
  })
  it('does not let shared basic or dp fallback IDs leak across unrelated families', () => {
    const item = (sourceId: string, algorithmFamily: string, categoryId: string) => ({
      sourceId,
      algorithmFamily,
      categoryId,
      categoryPath: resolveCanonicalCategory(categoryId, [])!.category.path,
      confidence: 0.99,
    })
    const items = [
      item('mst-1', 'MST', 'basic'),
      item('mst-2', 'MST', 'graph.mst'),
      item('kmp-1', 'KMP', 'basic'),
      item('kmp-2', 'KMP', 'string.pattern.kmp'),
      item('knapsack-1', '01背包', 'dp'),
      item('lcs-1', 'LCS', 'dp'),
    ]
    const result = reconcileBatchCategories(items)
    expect(result.map(row => [row.sourceId, row.categoryId])).toEqual(
      items.map(row => [row.sourceId, row.categoryId]),
    )
    expect(result.slice(0, 4).every(row => row.needsReview)).toBe(true)
    expect(result[4]?.needsReview).toBeUndefined()
    expect(result[5]?.needsReview).toBeUndefined()
    expect(reconcileBatchCategories([...items].reverse()).reverse()).toEqual(result)
  })

  it('never resolves colliding or polysemous aliases by insertion order', () => {
    for (const alias of ['Tarjan', 'BFS', 'DFS'])
      expect(resolveCanonicalAlgorithmFamily(alias)).toBeNull()
    for (const category of canonicalTaxonomy.categories)
      for (const alias of category.aliases) {
        if (taxonomyAliasCandidates(alias).length > 1)
          expect(resolveCanonicalAlgorithmFamily(alias), alias).toBeNull()
      }
    expect(taxonomyAliasCandidates('Tarjan').length).toBeGreaterThan(1)
    expect(resolveCanonicalAlgorithmFamily('Fenwick')?.category.categoryId).toBe(
      'data-structure.fenwick',
    )
  })

  it('normalizes separators and fullwidth letters while preserving language symbols', () => {
    expect(normalizeTaxonomyAlias(' Ｃ＋＋／ 工具（常用） ')).toBe('c++工具常用')
    expect(normalizeTaxonomyAlias('C++')).not.toBe(normalizeTaxonomyAlias('C'))
    expect(normalizeTaxonomyAlias('C#')).not.toBe(normalizeTaxonomyAlias('C'))
    expect(normalizeTaxonomyAlias('AC_自动机')).toBe(normalizeTaxonomyAlias('AC 自动机'))
  })
})
