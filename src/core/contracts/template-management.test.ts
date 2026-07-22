import { describe, expect, it } from 'vitest'

import {
  batchImportTemplateRequestSchema,
  deleteFileExecutionsRequestSchema,
  deleteFileExecutionsResultSchema,
  previewDeleteFileExecutionsRequestSchema,
  fileChangePlanPayloadSchema,
  inspectBatchTemplateImportResultSchema,
  parseStoredFileChangePlanPayload,
} from './template-management'

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

describe('stored file-plan payload compatibility', () => {
  const operationId = '40000000-0000-4000-8000-000000000014'
  const requestId = '40000000-0000-4000-8000-000000000015'

  it('reads the versioned V2 envelope without losing plan metadata', () => {
    const payload = fileChangePlanPayloadSchema.parse({
      contextVersion: 'context-v2',
      diagnostic: {
        auditIssueCount: 1,
        candidateTemplateCount: 2,
        contextTruncated: false,
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
      outputLanguage: 'zh-CN',
      schemaVersion: 2,
      summary: '本地审计发现一份完全重复文件。',
      operations: [{ selectedByDefault: true, source: 'local-audit' }],
    })
  })

  it('upgrades legacy operation arrays with safe defaults', () => {
    const payload = parseStoredFileChangePlanPayload([
      {
        id: operationId,
        kind: 'delete',
        reason: '旧计划操作。',
        sourcePath: '旧文件.cpp',
        templateId: 'b'.repeat(64),
      },
    ])

    expect(payload).toMatchObject({
      contextVersion: null,
      outputLanguage: 'zh-CN',
      schemaVersion: 2,
      summary: '',
      operations: [
        {
          precondition: null,
          selectedByDefault: false,
          source: 'ai',
        },
      ],
    })
  })
})
