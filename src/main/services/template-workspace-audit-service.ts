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
import { MAX_SIMILARITY_CANDIDATE_PAIRS, MAX_SOURCE_BYTES } from './template-management-constants'

export interface WorkspaceAuditOptions {
  onProgress?: (progress: {
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
      if (!metadata.has(template.id)) {
        addIssue({
          detail: '算法卡片尚未补充结构化元数据。',
          id: randomUUID(),
          kind: 'missing-metadata',
          paths: [template.relativePath],
          severity: 'info',
        })
      }
      if (/\s|副本|copy(?:\s|\(|_|\d)/i.test(template.fileName)) {
        addIssue({
          detail: '文件名可能包含副本标记或不一致空格，建议人工确认命名。',
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
        phase: 'index-check',
        processedCount: index + 1,
        totalCount: templates.length,
      })
    }
    for (const paths of pathsByHash.values()) {
      if (paths.length > 1) {
        const ordered = [...paths].sort((left, right) => {
          const leftCopy = /\s|副本|copy(?:\s|\(|_|\d)/i.test(basename(left)) ? 1 : 0
          const rightCopy = /\s|副本|copy(?:\s|\(|_|\d)/i.test(basename(right)) ? 1 : 0
          return leftCopy - rightCopy || left.length - right.length || left.localeCompare(right)
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
          await readFile(resolved.absolutePath, 'utf8'),
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
        (left, right) => left.length - right.length || left.localeCompare(right),
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
