import { randomUUID } from 'node:crypto'

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import {
  batchTemplateStagingItemStatusSchema,
  batchTemplateStagingStatusSchema,
  templateMetadataLanguageSchema,
  type BatchTemplateStagingItemStatus,
  type BatchTemplateStagingStatus,
  type TemplateClassification,
  type TemplateMetadataLanguage,
} from '@core/contracts/template-management'
import {
  templateSourceEncodingSchema,
  type TemplateSourceEncoding,
} from '@core/contracts/workspace'

import type { AppDatabase } from './database'
import { batchTemplateStagingItems, batchTemplateStagingSessions, workspaces } from './schema'
import { PublicError } from '../errors/public-error'

/** The database rows are intentionally kept separate from the renderer DTO. */
export type BatchTemplateStagingSessionRecord = typeof batchTemplateStagingSessions.$inferSelect
export type BatchTemplateStagingItemRecord = typeof batchTemplateStagingItems.$inferSelect
export type BatchTemplateStagingSession = BatchTemplateStagingSessionRecord
export type BatchTemplateStagingItem = BatchTemplateStagingItemRecord

export interface BatchTemplateStagingAggregate {
  items: BatchTemplateStagingItemRecord[]
  session: BatchTemplateStagingSessionRecord
}

export interface CreateBatchTemplateStagingItemInput {
  classification?: TemplateClassification | null
  classificationJson?: string | null
  displayPath: string
  error?: string | null
  fileName: string
  ordinal: number
  sourceEncoding: TemplateSourceEncoding
  sourceHash: string
  sourceId: string
  sourceRelativePath: string
  status?: BatchTemplateStagingItemStatus
  targetRelativePath?: string | null
}

export interface CreateBatchTemplateStagingInput {
  baseTreeHash: string
  baseWorkspaceVersion: string
  createdAt?: string
  id?: string
  items: readonly CreateBatchTemplateStagingItemInput[]
  outputLanguage: TemplateMetadataLanguage
  rootRelativePath?: string
  totalCount?: number
  updatedAt?: string
  workspaceId: string
}

export type CreateBatchTemplateStagingFields = Omit<CreateBatchTemplateStagingInput, 'workspaceId'>

export interface UpdateBatchTemplateStagingSessionInput {
  baseTreeHash?: string
  baseWorkspaceVersion?: string
  currentIndex?: number
  error?: string | null
  expectedVersion?: number | null
  outputLanguage?: TemplateMetadataLanguage
  processedCount?: number
  rootRelativePath?: string
  stagingId: string
  status?: BatchTemplateStagingStatus
  totalCount?: number
  workspaceId: string
}

export type UpdateBatchTemplateStagingSessionFields = Omit<
  UpdateBatchTemplateStagingSessionInput,
  'stagingId' | 'workspaceId'
>

export interface UpsertBatchTemplateStagingItemInput extends CreateBatchTemplateStagingItemInput {
  expectedVersion?: number | null
  stagingId: string
  workspaceId: string
}

export type UpsertBatchTemplateStagingItemFields = Omit<
  UpsertBatchTemplateStagingItemInput,
  'stagingId' | 'workspaceId'
>

export interface ListBatchTemplateStagingOptions {
  limit?: number
  statuses?: readonly BatchTemplateStagingStatus[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const MAX_ERROR_LENGTH = 500
const MAX_CLASSIFICATION_JSON_LENGTH = 1_000_000

/**
 * A deliberately conservative transition graph. Self-transitions are useful
 * for resumable workers; applied/discarded are terminal states.
 */
const SESSION_TRANSITIONS: Record<
  BatchTemplateStagingStatus,
  readonly BatchTemplateStagingStatus[]
> = {
  applying: ['applying', 'applied', 'failed', 'ready'],
  applied: ['applied'],
  discarded: ['discarded'],
  failed: ['failed', 'processing', 'ready', 'discarded'],
  processing: ['processing', 'failed', 'ready', 'discarded'],
  ready: ['ready', 'processing', 'applying', 'discarded'],
}

const ITEM_TRANSITIONS: Record<
  BatchTemplateStagingItemStatus,
  readonly BatchTemplateStagingItemStatus[]
> = {
  completed: ['completed', 'processing', 'skipped'],
  failed: ['failed', 'processing', 'pending', 'skipped'],
  pending: ['pending', 'processing', 'completed', 'failed', 'skipped'],
  processing: ['processing', 'pending', 'completed', 'failed', 'skipped'],
  skipped: ['skipped', 'pending', 'processing', 'completed'],
}

function invalid(message: string): never {
  throw new PublicError('INVALID_REQUEST', message)
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) invalid(`${label}格式无效。`)
}

function assertSha256(value: string, label: string): void {
  if (!SHA256_PATTERN.test(value)) invalid(`${label}必须是 SHA-256 指纹。`)
}

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) invalid(`${label}必须是有效整数。`)
}

