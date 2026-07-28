import { describe, expect, it } from 'vitest'

import {
  applyExistingTemplateMetadataCompletionRequestSchema,
  batchImportTemplateRequestSchema,
  deleteFileExecutionsRequestSchema,
  deleteFileExecutionsResultSchema,
  deleteInvalidFileExecutionsRequestSchema,
  invalidFileExecutionDeletionPreviewSchema,
  invalidFileExecutionPageRequestSchema,
  invalidFileExecutionPageSchema,
  previewDeleteFileExecutionsRequestSchema,
  previewDeleteInvalidFileExecutionsRequestSchema,
  fileChangePlanPayloadSchema,
  inspectBatchTemplateImportResultSchema,
  parseStoredFileChangePlanPayload,
  previewExistingTemplateMetadataCompletionRequestSchema,
  previewTemplateClassificationRequestSchema,
} from './template-management'

describe('existing template metadata completion contracts', () => {
  const firstTemplateId = 'a'.repeat(64)
  const secondTemplateId = 'b'.repeat(64)

  it('accepts distinct current-workspace selections and rejects duplicates or oversized batches', () => {
    expect(
      previewExistingTemplateMetadataCompletionRequestSchema.parse({
        outputLanguage: 'zh-CN',
        templateIds: [firstTemplateId, secondTemplateId],
      }).templateIds,
    ).toEqual([firstTemplateId, secondTemplateId])
    expect(() =>
      previewExistingTemplateMetadataCompletionRequestSchema.parse({
        outputLanguage: 'zh-CN',
        templateIds: [firstTemplateId, firstTemplateId],
      }),
    ).toThrow()
    expect(() =>
      previewExistingTemplateMetadataCompletionRequestSchema.parse({
        outputLanguage: 'zh-CN',
        templateIds: Array.from({ length: 21 }, (_, index) => index.toString(16).padStart(64, '0')),
      }),
    ).toThrow()
  })

  it('requires explicit confirmation and distinct fields for each selected template', () => {
    expect(
      applyExistingTemplateMetadataCompletionRequestSchema.parse({
        confirmed: true,
        draftId: '40000000-0000-4000-8000-000000000020',
        selections: [{ fields: ['solves', 'tags'], templateId: firstTemplateId }],
      }).selections[0]?.fields,
    ).toEqual(['solves', 'tags'])
    expect(() =>
      applyExistingTemplateMetadataCompletionRequestSchema.parse({
        confirmed: true,
        draftId: '40000000-0000-4000-8000-000000000020',
        selections: [{ fields: ['solves', 'solves'], templateId: firstTemplateId }],
      }),
    ).toThrow()
  })
})

describe('template AI draft contracts', () => {
  const request = {
    content: 'void template_source() {}',
    fileName: 'template.cpp',
    metadata: {
      commonMistakes: '',
      constraints: '',
      notes: '',
      prerequisites: '',
      solves: '',
      spaceComplexity: null,
      tags: [],
      timeComplexity: null,
    },
    outputLanguage: 'zh-CN',
  } as const

  it('accepts a plain optional draft file name but rejects absolute or nested paths', () => {
    expect(previewTemplateClassificationRequestSchema.parse(request).fileName).toBe('template.cpp')
    expect(
      previewTemplateClassificationRequestSchema.parse({ ...request, fileName: '' }).fileName,
    ).toBe('')
    expect(() =>
      previewTemplateClassificationRequestSchema.parse({
        ...request,
        fileName: '/private/project/template.cpp',
      }),
    ).toThrow()
    expect(() =>
      previewTemplateClassificationRequestSchema.parse({
        ...request,
        fileName: 'directory/template.cpp',
      }),
    ).toThrow()
    expect(() =>
      previewTemplateClassificationRequestSchema.parse({
        ...request,
        fileName: String.raw`C:\private\template.cpp`,
      }),
    ).toThrow()
  })
})

