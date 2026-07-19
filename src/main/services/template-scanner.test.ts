// @vitest-environment node

import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { PublicError } from '../errors/public-error'
import {
  scanTemplateWorkspace,
  type PreviousTemplateIndexEntry,
  type TemplateScanResult,
} from './template-scanner'

function previousEntries(result: TemplateScanResult): PreviousTemplateIndexEntry[] {
  return result.templates.map(template => {
    const { changeKind, ...entry } = template
    void changeKind
    return entry
  })
}

function withoutChangeKinds(result: TemplateScanResult): PreviousTemplateIndexEntry[] {
  return previousEntries(result)
}

describe('scanTemplateWorkspace', () => {
  let temporaryDirectory: string
  let workspaceRoot: string

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'algorithm-template-scan-'))
    workspaceRoot = join(temporaryDirectory, 'workspace')
    await mkdir(join(workspaceRoot, '基础算法', '搜索', 'BFS'), { recursive: true })
    await mkdir(join(workspaceRoot, 'node_modules'), { recursive: true })
    await writeFile(
      join(workspaceRoot, '基础算法', '搜索', 'BFS', 'bfs.cpp'),
      'void bfs() {}',
      'utf8',
    )
    await writeFile(join(workspaceRoot, 'dfs.py'), 'def dfs():\n    pass\n', 'utf8')
    await writeFile(join(workspaceRoot, 'README.md'), '# ignored', 'utf8')
    await writeFile(join(workspaceRoot, 'node_modules', 'ignored.ts'), 'export {}', 'utf8')
    await writeFile(join(temporaryDirectory, 'outside.cpp'), 'outside', 'utf8')
    await symlink(join(temporaryDirectory, 'outside.cpp'), join(workspaceRoot, 'linked.cpp'))
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { force: true, recursive: true })
  })

  it('builds a deterministic read-only source index and skips unsafe entries', async () => {
    const sourcePath = join(workspaceRoot, '基础算法', '搜索', 'BFS', 'bfs.cpp')
    const before = await readFile(sourcePath, 'utf8')

    const firstScan = await scanTemplateWorkspace(
      workspaceRoot,
      '40000000-0000-4000-8000-000000000001',
    )
    const secondScan = await scanTemplateWorkspace(
      workspaceRoot,
      '40000000-0000-4000-8000-000000000001',
    )

    expect(new Set(firstScan.templates.map(template => template.relativePath))).toEqual(
      new Set(['基础算法/搜索/BFS/bfs.cpp', 'dfs.py']),
    )
    expect(firstScan.summary).toMatchObject({
      skippedSymlinkCount: 1,
      templateCount: 2,
      truncated: false,
      unsupportedFileCount: 1,
    })
    expect(secondScan.templates.map(template => template.id)).toEqual(
      firstScan.templates.map(template => template.id),
    )
    expect(await readFile(sourcePath, 'utf8')).toBe(before)
  })

  it('reuses unchanged hashes and matches a forced full rebuild deterministically', async () => {
    const workspaceId = '40000000-0000-4000-8000-000000000001'
    const first = await scanTemplateWorkspace(workspaceRoot, workspaceId)
    const incremental = await scanTemplateWorkspace(workspaceRoot, workspaceId, {
      previousEntries: previousEntries(first),
    })
    const rebuilt = await scanTemplateWorkspace(workspaceRoot, workspaceId, {
      forceFull: true,
      previousEntries: previousEntries(first),
    })

    expect(incremental.stats).toMatchObject({
      hashedCount: 0,
      reusedCount: 2,
      unchangedCount: 2,
    })
    expect(withoutChangeKinds(incremental)).toEqual(withoutChangeKinds(rebuilt))
  })

  it('detects same-size content changes even when mtime is restored', async () => {
    const workspaceId = '40000000-0000-4000-8000-000000000001'
    const sourcePath = join(workspaceRoot, '基础算法', '搜索', 'BFS', 'bfs.cpp')
    const first = await scanTemplateWorkspace(workspaceRoot, workspaceId)
    const originalStats = await stat(sourcePath)
    await writeFile(sourcePath, 'void dfs() {}', 'utf8')
    await utimes(sourcePath, originalStats.atime, originalStats.mtime)

    const second = await scanTemplateWorkspace(workspaceRoot, workspaceId, {
      previousEntries: previousEntries(first),
    })
    const before = first.templates.find(template => template.relativePath.endsWith('bfs.cpp'))!
    const after = second.templates.find(template => template.relativePath.endsWith('bfs.cpp'))!
    expect(after.id).toBe(before.id)
    expect(after.contentHash).not.toBe(before.contentHash)
    expect(after.changeKind).toBe('modified')
    expect(second.stats).toMatchObject({ hashedCount: 1, modifiedCount: 1, reusedCount: 1 })
  })

  it('preserves stable ids for unique moves and reports deletions', async () => {
    const workspaceId = '40000000-0000-4000-8000-000000000001'
    const first = await scanTemplateWorkspace(workspaceRoot, workspaceId)
    const previous = previousEntries(first)
    const source = join(workspaceRoot, '基础算法', '搜索', 'BFS', 'bfs.cpp')
    const targetDirectory = join(workspaceRoot, '图论', '搜索')
    const target = join(targetDirectory, 'breadth-first.cpp')
    await mkdir(targetDirectory, { recursive: true })
    await rename(source, target)
    await unlink(join(workspaceRoot, 'dfs.py'))

    const second = await scanTemplateWorkspace(workspaceRoot, workspaceId, {
      previousEntries: previous,
    })
    const moved = second.templates.find(
      template => template.relativePath === '图论/搜索/breadth-first.cpp',
    )!
    expect(moved.id).toBe(
      first.templates.find(template => template.relativePath.endsWith('bfs.cpp'))!.id,
    )
    expect(second.stats).toMatchObject({ movedCount: 1, removedCount: 1 })
  })

  it('cancels before publication and rejects files that change while being read', async () => {
    const workspaceId = '40000000-0000-4000-8000-000000000001'
    const controller = new AbortController()
    controller.abort()
    await expect(
      scanTemplateWorkspace(workspaceRoot, workspaceId, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'TASK_CANCELLED' })

    const target = join(workspaceRoot, 'dfs.py')
    let injected = false
    await expect(
      scanTemplateWorkspace(workspaceRoot, workspaceId, {
        beforeContentRead: async relativePath => {
          if (injected || relativePath !== 'dfs.py') return
          injected = true
          await writeFile(target, 'def changed():\n    return True\n', 'utf8')
        },
      }),
    ).rejects.toSatisfy(
      error => error instanceof PublicError && error.code === 'SCAN_CHANGED_DURING_RUN',
    )
  })
})
