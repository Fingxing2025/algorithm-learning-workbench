import { describe, expect, it, vi } from 'vitest'

import type {
  FileExecutionDeletionRecord,
  FilePlanDeletionRecord,
} from '../database/template-management-repository'
import { TemplateFilePlanHistoryService } from './template-file-plan-history-service'

const workspaceId = '10000000-0000-4000-8000-000000000001'
const executionId = '20000000-0000-4000-8000-000000000001'
const rolledBackExecutionId = '20000000-0000-4000-8000-000000000002'
const planId = '30000000-0000-4000-8000-000000000001'

function createService(options?: {
  executionRecords?: FileExecutionDeletionRecord[]
  planRecords?: FilePlanDeletionRecord[]
}) {
  const executionRecords = options?.executionRecords ?? [
    {
      backupDirectory: `file-plan-backups/${executionId}`,
      id: executionId,
      planId,
      status: 'applied' as const,
    },
  ]
  const planRecords = options?.planRecords ?? []
  const metadataRepository = {
    deleteFileExecutions: vi.fn().mockReturnValue({
      deletedAt: '2026-07-22T10:00:00.000Z',
      deletedExecutionCount: executionRecords.length,
      deletedPlanCount: 0,
    }),
    deleteFilePlans: vi.fn().mockReturnValue({
      deletedAt: '2026-07-22T10:00:00.000Z',
      deletedExecutionCount: planRecords.flatMap(plan => plan.executions).length,
      deletedPlanCount: planRecords.length,
    }),
    inspectFileExecutionsForDeletion: vi.fn().mockReturnValue(executionRecords),
    inspectFilePlansForDeletion: vi.fn().mockReturnValue(planRecords),
  }
  const lifecycle = {
    executeManagedHistoryDeletion: vi.fn().mockImplementation(async (paths, commit) => ({
      cleanupPending: false,
      deletedBackupDirectoryCount: paths.length,
      missingBackupDirectoryCount: 0,
      result: commit('40000000-0000-4000-8000-000000000001'),
    })),
    inspectManagedHistoryBackups: vi.fn().mockImplementation(async paths => ({
      existingRelativePaths: paths,
      missingCount: 0,
    })),
  }
  const workspaceRepository = { getActiveWorkspace: () => ({ id: workspaceId }) }
  const service = new TemplateFilePlanHistoryService(
    metadataRepository as never,
    workspaceRepository as never,
    {} as never,
    {} as never,
    lifecycle as never,
  )
  return { lifecycle, metadataRepository, service }
}

describe('TemplateFilePlanHistoryService permanent deletion previews', () => {
  it('previews and permanently deletes an applied execution without requiring rollback', async () => {
    const { lifecycle, metadataRepository, service } = createService()

    const preview = await service.previewDeleteFileExecutions({ executionIds: [executionId] })
    expect(preview).toMatchObject({
      appliedExecutionCount: 1,
      backupDirectoryCount: 1,
      executionCount: 1,
      rolledBackExecutionCount: 0,
    })
    const result = await service.deleteFileExecutions({
      confirmed: true,
      previewId: preview.previewId,
    })

    expect(result).toMatchObject({
      deletedBackupDirectoryCount: 1,
      deletedExecutionCount: 1,
      deletedPlanCount: 0,
      kind: 'executions',
    })
    expect(lifecycle.executeManagedHistoryDeletion).toHaveBeenCalledWith(
      [`file-plan-backups/${executionId}`],
      expect.any(Function),
    )
    expect(metadataRepository.deleteFileExecutions).toHaveBeenCalledWith(
      workspaceId,
      expect.arrayContaining([expect.objectContaining({ id: executionId, status: 'applied' })]),
      expect.any(String),
    )
  })

  it('reports mutually exclusive applied, cancelled, rolled-back, and archived plan impacts', async () => {
    const records: FilePlanDeletionRecord[] = [
      {
        archivedAt: null,
        executions: [],
        id: planId,
        status: 'cancelled',
      },
      {
        archivedAt: '2026-07-18T10:00:00.000Z',
        executions: [
          {
            backupDirectory: `file-plan-backups/${rolledBackExecutionId}`,
            id: rolledBackExecutionId,
            planId: '30000000-0000-4000-8000-000000000002',
            status: 'rolled-back',
          },
        ],
        id: '30000000-0000-4000-8000-000000000002',
        status: 'applied',
      },
      {
        archivedAt: null,
        executions: [
          {
            backupDirectory: `file-plan-backups/${executionId}`,
            id: executionId,
            planId: '30000000-0000-4000-8000-000000000003',
            status: 'applied',
          },
        ],
        id: '30000000-0000-4000-8000-000000000003',
        status: 'applied',
      },
    ]
    const { metadataRepository, service } = createService({ planRecords: records })
    const preview = await service.previewDeleteFilePlans({ planIds: records.map(plan => plan.id) })

    expect(preview).toMatchObject({
      appliedPlanCount: 1,
      archivedPlanCount: 1,
      cancelledPlanCount: 1,
      executionCount: 2,
      planCount: 3,
      rolledBackPlanCount: 1,
    })
    const result = await service.deleteFilePlans({
      confirmed: true,
      previewId: preview.previewId,
    })
    expect(result).toMatchObject({ deletedExecutionCount: 2, deletedPlanCount: 3, kind: 'plans' })
    expect(metadataRepository.deleteFilePlans).toHaveBeenCalledWith(
      workspaceId,
      records,
      expect.any(String),
    )
  })

  it('consumes previews once and rejects a second apply', async () => {
    const { service } = createService()
    const preview = await service.previewDeleteFileExecutions({ executionIds: [executionId] })
    await service.deleteFileExecutions({ confirmed: true, previewId: preview.previewId })
    await expect(
      service.deleteFileExecutions({ confirmed: true, previewId: preview.previewId }),
    ).rejects.toThrow('预览不存在')
  })
})
