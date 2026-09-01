import { describe, expect, it } from 'vitest'

import { validateClassificationLanguage } from './template-management-service'

const chineseMetadata = {
  solves: '单源最短路。',
  tags: ['图论', '最短路', 'Dijkstra'],
}

describe('template classification language validation', () => {
  it('accepts conventional algorithm names inside Chinese paths and file names', () => {
    expect(() =>
      validateClassificationLanguage(
        'zh-CN',
        ['图论', '最短路', 'Dijkstra', '堆优化'],
        'dijkstra.cpp',
        chineseMetadata,
      ),
    ).not.toThrow()
  })

  it('accepts BWT as a conventional abbreviation in a Chinese classification', () => {
    expect(() =>
      validateClassificationLanguage('zh-CN', ['字符串算法', 'BWT', '逆变换'], 'BWT变换.cpp', {
        solves: '从末列恢复原字符串。',
        tags: ['字符串', 'BWT', '逆变换'],
      }),
    ).not.toThrow()
  })

  it('accepts conventional BWT and LF-mapping long names', () => {
    expect(() =>
      validateClassificationLanguage(
        'zh-CN',
        ['字符串算法', 'Burrows-Wheeler Transform', 'LF-mapping'],
        'Burrows-Wheeler Transform.cpp',
        {
          solves: '从 BWT 末列恢复原字符串。',
          tags: ['字符串', 'Burrows-Wheeler Transform', 'LF-mapping'],
        },
      ),
    ).not.toThrow()
  })

  it('rejects generic English phrases when Chinese metadata is selected', () => {
    expect(() =>
      validateClassificationLanguage(
        'zh-CN',
        ['图论', '最短路', 'Dijkstra', 'Heap Optimized'],
        'shortest-path.cpp',
        chineseMetadata,
      ),
    ).toThrow(/AI 返回的中文分类路径/)
  })

  it('accepts an existing English directory chain for a Chinese classification', () => {
    expect(() =>
      validateClassificationLanguage(
        'zh-CN',
        ['String Algorithms', 'BWT'],
        'BWT变换.cpp',
        chineseMetadata,
        undefined,
        new Set(['String Algorithms', 'String Algorithms/BWT']),
      ),
    ).not.toThrow()
  })

  it('still rejects a newly invented English child under an existing English directory', () => {
    expect(() =>
      validateClassificationLanguage(
        'zh-CN',
        ['String Algorithms', 'BWT', 'Inverse Transform'],
        'BWT变换.cpp',
        chineseMetadata,
        undefined,
        new Set(['String Algorithms', 'String Algorithms/BWT']),
      ),
    ).toThrow(/AI 返回的中文分类路径/)
  })

  it('rejects generic English hidden inside an otherwise Chinese path', () => {
    expect(() =>
      validateClassificationLanguage(
        'zh-CN',
        ['图论', '最短路', 'Dijkstra', 'Heap堆优化'],
        'Dijkstra堆优化.cpp',
        chineseMetadata,
      ),
    ).toThrow(/AI 返回的中文分类路径/)
  })

  it('rejects generic English tags when Chinese metadata is selected', () => {
    expect(() =>
      validateClassificationLanguage('zh-CN', ['字符串算法', 'BWT', '逆变换'], 'BWT变换.cpp', {
        ...chineseMetadata,
        tags: ['字符串', 'inverse transform'],
      }),
    ).toThrow(/AI 返回的标签/)
  })

  it('rejects CJK characters when English metadata is selected', () => {
    expect(() =>
      validateClassificationLanguage(
        'en',
        ['Graph Theory', 'Shortest Path', 'Dijkstra'],
        'dijkstra.cpp',
        { ...chineseMetadata, solves: 'Stale queue entries.' },
      ),
    ).toThrow(/AI 返回的英文元数据/)
  })

  it('does not reject user-provided fields merely because they use another language', () => {
    const englishUserMetadata = {
      solves: 'Find the first update that makes a cell negative.',
      tags: ['binary search', '3D difference array'],
    }
    expect(() =>
      validateClassificationLanguage(
        'zh-CN',
        ['二分答案', '三维差分'],
        'binary-search.cpp',
        englishUserMetadata,
        { fileName: 'binary-search.cpp', fields: englishUserMetadata },
      ),
    ).not.toThrow()
  })
})
