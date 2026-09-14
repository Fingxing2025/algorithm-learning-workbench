import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'

import type { WorkspaceAudit } from '@core/contracts/template-management'

import { PublicError } from '../errors/public-error'
import { resolveAuthorizedFile } from '../security/path-guard'
import { TemplateManagementRepository } from '../database/template-management-repository'
import { WorkspaceRepository } from '../database/workspace-repository'
import {
  jaccard,
  normalizeSourceForComparison,
  parseSimilaritySignature,
  similarityCandidateKeys,
  sourceShingles,
} from './template-content-index'
import { analyzeTemplateFileName } from './template-file-name-analysis'
import { MAX_SIMILARITY_CANDIDATE_PAIRS, MAX_SOURCE_BYTES } from './template-management-constants'
import { decodeTemplateSourceBuffer } from './template-source-codec'
import {
  normalizeTaxonomyAlias,
  resolveCanonicalDirectory,
  taxonomyAliasCandidates,
} from '@core/domain/template-taxonomy'

/**
 * Classifies directory names conservatively.  Batch import often creates
 * semantically equivalent branches such as "字符串"/"字符串算法" or
 * "算法"/"算法基础".  We only remove well-known descriptive affixes and
 * punctuation; arbitrary fuzzy matching would risk merging real categories.
 */
function canonicalDirectorySegment(segment: string): string {
  const fallback = normalizeTaxonomyAlias(segment)
  let value = fallback
  const withoutPrefix = value.replace(/^(基础|通用|常用|basics?)/u, '')
  if (withoutPrefix.length >= 2) value = withoutPrefix
  if (value === '路径') value = '路'
  else if (value.endsWith('路径') && value.length > 2) value = `${value.slice(0, -2)}路`
  for (const suffix of [
    'categories',
    'category',
    'templates',
    'template',
    'algorithms',
    'algorithm',
    '分类',
    '模板',
    '算法',
    '基础',
  ]) {
    if (!value.endsWith(suffix)) continue
    const withoutSuffix = value.slice(0, -suffix.length)
    if (withoutSuffix.length >= 2) {
      value = withoutSuffix
      break
    }
  }
  return value || fallback
}

