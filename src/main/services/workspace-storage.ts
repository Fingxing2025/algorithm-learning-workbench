import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { z } from 'zod'

import { PublicError } from '../errors/public-error'
import { isPathInsideRoot } from '../security/path-guard'

export const WORKSPACE_MARKER_FILE = 'workspace.awb.json'
export const WORKSPACE_DATA_DIRECTORY = '.awb'
export const WORKSPACE_DATABASE_FILE = 'workspace.sqlite'
export const WORKSPACE_TEMPLATE_DIRECTORY = 'templates'
export const WORKSPACE_PROBLEM_ASSET_DIRECTORY = join('problem-assets', 'images')

export const workspaceMarkerSchema = z
  .object({
    createdAt: z.string().datetime(),
    formatVersion: z.literal(2),
    name: z.string().trim().min(1).max(255),
    templateDirectory: z.literal(WORKSPACE_TEMPLATE_DIRECTORY),
    workspaceId: z.string().uuid(),
  })
  .strict()

export type WorkspaceMarker = z.infer<typeof workspaceMarkerSchema>

export interface WorkspaceStoragePaths {
  containerRoot: string
  dataRoot: string
  databasePath: string
  filePlanBackupRoot: string
  marker: WorkspaceMarker
  markerPath: string
  problemImagesRoot: string
  recoveryRoot: string
  templateRoot: string
}

export class WorkspaceStorageManager {
  private active: WorkspaceStoragePaths | null = null

  get current(): WorkspaceStoragePaths | null {
    return this.active
  }

  activate(paths: WorkspaceStoragePaths): void {
    this.active = paths
  }

  clear(): void {
    this.active = null
  }

  requireActive(): WorkspaceStoragePaths {
    if (!this.active) {
      throw new PublicError('WORKSPACE_REQUIRED', '请先创建或选择工作区。')
    }
    return this.active
  }

  getDataRoot(): string {
    return this.requireActive().dataRoot
  }

  getProblemImagesRoot(): string {
    return this.requireActive().problemImagesRoot
  }

  getTemplateRoot(): string {
    return this.requireActive().templateRoot
  }

  async inspect(containerPath: string): Promise<WorkspaceStoragePaths | null> {
    const containerRoot = await this.resolveContainer(containerPath)
    const markerPath = join(containerRoot, WORKSPACE_MARKER_FILE)
    const markerStats = await lstat(markerPath).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    })
    if (!markerStats) return null
    if (!markerStats.isFile() || markerStats.isSymbolicLink()) {
      throw new PublicError('INVALID_REQUEST', '工作区标记不是普通文件，已停止打开。')
    }
    let marker: WorkspaceMarker
    try {
      marker = workspaceMarkerSchema.parse(JSON.parse(await readFile(markerPath, 'utf8')))
    } catch {
      throw new PublicError('INVALID_REQUEST', '工作区标记已损坏或版本不受支持。')
    }
    return this.paths(containerRoot, marker)
  }

  async initialize(containerPath: string, marker: WorkspaceMarker): Promise<WorkspaceStoragePaths> {
    const containerRoot = await this.resolveContainer(containerPath)
    const paths = this.paths(containerRoot, marker)
    await mkdir(paths.templateRoot, { mode: 0o700, recursive: true })
    await mkdir(paths.problemImagesRoot, { mode: 0o700, recursive: true })
    await mkdir(paths.filePlanBackupRoot, { mode: 0o700, recursive: true })
    await mkdir(join(paths.dataRoot, 'restore-preflight-backups'), {
      mode: 0o700,
      recursive: true,
    })
    await mkdir(paths.recoveryRoot, { mode: 0o700, recursive: true })
    await mkdir(join(paths.dataRoot, 'cache'), { mode: 0o700, recursive: true })
    return paths
  }

  async publishMarker(paths: WorkspaceStoragePaths): Promise<void> {
    const temporaryPath = join(paths.containerRoot, `.${WORKSPACE_MARKER_FILE}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporaryPath, `${JSON.stringify(paths.marker, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      })
      await rename(temporaryPath, paths.markerPath)
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  paths(containerRoot: string, marker: WorkspaceMarker): WorkspaceStoragePaths {
    const normalizedContainer = resolve(containerRoot)
    const templateRoot = join(normalizedContainer, WORKSPACE_TEMPLATE_DIRECTORY)
    if (!isPathInsideRoot(normalizedContainer, templateRoot)) {
      throw new PublicError('PATH_NOT_AUTHORIZED', '模板目录不在工作区文件夹内。')
    }
    const dataRoot = join(normalizedContainer, WORKSPACE_DATA_DIRECTORY)
    return {
      containerRoot: normalizedContainer,
      dataRoot,
      databasePath: join(dataRoot, WORKSPACE_DATABASE_FILE),
      filePlanBackupRoot: join(dataRoot, 'file-plan-backups'),
      marker,
      markerPath: join(normalizedContainer, WORKSPACE_MARKER_FILE),
      problemImagesRoot: join(normalizedContainer, WORKSPACE_PROBLEM_ASSET_DIRECTORY),
      recoveryRoot: join(dataRoot, 'recovery'),
      templateRoot,
    }
  }

  private async resolveContainer(containerPath: string): Promise<string> {
    const requested = resolve(containerPath)
    if (!isAbsolute(requested)) {
      throw new PublicError('INVALID_REQUEST', '工作区路径必须是绝对路径。')
    }
    const canonical = await realpath(requested).catch(() => null)
    if (!canonical) {
      throw new PublicError('FILE_UNAVAILABLE', '工作区文件夹不存在或不可访问。')
    }
    const stats = await lstat(canonical)
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new PublicError('INVALID_REQUEST', '工作区必须是普通文件夹。')
    }
    return canonical
  }
}

export function containerForTemplateRoot(templateRoot: string): string {
  return basename(templateRoot) === WORKSPACE_TEMPLATE_DIRECTORY
    ? dirname(templateRoot)
    : templateRoot
}

export function pathIsInsideWorkspace(containerRoot: string, candidate: string): boolean {
  const pathFromContainer = relative(resolve(containerRoot), resolve(candidate))
  return (
    pathFromContainer === '' ||
    (!isAbsolute(pathFromContainer) && !pathFromContainer.startsWith('..'))
  )
}
