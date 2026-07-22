import { describe, expect, it } from 'vitest'

import type { AppDatabase } from './database'
import {
  TemplateManagementRepository,
  type FileExecutionDeletionRecord,
} from './template-management-repository'

const workspaceId = '40000000-0000-4000-8000-000000000021'
const otherWorkspaceId = '40000000-0000-4000-8000-000000000022'
const firstPlanId = '40000000-0000-4000-8000-000000000023'
const secondPlanId = '40000000-0000-4000-8000-000000000024'
const firstExecutionId = '40000000-0000-4000-8000-000000000025'
const secondExecutionId = '40000000-0000-4000-8000-000000000026'
const otherExecutionId = '40000000-0000-4000-8000-000000000028'
const operationId = '40000000-0000-4000-8000-000000000029'

interface StoredExecution {
  backupDirectory: string
  id: string
  planId: string
  status: 'applied' | 'rolled-back'
}

interface StoredPlan {
  archivedAt: string | null
  id: string
  status: 'applied' | 'cancelled' | 'draft'
  workspaceId: string
}

class TransactionalHistoryDatabase {
  appState: Array<{ key: string; value: string }> = []
  executions: StoredExecution[] = []
  failDeleteId: string | null = null
  plans: StoredPlan[] = []

  readonly client = {
    prepare: (sql: string) => {
      if (sql.includes('INNER JOIN file_change_plans') && sql.includes('backup_directory')) {
        return {
          all: (targetWorkspaceId: string, ...executionIds: string[]) =>
            this.executions
              .filter(execution => {
                const plan = this.plans.find(item => item.id === execution.planId)
                return (
                  plan?.workspaceId === targetWorkspaceId && executionIds.includes(execution.id)
                )
              })
              .map(execution => ({ ...execution })),
        }
      }
      if (sql.includes('SELECT id, status, archived_at AS archivedAt')) {
        return {
          all: (targetWorkspaceId: string, ...planIds: string[]) =>
            this.plans
              .filter(plan => plan.workspaceId === targetWorkspaceId && planIds.includes(plan.id))
              .map(({ archivedAt, id, status }) => ({ archivedAt, id, status })),
        }
      }
      if (sql.includes('WHERE e.plan_id IN')) {
        return {
          all: (...planIds: string[]) =>
            this.executions
              .filter(execution => planIds.includes(execution.planId))
              .map(execution => ({ ...execution })),
        }
      }
      if (sql.startsWith('DELETE FROM file_change_executions')) {
        return {
          run: (executionId: string) => {
            if (executionId === this.failDeleteId) throw new Error('injected deletion failure')
            const index = this.executions.findIndex(record => record.id === executionId)
            if (index < 0) return { changes: 0 }
            this.executions.splice(index, 1)
            return { changes: 1 }
          },
        }
      }
      if (sql.startsWith('DELETE FROM file_change_plans')) {
        return {
          run: (planId: string) => {
            const index = this.plans.findIndex(record => record.id === planId)
            if (index < 0) return { changes: 0 }
            this.plans.splice(index, 1)
            return { changes: 1 }
          },
        }
      }
      if (sql.startsWith('INSERT INTO app_state')) {
        return {
          run: (key: string, value: string) => {
            this.appState.push({ key, value })
            return { changes: 1 }
          },
        }
      }
      throw new Error(`Unexpected SQL in history deletion test: ${sql}`)
    },
    transaction:
      <Result>(operation: () => Result) =>
      () => {
        const snapshot = {
          appState: this.appState.map(record => ({ ...record })),
          executions: this.executions.map(record => ({ ...record })),
          plans: this.plans.map(record => ({ ...record })),
        }
        try {
          return operation()
        } catch (error) {
          this.appState = snapshot.appState
          this.executions = snapshot.executions
          this.plans = snapshot.plans
          throw error
        }
      },
  }

  asAppDatabase(): AppDatabase {
    return { client: this.client } as unknown as AppDatabase
  }
}

