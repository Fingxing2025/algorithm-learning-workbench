import { lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import {
  invalidFileExecutionPageRequestSchema,
  type InvalidFileExecutionItem,
  type InvalidFileExecutionPage,
  type InvalidFileExecutionPageRequest,
  type InvalidFileExecutionReason,
} from '@core/contracts/template-management'

import {
  TemplateManagementRepository,
  type FileExecutionIntegrityRecord,
} from '../database/template-management-repository'
import { PublicError } from '../errors/public-error'
import type { WorkspaceStorageManager } from './workspace-storage'

interface InvalidFileExecutionCursor {
  createdAt: string
  id: string
}

export interface InvalidFileExecutionAssessment {
  item: InvalidFileExecutionItem
  record: FileExecutionIntegrityRecord
}

function decodeCursor(value: string | null): InvalidFileExecutionCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<InvalidFileExecutionCursor>
    if (
      typeof parsed.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(parsed.id)
    ) {
      throw new Error('invalid cursor')
    }
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    throw new PublicError('INVALID_REQUEST', '失效执行记录分页位置已失效，请重新加载。')
  }
}

function encodeCursor(value: InvalidFileExecutionCursor): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function operationCount(value: string): number | null {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.length : null
  } catch {
    return null
  }
}

function reasonForUnsafePath(error: unknown): InvalidFileExecutionReason {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
    ? 'backup-missing'
    : 'backup-path-unreadable'
}

export class FileExecutionIntegrityService {
  private readonly userDataPath: string

  constructor(
    private readonly repository: TemplateManagementRepository,
    userDataPath: string,
    private readonly workspaceStorage?: WorkspaceStorageManager,
  ) {
    this.userDataPath = resolve(userDataPath)
  }

  private get filePlanBackupRoot(): string {
    return (
      this.workspaceStorage?.current?.filePlanBackupRoot ??
      join(this.userDataPath, 'file-plan-backups')
    )
  }

  async listInvalidFileExecutionsPage(
    workspaceId: string,
    rawRequest: InvalidFileExecutionPageRequest,
  ): Promise<InvalidFileExecutionPage> {
    const request = invalidFileExecutionPageRequestSchema.parse(rawRequest)
    const cursor = decodeCursor(request.cursor)
    const all = await this.assessRecords(
      this.repository.listAppliedFileExecutionIntegrityRecords(workspaceId),
    )
    const afterCursor = cursor
      ? all.filter(
          ({ item }) =>
            item.createdAt < cursor.createdAt ||
            (item.createdAt === cursor.createdAt && item.id < cursor.id),
        )
      : all
    const pageRows = afterCursor.slice(0, request.limit + 1)
    const hasMore = pageRows.length > request.limit
    const items = (hasMore ? pageRows.slice(0, request.limit) : pageRows).map(({ item }) => item)
    const last = items.at(-1)
    return {
      items,
      nextAction: hasMore ? '继续加载下一批失效执行记录。' : null,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
      processedCount: items.length,
      totalCount: all.length,
      truncated: hasMore,
      truncatedReason: hasMore ? '失效执行记录按执行时间分批加载。' : null,
    }
  }

  async countInvalidFileExecutions(workspaceId: string): Promise<number> {
    return (
      await this.assessRecords(
        this.repository.listAppliedFileExecutionIntegrityRecords(workspaceId),
      )
    ).length
  }

  async inspectInvalidFileExecutions(
    workspaceId: string,
    executionIds: string[],
  ): Promise<InvalidFileExecutionAssessment[] | null> {
    const records = this.repository.inspectAppliedFileExecutionIntegrityRecords(
      workspaceId,
      executionIds,
    )
    if (!records) return null
    const assessments = await this.assessRecords(records)
    return assessments.length === records.length ? assessments : null
  }

  async findInvalidFileExecutions(
    workspaceId: string,
    executionIds: string[],
  ): Promise<InvalidFileExecutionAssessment[]> {
    if (executionIds.length === 0) return []
    const records = this.repository.inspectAppliedFileExecutionIntegrityRecords(
      workspaceId,
      executionIds,
    )
    return records ? this.assessRecords(records) : []
  }

  private async assessRecords(
    records: FileExecutionIntegrityRecord[],
  ): Promise<InvalidFileExecutionAssessment[]> {
    const assessed = await Promise.all(
      records.map(async record => {
        const reason = await this.inspectBackup(record)
        if (!reason) return null
        return {
          item: {
            createdAt: record.createdAt,
            deletable: reason === 'backup-missing',
            id: record.id,
            operationCount: operationCount(record.operationsJson),
            reason,
            workspaceId: record.workspaceId,
            workspaceName: record.workspaceName,
          },
          record,
        } satisfies InvalidFileExecutionAssessment
      }),
    )
    return assessed
      .filter((value): value is InvalidFileExecutionAssessment => value !== null)
      .sort(
        (left, right) =>
          right.item.createdAt.localeCompare(left.item.createdAt) ||
          right.item.id.localeCompare(left.item.id),
      )
  }

  private async inspectBackup(
    record: FileExecutionIntegrityRecord,
  ): Promise<InvalidFileExecutionReason | null> {
    const canonicalReference = `file-plan-backups/${record.id}`
    if (record.backupDirectory !== canonicalReference) return 'backup-reference-invalid'

    let parentStatus: Awaited<ReturnType<typeof lstat>>
    try {
      parentStatus = await lstat(this.filePlanBackupRoot)
    } catch (error) {
      return reasonForUnsafePath(error)
    }
    if (parentStatus.isSymbolicLink()) return 'backup-path-symbolic-link'
    if (!parentStatus.isDirectory()) return 'backup-path-not-directory'

    let targetStatus: Awaited<ReturnType<typeof lstat>>
    try {
      targetStatus = await lstat(join(this.filePlanBackupRoot, record.id))
    } catch (error) {
      return reasonForUnsafePath(error)
    }
    if (targetStatus.isSymbolicLink()) return 'backup-path-symbolic-link'
    if (!targetStatus.isDirectory()) return 'backup-path-not-directory'
    return null
  }
}
