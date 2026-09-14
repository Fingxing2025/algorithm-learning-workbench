import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  templateClassificationSchema,
  type SourceEvidence,
} from '@core/contracts/template-management'
import {
  buildClassificationSourceContext,
  reconcileGlobalClassification,
  reviewClassificationEvidence,
  validateSourceEvidence,
} from './template-classification-evidence'

const source = readFileSync('tests/fixtures/classification-evidence/fenwick.cpp', 'utf8')
const evidence: SourceEvidence = {
  startLine: 8,
  endLine: 8,
  quote: 'for (; i < (int)a.size(); i += i & -i) a[i] += delta;',
  claim: '更新沿 lowbit 跳转',
}
const draft = () =>
  templateClassificationSchema.parse({
    algorithmFamily: 'Fenwick',
    alternatives: [],
    categoryId: 'data-structure.fenwick',
    categoryPath: ['数据结构', '树状数组', 'Fenwick 树'],
    classificationReason: '低位更新与前缀累加',
    confidence: 0.9,
    metadata: {
      solves: '前缀累加',
      notes: '',
      tags: ['前缀'],
      timeComplexity: 'O(log n)',
      spaceComplexity: 'O(n)',
    },
    model: 'mock',
    providerName: 'mock',
    suggestedRelativePath: '数据结构/树状数组/Fenwick 树/累加.cpp',
    placement: {
      existingParentPath: '',
      mode: 'create-category-chain',
      newDirectories: ['数据结构', '树状数组', 'Fenwick 树'],
      reason: '本地映射',
      targetDirectory: '数据结构/树状数组/Fenwick 树',
    },
  })

