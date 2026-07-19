import { basename, extname } from 'node:path'

import type {
  ClassifyTemplateRequest,
  FilePlanGenerationRequest,
  TemplateMetadataFields,
} from '@core/contracts/template-management'

import { PublicError } from '../errors/public-error'

const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u
const CONVENTIONAL_ALGORITHM_NAMES = new Set([
  'ac',
  'aho',
  'astar',
  'bellman',
  'bfs',
  'bit',
  'bwt',
  'cantor',
  'cdq',
  'corasick',
  'crt',
  'dfs',
  'dijkstra',
  'dinic',
  'dlx',
  'dsu',
  'exkmp',
  'fft',
  'floyd',
  'hld',
  'kmp',
  'kosaraju',
  'kruskal',
  'lca',
  'lucas',
  'manacher',
  'mcmf',
  'mo',
  'ntt',
  'prim',
  'rmq',
  'sam',
  'scc',
  'sg',
  'spfa',
  'splay',
  'st',
  'suffixarray',
  'tarjan',
  'treap',
  'trie',
  'z',
])

function isConventionalAlgorithmName(value: string): boolean {
  const tokens = value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\ba\s*\*/g, 'astar')
    .replace(/\bburrows[\s-]*wheeler(?:[\s-]*transform)?\b/g, 'bwt')
    .replace(/\blf[\s-]*mapping\b/g, 'bwt')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return (
    tokens.some(token => CONVENTIONAL_ALGORITHM_NAMES.has(token)) &&
    tokens.every(token => /^\d+$/u.test(token) || CONVENTIONAL_ALGORITHM_NAMES.has(token))
  )
}

function usesChineseOrConventionalAlgorithmName(value: string): boolean {
  if (!CJK_PATTERN.test(value)) return isConventionalAlgorithmName(value)
  const latinTokens = value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\ba\s*\*/g, 'astar')
    .replace(/\bburrows[\s-]*wheeler(?:[\s-]*transform)?\b/g, 'bwt')
    .replace(/\blf[\s-]*mapping\b/g, 'bwt')
    .match(/[a-z][a-z0-9]*/g)
  return !latinTokens || latinTokens.every(token => CONVENTIONAL_ALGORITHM_NAMES.has(token))
}

export function validateClassificationLanguage(
  outputLanguage: ClassifyTemplateRequest['outputLanguage'],
  categoryPath: string[],
  fileName: string,
  fields: Pick<
    TemplateMetadataFields,
    'commonMistakes' | 'constraints' | 'prerequisites' | 'solves' | 'tags'
  >,
  existing?: {
    fileName: string
    fields: Pick<
      TemplateMetadataFields,
      'commonMistakes' | 'constraints' | 'prerequisites' | 'solves' | 'tags'
    >
  },
  existingCategoryPaths: ReadonlySet<string> = new Set(),
): void {
  const narratives = [
    [fields.solves, existing?.fields.solves],
    [fields.constraints, existing?.fields.constraints],
    [fields.prerequisites, existing?.fields.prerequisites],
    [fields.commonMistakes, existing?.fields.commonMistakes],
  ] as const
  const generatedNarratives = narratives.flatMap(([value, existingValue]) =>
    existingValue?.trim() ? [] : [value],
  )
  const generatedTags = existing?.fields.tags.length ? [] : fields.tags
  const generatedFileName = existing?.fileName.trim() ? [] : [fileName]
  const allGeneratedNaturalLanguage = [
    ...generatedFileName,
    ...categoryPath,
    ...generatedTags,
    ...generatedNarratives,
  ].filter(Boolean)
  if (outputLanguage === 'en') {
    if (allGeneratedNaturalLanguage.some(value => CJK_PATTERN.test(value))) {
      throw new PublicError(
        'AI_INVALID_RESPONSE',
        'AI 返回的英文元数据中仍包含中文或其他东亚文字，请重试或更换模型。',
      )
    }
    return
  }
  if (
    !categoryPath.every(
      (value, index) =>
        usesChineseOrConventionalAlgorithmName(value) ||
        existingCategoryPaths.has(categoryPath.slice(0, index + 1).join('/')),
    )
  ) {
    throw new PublicError(
      'AI_INVALID_RESPONSE',
      'AI 返回的中文分类路径中包含非惯用英文名称，请重试。',
    )
  }
  const fileStem = basename(fileName, extname(fileName))
  if (!existing?.fileName.trim() && !usesChineseOrConventionalAlgorithmName(fileStem)) {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 未使用中文或惯用算法专名生成文件名，请重试。')
  }
  if (generatedTags.some(value => !usesChineseOrConventionalAlgorithmName(value))) {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 返回的标签未使用中文或惯用算法专名，请重试。')
  }
  if (generatedNarratives.some(value => value.trim() && !CJK_PATTERN.test(value))) {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 返回的说明字段与中文选项不一致，请重试。')
  }
}

export function validateFilePlanLanguage(
  outputLanguage: FilePlanGenerationRequest['outputLanguage'],
  values: string[],
  paths: string[] = [],
): void {
  const naturalLanguage = values.filter(value => value.trim())
  const pathSegments = paths.flatMap(path => {
    const segments = path.split('/')
    const fileName = segments.pop() ?? ''
    return [...segments, basename(fileName, extname(fileName))].filter(Boolean)
  })
  if (outputLanguage === 'en') {
    if ([...naturalLanguage, ...pathSegments].some(value => CJK_PATTERN.test(value))) {
      throw new PublicError(
        'AI_INVALID_RESPONSE',
        'AI 返回的英文文件计划中仍包含中文或其他东亚文字，请重试或更换模型。',
      )
    }
    return
  }
  if (
    naturalLanguage.some(
      value => !CJK_PATTERN.test(value) && !isConventionalAlgorithmName(value),
    ) ||
    pathSegments.some(segment => !usesChineseOrConventionalAlgorithmName(segment))
  ) {
    throw new PublicError(
      'AI_INVALID_RESPONSE',
      'AI 返回的文件计划未遵循中文命名与说明规则，请重试。',
    )
  }
}
