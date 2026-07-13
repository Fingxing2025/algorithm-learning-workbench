// @vitest-environment node

import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scanTemplateWorkspace } from './template-scanner'

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
})