describe('file execution deletion contracts', () => {
  const firstExecutionId = '40000000-0000-4000-8000-000000000017'
  const secondExecutionId = '40000000-0000-4000-8000-000000000018'

  it('requires a distinct-ID preview before confirmed deletion', () => {
    expect(
      previewDeleteFileExecutionsRequestSchema.parse({
        executionIds: [firstExecutionId, secondExecutionId],
      }),
    ).toEqual({ executionIds: [firstExecutionId, secondExecutionId] })
    expect(
      deleteFileExecutionsRequestSchema.parse({
        confirmed: true,
        previewId: firstExecutionId,
      }),
    ).toEqual({ confirmed: true, previewId: firstExecutionId })
    expect(
      deleteFileExecutionsResultSchema.parse({
        cleanupPending: false,
        deletedAt: '2026-07-18T10:00:00.000Z',
        deletedBackupDirectoryCount: 1,
        deletedExecutionCount: 2,
        deletedPlanCount: 0,
        kind: 'executions',
        missingBackupDirectoryCount: 1,
        recordIds: [firstExecutionId, secondExecutionId],
      }),
    ).toMatchObject({ deletedExecutionCount: 2, kind: 'executions' })
  })

  it('rejects duplicate, empty, and non-UUID execution identifiers', () => {
    expect(() =>
      previewDeleteFileExecutionsRequestSchema.parse({
        executionIds: [firstExecutionId, firstExecutionId],
      }),
    ).toThrow()
    expect(() => previewDeleteFileExecutionsRequestSchema.parse({ executionIds: [] })).toThrow()
    expect(() =>
      previewDeleteFileExecutionsRequestSchema.parse({ executionIds: ['not-an-execution-id'] }),
    ).toThrow()
    expect(() =>
      deleteFileExecutionsRequestSchema.parse({ confirmed: false, previewId: firstExecutionId }),
    ).toThrow()
  })
})

describe('invalid file execution cleanup contracts', () => {
  const firstExecutionId = '41000000-0000-4000-8000-000000000017'
  const secondExecutionId = '41000000-0000-4000-8000-000000000018'
  const workspaceId = '41000000-0000-4000-8000-000000000019'

  it('keeps global pagination and display data path-free', () => {
    expect(invalidFileExecutionPageRequestSchema.parse({ cursor: null, limit: 20 })).toEqual({
      cursor: null,
      limit: 20,
    })
    const page = invalidFileExecutionPageSchema.parse({
      items: [
        {
          createdAt: '2026-07-24T10:00:00.000Z',
          deletable: true,
          id: firstExecutionId,
          operationCount: null,
          reason: 'backup-missing',
          workspaceId,
          workspaceName: '算法模板',
        },
      ],
      nextAction: null,
      nextCursor: null,
      processedCount: 1,
      totalCount: 1,
      truncated: false,
      truncatedReason: null,
    })

    expect(page.items[0]).not.toHaveProperty('backupDirectory')
    expect(() => invalidFileExecutionPageRequestSchema.parse({ cursor: null, limit: 19 })).toThrow()
  })

  it('requires distinct selected IDs, a Main preview, and literal confirmation', () => {
    expect(
      previewDeleteInvalidFileExecutionsRequestSchema.parse({
        executionIds: [firstExecutionId, secondExecutionId],
      }),
    ).toEqual({ executionIds: [firstExecutionId, secondExecutionId] })
    expect(() =>
      previewDeleteInvalidFileExecutionsRequestSchema.parse({
        executionIds: [firstExecutionId, firstExecutionId],
      }),
    ).toThrow()
    expect(() =>
      previewDeleteInvalidFileExecutionsRequestSchema.parse({ executionIds: [] }),
    ).toThrow()
    expect(
      deleteInvalidFileExecutionsRequestSchema.parse({
        confirmed: true,
        previewId: firstExecutionId,
      }),
    ).toEqual({ confirmed: true, previewId: firstExecutionId })
    expect(() =>
      deleteInvalidFileExecutionsRequestSchema.parse({
        confirmed: false,
        previewId: firstExecutionId,
      }),
    ).toThrow()
  })

  it('only allows deletable missing-backup items in a cleanup preview', () => {
    expect(
      invalidFileExecutionDeletionPreviewSchema.parse({
        executionCount: 1,
        expiresAt: '2026-07-24T10:10:00.000Z',
        items: [
          {
            createdAt: '2026-07-24T10:00:00.000Z',
            deletable: true,
            id: firstExecutionId,
            operationCount: 2,
            reason: 'backup-missing',
            workspaceId,
            workspaceName: '算法模板',
          },
        ],
        previewId: secondExecutionId,
        recordIds: [firstExecutionId],
        workspaceCount: 1,
      }).executionCount,
    ).toBe(1)
    expect(() =>
      invalidFileExecutionDeletionPreviewSchema.parse({
        executionCount: 1,
        expiresAt: '2026-07-24T10:10:00.000Z',
        items: [],
        previewId: secondExecutionId,
        recordIds: [firstExecutionId],
        workspaceCount: 1,
      }),
    ).toThrow()
  })
})

