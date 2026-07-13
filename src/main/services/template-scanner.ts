import { createHash } from 'node:crypto'
import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import { basename, extname, relative, resolve, sep } from 'node:path'

import type { ScanIssue, ScanSummary, TemplateSummary } from '@core/contracts/workspace'

import { PublicError } from '../errors/public-error'
import { isPathInsideRoot, resolveAuthorizedRoot } from '../security/path-guard'

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

export interface TemplateScanResult {
  summary: ScanSummary
  templates: TemplateSummary[]
}

export function getLanguageForExtension(extension: string): string | undefined {
  return languageByExtension[extension.toLowerCase() as keyof typeof languageByExtension]
}

export function createTemplateId(workspaceId: string, relativePath: string): string {
  return createHash('sha256').update(workspaceId).update('\0').update(relativePath).digest('hex')
}

function toPortableRelativePath(rootPath: string, absolutePath: string): string {
  return relative(rootPath, absolutePath).split(sep).join('/')
}

export async function scanTemplateWorkspace(
  rootPath: string,
  workspaceId: string,
): Promise<TemplateScanResult> {
  const canonicalRoot = await resolveAuthorizedRoot(rootPath)
  const templates: TemplateSummary[] = []
  const issues: ScanIssue[] = []
  const caseInsensitivePaths = new Map<string, string>()
  const directories = [{ absolutePath: canonicalRoot, depth: 0 }]
  let caseConflictCount = 0
  let skippedSymlinkCount = 0
  let truncated = false
  let unsupportedFileCount = 0

  const addIssue = (issue: ScanIssue) => {
    if (issues.length < MAX_ISSUES) {
      issues.push(issue)
    }
  }

  while (directories.length > 0 && !truncated) {
    const current = directories.shift()
    if (!current) {
      break
    }

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
        if (entry.name.startsWith('.')) {
          continue
        }

        const absoluteEntryPath = resolve(canonicalDirectory, entry.name)
        if (entry.isSymbolicLink()) {
          skippedSymlinkCount += 1
          continue
        }

        if (entry.isDirectory()) {
          if (skippedDirectoryNames.has(entry.name.toLowerCase())) {
            continue
          }
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

        if (!entry.isFile()) {
          continue
        }

        const entryRelativePath = toPortableRelativePath(canonicalRoot, absoluteEntryPath)
        try {
          const extension = extname(entry.name).toLowerCase()
          const language = getLanguageForExtension(extension)
          if (!language) {
            unsupportedFileCount += 1
            continue
          }

          if (templates.length >= MAX_TEMPLATES) {
            truncated = true
            addIssue({
              kind: 'scan-limit',
              message: `模板数量超过 ${MAX_TEMPLATES}，本次扫描已停止。`,
              relativePath: currentRelativePath,
            })
            break
          }

          const fileLinkStats = await lstat(absoluteEntryPath)
          if (fileLinkStats.isSymbolicLink()) {
            skippedSymlinkCount += 1
            continue
          }
          const canonicalFile = await realpath(absoluteEntryPath)
          if (!isPathInsideRoot(canonicalRoot, canonicalFile)) {
            skippedSymlinkCount += 1
            continue
          }

          const fileStats = await stat(canonicalFile)
          const relativePath = toPortableRelativePath(canonicalRoot, canonicalFile)
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

          templates.push({
            extension,
            fileName: entry.name,
            id: createTemplateId(workspaceId, relativePath),
            language,
            modifiedAt: fileStats.mtime.toISOString(),
            name: basename(entry.name, extension),
            relativePath,
            sizeBytes: fileStats.size,
          })
        } catch {
          addIssue({
            kind: 'unreadable',
            message: '该文件无法读取，已跳过。',
            relativePath: entryRelativePath,
          })
        }
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

  templates.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'zh-CN'))

  return {
    summary: {
      caseConflictCount,
      issues,
      skippedSymlinkCount,
      templateCount: templates.length,
      truncated,
      unsupportedFileCount,
    },
    templates,
  }
}
