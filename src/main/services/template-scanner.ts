import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises'
import { basename, extname, relative, resolve, sep } from 'node:path'

import type { ScanIssue, ScanSummary, TemplateSummary } from '@core/contracts/workspace'

import { PublicError } from '../errors/public-error'
import { isPathInsideRoot, resolveAuthorizedRoot } from '../security/path-guard'
import {
  buildSimilaritySignature,
  MAX_INDEXED_SOURCE_BYTES,
  normalizeSourceForComparison,
  TEMPLATE_INDEX_VERSION,
} from './template-content-index'

const MAX_DEPTH = 24
const MAX_ISSUES = 50
const MAX_TEMPLATES = 20_000

const languageByExtension = {
  '.c': 'C',
  '.cc': 'C++',
  '.cpp': 'C++',
  '.cs': 'C#',
  '.cxx': 'C++',
  '.go': 'Go',
  '.h': 'C/C++ Header',
  '.hpp': 'C++ Header',
  '.java': 'Java',
  '.js': 'JavaScript',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.php': 'PHP',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.rs': 'Rust',
  '.swift': 'Swift',
  '.ts': 'TypeScript',
} as const

const skippedDirectoryNames = new Set([
  '.git',
  '.hg',
  '.idea',
  '.svn',
  '.vscode',
  'build',
  'dist',
  'node_modules',
  'out',
  'release',
])

export type TemplateScanChangeKind = 'added' | 'modified' | 'moved' | 'unchanged'

export interface TemplateIndexEntry extends TemplateSummary {
  available: boolean
  changeKind: TemplateScanChangeKind
  changeToken: string
  contentHash: string
  fileIdentity: string | null
  indexVersion: number
  normalizedContentHash: string | null
  similaritySignatureJson: string | null
}

export type PreviousTemplateIndexEntry = Omit<TemplateIndexEntry, 'changeKind'>

export interface TemplateScanStats {
  addedCount: number
  discoveredCount: number
  hashedCount: number
  modifiedCount: number
  movedCount: number
  processedCount: number
  removedCount: number
  reusedCount: number
  totalCount: number
  unchangedCount: number
}

export interface TemplateScanProgress {
  phase: 'discovering' | 'indexing'
  processedCount: number
  totalCount: number | null
}

export interface TemplateScanOptions {
  beforeContentRead?: (relativePath: string) => Promise<void> | void
  forceFull?: boolean
  onBeforePublish?: () => void
  onProgress?: (progress: TemplateScanProgress) => void
  previousEntries?: readonly PreviousTemplateIndexEntry[]
  signal?: AbortSignal
}

export interface TemplateScanResult {
  stats: TemplateScanStats
  summary: ScanSummary
  templates: TemplateIndexEntry[]
}

interface DiscoveredTemplate {
  absolutePath: string
  entryName: string
  extension: string
  language: string
  relativePath: string
}

interface IndexedContent {
  contentHash: string
  normalizedContentHash: string | null
  similaritySignatureJson: string | null
}

export function getLanguageForExtension(extension: string): string | undefined {
  return languageByExtension[extension.toLowerCase() as keyof typeof languageByExtension]
}

export function createTemplateId(workspaceId: string, relativePath: string): string {
  return createHash('sha256').update(workspaceId).update('\0').update(relativePath).digest('hex')
}

function createCollisionSafeTemplateId(
  workspaceId: string,
  relativePath: string,
  contentHash: string,
  usedIds: Set<string>,
): string {
  const primary = createTemplateId(workspaceId, relativePath)
  if (!usedIds.has(primary)) return primary
  let attempt = 1
  while (true) {
    const candidate = createHash('sha256')
      .update(workspaceId)
      .update('\0')
      .update(relativePath)
      .update('\0')
      .update(contentHash)
      .update('\0')
      .update(String(attempt))
      .digest('hex')
    if (!usedIds.has(candidate)) return candidate
    attempt += 1
  }
}

function toPortableRelativePath(rootPath: string, absolutePath: string): string {
  return relative(rootPath, absolutePath).split(sep).join('/')
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PublicError('TASK_CANCELLED', '后台任务已取消。')
}

async function applyTestScanDelay(signal?: AbortSignal): Promise<void> {
  if (process.env.NODE_ENV !== 'test') return
  const delayMs = Number.parseInt(process.env.E2E_SCAN_DELAY_MS ?? '', 10)
  if (!Number.isInteger(delayMs) || delayMs <= 0) return
  await new Promise<void>(resolve => setTimeout(resolve, Math.min(delayMs, 100)))
  throwIfCancelled(signal)
}

