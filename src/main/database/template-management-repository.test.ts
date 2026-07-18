import { describe, expect, it } from 'vitest'

import type { AppDatabase } from './database'
import { TemplateManagementRepository } from './template-management-repository'

const workspaceId = '40000000-0000-4000-8000-000000000021'
const otherWorkspaceId = '40000000-0000-4000-8000-000000000022'
const firstExecutionId = '40000000-0000-4000-8000-000000000025'
const secondExecutionId = '40000000-0000-4000-8000-000000000026'
const appliedExecutionId = '40000000-0000-4000-8000-000000000027'
const otherExecutionId = '40000000-0000-4000-8000-000000000028'

interface StoredExecution {
  id: string
  status: 'applied' | 'rolled-back'
  workspaceId: string
}

class TransactionalExecutionDatabase {
  failDeleteId: string | null = null
  records: StoredExecution[] = []

  readonly client = {
    prepare: (sql: string) => {
      if (sql.includes('SELECT e.id, e.status')) {
        return {
          all: (targetWorkspaceId: string, ...executionIds: string[]) =>
            this.records
              .filter(
                record =>
                  record.workspaceId === targetWorkspaceId && executionIds.includes(record.id),
              )
              .map(({ id, status }) => ({ id, status })),
        }
      }
      if (sql.includes('DELETE FROM file_change_executions')) {
        return {
          run: (executionId: string) => {
            if (executionId === this.failDeleteId) {
              throw new Error('injected execution deletion failure')
            }
            const index = this.records.findIndex(
              record => record.id === executionId && record.status === 'rolled-back',
            )
            if (index < 0) return { changes: 0 }
            this.records.splice(index, 1)
            return { changes: 1 }
          },
        }
      }
      throw new Error(`Unexpected SQL in execution deletion test: ${sql}`)
    },
    transaction:
      <Result>(operation: () => Result) =>
      () => {
        const snapshot = this.records.map(record => ({ ...record }))
        try {
          return operation()
        } catch (error) {
          this.records = snapshot
          throw error
        }
      },
  }

  asAppDatabase(): AppDatabase {
    return { client: this.client } as unknown as AppDatabase
  }

  ids(): string[] {
    return this.records.map(record => record.id).sort()
  }
}

function createRepository(records: StoredExecution[]) {
  const database = new TransactionalExecutionDatabase()
  database.records = records
  return {
    database,
    repository: new TemplateManagementRepository(database.asAppDatabase()),
  }
}

describe('TemplateManagementRepository execution deletion', () => {
  it('deletes only fully validated rolled-back records for the current workspace', () => {
    const { database, repository } = createRepository([
      { id: firstExecutionId, status: 'rolled-back', workspaceId },
      { id: secondExecutionId, status: 'rolled-back', workspaceId },
    ])

    const result = repository.deleteRolledBackExecutions(workspaceId, [
      firstExecutionId,
      secondExecutionId,
    ])

    expect(result).toMatchObject({
      deletedExecutionIds: [firstExecutionId, secondExecutionId],
    })
    expect(database.ids()).toEqual([])
  })

  it('rejects mixed status, unknown, and other-workspace batches without partial deletion', () => {
    const { database, repository } = createRepository([
      { id: firstExecutionId, status: 'rolled-back', workspaceId },
      { id: appliedExecutionId, status: 'applied', workspaceId },
      { id: otherExecutionId, status: 'rolled-back', workspaceId: otherWorkspaceId },
    ])
    const expectedIds = [appliedExecutionId, firstExecutionId, otherExecutionId].sort()

    expect(
      repository.deleteRolledBackExecutions(workspaceId, [firstExecutionId, appliedExecutionId]),
    ).toBeNull()
    expect(
      repository.deleteRolledBackExecutions(workspaceId, [
        firstExecutionId,
        '40000000-0000-4000-8000-000000000099',
      ]),
    ).toBeNull()
    expect(
      repository.deleteRolledBackExecutions(workspaceId, [firstExecutionId, otherExecutionId]),
    ).toBeNull()
    expect(database.ids()).toEqual(expectedIds)
  })

  it('rolls the whole batch back when deletion fails after the first record', () => {
    const { database, repository } = createRepository([
      { id: firstExecutionId, status: 'rolled-back', workspaceId },
      { id: secondExecutionId, status: 'rolled-back', workspaceId },
    ])
    database.failDeleteId = secondExecutionId

    expect(() =>
      repository.deleteRolledBackExecutions(workspaceId, [firstExecutionId, secondExecutionId]),
    ).toThrow('injected execution deletion failure')
    expect(database.ids()).toEqual([firstExecutionId, secondExecutionId])
  })
})
