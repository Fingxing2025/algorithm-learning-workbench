import { randomUUID } from 'node:crypto'

import { and, asc, eq, gt, inArray, like, or, sql } from 'drizzle-orm'

import {
  scanIssueSchema,
  type ScanSummary,
  type TemplatePage,
  type TemplatePageRequest,
  type TemplateSummary,
} from '@core/contracts/workspace'

import type { AppDatabase } from './database'
import { appState, templates, workspaces } from './schema'
import type {
  PreviousTemplateIndexEntry,
  TemplateIndexEntry,
  TemplateScanStats,
} from '../services/template-scanner'
import { PublicError } from '../errors/public-error'

const ACTIVE_WORKSPACE_KEY = 'active_workspace_id'

export type WorkspaceRecord = typeof workspaces.$inferSelect

interface TemplateCursor {
  id: string
  relativePath: string
}

function decodeTemplateCursor(value: string | null): TemplateCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<TemplateCursor>
    if (
      typeof parsed.id !== 'string' ||
      !/^[a-f0-9]{64}$/.test(parsed.id) ||
      typeof parsed.relativePath !== 'string' ||
      parsed.relativePath.length === 0 ||
      parsed.relativePath.length > 4096
    ) {
      throw new Error('invalid cursor')
    }
    return { id: parsed.id, relativePath: parsed.relativePath }
  } catch {
    throw new PublicError('INVALID_REQUEST', '模板分页位置已失效，请从第一批重新加载。')
  }
}

function encodeTemplateCursor(template: Pick<TemplateSummary, 'id' | 'relativePath'>): string {
  return Buffer.from(
    JSON.stringify({ id: template.id, relativePath: template.relativePath }),
  ).toString('base64url')
}

