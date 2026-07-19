import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PublicError } from '../errors/public-error'
import { buildSimilaritySignature } from './template-content-index'
import { TemplateManagementService } from './template-management-service'
import type { TemplateIndexEntry } from './template-scanner'

function createTemplate(
  workspaceId: string,
  relativePath: string,
  normalizedContentHash: string,
): TemplateIndexEntry {
  const id = `${workspaceId}-${relativePath}`.padEnd(64, '0').slice(0, 64)
  return {
    available: true,
    changeKind: 'unchanged',
    changeToken: 'token',
    contentHash: normalizedContentHash,
    extension: '.cpp',
    fileIdentity: null,
    fileName: relativePath.split('/').at(-1) ?? relativePath,
    id,
    indexVersion: 1,
    language: 'C++',
    modifiedAt: new Date(0).toISOString(),
    name: relativePath,
    normalizedContentHash,
    relativePath,
    similaritySignatureJson: JSON.stringify(buildSimilaritySignature('int a')),
    sizeBytes: 12,
  }
}

function createService(rootPath: string, templates: TemplateIndexEntry[]) {
  const workspace = { id: 'workspace-1', rootPath }
  const workspaceRepository = {
    getActiveWorkspace: () => workspace,
    listTemplateIndexEntries: () => templates,
  }
  const metadataRepository = {
    listMetadataMap: () => new Map(),
  }
  return new TemplateManagementService(
    {} as never,
    metadataRepository as never,
    workspaceRepository as never,
    {} as never,
    rootPath,
    {} as never,
    {} as never,
  )
}

describe('TemplateManagementService feature contracts', () => {
  it('reports normalized duplicate source groups with a deterministic keeper', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'template-management-service-'))
    try {
      await writeFile(join(rootPath, 'a.cpp'), 'int a;\n')
      await writeFile(join(rootPath, 'copy.cpp'), 'int a;\n')
      const service = createService(rootPath, [
        createTemplate('a', 'copy.cpp', 'same-hash'),
        createTemplate('b', 'a.cpp', 'same-hash'),
      ])

      const audit = await service.auditWorkspace()

      expect(audit.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'duplicate-content',
            paths: ['a.cpp', 'copy.cpp'],
          }),
        ]),
      )
      expect(audit.truncated).toBe(false)
      expect(audit.processedCount).toBe(2)
    } finally {
      await rm(rootPath, { force: true, recursive: true })
    }
  })

  it('stops audit work before publishing results when cancelled', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'template-management-service-'))
    try {
      const service = createService(rootPath, [createTemplate('a', 'a.cpp', 'hash')])
      const controller = new AbortController()
      controller.abort()

      await expect(service.auditWorkspace({ signal: controller.signal })).rejects.toMatchObject({
        code: 'TASK_CANCELLED',
      } satisfies Partial<PublicError>)
    } finally {
      await rm(rootPath, { force: true, recursive: true })
    }
  })
})