function changeToken(stats: {
  ctimeMs: bigint | number
  ctimeNs?: bigint
  mtimeMs: bigint | number
  mtimeNs?: bigint
  size: bigint | number
}): string {
  return [stats.size, stats.mtimeNs ?? stats.mtimeMs, stats.ctimeNs ?? stats.ctimeMs].join(':')
}

function fileIdentity(stats: { dev: bigint | number; ino: bigint | number }): string | null {
  if (stats.ino === 0 || stats.ino === 0n) return null
  return `${stats.dev}:${stats.ino}`
}

async function hashLargeFile(absolutePath: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(absolutePath, { signal })
  for await (const chunk of stream) {
    throwIfCancelled(signal)
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}

async function indexContent(
  absolutePath: string,
  sizeBytes: number,
  signal?: AbortSignal,
): Promise<IndexedContent> {
  throwIfCancelled(signal)
  if (sizeBytes > MAX_INDEXED_SOURCE_BYTES) {
    return {
      contentHash: await hashLargeFile(absolutePath, signal),
      normalizedContentHash: null,
      similaritySignatureJson: null,
    }
  }
  const content = await readFile(absolutePath, { signal })
  const contentHash = createHash('sha256').update(content).digest('hex')
  if (content.includes(0)) {
    return { contentHash, normalizedContentHash: null, similaritySignatureJson: null }
  }
  const normalized = normalizeSourceForComparison(content.toString('utf8'))
  if (!normalized) {
    return { contentHash, normalizedContentHash: null, similaritySignatureJson: null }
  }
  return {
    contentHash,
    normalizedContentHash: createHash('sha256').update(normalized).digest('hex'),
    similaritySignatureJson: JSON.stringify(buildSimilaritySignature(normalized)),
  }
}

function reusable(previous: PreviousTemplateIndexEntry | undefined, token: string): boolean {
  return Boolean(
    previous &&
    previous.indexVersion === TEMPLATE_INDEX_VERSION &&
    previous.changeToken === token &&
    /^[a-f0-9]{64}$/u.test(previous.contentHash),
  )
}

export async function scanTemplateWorkspace(
  rootPath: string,
  workspaceId: string,
  options: TemplateScanOptions = {},
): Promise<TemplateScanResult> {
  const canonicalRoot = await resolveAuthorizedRoot(rootPath)
  const discovered: DiscoveredTemplate[] = []
  const issues: ScanIssue[] = []
  const caseInsensitivePaths = new Map<string, string>()
  const directories = [{ absolutePath: canonicalRoot, depth: 0 }]
  let caseConflictCount = 0
  let skippedSymlinkCount = 0
  let truncated = false
  let unsupportedFileCount = 0

  const addIssue = (issue: ScanIssue) => {
    if (issues.length < MAX_ISSUES) issues.push(issue)
  }

  while (directories.length > 0 && !truncated) {
    throwIfCancelled(options.signal)
    const current = directories.shift()
    if (!current) break
    const currentRelativePath = toPortableRelativePath(canonicalRoot, current.absolutePath)
    try {
      const currentLinkStats = await lstat(current.absolutePath)
      if (currentLinkStats.isSymbolicLink()) {
        skippedSymlinkCount += 1
        continue
      }
      const canonicalDirectory = await realpath(current.absolutePath)
      if (!isPathInsideRoot(canonicalRoot, canonicalDirectory)) {
        skippedSymlinkCount += 1
        continue
      }
      const entries = await readdir(canonicalDirectory, { withFileTypes: true })
      entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
      for (const entry of entries) {
        throwIfCancelled(options.signal)
        if (entry.name.startsWith('.')) continue
        const absoluteEntryPath = resolve(canonicalDirectory, entry.name)
        if (entry.isSymbolicLink()) {
          skippedSymlinkCount += 1
          continue
        }
        if (entry.isDirectory()) {
          if (skippedDirectoryNames.has(entry.name.toLowerCase())) continue
          if (current.depth >= MAX_DEPTH) {
            addIssue({
              kind: 'depth-limit',
              message: `目录层级超过 ${MAX_DEPTH} 层，已停止继续扫描。`,
              relativePath: toPortableRelativePath(canonicalRoot, absoluteEntryPath),
            })
            continue
          }
          directories.push({ absolutePath: absoluteEntryPath, depth: current.depth + 1 })
          continue
        }
        if (!entry.isFile()) continue
        const extension = extname(entry.name).toLowerCase()
        const language = getLanguageForExtension(extension)
        if (!language) {
          unsupportedFileCount += 1
          continue
        }
        if (discovered.length >= MAX_TEMPLATES) {
          truncated = true
          addIssue({
            kind: 'scan-limit',
            message: `模板数量超过 ${MAX_TEMPLATES}，本次扫描已停止。`,
            relativePath: currentRelativePath,
          })
          break
        }
        const relativePath = toPortableRelativePath(canonicalRoot, absoluteEntryPath)
        const caseKey = relativePath.toLocaleLowerCase('en-US')
        const conflictingPath = caseInsensitivePaths.get(caseKey)
        if (conflictingPath && conflictingPath !== relativePath) {
          caseConflictCount += 1
          addIssue({
            kind: 'case-conflict',
            message: '检测到仅大小写不同的路径，跨平台使用时可能冲突。',
            relativePath,
          })
        } else {
          caseInsensitivePaths.set(caseKey, relativePath)
        }
        discovered.push({
          absolutePath: absoluteEntryPath,
          entryName: entry.name,
          extension,
          language,
          relativePath,
        })
        options.onProgress?.({
          phase: 'discovering',
          processedCount: discovered.length,
          totalCount: null,
        })
      }
    } catch {
      if (current.absolutePath === canonicalRoot) {
        throw new PublicError('SCAN_FAILED', '无法读取该模板工作区，请检查文件夹权限。')
      }
      addIssue({
        kind: 'unreadable',
        message: '该目录无法读取，已跳过。',
        relativePath: currentRelativePath,
      })
    }
  }

  discovered.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'zh-CN'))
  const previousEntries = options.previousEntries ?? []
  const previousByPath = new Map(previousEntries.map(entry => [entry.relativePath, entry]))
  const previousByIdentity = new Map<string, PreviousTemplateIndexEntry[]>()
  for (const entry of previousEntries) {
    if (!entry.available || !entry.fileIdentity) continue
    const entries = previousByIdentity.get(entry.fileIdentity) ?? []
    entries.push(entry)
    previousByIdentity.set(entry.fileIdentity, entries)
  }
  const matchedPreviousIds = new Set<string>()
  const provisional: TemplateIndexEntry[] = []
  let hashedCount = 0
  let reusedCount = 0

  for (let index = 0; index < discovered.length; index += 1) {
    throwIfCancelled(options.signal)
    const item = discovered[index]!
    try {
      const linkStats = await lstat(item.absolutePath)
      if (!linkStats.isFile() || linkStats.isSymbolicLink()) {
        throw new PublicError('SCAN_CHANGED_DURING_RUN', '扫描期间文件状态发生变化，请重试。')
      }
      const canonicalFile = await realpath(item.absolutePath)
      if (!isPathInsideRoot(canonicalRoot, canonicalFile)) {
        throw new PublicError('PATH_NOT_AUTHORIZED', '扫描期间文件越过授权目录，已停止。')
      }
      const before = await stat(canonicalFile, { bigint: true })
      if (!before.isFile()) {
        throw new PublicError('SCAN_CHANGED_DURING_RUN', '扫描期间文件状态发生变化，请重试。')
      }
      const relativePath = toPortableRelativePath(canonicalRoot, canonicalFile)
      if (relativePath !== item.relativePath) {
        throw new PublicError('SCAN_CHANGED_DURING_RUN', '扫描期间文件路径发生变化，请重试。')
      }
      const token = changeToken(before)
      const identity = fileIdentity(before)
      const exactPrevious = previousByPath.get(relativePath)
      const identityCandidates = identity
        ? (previousByIdentity.get(identity) ?? []).filter(
            entry => !matchedPreviousIds.has(entry.id) && !previousByPath.has(relativePath),
          )
        : []
      const identityPrevious = identityCandidates.length === 1 ? identityCandidates[0] : undefined
      const previous = exactPrevious ?? identityPrevious
      const canReuse = !options.forceFull && reusable(previous, token)
      await options.beforeContentRead?.(relativePath)
      await applyTestScanDelay(options.signal)
      const indexed = canReuse
        ? {
            contentHash: previous!.contentHash,
            normalizedContentHash: previous!.normalizedContentHash,
            similaritySignatureJson: previous!.similaritySignatureJson,
          }
        : await indexContent(canonicalFile, Number(before.size), options.signal)
      if (canReuse) reusedCount += 1
      else hashedCount += 1
      const after = await stat(canonicalFile, { bigint: true })
      if (changeToken(after) !== token || fileIdentity(after) !== identity) {
        throw new PublicError('SCAN_CHANGED_DURING_RUN', '扫描期间文件内容发生变化，请重试。')
      }
      if (previous) matchedPreviousIds.add(previous.id)
      provisional.push({
        available: true,
        changeKind: previous
          ? identityPrevious
            ? 'moved'
            : previous.available
              ? canReuse
                ? 'unchanged'
                : 'modified'
              : 'added'
          : 'added',
        changeToken: token,
        contentHash: indexed.contentHash,
        extension: item.extension,
        fileIdentity: identity,
        fileName: item.entryName,
        id: previous?.id ?? '',
        indexVersion: TEMPLATE_INDEX_VERSION,
        language: item.language,
        modifiedAt: before.mtime.toISOString(),
        name: basename(item.entryName, item.extension),
        normalizedContentHash: indexed.normalizedContentHash,
        relativePath,
        similaritySignatureJson: indexed.similaritySignatureJson,
        sizeBytes: Number(before.size),
      })
      options.onProgress?.({
        phase: 'indexing',
        processedCount: index + 1,
        totalCount: discovered.length,
      })
    } catch (error) {
      if (error instanceof PublicError) throw error
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ELOOP') {
        throw new PublicError('SCAN_CHANGED_DURING_RUN', '扫描期间文件状态发生变化，请重试。')
      }
      addIssue({
        kind: 'unreadable',
        message: '该文件无法读取，已跳过。',
        relativePath: item.relativePath,
      })
    }
  }

  const unmatchedPreviousByContent = new Map<string, PreviousTemplateIndexEntry[]>()
  for (const entry of previousEntries) {
    if (!entry.available || matchedPreviousIds.has(entry.id) || !entry.contentHash) continue
    const key = `${entry.sizeBytes}:${entry.contentHash}`
    const entries = unmatchedPreviousByContent.get(key) ?? []
    entries.push(entry)
    unmatchedPreviousByContent.set(key, entries)
  }
  const unmatchedCurrentByContent = new Map<string, TemplateIndexEntry[]>()
  for (const entry of provisional) {
    if (entry.id) continue
    const key = `${entry.sizeBytes}:${entry.contentHash}`
    const entries = unmatchedCurrentByContent.get(key) ?? []
    entries.push(entry)
    unmatchedCurrentByContent.set(key, entries)
  }
  for (const [key, currentEntries] of unmatchedCurrentByContent) {
    const previousMatches = unmatchedPreviousByContent.get(key) ?? []
    if (currentEntries.length !== 1 || previousMatches.length !== 1) continue
    const current = currentEntries[0]!
    const previous = previousMatches[0]!
    current.id = previous.id
    current.changeKind = 'moved'
    matchedPreviousIds.add(previous.id)
  }

  const usedIds = new Set(previousEntries.map(entry => entry.id))
  for (const entry of provisional) {
    if (!entry.id) {
      entry.id = createCollisionSafeTemplateId(
        workspaceId,
        entry.relativePath,
        entry.contentHash,
        usedIds,
      )
    }
    usedIds.add(entry.id)
  }
  const removedCount = previousEntries.filter(
    entry => entry.available && !matchedPreviousIds.has(entry.id),
  ).length
  const stats: TemplateScanStats = {
    addedCount: provisional.filter(entry => entry.changeKind === 'added').length,
    discoveredCount: discovered.length,
    hashedCount,
    modifiedCount: provisional.filter(entry => entry.changeKind === 'modified').length,
    movedCount: provisional.filter(entry => entry.changeKind === 'moved').length,
    processedCount: provisional.length,
    removedCount,
    reusedCount,
    totalCount: discovered.length,
    unchangedCount: provisional.filter(entry => entry.changeKind === 'unchanged').length,
  }
  return {
    stats,
    summary: {
      caseConflictCount,
      issues,
      skippedSymlinkCount,
      templateCount: provisional.length,
      truncated,
      unsupportedFileCount,
    },
    templates: provisional,
  }
}
