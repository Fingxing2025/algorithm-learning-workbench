import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'

import { scanIssueSchema, type ScanSummary, type TemplateSummary } from '@core/contracts/workspace'

import type { AppDatabase } from './database'
import { appState, templates, workspaces } from './schema'

const ACTIVE_WORKSPACE_KEY = 'active_workspace_id'

export type WorkspaceRecord = typeof workspaces.$inferSelect

export class WorkspaceRepository {
  constructor(private readonly database: AppDatabase) {}

  getActiveWorkspace(): WorkspaceRecord | undefined {
    const activeState = this.database.orm
      .select()
      .from(appState)
      .where(eq(appState.key, ACTIVE_WORKSPACE_KEY))
      .get()

    if (!activeState) {
      return undefined
    }

    return this.database.orm
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, activeState.value))
      .get()
  }

  getTemplateWithWorkspace(templateId: string) {
    return this.database.orm
      .select({ template: templates, workspace: workspaces })
      .from(templates)
      .innerJoin(workspaces, eq(templates.workspaceId, workspaces.id))
      .where(eq(templates.id, templateId))
      .get()
  }

  listTemplates(workspaceId: string): TemplateSummary[] {
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
      .where(and(eq(templates.workspaceId, workspaceId), eq(templates.available, true)))
      .orderBy(templates.relativePath)
      .all()
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

  replaceTemplates(
    workspaceId: string,
    templateRows: TemplateSummary[],
    summary: ScanSummary,
    scannedAt: string,
  ): void {
    this.database.orm.transaction(transaction => {
      transaction
        .update(templates)
        .set({ available: false })
        .where(eq(templates.workspaceId, workspaceId))
        .run()

      for (let start = 0; start < templateRows.length; start += 100) {
        const rows = templateRows.slice(start, start + 100).map(template => ({
          ...template,
          workspaceId,
        }))
        if (rows.length > 0) {
          transaction
            .insert(templates)
            .values(rows)
            .onConflictDoUpdate({
              set: {
                available: true,
                extension: sql`excluded.extension`,
                fileName: sql`excluded.file_name`,
                language: sql`excluded.language`,
                modifiedAt: sql`excluded.modified_at`,
                name: sql`excluded.name`,
                relativePath: sql`excluded.relative_path`,
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
          scannedAt,
          skippedSymlinkCount: summary.skippedSymlinkCount,
          templateCount: summary.templateCount,
          unsupportedFileCount: summary.unsupportedFileCount,
        })
        .where(eq(workspaces.id, workspaceId))
        .run()
    })
  }

  setActiveWorkspace(workspaceId: string): void {
    this.database.orm
      .insert(appState)
      .values({ key: ACTIVE_WORKSPACE_KEY, value: workspaceId })
      .onConflictDoUpdate({ target: appState.key, set: { value: workspaceId } })
      .run()
  }

  upsertWorkspace(rootPath: string, name: string): WorkspaceRecord {
    const existing = this.database.orm
      .select()
      .from(workspaces)
      .where(eq(workspaces.rootPath, rootPath))
      .get()

    if (existing) {
      if (existing.name !== name) {
        this.database.orm
          .update(workspaces)
          .set({ name })
          .where(eq(workspaces.id, existing.id))
          .run()
        return { ...existing, name }
      }
      return existing
    }

    const id = randomUUID()
    this.database.orm
      .insert(workspaces)
      .values({ createdAt: new Date().toISOString(), id, name, rootPath })
      .onConflictDoUpdate({ target: workspaces.rootPath, set: { name } })
      .run()

    const workspace = this.database.orm
      .select()
      .from(workspaces)
      .where(eq(workspaces.rootPath, rootPath))
      .get()

    if (!workspace) {
      throw new Error('Workspace was not persisted')
    }
    return workspace
  }
}