describe('source evidence and proposal provenance (software contracts, not model accuracy)', () => {
  it('verifies original line references and never treats misleading titles as evidence', () => {
    const context = buildClassificationSourceContext(source, 32000)
    const result = reviewClassificationEvidence(draft(), source, context, [evidence])
    expect(result.sourceEvidence?.[0]?.verified).toBe(true)
    expect(result.sourceCoverage?.complete).toBe(true)
    expect(result.needsReview).toBe(false)
    expect(result.proposalHistory?.[0]).toMatchObject({ source: 'detailed-source', version: 1 })
    for (const bad of [
      { ...evidence, quote: 'sort(edges.begin(), edges.end());' },
      { ...evidence, startLine: 9, endLine: 8 },
      { ...evidence, endLine: 999 },
    ]) {
      expect(reviewClassificationEvidence(draft(), source, context, [bad])).toMatchObject({
        needsReview: true,
        reviewReasons: expect.arrayContaining(['invalid-source-evidence']),
      })
    }
    expect(reviewClassificationEvidence(draft(), source, context)).toMatchObject({
      needsReview: true,
      reviewReasons: ['missing-source-evidence'],
    })
  })

  it('samples middle blocks, labels omissions and refuses evidence from omitted source', () => {
    const long = [
      ...Array.from({ length: 400 }, () => '// padding'),
      ...source.split('\n'),
      ...Array.from({ length: 400 }, () => '// padding'),
    ].join('\n')
    const context = buildClassificationSourceContext(long, 1800)
    expect(context.content.length).toBeLessThanOrEqual(1800)
    expect(context.content).toContain('i += i & -i')
    expect(context.coverage.complete).toBe(false)
    expect(context.coverage.coveredLines + context.coverage.omittedLines).toBe(
      context.coverage.totalLines,
    )
    const absentLine = Array.from({ length: context.coverage.totalLines }, (_, i) => i + 1).find(
      line =>
        !context.coverage.ranges.some(range => range.startLine <= line && range.endLine >= line),
    )!
    const quote = long.split('\n')[absentLine - 1]!
    expect(
      validateSourceEvidence(long, context, [
        { startLine: absentLine, endLine: absentLine, quote, claim: '未发送位置' },
      ])[0]?.verified,
    ).toBe(false)
    expect(
      reviewClassificationEvidence(draft(), long, context, [
        { ...evidence, startLine: 408, endLine: 408 },
      ]),
    ).toMatchObject({ needsReview: true, reviewReasons: ['partial-source-coverage'] })
  })

  it('omits an oversized single line rather than claiming it is completely covered', () => {
    const context = buildClassificationSourceContext('x'.repeat(50000), 1200)
    expect(context.content).toBe('')
    expect(context.coverage).toMatchObject({ complete: false, coveredLines: 0, omittedLines: 1 })
  })

  it('requires implementation evidence even when comment and literal quotes match exactly', () => {
    for (const line of [
      '// for (int i=0; i<n; i++) a[i]+=1;',
      '/* return lowbit(x); */',
      'const char* name = "for (int i=0; i<n; i++)";',
      'const char* name = R"tag(return x;)tag";',
      '#include "return.hpp"',
    ]) {
      const quote = line.includes('return x;')
        ? 'return x;'
        : line.includes('for (int')
          ? 'for (int i=0; i<n; i++)'
          : line
      const result = reviewClassificationEvidence(
        draft(),
        line,
        buildClassificationSourceContext(line, 32000),
        [{ startLine: 1, endLine: 1, quote, claim: '文字线索' }],
      )
      expect(result.sourceEvidence?.[0]?.verified).toBe(true)
      expect(result.reviewReasons).toContain('missing-implementation-evidence')
    }
  })

  it.each([
    [
      'LF continuation',
      ['// documented example \\', 'for (int i=0; i<n; ++i) a[i] += 1;'].join('\n'),
      2,
      'for (int i=0; i<n; ++i) a[i] += 1;',
    ],
    [
      'CRLF continuation',
      ['// documented example \\', 'for (int i=0; i<n; ++i) a[i] += 1;'].join('\r\n'),
      2,
      'for (int i=0; i<n; ++i) a[i] += 1;',
    ],
    [
      'successive continuations',
      ['// documented example \\', 'for (int i=0; i<n; ++i) \\', 'return i;'].join('\n'),
      3,
      'return i;',
    ],
  ])('masks implementation-looking text in a %s line comment', (_, candidate, line, quote) => {
    const [checked] = validateSourceEvidence(
      candidate,
      buildClassificationSourceContext(candidate, 32000),
      [{ startLine: line, endLine: line, quote, claim: '注释中的伪实现' }],
    )
    expect(checked).toMatchObject({ verified: true, containsImplementation: false })
  })

  it.each(["100'000", "0xDE'AD"])(
    'keeps real implementation visible after the C++ numeric literal %s',
    literal => {
      const candidate = [
        `constexpr int limit = ${literal};`,
        'for (int i=0; i<limit; ++i) values[i] += 1;',
      ].join('\n')
      const [checked] = validateSourceEvidence(
        candidate,
        buildClassificationSourceContext(candidate, 32000),
        [
          {
            startLine: 2,
            endLine: 2,
            quote: 'for (int i=0; i<limit; ++i) values[i] += 1;',
            claim: '真实循环实现',
          },
        ],
      )
      expect(checked).toMatchObject({ verified: true, containsImplementation: true })
    },
  )

  it("does not treat the opening quote in u8'a' as a numeric separator", () => {
    const candidate = [
      "constexpr char marker = u8'a';",
      'for (int i=0; i<limit; ++i) values[i] += 1;',
    ].join('\n')
    const [checked] = validateSourceEvidence(
      candidate,
      buildClassificationSourceContext(candidate, 32000),
      [
        {
          startLine: 2,
          endLine: 2,
          quote: 'for (int i=0; i<limit; ++i) values[i] += 1;',
          claim: '真实循环实现',
        },
      ],
    )
    expect(checked).toMatchObject({ verified: true, containsImplementation: true })
  })

  it('continues masking implementation-looking text inside a character literal', () => {
    const candidate = "constexpr int marker = 'for';"
    const [checked] = validateSourceEvidence(
      candidate,
      buildClassificationSourceContext(candidate, 32000),
      [{ startLine: 1, endLine: 1, quote: 'for', claim: '字符常量中的文字' }],
    )
    expect(checked).toMatchObject({ verified: true, containsImplementation: false })
  })

  it('does not classify an auxiliary dependency as multiple independent algorithm goals', () => {
    const value = {
      ...draft(),
      algorithmFamily: 'Kruskal',
      categoryId: 'graph.mst',
      secondaryFamilies: ['并查集'],
      independentAlgorithmGoals: false,
    }
    const result = reviewClassificationEvidence(
      value,
      source,
      buildClassificationSourceContext(source, 32000),
      [evidence],
    )
    expect(result.reviewReasons).not.toContain('composite-algorithm')
  })

  it('retains detailed algorithm, path and complexity against a high-confidence global proposal', () => {
    const context = buildClassificationSourceContext(source, 32000)
    const detail = reviewClassificationEvidence(draft(), source, context, [evidence])
    const result = reconcileGlobalClassification(
      detail,
      {
        algorithmFamily: 'MST',
        categoryId: 'graph.mst',
        primaryTechnique: '排序',
        variant: '边排序',
        confidence: 1,
        timeComplexity: 'O(n log n)',
        sourceEvidence: [{ ...evidence, quote: 'fabricated' }],
      },
      source,
      buildClassificationSourceContext(source, 1200),
    )
    expect(result.categoryId).toBe('data-structure.fenwick')
    expect(result.metadata.timeComplexity).toBe('O(log n)')
    expect(result.needsReview).toBe(true)
    expect(result.reviewReasons).toContain('global-detail-disagreement')
    expect(
      result.proposalHistory?.map(item => [item.version, item.source, item.categoryId]),
    ).toEqual([
      [1, 'global-summary', 'graph.mst'],
      [2, 'detailed-source', 'data-structure.fenwick'],
    ])
  })

  it.each([
    [{ confidence: 0.64 }, 'low-confidence'],
    [
      {
        alternatives: [{ confidence: 0.85, reason: '候选', targetDirectory: '数据结构/树/树结构' }],
      },
      'close-alternatives',
    ],
    [{ algorithmFamily: 'Tarjan' }, 'unknown-algorithm-family'],
    [{ secondaryFamilies: ['二分查找'], independentAlgorithmGoals: true }, 'composite-algorithm'],
    [{ categoryId: 'basic' }, 'generic-category'],
    [{ categoryDecision: 'propose-new' }, 'new-category-proposal'],
  ] as const)('forces review for %j', (patch, reason) => {
    const result = reviewClassificationEvidence(
      templateClassificationSchema.parse({ ...draft(), ...patch }),
      source,
      buildClassificationSourceContext(source, 32000),
      [evidence],
    )
    expect(result.needsReview).toBe(true)
    expect(result.reviewReasons).toContain(reason)
  })
})
