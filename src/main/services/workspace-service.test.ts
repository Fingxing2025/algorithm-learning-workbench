// @vitest-environment node

import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { TemplateMetadataFields } from '@core/contracts/template-management'
import type { TemplatePage, TemplateSummary } from '@core/contracts/workspace'

import type { TemplateManagementRepository } from '../database/template-management-repository'
import type { WorkspaceRecord, WorkspaceRepository } from '../database/workspace-repository'
import type { TemplateIndexEntry } from './template-scanner'
import { WorkspaceService } from './workspace-service'

const templateId = 'a'.repeat(64)
const metadataFields: TemplateMetadataFields = {
  commonMistakes: '',
  constraints: '',
  notes: 'source-edit-metadata-fixture',
  prerequisites: '',
  solves: '',
  spaceComplexity: null,
  tags: ['fixture'],
  timeComplexity: null,
}

class MemoryWorkspaceRepository {
  failNextPublication = false
  readonly workspace: WorkspaceRecord
  template: TemplateSummary & { available: boolean }

  constructor(rootPath: string) {
    this.workspace = {
      caseConflictCount: 0,
      createdAt: new Date(0).toISOString(),
      id: '50000000-0000-4000-8000-000000000001',
      issuesJson: '[]',
      name: 'workspace',
      rootPath,
      scanStatsJson: '{}',
      scanTruncated: false,
      scannedAt: new Date(0).toISOString(),
      skippedSymlinkCount: 0,
      templateCount: 1,
      unsupportedFileCount: 0,
    }
    this.template = {
      available: true,
      extension: '.cpp',
      fileName: 'stable.cpp',
      id: templateId,
      language: 'C++',
      modifiedAt: new Date(0).toISOString(),
      name: 'stable',
      relativePath: 'stable.cpp',
      sizeBytes: 27,
    }
  }

  applyTemplateScan(
    _workspaceId: string,
    rows: TemplateIndexEntry[],
    _summary: unknown,
    _stats: unknown,
    scannedAt: string,
  ) {
    if (this.failNextPublication) {
      this.failNextPublication = false
      throw new Error('injected index publication failure')
    }
    const row = rows.find(item => item.id === templateId)
    if (row) {
      this.template = {
        available: true,
        extension: row.extension,
        fileName: row.fileName,
        id: row.id,
        language: row.language,
        modifiedAt: row.modifiedAt,
        name: row.name,
        relativePath: row.relativePath,
        sizeBytes: row.sizeBytes,
      }
    }
    this.workspace.scannedAt = scannedAt
    this.workspace.templateCount = rows.length
  }

  getActiveWorkspace() {
    return this.workspace
  }

  getTemplateSummary(workspaceId: string, id: string) {
    return workspaceId === this.workspace.id && id === this.template.id && this.template.available
      ? this.template
      : undefined
  }

  getTemplateWithWorkspace(id: string) {
    return id === this.template.id
      ? { template: this.template, workspace: this.workspace }
      : undefined
  }

  listTemplateIndexEntries() {
    return []
  }

  listTemplatesPage(): TemplatePage {
    return {
      items: this.template.available ? [this.template] : [],
      nextAction: null,
      nextCursor: null,
      processedCount: this.template.available ? 1 : 0,
      totalCount: this.template.available ? 1 : 0,
      truncated: false,
      truncatedReason: null,
    }
  }

  parseSummary() {
    return {
      caseConflictCount: 0,
      issues: [],
      skippedSymlinkCount: 0,
      templateCount: this.template.available ? 1 : 0,
      truncated: false,
      unsupportedFileCount: 0,
    }
  }
}

class MemoryMetadataRepository {
  relationCount = 1
  metadata = new Map<string, TemplateMetadataFields>()

  countTemplateRelations(id: string) {
    return id === templateId ? this.relationCount : 0
  }

  getMetadata(id: string) {
    const value = this.metadata.get(id)
    return value ? { ...value, templateId: id, updatedAt: new Date().toISOString() } : null
  }

  upsertMetadata(id: string, fields: TemplateMetadataFields) {
    this.metadata.set(id, fields)
    return this.getMetadata(id)!
  }
}