function assertRelativePath(value: string, label: string): string {
  if (typeof value !== 'string') invalid(`${label}无效。`)
  const normalized = value.trim().replace(/\\/g, '/').normalize('NFC')
  if (
    !normalized ||
    normalized.length > 4096 ||
    normalized.startsWith('/') ||
    // Reject both drive-absolute (`C:/...`) and drive-relative (`C:...`)
    // Windows paths before they can be interpreted as workspace-relative.
    /^[A-Za-z]:/u.test(normalized)
  ) {
    invalid(`${label}必须是工作区相对路径。`)
  }
  const segments = normalized.split('/')
  if (
    segments.some(
      segment =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\0') ||
        segment.length > 255,
    )
  ) {
    invalid(`${label}包含无效目录。`)
  }
  return segments.join('/')
}

function assertFileName(value: string): string {
  if (typeof value !== 'string') invalid('暂存文件名无效。')
  const normalized = value.trim().normalize('NFC')
  if (
    !normalized ||
    normalized.length > 255 ||
    normalized === '.' ||
    normalized === '..' ||
    /[\\/\0]/u.test(normalized)
  ) {
    invalid('暂存文件名无效。')
  }
  return normalized
}

function assertError(value: string | null | undefined): string | null | undefined {
  if (value !== null && value !== undefined && value.length > MAX_ERROR_LENGTH) {
    invalid('暂存错误信息过长。')
  }
  return value
}

function assertStatus(value: string, kind: 'session' | 'item'): void {
  const result =
    kind === 'session'
      ? batchTemplateStagingStatusSchema.safeParse(value)
      : batchTemplateStagingItemStatusSchema.safeParse(value)
  if (!result.success) invalid('暂存状态无效。')
}

function assertLanguage(value: string): asserts value is TemplateMetadataLanguage {
  if (!templateMetadataLanguageSchema.safeParse(value).success) {
    invalid('暂存输出语言无效。')
  }
}

function serializeClassification(input: {
  classification?: TemplateClassification | null
  classificationJson?: string | null
}): string | null | undefined {
  if (input.classificationJson !== undefined) {
    if (input.classificationJson !== null) {
      if (input.classificationJson.length > MAX_CLASSIFICATION_JSON_LENGTH) {
        invalid('暂存分类结果过大。')
      }
      try {
        JSON.parse(input.classificationJson)
      } catch {
        invalid('暂存分类结果不是有效 JSON。')
      }
    }
    return input.classificationJson
  }
  if (input.classification === undefined) return undefined
  if (input.classification === null) return null
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(input.classification)
  } catch {
    invalid('暂存分类结果无法保存。')
  }
  if (!serialized) invalid('暂存分类结果无法保存。')
  if (serialized.length > MAX_CLASSIFICATION_JSON_LENGTH) invalid('暂存分类结果过大。')
  return serialized
}

function validateCreateItem(item: CreateBatchTemplateStagingItemInput): {
  classificationJson: string | null | undefined
  displayPath: string
  error: string | null | undefined
  fileName: string
  ordinal: number
  sourceEncoding: string
  sourceHash: string
  sourceId: string
  sourceRelativePath: string
  status: BatchTemplateStagingItemStatus
  targetRelativePath: string | null | undefined
} {
  assertUuid(item.sourceId, '源文件 ID')
  assertInteger(item.ordinal, '暂存顺序')
  if (item.ordinal < 0 || item.ordinal > 99) invalid('暂存顺序超出范围。')
  assertStatus(item.status ?? 'pending', 'item')
  if (!templateSourceEncodingSchema.safeParse(item.sourceEncoding).success) {
    invalid('源码编码无效。')
  }
  assertSha256(item.sourceHash, '源码')
  const targetRelativePath =
    item.targetRelativePath === undefined || item.targetRelativePath === null
      ? item.targetRelativePath
      : assertRelativePath(item.targetRelativePath, '目标路径')
  return {
    classificationJson: serializeClassification(item),
    displayPath: assertRelativePath(item.displayPath, '展示路径'),
    error: assertError(item.error),
    fileName: assertFileName(item.fileName),
    ordinal: item.ordinal,
    sourceEncoding: item.sourceEncoding,
    sourceHash: item.sourceHash,
    sourceId: item.sourceId,
    sourceRelativePath: assertRelativePath(item.sourceRelativePath, '源相对路径'),
    status: (item.status ?? 'pending') as BatchTemplateStagingItemStatus,
    targetRelativePath,
  }
}

