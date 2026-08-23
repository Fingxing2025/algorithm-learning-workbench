import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { FileExecutionIntegrityRecord } from '../database/template-management-repository'
import { FileExecutionIntegrityService } from './file-execution-integrity-service'

const workspaceId = '51000000-0000-4000-8000-000000000001'
const otherWorkspaceId = '51000000-0000-4000-8000-000000000002'
const planId = '52000000-0000-4000-8000-000000000001'
const firstExecutionId = '53000000-0000-4000-8000-000000000001'
const secondExecutionId = '53000000-0000-4000-8000-000000000002'

const temporaryRoots: string[] = []

function record(
  id: string,
  overrides: Partial<FileExecutionIntegrityRecord> = {},
): FileExecutionIntegrityRecord {
  return {
    backupDirectory: `file-plan-backups/${id}`,
    createdAt: id === firstExecutionId ? '2026-07-24T10:00:00.000Z' : '2026-07-24T09:00:00.000Z',
    id,
    operationsJson: '[{"kind":"move"}]',
    planId,
    status: 'applied',
    workspaceId,
    workspaceName: '主工作区',
    ...overrides,
  }
}

async function createService(records: FileExecutionIntegrityRecord[]) {
  const root = await mkdtemp(join(tmpdir(), 'file-execution-integrity-'))
  temporaryRoots.push(root)
  const repository = {
    inspectAppliedFileExecutionIntegrityRecords: (requestedWorkspaceId: string, ids: string[]) => {
      const selected = records.filter(
        item => item.workspaceId === requestedWorkspaceId && ids.includes(item.id),
      )
      return selected.length === ids.length ? selected : null
    },
    listAppliedFileExecutionIntegrityRecords: (requestedWorkspaceId: string) =>
      records.filter(item => item.workspaceId === requestedWorkspaceId),
  }
  return {
    root,
    service: new FileExecutionIntegrityService(repository as never, root),
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })),
  )
})

describe('FileExecutionIntegrityService', () => {
  it('finds canonical missing backups only in the requested workspace', async () => {
    const { service } = await createService([
      record(firstExecutionId),
      record(secondExecutionId, {
        operationsJson: '{damaged',
        workspaceId: otherWorkspaceId,
        workspaceName: '旧工作区',
      }),
    ])

    const page = await service.listInvalidFileExecutionsPage(workspaceId, {
      cursor: null,
      limit: 20,
    })

    expect(page.totalCount).toBe(1)
    expect(page.items).toEqual([
      expect.objectContaining({
        deletable: true,
        id: firstExecutionId,
        operationCount: 1,
        reason: 'backup-missing',
        workspaceName: '主工作区',
      }),
    ])
  })

  it('omits a valid directory and fails closed for invalid references, files, and symlinks', async () => {
    const fileId = '53000000-0000-4000-8000-000000000003'
    const symlinkId = '53000000-0000-4000-8000-000000000004'
    const invalidId = '53000000-0000-4000-8000-000000000005'
    const validId = '53000000-0000-4000-8000-000000000006'
    const { root, service } = await createService([
      record(fileId),
      record(symlinkId),
      record(invalidId, { backupDirectory: `file-plan-backups/${firstExecutionId}` }),
      record(validId),
    ])
    const backupRoot = join(root, 'file-plan-backups')
    await mkdir(backupRoot)
    await writeFile(join(backupRoot, fileId), 'not a directory')
    await symlink(backupRoot, join(backupRoot, symlinkId))
    await mkdir(join(backupRoot, validId))

    const page = await service.listInvalidFileExecutionsPage(workspaceId, {
      cursor: null,
      limit: 20,
    })

    expect(page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deletable: false,
          id: fileId,
          reason: 'backup-path-not-directory',
        }),
        expect.objectContaining({
          deletable: false,
          id: symlinkId,
          reason: 'backup-path-symbolic-link',
        }),
        expect.objectContaining({
          deletable: false,
          id: invalidId,
          reason: 'backup-reference-invalid',
        }),
      ]),
    )
    expect(page.items.some(item => item.id === validId)).toBe(false)
  })

  it('uses a stable opaque cursor for invalid records only', async () => {
    const records = Array.from({ length: 21 }, (_, index) => {
      const suffix = (index + 10).toString(16).padStart(12, '0')
      return record(`53000000-0000-4000-8000-${suffix}`, {
        createdAt: new Date(Date.UTC(2026, 6, 24, 10, 0, 0) - index * 1_000).toISOString(),
      })
    })
    const { service } = await createService(records)
    const first = await service.listInvalidFileExecutionsPage(workspaceId, {
      cursor: null,
      limit: 20,
    })
    const second = await service.listInvalidFileExecutionsPage(workspaceId, {
      cursor: first.nextCursor,
      limit: 20,
    })

    expect(first.items).toHaveLength(20)
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/u)
    expect(second.items).toHaveLength(1)
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(21)
  })
})