describe('WorkspaceService template source editing', () => {
  let metadataRepository: MemoryMetadataRepository
  let repository: MemoryWorkspaceRepository
  let service: WorkspaceService
  let sourcePath: string
  let temporaryRoot: string
  let userDataPath: string
  let workspaceRoot: string

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'algorithm-workbench-source-edit-'))
    userDataPath = join(temporaryRoot, 'user-data')
    workspaceRoot = join(temporaryRoot, 'workspace')
    await mkdir(userDataPath)
    await mkdir(workspaceRoot)
    sourcePath = join(workspaceRoot, 'stable.cpp')
    await writeFile(sourcePath, 'int stable() { return 1; }\n', 'utf8')
    repository = new MemoryWorkspaceRepository(workspaceRoot)
    metadataRepository = new MemoryMetadataRepository()
    service = new WorkspaceService(
      repository as unknown as WorkspaceRepository,
      metadataRepository as unknown as TemplateManagementRepository,
      userDataPath,
    )
  })

  afterEach(async () => {
    await rm(temporaryRoot, { force: true, recursive: true })
  })

  it('previews without writing, applies atomically, and preserves stable metadata and relations', async () => {
    metadataRepository.upsertMetadata(templateId, metadataFields)
    const preview = await service.previewTemplateSourceEdit({
      content: 'int stable() { return 2; }\n',
      templateId,
    })

    expect(await readFile(sourcePath, 'utf8')).toBe('int stable() { return 1; }\n')
    expect(preview.diff.before).toContain('return 1')
    expect(preview.diff.after).toContain('return 2')
    const result = await service.applyTemplateSourceEdit({
      confirmed: true,
      previewId: preview.previewId,
    })

    expect(await readFile(sourcePath, 'utf8')).toBe('int stable() { return 2; }\n')
    expect(result.source).toMatchObject({ id: templateId, relativePath: 'stable.cpp' })
    expect(result.workspace.templates[0]?.id).toBe(templateId)
    expect(metadataRepository.getMetadata(templateId)?.notes).toBe(metadataFields.notes)
    expect(metadataRepository.countTemplateRelations(templateId)).toBe(1)
  })

  it('rejects an external modification after preview without overwriting it', async () => {
    const preview = await service.previewTemplateSourceEdit({
      content: 'int stable() { return 2; }\n',
      templateId,
    })
    await writeFile(sourcePath, 'int changed_outside() { return 9; }\n', 'utf8')

    await expect(
      service.applyTemplateSourceEdit({ confirmed: true, previewId: preview.previewId }),
    ).rejects.toMatchObject({ code: 'FILE_UNAVAILABLE' })
    expect(await readFile(sourcePath, 'utf8')).toBe('int changed_outside() { return 9; }\n')
  })

  it('rejects NUL, byte-size overflow, and a symlink swapped in after indexing', async () => {
    await expect(
      service.previewTemplateSourceEdit({ content: 'int main() {}\0binary', templateId }),
    ).rejects.toMatchObject({ code: 'FILE_UNAVAILABLE' })
    await expect(
      service.previewTemplateSourceEdit({ content: '你'.repeat(800_000), templateId }),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })

    const outsidePath = join(temporaryRoot, 'outside.cpp')
    await writeFile(outsidePath, 'int outside;\n', 'utf8')
    await unlink(sourcePath)
    await symlink(outsidePath, sourcePath)
    await expect(
      service.previewTemplateSourceEdit({ content: 'int replacement;\n', templateId }),
    ).rejects.toMatchObject({ code: 'PATH_NOT_AUTHORIZED' })
  })

  it('restores the original file when index publication fails after replacement', async () => {
    metadataRepository.upsertMetadata(templateId, metadataFields)
    const preview = await service.previewTemplateSourceEdit({
      content: 'int stable() { return 3; }\n',
      templateId,
    })
    repository.failNextPublication = true

    await expect(
      service.applyTemplateSourceEdit({ confirmed: true, previewId: preview.previewId }),
    ).rejects.toMatchObject({ code: 'FILE_UNAVAILABLE' })
    expect(await readFile(sourcePath, 'utf8')).toBe('int stable() { return 1; }\n')
    expect(metadataRepository.getMetadata(templateId)?.notes).toBe(metadataFields.notes)
    expect((await service.readTemplateSource(templateId)).id).toBe(templateId)
  })
})