function validateExpectedVersion(value: number | null | undefined): void {
  if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    invalid('暂存版本无效。')
  }
}

export class BatchTemplateStagingRepository {
  constructor(private readonly database: AppDatabase) {}

  transaction<Result>(run: () => Result): Result {
    return this.database.client.transaction(run)()
  }

  /** Restore a Main-owned batch-edit snapshot while invalidating old drafts. */
  restoreSnapshot(snapshot: BatchTemplateStagingAggregate): void {
    this.transaction(() => {
      const latest = this.getSession(snapshot.session.workspaceId, snapshot.session.id)
      if (!latest || latest.status === 'applied')
        throw new PublicError('TASK_CONFLICT', '暂存状态已变化，请重新加载批次。')
      this.database.orm
        .delete(batchTemplateStagingItems)
        .where(eq(batchTemplateStagingItems.stagingId, snapshot.session.id))
        .run()
      this.database.orm.insert(batchTemplateStagingItems).values(snapshot.items).run()
      this.database.orm
        .update(batchTemplateStagingSessions)
        .set({ ...snapshot.session, stagingVersion: latest.stagingVersion + 1 })
        .where(
          and(
            eq(batchTemplateStagingSessions.id, snapshot.session.id),
            eq(batchTemplateStagingSessions.workspaceId, snapshot.session.workspaceId),
          ),
        )
        .run()
    })
  }

  /**
   * Create a session and all of its initial items in one SQLite transaction.
   * The returned value is an aggregate because callers normally need to render
   * the first staging snapshot immediately.
   */
  create(input: CreateBatchTemplateStagingInput): BatchTemplateStagingAggregate
  create(
    workspaceId: string,
    input: CreateBatchTemplateStagingFields,
  ): BatchTemplateStagingAggregate
  create(
    inputOrWorkspaceId: CreateBatchTemplateStagingInput | string,
    fields?: CreateBatchTemplateStagingFields,
  ): BatchTemplateStagingAggregate {
    const input: CreateBatchTemplateStagingInput =
      typeof inputOrWorkspaceId === 'string'
        ? this.withWorkspace(inputOrWorkspaceId, fields)
        : inputOrWorkspaceId
    return this.createSession(input)
  }

