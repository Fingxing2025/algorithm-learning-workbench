import { describe, expect, it } from 'vitest'

import type { TemplateClassification } from '@core/contracts/template-management'

import {
  emptyTemplateMetadata,
  findTemplateMetadataConflicts,
  mergeTemplateClassification,
  restoreDraftBeforeClassificationLanguageChange,
} from './template-metadata-merge'

const classification: TemplateClassification = {
  alternatives: [],
  categoryPath: ['图论', '最短路', 'Dijkstra'],
  classificationReason: '当前工作区的最短路分类。',
  confidence: 0.95,
  metadata: {
    ...emptyTemplateMetadata,
    solves: 'AI 识别的问题',
    tags: ['图论', '最短路'],
    timeComplexity: 'O(m log n)',
  },
  model: 'fixture-model',
  placement: {
    existingParentPath: '图论/最短路',
    mode: 'create-subdirectory',
    newDirectories: ['Dijkstra'],
    reason: '按具体算法建立子目录。',
    targetDirectory: '图论/最短路/Dijkstra',
  },
  providerName: 'fixture-provider',
  suggestedRelativePath: '图论/最短路/dijkstra.cpp',
}

describe('template metadata merge', () => {
  it('fills empty user fields without producing conflicts', () => {
    expect(findTemplateMetadataConflicts('', emptyTemplateMetadata, classification)).toEqual([])
    expect(mergeTemplateClassification('', emptyTemplateMetadata, classification, {})).toEqual({
      metadata: classification.metadata,
      relativePath: classification.suggestedRelativePath,
    })
  })

  it('protects user values by default and allows selecting individual AI fields', () => {
    const userMetadata = {
      ...emptyTemplateMetadata,
      solves: '用户定义的问题',
      tags: ['我的标签'],
      timeComplexity: 'O(n²)',
    }
    expect(
      findTemplateMetadataConflicts('custom.cpp', userMetadata, classification).map(
        conflict => conflict.key,
      ),
    ).toEqual(['relativePath', 'solves', 'tags', 'timeComplexity'])

    const merged = mergeTemplateClassification('custom.cpp', userMetadata, classification, {
      relativePath: 'ai',
      timeComplexity: 'ai',
    })
    expect(merged.relativePath).toBe('图论/最短路/dijkstra.cpp')
    expect(merged.metadata.timeComplexity).toBe('O(m log n)')
    expect(merged.metadata.solves).toBe('用户定义的问题')
    expect(merged.metadata.tags).toEqual(['我的标签'])
  })

  it('removes untouched AI values on language change while preserving user edits', () => {
    const baseline = {
      metadata: { ...emptyTemplateMetadata, solves: '用户原始问题', tags: ['用户标签'] },
      relativePath: 'custom.cpp',
    }
    const current = {
      metadata: {
        ...classification.metadata,
        solves: '用户原始问题',
        tags: ['用户标签'],
      },
      relativePath: classification.suggestedRelativePath,
    }

    expect(
      restoreDraftBeforeClassificationLanguageChange(current, baseline, classification),
    ).toEqual({
      metadata: {
        ...emptyTemplateMetadata,
        solves: '用户原始问题',
        tags: ['用户标签'],
      },
      relativePath: 'custom.cpp',
    })
  })
})