describe('batch template import contracts', () => {
  const sourceId = '40000000-0000-4000-8000-000000000016'

  it('allows a selected source to be imported without AI metadata', () => {
    expect(
      batchImportTemplateRequestSchema.parse({
        items: [
          {
            conflictAction: 'create',
            content: 'void manual_import() {}\n',
            expectedExistingFileState: null,
            metadata: null,
            relativePath: '基础/手动导入.cpp',
            sourceId,
          },
        ],
      }),
    ).toMatchObject({ items: [{ conflictAction: 'create', metadata: null }] })
  })

  it('expresses overwrite eligibility without exposing existing source content', () => {
    const result = inspectBatchTemplateImportResultSchema.parse({
      conflicts: [
        {
          actualRelativePath: '基础/手动导入.cpp',
          canOverwrite: true,
          existingFileState: '1:2:42:1000:1000',
          kind: 'existing-file',
          relativePath: '基础/手动导入.cpp',
          sourceId,
        },
      ],
    })

    expect(result.conflicts[0]).toEqual({
      actualRelativePath: '基础/手动导入.cpp',
      canOverwrite: true,
      existingFileState: '1:2:42:1000:1000',
      kind: 'existing-file',
      relativePath: '基础/手动导入.cpp',
      sourceId,
    })
    expect(result.conflicts[0]).not.toHaveProperty('content')
  })
})

describe('stored file-plan current payload', () => {
  const operationId = '40000000-0000-4000-8000-000000000014'
  const requestId = '40000000-0000-4000-8000-000000000015'

  it('reads the versioned V2 envelope without losing plan metadata', () => {
    const payload = fileChangePlanPayloadSchema.parse({
      contextVersion: 'context-v2',
      diagnostic: {
        adaptiveSplitCount: 1,
        auditIssueCount: 1,
        candidateTemplateCount: 2,
        contextTruncated: false,
        effectiveBatchCount: 3,
        initialBatchCount: 2,
        languageFallbackBatchCount: 1,
        notesIncludedCount: 1,
        requestId,
        schemaVersion: 2,
      },
      operations: [
        {
          id: operationId,
          kind: 'delete',
          reason: '完全重复。',
          selectedByDefault: true,
          source: 'local-audit',
          sourcePath: '副本.cpp',
          templateId: 'a'.repeat(64),
        },
      ],
      outputLanguage: 'zh-CN',
      schemaVersion: 2,
      summary: '本地审计发现一份完全重复文件。',
    })

    expect(parseStoredFileChangePlanPayload(payload)).toMatchObject({
      contextVersion: 'context-v2',
      diagnostic: {
        adaptiveSplitCount: 1,
        effectiveBatchCount: 3,
        initialBatchCount: 2,
        languageFallbackBatchCount: 1,
      },
      outputLanguage: 'zh-CN',
      schemaVersion: 2,
      summary: '本地审计发现一份完全重复文件。',
      operations: [{ selectedByDefault: true, source: 'local-audit' }],
    })
  })

  it('rejects unversioned operation arrays', () => {
    expect(
      parseStoredFileChangePlanPayload([
        {
          id: operationId,
          kind: 'delete',
          reason: '旧计划操作。',
          sourcePath: '旧文件.cpp',
          templateId: 'b'.repeat(64),
        },
      ]),
    ).toBeNull()
  })
})