  createSession(input: CreateBatchTemplateStagingInput): BatchTemplateStagingAggregate
  createSession(
    workspaceId: string,
    input: CreateBatchTemplateStagingFields,
  ): BatchTemplateStagingAggregate
  createSession(
    inputOrWorkspaceId: CreateBatchTemplateStagingInput | string,
    fields?: CreateBatchTemplateStagingFields,
  ): BatchTemplateStagingAggregate {
    const input =
      typeof inputOrWorkspaceId === 'string'
        ? this.withWorkspace(inputOrWorkspaceId, fields)
        : inputOrWorkspaceId
    assertUuid(input.workspaceId, '工作区 ID')
    assertLanguage(input.outputLanguage)
    assertSha256(input.baseTreeHash, '模板树基线')
    assertSha256(input.baseWorkspaceVersion, '工作区版本基线')
    if (input.items.length < 1 || input.items.length > 100) {
      invalid('一次暂存最多包含 100 份源码。')
    }
    const totalCount = input.totalCount ?? input.items.length
    assertInteger(totalCount, '暂存总数')
    if (totalCount < 1 || totalCount > 100 || totalCount !== input.items.length) {
      invalid('暂存总数与源码数量不一致。')
    }
    const id = input.id ?? randomUUID()
    assertUuid(id, '暂存 ID')
    const items = input.items.map(validateCreateItem)
    const sourceIds = new Set<string>()
    const ordinals = new Set<number>()
    for (const item of items) {
      if (sourceIds.has(item.sourceId)) invalid('暂存中不能重复使用源文件 ID。')
      if (ordinals.has(item.ordinal)) invalid('暂存顺序不能重复。')
      sourceIds.add(item.sourceId)
      ordinals.add(item.ordinal)
    }
    const now = input.createdAt ?? input.updatedAt ?? new Date().toISOString()
    const updatedAt = input.updatedAt ?? now
    const rootRelativePath = input.rootRelativePath
      ? assertRelativePath(input.rootRelativePath, '暂存根路径')
      : `.awb/staging/${id}`

    const transaction = this.database.client.transaction(() => {
      const workspace = this.database.orm
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, input.workspaceId))
        .get()
      if (!workspace) invalid('工作区不存在或已被移除。')

      this.database.orm
        .insert(batchTemplateStagingSessions)
        .values({
          baseTreeHash: input.baseTreeHash,
          baseWorkspaceVersion: input.baseWorkspaceVersion,
          createdAt: now,
          currentIndex: 0,
          error: null,
          id,
          outputLanguage: input.outputLanguage,
          processedCount: 0,
          rootRelativePath,
          stagingVersion: 0,
          status: 'processing',
          totalCount,
          updatedAt,
          workspaceId: input.workspaceId,
        })
        .run()

      this.database.orm
        .insert(batchTemplateStagingItems)
        .values(
          items.map(item => ({
            classificationJson: item.classificationJson ?? null,
            displayPath: item.displayPath,
            error: item.error ?? null,
            fileName: item.fileName,
            ordinal: item.ordinal,
            sourceEncoding: item.sourceEncoding,
            sourceHash: item.sourceHash,
            sourceId: item.sourceId,
            sourceRelativePath: item.sourceRelativePath,
            stagingId: id,
            status: item.status,
            targetRelativePath: item.targetRelativePath ?? null,
            updatedAt,
          })),
        )
        .run()
    })
    transaction()
    return this.get(input.workspaceId, id)!
  }

  private withWorkspace(
    workspaceId: string,
    fields: CreateBatchTemplateStagingFields | undefined,
  ): CreateBatchTemplateStagingInput {
    if (!fields) invalid('暂存创建参数不完整。')
    return { ...fields, workspaceId }
  }

  get(
    workspaceId: string,
    stagingId: string,
    expectedVersion?: number | null,
  ): BatchTemplateStagingAggregate | null {
    assertUuid(workspaceId, '工作区 ID')
    assertUuid(stagingId, '暂存 ID')
    validateExpectedVersion(expectedVersion)
    const transaction = this.database.client.transaction(() => {
      const session = this.getSession(workspaceId, stagingId, expectedVersion)
      if (!session) return null
      const items = this.database.orm
        .select()
        .from(batchTemplateStagingItems)
        .where(eq(batchTemplateStagingItems.stagingId, stagingId))
        .orderBy(asc(batchTemplateStagingItems.ordinal), asc(batchTemplateStagingItems.sourceId))
        .all()
      return { items, session }
    })
    return transaction()
  }

  getSession(
    workspaceId: string,
    stagingId: string,
    expectedVersion?: number | null,
  ): BatchTemplateStagingSessionRecord | null {
    assertUuid(workspaceId, '工作区 ID')
    assertUuid(stagingId, '暂存 ID')
    validateExpectedVersion(expectedVersion)
    const row = this.database.orm
      .select()
      .from(batchTemplateStagingSessions)
      .where(
        and(
          eq(batchTemplateStagingSessions.workspaceId, workspaceId),
          eq(batchTemplateStagingSessions.id, stagingId),
        ),
      )
      .get()
    if (
      !row ||
      (expectedVersion !== undefined &&
        expectedVersion !== null &&
        row.stagingVersion !== expectedVersion)
    ) {
      return null
    }
    return row
  }

  list(
    workspaceId: string,
    options: ListBatchTemplateStagingOptions = {},
  ): BatchTemplateStagingAggregate[] {
    const transaction = this.database.client.transaction(() =>
      this.listSessions(workspaceId, options).flatMap(session => {
        const items = this.database.orm
          .select()
          .from(batchTemplateStagingItems)
          .where(eq(batchTemplateStagingItems.stagingId, session.id))
          .orderBy(asc(batchTemplateStagingItems.ordinal), asc(batchTemplateStagingItems.sourceId))
          .all()
        return [{ items, session }]
      }),
    )
    return transaction()
  }

  listSessions(
    workspaceId: string,
    options: ListBatchTemplateStagingOptions = {},
  ): BatchTemplateStagingSessionRecord[] {
    assertUuid(workspaceId, '工作区 ID')
    const limit = options.limit ?? 20
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) invalid('暂存列表数量无效。')
    if (options.statuses) {
      options.statuses.forEach(status => assertStatus(status, 'session'))
    }
    const filters = [eq(batchTemplateStagingSessions.workspaceId, workspaceId)]
    if (options.statuses && options.statuses.length > 0) {
      filters.push(inArray(batchTemplateStagingSessions.status, options.statuses as string[]))
    }
    return this.database.orm
      .select()
      .from(batchTemplateStagingSessions)
      .where(and(...filters))
      .orderBy(desc(batchTemplateStagingSessions.updatedAt), desc(batchTemplateStagingSessions.id))
      .limit(limit)
      .all()
  }

  getItem(
    workspaceId: string,
    stagingId: string,
    sourceId: string,
  ): BatchTemplateStagingItemRecord | null {
    assertUuid(workspaceId, '工作区 ID')
    assertUuid(stagingId, '暂存 ID')
    assertUuid(sourceId, '源文件 ID')
    const owned = this.getSession(workspaceId, stagingId)
    if (!owned) return null
    return (
      this.database.orm
        .select()
        .from(batchTemplateStagingItems)
        .where(
          and(
            eq(batchTemplateStagingItems.stagingId, stagingId),
            eq(batchTemplateStagingItems.sourceId, sourceId),
          ),
        )
        .get() ?? null
    )
  }

  listItems(workspaceId: string, stagingId: string): BatchTemplateStagingItemRecord[] {
    assertUuid(workspaceId, '工作区 ID')
    assertUuid(stagingId, '暂存 ID')
    if (!this.getSession(workspaceId, stagingId)) return []
    return this.database.orm
      .select()
      .from(batchTemplateStagingItems)
      .where(eq(batchTemplateStagingItems.stagingId, stagingId))
      .orderBy(asc(batchTemplateStagingItems.ordinal), asc(batchTemplateStagingItems.sourceId))
      .all()
  }

  updateSession(
    input: UpdateBatchTemplateStagingSessionInput,
  ): BatchTemplateStagingSessionRecord | null
  updateSession(
    workspaceId: string,
    stagingId: string,
    fields: UpdateBatchTemplateStagingSessionFields,
    expectedVersion?: number | null,
  ): BatchTemplateStagingSessionRecord | null
  updateSession(
    inputOrWorkspaceId: UpdateBatchTemplateStagingSessionInput | string,
    stagingIdOrFields?: string | UpdateBatchTemplateStagingSessionFields,
    fieldsOrExpectedVersion?: UpdateBatchTemplateStagingSessionFields | number | null,
    positionalExpectedVersion?: number | null,
  ): BatchTemplateStagingSessionRecord | null {
    let input: UpdateBatchTemplateStagingSessionInput
    if (typeof inputOrWorkspaceId === 'string') {
      if (
        typeof stagingIdOrFields !== 'string' ||
        !fieldsOrExpectedVersion ||
        typeof fieldsOrExpectedVersion === 'number'
      ) {
        invalid('暂存更新参数不完整。')
      }
      input = {
        ...fieldsOrExpectedVersion,
        ...(positionalExpectedVersion === undefined
          ? {}
          : { expectedVersion: positionalExpectedVersion }),
        stagingId: stagingIdOrFields,
        workspaceId: inputOrWorkspaceId,
      }
    } else {
      input = inputOrWorkspaceId
    }
    assertUuid(input.workspaceId, '工作区 ID')
    assertUuid(input.stagingId, '暂存 ID')
    validateExpectedVersion(input.expectedVersion)
    if (input.status !== undefined) assertStatus(input.status, 'session')
    if (input.outputLanguage !== undefined) assertLanguage(input.outputLanguage)
    if (input.baseTreeHash !== undefined) assertSha256(input.baseTreeHash, '模板树基线')
    if (input.baseWorkspaceVersion !== undefined) {
      assertSha256(input.baseWorkspaceVersion, '工作区版本基线')
    }
    if (input.rootRelativePath !== undefined) {
      assertRelativePath(input.rootRelativePath, '暂存根路径')
    }
    for (const [value, label] of [
      [input.currentIndex, '当前暂存位置'],
      [input.processedCount, '已处理数量'],
      [input.totalCount, '暂存总数'],
    ] as const) {
      if (value !== undefined) assertInteger(value, label)
    }
    assertError(input.error)

    const transaction = this.database.client.transaction(() => {
      const current = this.getSession(input.workspaceId, input.stagingId)
      if (!current) return null
      if (
        input.expectedVersion !== undefined &&
        input.expectedVersion !== null &&
        current.stagingVersion !== input.expectedVersion
      ) {
        return null
      }
      if (
        input.status !== undefined &&
        !SESSION_TRANSITIONS[current.status as BatchTemplateStagingStatus]?.includes(input.status)
      ) {
        invalid(`暂存状态不能从“${current.status}”变更为“${input.status}”。`)
      }
      const nextTotal = input.totalCount ?? current.totalCount
      if (nextTotal < 1 || nextTotal > 100) invalid('暂存总数超出范围。')
      if (input.totalCount !== undefined && input.totalCount !== current.totalCount) {
        invalid('暂存总数创建后不可修改。')
      }
      const nextProcessed = input.processedCount ?? current.processedCount
      const nextIndex = input.currentIndex ?? current.currentIndex
      if (nextProcessed < 0 || nextProcessed > nextTotal) invalid('已处理数量超出范围。')
      if (nextIndex < 0 || nextIndex > nextTotal) invalid('当前暂存位置超出范围。')
      if (
        (input.baseTreeHash !== undefined && input.baseTreeHash !== current.baseTreeHash) ||
        (input.baseWorkspaceVersion !== undefined &&
          input.baseWorkspaceVersion !== current.baseWorkspaceVersion) ||
        (input.outputLanguage !== undefined && input.outputLanguage !== current.outputLanguage) ||
        (input.rootRelativePath !== undefined &&
          input.rootRelativePath !== current.rootRelativePath)
      ) {
        invalid('暂存基线和输出配置创建后不可修改。')
      }

      const next = {
        currentIndex: nextIndex,
        error: input.error === undefined ? current.error : input.error,
        processedCount: nextProcessed,
        status: input.status ?? (current.status as BatchTemplateStagingStatus),
      }
      const changed =
        next.currentIndex !== current.currentIndex ||
        next.error !== current.error ||
        next.processedCount !== current.processedCount ||
        next.status !== current.status
      if (!changed) return current
      if (current.status === 'applied' || current.status === 'discarded') {
        invalid('暂存批次已结束，不能继续修改。')
      }
      const updatedAt = new Date().toISOString()
      const filters = [
        eq(batchTemplateStagingSessions.workspaceId, input.workspaceId),
        eq(batchTemplateStagingSessions.id, input.stagingId),
        eq(batchTemplateStagingSessions.stagingVersion, current.stagingVersion),
      ]
      const result = this.database.orm
        .update(batchTemplateStagingSessions)
        .set({
          currentIndex: next.currentIndex,
          error: next.error,
          processedCount: next.processedCount,
          stagingVersion: sql`${batchTemplateStagingSessions.stagingVersion} + 1`,
          status: next.status,
          updatedAt,
        })
        .where(and(...filters))
        .run()
      if (result.changes !== 1) return null
      return this.getSession(input.workspaceId, input.stagingId)
    })
    return transaction()
  }

  upsertItem(input: UpsertBatchTemplateStagingItemInput): BatchTemplateStagingItemRecord | null
  upsertItem(
    workspaceId: string,
    stagingId: string,
    fields: UpsertBatchTemplateStagingItemFields,
    expectedVersion?: number | null,
  ): BatchTemplateStagingItemRecord | null
  upsertItem(
    inputOrWorkspaceId: UpsertBatchTemplateStagingItemInput | string,
    stagingIdOrFields?: string | UpsertBatchTemplateStagingItemFields,
    fieldsOrExpectedVersion?: UpsertBatchTemplateStagingItemFields | number | null,
    positionalExpectedVersion?: number | null,
  ): BatchTemplateStagingItemRecord | null {
    let input: UpsertBatchTemplateStagingItemInput
    if (typeof inputOrWorkspaceId === 'string') {
      if (
        typeof stagingIdOrFields !== 'string' ||
        !fieldsOrExpectedVersion ||
        typeof fieldsOrExpectedVersion === 'number'
      ) {
        invalid('暂存项更新参数不完整。')
      }
      input = {
        ...fieldsOrExpectedVersion,
        ...(positionalExpectedVersion === undefined
          ? {}
          : { expectedVersion: positionalExpectedVersion }),
        stagingId: stagingIdOrFields,
        workspaceId: inputOrWorkspaceId,
      }
    } else {
      input = inputOrWorkspaceId
    }
    assertUuid(input.workspaceId, '工作区 ID')
    assertUuid(input.stagingId, '暂存 ID')
    validateExpectedVersion(input.expectedVersion)
    const validated = validateCreateItem(input)
    const transaction = this.database.client.transaction(() => {
      const session = this.getSession(input.workspaceId, input.stagingId)
      if (!session) return null
      if (
        input.expectedVersion !== undefined &&
        input.expectedVersion !== null &&
        session.stagingVersion !== input.expectedVersion
      ) {
        return null
      }
      if (session.status === 'applied' || session.status === 'discarded') {
        invalid('暂存批次已结束，不能继续修改。')
      }
      const existing = this.database.orm
        .select()
        .from(batchTemplateStagingItems)
        .where(
          and(
            eq(batchTemplateStagingItems.stagingId, input.stagingId),
            eq(batchTemplateStagingItems.sourceId, input.sourceId),
          ),
        )
        .get()
      if (existing && existing.sourceHash !== validated.sourceHash) {
        // Returning null lets the service turn this into a user-facing source
        // drift error while keeping the repository free of partial writes.
        return null
      }
      if (
        existing &&
        (existing.ordinal !== validated.ordinal ||
          existing.displayPath !== validated.displayPath ||
          existing.fileName !== validated.fileName ||
          existing.sourceEncoding !== validated.sourceEncoding ||
          existing.sourceRelativePath !== validated.sourceRelativePath)
      ) {
        invalid('暂存源文件身份已变化，请重新创建批量导入。')
      }

      if (!existing) {
        // The source set is immutable after createSession. Processing may
        // update an existing item, but it must never smuggle a new source into
        // a session that was already approved by the user.
        invalid('源文件不属于此暂存批次，请重新创建批量导入。')
      }

      const nextStatus =
        input.status === undefined
          ? ((existing?.status as BatchTemplateStagingItemStatus | undefined) ?? 'pending')
          : validated.status
      if (
        existing &&
        !ITEM_TRANSITIONS[existing.status as BatchTemplateStagingItemStatus]?.includes(nextStatus)
      ) {
        invalid(`暂存项状态不能从“${existing.status}”变更为“${nextStatus}”。`)
      }

      const next = {
        classificationJson:
          validated.classificationJson === undefined
            ? (existing?.classificationJson ?? null)
            : validated.classificationJson,
        displayPath: validated.displayPath,
        error: validated.error === undefined ? (existing?.error ?? null) : validated.error,
        fileName: validated.fileName,
        ordinal: validated.ordinal,
        sourceEncoding: validated.sourceEncoding,
        sourceHash: validated.sourceHash,
        sourceId: validated.sourceId,
        sourceRelativePath: validated.sourceRelativePath,
        stagingId: input.stagingId,
        status: nextStatus,
        targetRelativePath:
          validated.targetRelativePath === undefined
            ? (existing?.targetRelativePath ?? null)
            : validated.targetRelativePath,
      }
      const changed =
        !existing ||
        existing.classificationJson !== next.classificationJson ||
        existing.displayPath !== next.displayPath ||
        existing.error !== next.error ||
        existing.fileName !== next.fileName ||
        existing.ordinal !== next.ordinal ||
        existing.sourceEncoding !== next.sourceEncoding ||
        existing.sourceRelativePath !== next.sourceRelativePath ||
        existing.status !== next.status ||
        existing.targetRelativePath !== next.targetRelativePath
      if (!changed) return existing

      const updatedAt = new Date().toISOString()
      const bump = this.database.orm
        .update(batchTemplateStagingSessions)
        .set({
          stagingVersion: sql`${batchTemplateStagingSessions.stagingVersion} + 1`,
          updatedAt,
        })
        .where(
          and(
            eq(batchTemplateStagingSessions.workspaceId, input.workspaceId),
            eq(batchTemplateStagingSessions.id, input.stagingId),
            eq(batchTemplateStagingSessions.stagingVersion, session.stagingVersion),
          ),
        )
        .run()
      if (bump.changes !== 1) return null

      if (existing) {
        const updated = this.database.orm
          .update(batchTemplateStagingItems)
          .set({ ...next, updatedAt })
          .where(
            and(
              eq(batchTemplateStagingItems.stagingId, input.stagingId),
              eq(batchTemplateStagingItems.sourceId, input.sourceId),
            ),
          )
          .run()
        if (updated.changes !== 1) throw new Error('暂存项更新失败。')
      } else {
        this.database.orm
          .insert(batchTemplateStagingItems)
          .values({ ...next, updatedAt })
          .run()
      }
      return this.getItem(input.workspaceId, input.stagingId, input.sourceId)
    })
    return transaction()
  }

  /** Convenience alias used by callers that call all staging mutations “upsert”. */
  upsert(input: UpsertBatchTemplateStagingItemInput): BatchTemplateStagingItemRecord | null
  upsert(
    workspaceId: string,
    stagingId: string,
    fields: UpsertBatchTemplateStagingItemFields,
    expectedVersion?: number | null,
  ): BatchTemplateStagingItemRecord | null
  upsert(
    inputOrWorkspaceId: UpsertBatchTemplateStagingItemInput | string,
    stagingIdOrFields?: string | UpsertBatchTemplateStagingItemFields,
    fieldsOrExpectedVersion?: UpsertBatchTemplateStagingItemFields | number | null,
    positionalExpectedVersion?: number | null,
  ): BatchTemplateStagingItemRecord | null {
    if (typeof inputOrWorkspaceId === 'string') {
      return this.upsertItem(
        inputOrWorkspaceId,
        stagingIdOrFields as string,
        fieldsOrExpectedVersion as UpsertBatchTemplateStagingItemFields,
        positionalExpectedVersion,
      )
    }
    return this.upsertItem(inputOrWorkspaceId)
  }

  /** Convenience alias for item edits (it retains source identity/hash checks). */
  updateItem(input: UpsertBatchTemplateStagingItemInput): BatchTemplateStagingItemRecord | null
  updateItem(
    workspaceId: string,
    stagingId: string,
    fields: UpsertBatchTemplateStagingItemFields,
    expectedVersion?: number | null,
  ): BatchTemplateStagingItemRecord | null
  updateItem(
    inputOrWorkspaceId: UpsertBatchTemplateStagingItemInput | string,
    stagingIdOrFields?: string | UpsertBatchTemplateStagingItemFields,
    fieldsOrExpectedVersion?: UpsertBatchTemplateStagingItemFields | number | null,
    positionalExpectedVersion?: number | null,
  ): BatchTemplateStagingItemRecord | null {
    if (typeof inputOrWorkspaceId === 'string') {
      return this.upsertItem(
        inputOrWorkspaceId,
        stagingIdOrFields as string,
        fieldsOrExpectedVersion as UpsertBatchTemplateStagingItemFields,
        positionalExpectedVersion,
      )
    }
    return this.upsertItem(inputOrWorkspaceId)
  }

  deleteSession(
    workspaceId: string,
    stagingId: string,
    expectedVersion?: number | null,
  ): boolean | null {
    assertUuid(workspaceId, '工作区 ID')
    assertUuid(stagingId, '暂存 ID')
    validateExpectedVersion(expectedVersion)
    const transaction = this.database.client.transaction(() => {
      const current = this.getSession(workspaceId, stagingId)
      if (!current) return false
      if (
        expectedVersion !== undefined &&
        expectedVersion !== null &&
        current.stagingVersion !== expectedVersion
      )
        return null
      const filters = [
        eq(batchTemplateStagingSessions.workspaceId, workspaceId),
        eq(batchTemplateStagingSessions.id, stagingId),
      ]
      if (expectedVersion !== undefined && expectedVersion !== null) {
        filters.push(eq(batchTemplateStagingSessions.stagingVersion, expectedVersion))
      }
      return (
        this.database.orm
          .delete(batchTemplateStagingSessions)
          .where(and(...filters))
          .run().changes > 0
      )
    })
    return transaction()
  }

  delete(workspaceId: string, stagingId: string, expectedVersion?: number | null): boolean | null {
    return this.deleteSession(workspaceId, stagingId, expectedVersion)
  }
}