function compareDirectoryKey(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalDirectoryPath(path: string): string {
  return path.split('/').map(canonicalDirectorySegment).join('/')
}

/**
 * Return a conservative topic key for cross-branch duplicate detection.
 * Numeric variants ("01背包") and problem/topic suffixes ("背包问题")
 * otherwise create separate branches even though they describe the same
 * category.  The key is only used to raise a review issue; it never moves a
 * file by itself.
 */
function directoryTopicKey(segment: string): string {
  return canonicalDirectorySegment(segment).replace(/(?:问题|专题|题型)$/u, '')
}

function isCrossBranchTopicVariant(segment: string): boolean {
  const normalized = segment.normalize('NFKC').trim()
  return /^\d+/u.test(normalized) || /(?:问题|专题|题型)$/u.test(normalized)
}

const ALGORITHM_CATEGORY_SEGMENTS = new Set([
  '动态规划',
  '图论',
  '数据结构',
  '字符串',
  '数学',
  '数值计算',
  '基础算法',
  '搜索',
  '贪心',
  '计算几何',
  '网络流',
])

function keeperScore(directory: string): number {
  const parts = directory.split('/')
  const parent = parts.length > 1 ? (parts[0] ?? '') : ''
  const normalizedParent = canonicalDirectorySegment(parent)
  // A topic folder nested under an algorithm paradigm is the semantically
  // correct home (e.g. 动态规划/01背包), even when a legacy top-level
  // `背包问题` branch contains more files.
  return ALGORITHM_CATEGORY_SEGMENTS.has(normalizedParent) ? 100 : 0
}

function chooseTopicKeeper(directories: readonly string[]): string {
  return [...directories].sort((left, right) => {
    return (
      keeperScore(right) - keeperScore(left) ||
      left.split('/').length - right.split('/').length ||
      left.localeCompare(right)
    )
  })[0]!
}

function directoryPathOf(relativePath: string): string {
  const separator = relativePath.lastIndexOf('/')
  return separator < 0 ? '' : relativePath.slice(0, separator)
}

export interface WorkspaceAuditOptions {
  onProgress?: (progress: {
    currentItem?: string | null
    phase: 'index-check' | 'duplicate-groups' | 'similarity' | 'finalizing'
    processedCount: number
    totalCount: number | null
  }) => void
  signal?: AbortSignal
}

export class TemplateWorkspaceAuditService {
  constructor(
    private readonly metadataRepository: TemplateManagementRepository,
    private readonly workspaceRepository: WorkspaceRepository,
  ) {}

  async auditWorkspace(options: WorkspaceAuditOptions = {}): Promise<WorkspaceAudit> {
    const workspace = this.workspaceRepository.getActiveWorkspace()
    if (!workspace) throw new PublicError('WORKSPACE_REQUIRED', '请先创建或选择模板工作区。')
    const templates = this.workspaceRepository
      .listTemplateIndexEntries(workspace.id)
      .filter(template => template.available)
    const metadata = this.metadataRepository.listMetadataMap(templates.map(template => template.id))
    const issues: WorkspaceAudit['issues'] = []
    let omittedIssueCount = 0
    let pathTruncatedIssueCount = 0
    let categoryPathTruncatedIssueCount = 0
    const addIssue = (issue: WorkspaceAudit['issues'][number]) => {
      if (issues.length < 500) issues.push(issue)
      else omittedIssueCount += 1
    }
    const throwIfCancelled = () => {
      if (options.signal?.aborted) throw new PublicError('TASK_CANCELLED', '后台任务已取消。')
    }
    const pathsByHash = new Map<string, string[]>()
    const indexedSources = templates.flatMap(template => {
      const signature = parseSimilaritySignature(template.similaritySignatureJson)
      return signature && template.normalizedContentHash ? [{ signature, template }] : []
    })
    for (let index = 0; index < templates.length; index += 1) {
      throwIfCancelled()
      const template = templates[index]!
      const templateMetadata = metadata.get(template.id) ?? null
      if (!templateMetadata) {
        addIssue({
          detail: '算法卡片尚未补充结构化元数据。',
          id: randomUUID(),
          kind: 'missing-metadata',
          paths: [template.relativePath],
          severity: 'info',
        })
      }
      const fileNameIssue = analyzeTemplateFileName(template.fileName)
      if (fileNameIssue) {
        addIssue({
          detail: fileNameIssue.detail,
          id: randomUUID(),
          kind: 'invalid-name',
          paths: [template.relativePath],
          severity: 'warning',
        })
      }
      if (template.sizeBytes === 0) {
        addIssue({
          detail: '模板文件为空。',
          id: randomUUID(),
          kind: 'empty-file',
          paths: [template.relativePath],
          severity: 'warning',
        })
      }
      if (template.normalizedContentHash) {
        const paths = pathsByHash.get(template.normalizedContentHash) ?? []
        paths.push(template.relativePath)
        pathsByHash.set(template.normalizedContentHash, paths)
      }
      options.onProgress?.({
        currentItem: template.relativePath.slice(0, 500),
        phase: 'index-check',
        processedCount: index + 1,
        totalCount: templates.length,
      })
    }

    // Detect semantically duplicated directory branches introduced by
    // independent batch classifications.  This is intentionally local and
    // conservative: only equivalent canonical segment chains are grouped,
    // and the shortest/most-used existing branch is kept as the destination.
    const templatesByDirectory = new Map<string, typeof templates>()
    for (const template of templates) {
      const directory = directoryPathOf(template.relativePath)
      if (!directory) continue
      const segments = directory.split('/')
      for (let depth = 1; depth <= segments.length; depth += 1) {
        const ancestor = segments.slice(0, depth).join('/')
        const entries = templatesByDirectory.get(ancestor) ?? []
        entries.push(template)
        templatesByDirectory.set(ancestor, entries)
      }
    }
    const directoriesByCanonical = new Map<string, string[]>()
    for (const directory of [...templatesByDirectory.keys()].sort()) {
      const separator = directory.lastIndexOf('/')
      const parent = separator < 0 ? '' : directory.slice(0, separator)
      const segment = separator < 0 ? directory : directory.slice(separator + 1)
      const canonical = `${canonicalDirectoryPath(parent)}\u0000${canonicalDirectorySegment(segment)}`
      const paths = directoriesByCanonical.get(canonical) ?? []
      paths.push(directory)
      directoriesByCanonical.set(canonical, paths)
    }
    // Alias-based grouping catches cross-parent branches such as
    // “背包问题” vs “动态规划/背包” and “搜索算法” vs “基础算法/搜索”.
    // Only exact taxonomy aliases are considered; unknown folders remain untouched.
    for (const directory of [...templatesByDirectory.keys()].sort()) {
      const candidates = taxonomyAliasCandidates(directory)
      const leafCandidates = taxonomyAliasCandidates(directory.split('/').at(-1) ?? '')
      if (candidates.length !== 1 && leafCandidates.length !== 1) continue
      const match = resolveCanonicalDirectory(directory)
      if (!match) continue
      const key = `taxonomy:${match.category.categoryId}`
      const paths = directoriesByCanonical.get(key) ?? []
      paths.push(directory)
      directoriesByCanonical.set(key, paths)
    }
    const coveredAffectedPaths = new Set<string>()
    for (const [, directories] of [...directoriesByCanonical.entries()].sort(([left], [right]) =>
      compareDirectoryKey(left, right),
    )) {
      const distinctDirectories = [...new Set(directories)].filter(
        directory =>
          !directories.some(other => other !== directory && directory.startsWith(`${other}/`)),
      )
      if (distinctDirectories.length < 2) continue
      const ordered = [...distinctDirectories].sort((left, right) => {
        const leftCount = templatesByDirectory.get(left)?.length ?? 0
        const rightCount = templatesByDirectory.get(right)?.length ?? 0
        return (
          rightCount - leftCount || left.length - right.length || compareDirectoryKey(left, right)
        )
      })
      const keeper = ordered[0]!
      const affectedPaths = [
        ...new Set(
          ordered
            .slice(1)
            .flatMap(directory => templatesByDirectory.get(directory) ?? [])
            .map(template => template.relativePath)
            .filter(path => !coveredAffectedPaths.has(path)),
        ),
      ].sort((left, right) => compareDirectoryKey(left, right))
      if (affectedPaths.length === 0) continue
      for (const path of affectedPaths) coveredAffectedPaths.add(path)
      const shownPaths = affectedPaths.slice(0, 20)
      const shownDirectories = ordered.slice(0, 4).join('、')
      const detail = `目录分类疑似重复（${shownDirectories}${ordered.length > 4 ? ' 等' : ''}）；建议统一到 ${keeper}，AI 将根据源码与元数据重新规划子目录。`
      addIssue({
        detail: detail.length <= 500 ? detail : `${detail.slice(0, 499)}…`,
        id: randomUUID(),
        kind: 'path-inconsistency',
        pathCount: affectedPaths.length,
        paths: shownPaths,
        pathsTruncated: affectedPaths.length > shownPaths.length,
        severity: 'warning',
      })
      if (affectedPaths.length > shownPaths.length) categoryPathTruncatedIssueCount += 1
    }

    // Also detect the common cross-branch shape produced by independent AI
    // classifications, for example `背包问题/` next to
    // `动态规划/01背包/`.  The existing parent-aware check intentionally
    // misses this because the parents differ.  Restrict this pass to explicit
    // numeric/problem variants so broad categories such as `图论/最短路` are
    // not flattened merely because a similarly named top-level folder exists.
    const topicDirectories = new Map<string, string[]>()
    for (const directory of templatesByDirectory.keys()) {
      const segment = directory.slice(directory.lastIndexOf('/') + 1)
      if (!isCrossBranchTopicVariant(segment)) continue
      const topic = directoryTopicKey(segment)
      if (topic.length < 2) continue
      const paths = topicDirectories.get(topic) ?? []
      paths.push(directory)
      topicDirectories.set(topic, paths)
    }
    for (const [topic, directories] of topicDirectories) {
      const distinctDirectories = [...new Set(directories)]
      const matching = distinctDirectories.filter(directory => {
        const segment = directory.slice(directory.lastIndexOf('/') + 1)
        return directoryTopicKey(segment) === topic
      })
      if (matching.length < 2) continue
      const keeper = chooseTopicKeeper(matching)
      const ordered = [keeper, ...matching.filter(directory => directory !== keeper)]
      const affectedPaths = ordered
        .slice(1)
        .flatMap(directory => templatesByDirectory.get(directory) ?? [])
        .map(template => template.relativePath)
        .filter(path => !coveredAffectedPaths.has(path))
        .sort((left, right) => left.localeCompare(right))
      if (affectedPaths.length === 0) continue
      for (const path of affectedPaths) coveredAffectedPaths.add(path)
      const shownPaths = affectedPaths.slice(0, 20)
      addIssue({
        detail: `目录分类疑似重复（${ordered.slice(0, 4).join('、')}）；建议统一到 ${keeper}，AI 将根据源码与元数据重新规划子目录。`,
        id: randomUUID(),
        kind: 'path-inconsistency',
        pathCount: affectedPaths.length,
        paths: shownPaths,
        pathsTruncated: affectedPaths.length > shownPaths.length,
        severity: 'warning',
      })
      if (affectedPaths.length > shownPaths.length) categoryPathTruncatedIssueCount += 1
    }
    for (const paths of pathsByHash.values()) {
      if (paths.length > 1) {
        const ordered = [...paths].sort((left, right) => {
          const leftNameIssue = analyzeTemplateFileName(basename(left)) ? 1 : 0
          const rightNameIssue = analyzeTemplateFileName(basename(right)) ? 1 : 0
          return (
            leftNameIssue - rightNameIssue ||
            left.length - right.length ||
            compareDirectoryKey(left, right)
          )
        })
        addIssue({
          detail: `这些模板源码规范化后完全相同；建议仅保留 ${ordered[0]}。`,
          id: randomUUID(),
          kind: 'duplicate-content',
          pathCount: ordered.length,
          paths: ordered.slice(0, 20),
          pathsTruncated: ordered.length > 20,
          severity: 'warning',
        })
        if (ordered.length > 20) pathTruncatedIssueCount += 1
      }
    }
    options.onProgress?.({
      currentItem: null,
      phase: 'duplicate-groups',
      processedCount: pathsByHash.size,
      totalCount: pathsByHash.size,
    })
    const exactDuplicatePaths = new Set(
      [...pathsByHash.values()].filter(paths => paths.length > 1).flat(),
    )
    const parent = indexedSources.map((_, index) => index)
    const find = (index: number): number => {
      let current = index
      while (parent[current]! !== current) {
        parent[current] = parent[parent[current]!]!
        current = parent[current]!
      }
      return current
    }
    const union = (left: number, right: number) => {
      const leftRoot = find(left)
      const rightRoot = find(right)
      if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot
    }
    const candidateBuckets = new Map<string, number[]>()
    for (let index = 0; index < indexedSources.length; index += 1) {
      const source = indexedSources[index]!
      if (exactDuplicatePaths.has(source.template.relativePath)) continue
      for (const key of similarityCandidateKeys(
        source.template.extension.toLocaleLowerCase('en-US'),
        source.signature,
      )) {
        const bucket = candidateBuckets.get(key) ?? []
        bucket.push(index)
        candidateBuckets.set(key, bucket)
      }
    }
    const candidatePairs = new Set<string>()
    let candidatePairsTruncated = false
    for (const bucket of candidateBuckets.values()) {
      for (let left = 0; left < bucket.length; left += 1) {
        for (let right = left + 1; right < bucket.length; right += 1) {
          const leftIndex = bucket[left]!
          const rightIndex = bucket[right]!
          const key =
            leftIndex < rightIndex ? `${leftIndex}:${rightIndex}` : `${rightIndex}:${leftIndex}`
          candidatePairs.add(key)
          if (candidatePairs.size >= MAX_SIMILARITY_CANDIDATE_PAIRS) {
            candidatePairsTruncated = true
            break
          }
        }
        if (candidatePairsTruncated) break
      }
      if (candidatePairsTruncated) break
    }
    const normalizedSourceCache = new Map<string, Set<string> | null>()
    const readShingles = async (path: string): Promise<Set<string> | null> => {
      if (normalizedSourceCache.has(path)) return normalizedSourceCache.get(path) ?? null
      try {
        const resolved = await resolveAuthorizedFile(workspace.rootPath, path)
        if (resolved.sizeBytes > MAX_SOURCE_BYTES) return null
        const normalized = normalizeSourceForComparison(
          decodeTemplateSourceBuffer(await readFile(resolved.absolutePath)).content,
        )
        const shingles = normalized ? sourceShingles(normalized) : null
        normalizedSourceCache.set(path, shingles)
        return shingles
      } catch {
        normalizedSourceCache.set(path, null)
        return null
      }
    }
    let comparedPairs = 0
    for (const pair of candidatePairs) {
      throwIfCancelled()
      const separator = pair.indexOf(':')
      const leftIndex = Number(pair.slice(0, separator))
      const rightIndex = Number(pair.slice(separator + 1))
      if (!Number.isInteger(leftIndex) || !Number.isInteger(rightIndex)) continue
      const leftSource = indexedSources[leftIndex]!
      const rightSource = indexedSources[rightIndex]!
      const lengthRatio =
        Math.min(leftSource.signature.normalizedLength, rightSource.signature.normalizedLength) /
        Math.max(leftSource.signature.normalizedLength, rightSource.signature.normalizedLength)
      if (lengthRatio >= 0.72) {
        const [leftShingles, rightShingles] = await Promise.all([
          readShingles(leftSource.template.relativePath),
          readShingles(rightSource.template.relativePath),
        ])
        if (leftShingles && rightShingles && jaccard(leftShingles, rightShingles) >= 0.82) {
          union(leftIndex, rightIndex)
        }
      }
      comparedPairs += 1
      options.onProgress?.({
        currentItem:
          `${leftSource.template.relativePath} ↔ ${rightSource.template.relativePath}`.slice(
            0,
            500,
          ),
        phase: 'similarity',
        processedCount: comparedPairs,
        totalCount: candidatePairs.size,
      })
      if (comparedPairs % 64 === 0) await new Promise<void>(resolve => setImmediate(resolve))
    }
    const similarGroups = new Map<number, string[]>()
    for (let index = 0; index < indexedSources.length; index += 1) {
      const source = indexedSources[index]!
      if (exactDuplicatePaths.has(source.template.relativePath)) continue
      const root = find(index)
      const paths = similarGroups.get(root) ?? []
      paths.push(source.template.relativePath)
      similarGroups.set(root, paths)
    }
    for (const paths of similarGroups.values()) {
      if (paths.length < 2) continue
      const ordered = [...paths].sort(
        (left, right) => left.length - right.length || compareDirectoryKey(left, right),
      )
      addIssue({
        detail: `这些模板源码高度相似；建议仅保留 ${ordered[0]}，执行前请查看源码确认。`,
        id: randomUUID(),
        kind: 'similar-content',
        pathCount: ordered.length,
        paths: ordered.slice(0, 20),
        pathsTruncated: ordered.length > 20,
        severity: 'warning',
      })
      if (ordered.length > 20) pathTruncatedIssueCount += 1
    }
    const staleRelationPaths = this.metadataRepository.listStaleTemplateRelationPaths(workspace.id)
    for (let index = 0; index < staleRelationPaths.length; index += 20) {
      const paths = staleRelationPaths.slice(index, index + 20)
      addIssue({
        detail: '题目关系仍指向当前不可用的模板；可撤销对应删除操作或手动解除关系。',
        id: randomUUID(),
        kind: 'stale-relation',
        pathCount: paths.length,
        paths,
        pathsTruncated: false,
        severity: 'warning',
      })
    }
    options.onProgress?.({
      currentItem: null,
      phase: 'finalizing',
      processedCount: templates.length,
      totalCount: templates.length,
    })
    const missingIndexCount = templates.filter(
      template =>
        template.sizeBytes > 0 &&
        template.sizeBytes <= MAX_SOURCE_BYTES &&
        (!template.normalizedContentHash ||
          !parseSimilaritySignature(template.similaritySignatureJson)),
    ).length
    const truncationReasons = [
      missingIndexCount > 0 ? '部分模板缺少可用的相似度索引；请重新扫描后再次审计。' : null,
      candidatePairsTruncated ? '高相似候选过多，已停止继续比较以保持应用可响应。' : null,
      pathTruncatedIssueCount > 0
        ? `${pathTruncatedIssueCount} 个重复或相似组的路径超过 20 条，已在组内明确标记截断。`
        : null,
      categoryPathTruncatedIssueCount > 0
        ? `${categoryPathTruncatedIssueCount} 个重复分类组的路径超过 20 条，已在组内明确标记截断。`
        : null,
      omittedIssueCount > 0 ? '还有更多建议未在当前结果中展开。' : null,
    ].filter((value): value is string => Boolean(value))
    return {
      generatedAt: new Date().toISOString(),
      issues,
      nextAction:
        truncationReasons.length > 0 ? '重新扫描后再次审计，或按顶层目录缩小处理范围。' : null,
      processedCount: templates.length,
      templateCount: templates.length,
      totalCount: templates.length,
      truncated: truncationReasons.length > 0,
      truncatedReason: truncationReasons.length > 0 ? truncationReasons.join('\n') : null,
    }
  }
}
