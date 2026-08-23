// @vitest-environment node

import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveAuthorizedFile } from './path-guard'

describe('resolveAuthorizedFile', () => {
  let temporaryDirectory: string
  let workspaceRoot: string

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'algorithm-path-guard-'))
    workspaceRoot = join(temporaryDirectory, 'workspace')
    await mkdir(workspaceRoot)
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { force: true, recursive: true })
  })

  it('allows a regular file inside the authorized root', async () => {
    const sourcePath = join(workspaceRoot, 'bfs.cpp')
    await writeFile(sourcePath, 'void bfs() {}', 'utf8')
    const canonicalSourcePath = await realpath(sourcePath)

    await expect(resolveAuthorizedFile(workspaceRoot, 'bfs.cpp')).resolves.toMatchObject({
      absolutePath: canonicalSourcePath,
      sizeBytes: 13,
    })
  })

  it('rejects lexical traversal outside the authorized root', async () => {
    await expect(resolveAuthorizedFile(workspaceRoot, '../outside.cpp')).rejects.toMatchObject({
      code: 'PATH_NOT_AUTHORIZED',
    })
  })

  it('rejects a symlink even when its visible path is inside the root', async () => {
    const outsidePath = join(temporaryDirectory, 'outside.cpp')
    await writeFile(outsidePath, 'secret', 'utf8')
    await symlink(outsidePath, join(workspaceRoot, 'linked.cpp'))

    await expect(resolveAuthorizedFile(workspaceRoot, 'linked.cpp')).rejects.toMatchObject({
      code: 'PATH_NOT_AUTHORIZED',
    })
  })
})