export class WorkspaceRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly registryDatabase: AppDatabase = database,
  ) {}

  getActiveWorkspace(): WorkspaceRecord | undefined {
    const activeState = this.registryDatabase.orm
      .select()
      .from(appState)
      .where(eq(appState.key, ACTIVE_WORKSPACE_KEY))
      .get()

    if (!activeState) {
      return undefined
    }

    const registered = this.registryDatabase.orm
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, activeState.value))
      .get()
    if (!registered || this.registryDatabase === this.database || !this.database.path) {
      return registered
    }

    const local = this.database.orm
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, registered.id))
      .get()
    return local
      ? {
          ...local,
          createdAt: registered.createdAt,
          id: registered.id,
          name: registered.name,
          rootPath: registered.rootPath,
        }
      : registered
  }

  getTemplateWithWorkspace(templateId: string) {
    const workspace = this.getActiveWorkspace()
    if (!workspace) return undefined
    const template = this.database.orm
      .select()
      .from(templates)
      .where(and(eq(templates.id, templateId), eq(templates.workspaceId, workspace.id)))
      .get()
    return template ? { template, workspace } : undefined
  }

  getTemplateByRelativePath(
    workspaceId: string,
    relativePath: string,
  ): TemplateSummary | undefined {
    return this.selectTemplateSummaries()
      .where(
        and(
          eq(templates.workspaceId, workspaceId),
          eq(templates.relativePath, relativePath),
          eq(templates.available, true),
        ),
      )
      .get()
  }

  getTemplateSummary(workspaceId: string, templateId: string): TemplateSummary | undefined {
    return this.selectTemplateSummaries()
      .where(
        and(
          eq(templates.workspaceId, workspaceId),
          eq(templates.id, templateId),
          eq(templates.available, true),
        ),
      )
      .get()
  }

  listTemplates(workspaceId: string): TemplateSummary[] {
    return this.selectTemplateSummaries()
      .where(and(eq(templates.workspaceId, workspaceId), eq(templates.available, true)))
      .orderBy(templates.relativePath)
      .all()
  }

  listTemplatesPage(workspaceId: string, request: TemplatePageRequest): TemplatePage {
    const cursor = decodeTemplateCursor(request.cursor)
    const filters = [eq(templates.workspaceId, workspaceId), eq(templates.available, true)]
    if (request.query) {
      const pattern = `%${request.query}%`
      filters.push(
        or(
          like(templates.name, pattern),
          like(templates.relativePath, pattern),
          like(templates.language, pattern),
        )!,
      )
    }
    const countCondition = and(...filters)
    const pageFilters = [...filters]
    if (cursor) {
      pageFilters.push(
        or(
          gt(templates.relativePath, cursor.relativePath),
          and(eq(templates.relativePath, cursor.relativePath), gt(templates.id, cursor.id)),
        )!,
      )
    }
    const rows = this.selectTemplateSummaries()
      .where(and(...pageFilters))
      .orderBy(asc(templates.relativePath), asc(templates.id))
      .limit(request.limit + 1)
      .all()
    const hasMore = rows.length > request.limit
    const items = hasMore ? rows.slice(0, request.limit) : rows
    const totalCount = Number(
      this.database.orm
        .select({ count: sql<number>`count(*)` })
        .from(templates)
        .where(countCondition)
        .get()?.count ?? 0,
    )
    return {
      items,
      nextAction: hasMore ? '继续加载下一批模板。' : null,
      nextCursor: hasMore && items.length > 0 ? encodeTemplateCursor(items.at(-1)!) : null,
      processedCount: items.length,
      totalCount,
      truncated: hasMore,
      truncatedReason: hasMore ? '模板索引按受控相对路径分批加载。' : null,
    }
  }

  private selectTemplateSummaries() {
    return this.database.orm
      .select({
        extension: templates.extension,
        fileName: templates.fileName,
        id: templates.id,
        language: templates.language,
        modifiedAt: templates.modifiedAt,
        name: templates.name,
        relativePath: templates.relativePath,
        sizeBytes: templates.sizeBytes,
      })
      .from(templates)
  }

  listTemplateIndexEntries(workspaceId: string): PreviousTemplateIndexEntry[] {
    return this.database.orm
      .select({
        available: templates.available,
        changeToken: templates.changeToken,
        contentHash: templates.contentHash,
        extension: templates.extension,
        fileIdentity: templates.fileIdentity,
        fileName: templates.fileName,
        id: templates.id,
        indexVersion: templates.indexVersion,
        language: templates.language,
        modifiedAt: templates.modifiedAt,
        name: templates.name,
        normalizedContentHash: templates.normalizedContentHash,
        relativePath: templates.relativePath,
        similaritySignatureJson: templates.similaritySignatureJson,
        sizeBytes: templates.sizeBytes,
      })
      .from(templates)
      .where(eq(templates.workspaceId, workspaceId))
      .orderBy(templates.relativePath, templates.id)
      .all()
      .map(row => ({
        ...row,
        changeToken: row.changeToken ?? '',
        contentHash: row.contentHash ?? '',
      }))
  }

  parseSummary(workspace: WorkspaceRecord): ScanSummary {
    let issues: unknown
    try {
      issues = JSON.parse(workspace.issuesJson)
    } catch {
      issues = []
    }
    const parsedIssues = scanIssueSchema.array().max(50).safeParse(issues)
    return {
      caseConflictCount: workspace.caseConflictCount,
      issues: parsedIssues.success ? parsedIssues.data : [],
      skippedSymlinkCount: workspace.skippedSymlinkCount,
      templateCount: workspace.templateCount,
      truncated: workspace.scanTruncated,
      unsupportedFileCount: workspace.unsupportedFileCount,
    }
  }

  applyTemplateScan(
    workspaceId: string,
    templateRows: TemplateIndexEntry[],
    summary: ScanSummary,
    stats: TemplateScanStats,
    scannedAt: string,
  ): void {
    this.database.orm.transaction(transaction => {
      const existingAvailableIds = transaction
        .select({ id: templates.id })
        .from(templates)
        .where(and(eq(templates.workspaceId, workspaceId), eq(templates.available, true)))
        .all()
      const finalIds = new Set(templateRows.map(template => template.id))
      const removedIds = existingAvailableIds.map(row => row.id).filter(id => !finalIds.has(id))
      for (let start = 0; start < removedIds.length; start += 500) {
        transaction
          .update(templates)
          .set({ available: false })
          .where(inArray(templates.id, removedIds.slice(start, start + 500)))
          .run()
      }

      const changedRows = templateRows.filter(template => template.changeKind !== 'unchanged')
      for (let start = 0; start < changedRows.length; start += 100) {
        const rows = changedRows.slice(start, start + 100).map(template => ({
          available: true,
          changeToken: template.changeToken,
          contentHash: template.contentHash,
          extension: template.extension,
          fileIdentity: template.fileIdentity,
          fileName: template.fileName,
          id: template.id,
          indexVersion: template.indexVersion,
          language: template.language,
          modifiedAt: template.modifiedAt,
          name: template.name,
          normalizedContentHash: template.normalizedContentHash,
          relativePath: template.relativePath,
          similaritySignatureJson: template.similaritySignatureJson,
          sizeBytes: template.sizeBytes,
          workspaceId,
        }))
        if (rows.length > 0) {
          transaction
            .insert(templates)
            .values(rows)
            .onConflictDoUpdate({
              set: {
                available: true,
                changeToken: sql`excluded.change_token`,
                contentHash: sql`excluded.content_hash`,
                extension: sql`excluded.extension`,
                fileIdentity: sql`excluded.file_identity`,
                fileName: sql`excluded.file_name`,
                indexVersion: sql`excluded.index_version`,
                language: sql`excluded.language`,
                modifiedAt: sql`excluded.modified_at`,
                name: sql`excluded.name`,
                normalizedContentHash: sql`excluded.normalized_content_hash`,
                relativePath: sql`excluded.relative_path`,
                similaritySignatureJson: sql`excluded.similarity_signature_json`,
                sizeBytes: sql`excluded.size_bytes`,
                workspaceId: sql`excluded.workspace_id`,
              },
              target: templates.id,
            })
            .run()
        }
      }

      transaction
        .update(workspaces)
        .set({
          caseConflictCount: summary.caseConflictCount,
          issuesJson: JSON.stringify(summary.issues),
          scanTruncated: summary.truncated,
          scanStatsJson: JSON.stringify(stats),
          scannedAt,
          skippedSymlinkCount: summary.skippedSymlinkCount,
          templateCount: summary.templateCount,
          unsupportedFileCount: summary.unsupportedFileCount,
        })
        .where(eq(workspaces.id, workspaceId))
        .run()
    })
    if (this.registryDatabase !== this.database) {
      this.registryDatabase.orm
        .update(workspaces)
        .set({
          caseConflictCount: summary.caseConflictCount,
          issuesJson: JSON.stringify(summary.issues),
          scanTruncated: summary.truncated,
          scanStatsJson: JSON.stringify(stats),
          scannedAt,
          skippedSymlinkCount: summary.skippedSymlinkCount,
          templateCount: summary.templateCount,
          unsupportedFileCount: summary.unsupportedFileCount,
        })
        .where(eq(workspaces.id, workspaceId))
        .run()
    }
  }

  setActiveWorkspace(workspaceId: string): void {
    this.registryDatabase.orm
      .insert(appState)
      .values({ key: ACTIVE_WORKSPACE_KEY, value: workspaceId })
      .onConflictDoUpdate({ target: appState.key, set: { value: workspaceId } })
      .run()
  }

  upsertWorkspace(rootPath: string, name: string): WorkspaceRecord {
    const existing = this.registryDatabase.orm
      .select()
      .from(workspaces)
      .where(eq(workspaces.rootPath, rootPath))
      .get()

    if (existing) {
      if (existing.name !== name) {
        this.registryDatabase.orm
          .update(workspaces)
          .set({ name })
          .where(eq(workspaces.id, existing.id))
          .run()
        return { ...existing, name }
      }
      return existing
    }

    return this.upsertWorkspaceIdentity({
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      name,
      rootPath,
    })
  }

  getWorkspaceById(workspaceId: string): WorkspaceRecord | undefined {
    return this.registryDatabase.orm
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .get()
  }

  getWorkspaceByRootPath(rootPath: string): WorkspaceRecord | undefined {
    return this.registryDatabase.orm
      .select()
      .from(workspaces)
      .where(eq(workspaces.rootPath, rootPath))
      .get()
  }

  relocateUnavailableWorkspaceIdentity(workspaceId: string, rootPath: string, name: string): void {
    const pathConflict = this.getWorkspaceByRootPath(rootPath)
    if (pathConflict && pathConflict.id !== workspaceId) {
      throw new PublicError('INVALID_REQUEST', '该文件夹已登记为另一个工作区。')
    }
    this.registryDatabase.orm
      .update(workspaces)
      .set({ name, rootPath })
      .where(eq(workspaces.id, workspaceId))
      .run()
  }

  upsertWorkspaceIdentity(identity: {
    createdAt: string
    id: string
    name: string
    rootPath: string
  }): WorkspaceRecord {
    const idConflict = this.getWorkspaceById(identity.id)
    if (idConflict && idConflict.rootPath !== identity.rootPath) {
      throw new PublicError(
        'INVALID_REQUEST',
        '该工作区身份已在另一个可用位置登记，请先打开原位置或将副本作为新工作区导入。',
      )
    }
    const pathConflict = this.getWorkspaceByRootPath(identity.rootPath)
    if (pathConflict && pathConflict.id !== identity.id) {
      throw new PublicError('INVALID_REQUEST', '该文件夹已登记为另一个工作区。')
    }
    this.registryDatabase.orm
      .insert(workspaces)
      .values(identity)
      .onConflictDoUpdate({
        target: workspaces.id,
        set: { name: identity.name, rootPath: identity.rootPath },
      })
      .run()

    const workspace = this.registryDatabase.orm
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, identity.id))
      .get()

    if (!workspace) {
      throw new Error('Workspace was not persisted')
    }
    return workspace
  }

  ensureWorkspaceDatabaseRecord(workspace: WorkspaceRecord): void {
    this.database.orm
      .insert(workspaces)
      .values({
        ...workspace,
        rootPath: 'templates',
      })
      .onConflictDoUpdate({
        target: workspaces.id,
        set: {
          name: workspace.name,
          rootPath: 'templates',
        },
      })
      .run()
    this.database.orm
      .insert(appState)
      .values({ key: ACTIVE_WORKSPACE_KEY, value: workspace.id })
      .onConflictDoUpdate({ target: appState.key, set: { value: workspace.id } })
      .run()
  }

  syncWorkspaceSummaryFromDatabase(workspaceId: string): void {
    if (this.registryDatabase === this.database) return
    const source = this.database.orm
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .get()
    if (!source) return
    this.registryDatabase.orm
      .update(workspaces)
      .set({
        caseConflictCount: source.caseConflictCount,
        issuesJson: source.issuesJson,
        scanStatsJson: source.scanStatsJson,
        scanTruncated: source.scanTruncated,
        scannedAt: source.scannedAt,
        skippedSymlinkCount: source.skippedSymlinkCount,
        templateCount: source.templateCount,
        unsupportedFileCount: source.unsupportedFileCount,
      })
      .where(eq(workspaces.id, workspaceId))
      .run()
  }
}