function createRepository() {
  const database = new TransactionalHistoryDatabase()
  database.plans = [
    { archivedAt: null, id: firstPlanId, status: 'applied', workspaceId },
    {
      archivedAt: '2026-07-18T10:00:00.000Z',
      id: secondPlanId,
      status: 'cancelled',
      workspaceId,
    },
    {
      archivedAt: null,
      id: '40000000-0000-4000-8000-000000000099',
      status: 'applied',
      workspaceId: otherWorkspaceId,
    },
  ]
  database.executions = [
    {
      backupDirectory: `file-plan-backups/${firstExecutionId}`,
      id: firstExecutionId,
      planId: firstPlanId,
      status: 'applied',
    },
    {
      backupDirectory: `file-plan-backups/${secondExecutionId}`,
      id: secondExecutionId,
      planId: firstPlanId,
      status: 'rolled-back',
    },
    {
      backupDirectory: `file-plan-backups/${otherExecutionId}`,
      id: otherExecutionId,
      planId: '40000000-0000-4000-8000-000000000099',
      status: 'rolled-back',
    },
  ]
  return {
    database,
    repository: new TemplateManagementRepository(database.asAppDatabase()),
  }
}

describe('TemplateManagementRepository permanent history deletion', () => {
  it('deletes mixed applied and rolled-back executions and commits the recovery marker', () => {
    const { database, repository } = createRepository()
    const expected = repository.inspectFileExecutionsForDeletion(workspaceId, [
      firstExecutionId,
      secondExecutionId,
    ])!

    const result = repository.deleteFileExecutions(workspaceId, expected, operationId)

    expect(result).toMatchObject({ deletedExecutionCount: 2, deletedPlanCount: 0 })
    expect(database.executions.map(record => record.id)).toEqual([otherExecutionId])
    expect(database.plans.some(plan => plan.id === firstPlanId)).toBe(true)
    expect(database.appState[0]?.key).toBe(`file_history_delete_commit:${operationId}`)
  })

  it('rejects unknown, cross-workspace, and concurrent changes without partial deletion', () => {
    const { database, repository } = createRepository()
    expect(
      repository.inspectFileExecutionsForDeletion(workspaceId, [
        firstExecutionId,
        otherExecutionId,
      ]),
    ).toBeNull()
    expect(
      repository.inspectFileExecutionsForDeletion(workspaceId, [
        firstExecutionId,
        '40000000-0000-4000-8000-000000000098',
      ]),
    ).toBeNull()
    const expected = repository.inspectFileExecutionsForDeletion(workspaceId, [firstExecutionId])!
    database.executions[0]!.status = 'rolled-back'
    expect(repository.deleteFileExecutions(workspaceId, expected, null)).toBeNull()
    expect(database.executions).toHaveLength(3)
  })

  it('rolls the whole execution batch back when the database fails', () => {
    const { database, repository } = createRepository()
    const expected = repository.inspectFileExecutionsForDeletion(workspaceId, [
      firstExecutionId,
      secondExecutionId,
    ])!
    database.failDeleteId = secondExecutionId

    expect(() => repository.deleteFileExecutions(workspaceId, expected, operationId)).toThrow(
      'injected deletion failure',
    )
    expect(database.executions).toHaveLength(3)
    expect(database.appState).toEqual([])
  })

  it('deletes a plan, its enumerated children, and an old archived plan in one transaction', () => {
    const { database, repository } = createRepository()
    const expected = repository.inspectFilePlansForDeletion(workspaceId, [
      firstPlanId,
      secondPlanId,
    ])!

    const result = repository.deleteFilePlans(workspaceId, expected, operationId)

    expect(result).toMatchObject({ deletedExecutionCount: 2, deletedPlanCount: 2 })
    expect(database.plans.map(plan => plan.workspaceId)).toEqual([otherWorkspaceId])
    expect(database.executions.map(record => record.id)).toEqual([otherExecutionId])
  })

  it('refuses draft plans and validates an exact preview snapshot', () => {
    const { database, repository } = createRepository()
    database.plans[0]!.status = 'draft'
    expect(repository.inspectFilePlansForDeletion(workspaceId, [firstPlanId])).toBeNull()
    database.plans[0]!.status = 'applied'
    const expected = repository.inspectFilePlansForDeletion(workspaceId, [firstPlanId])!
    database.executions.push({
      backupDirectory: `file-plan-backups/${operationId}`,
      id: operationId,
      planId: firstPlanId,
      status: 'applied',
    })
    expect(repository.deleteFilePlans(workspaceId, expected, null)).toBeNull()
    expect(database.plans.some(plan => plan.id === firstPlanId)).toBe(true)
  })

  it('keeps the execution preview shape path-only inside Main', () => {
    const { repository } = createRepository()
    const record = repository.inspectFileExecutionsForDeletion(workspaceId, [
      firstExecutionId,
    ])![0]! satisfies FileExecutionDeletionRecord
    expect(record.backupDirectory).toBe(`file-plan-backups/${firstExecutionId}`)
  })
})
