import { createHash, randomUUID } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { lstat, mkdir, readdir, readFile, rename, rm, rmdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { createDatabaseAtPath, WorkspaceDatabaseManager } from '../database/database'
import { WorkspaceRepository, type WorkspaceRecord } from '../database/workspace-repository'
import { PublicError } from '../errors/public-error'
import {
  containerForTemplateRoot,
  type WorkspaceMarker,
  type WorkspaceStoragePaths,
  WorkspaceStorageManager,
  WORKSPACE_DATA_DIRECTORY,
  WORKSPACE_MARKER_FILE,
  WORKSPACE_TEMPLATE_DIRECTORY,
} from './workspace-storage'

const UPGRADE_STAGING_PREFIX = '.awb-workspace-upgrade-'
const RESERVED_WORKSPACE_ENTRIES = new Set([
  WORKSPACE_MARKER_FILE,
  WORKSPACE_DATA_DIRECTORY,
  'problem-assets',
])

interface UpgradeEntry {
  fingerprint: string
  name: string
}

function portableNameKey(name: string): string {
  return name.normalize('NFC').toLocaleLowerCase('en-US')
}

async function pathExists(path: string): Promise<boolean> {
  return lstat(path)
    .then(() => true)
    .catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    })
}

function assertNoPortableNameCollisions(names: readonly string[]): void {
  const keys = new Set<string>()
  for (const name of names) {
    if (name !== name.normalize('NFC')) {
      throw new PublicError('INVALID_REQUEST', `文件名不是 NFC 规范形式，无法安全升级：${name}`)
    }
    const key = portableNameKey(name)
    if (keys.has(key)) {
      throw new PublicError(
        'INVALID_REQUEST',
        `文件夹内存在仅大小写或 Unicode 形式不同的同名条目，无法安全升级：${name}`,
      )
    }
    keys.add(key)
  }
}

async function pathFingerprint(path: string): Promise<string> {
  const digest = createHash('sha256')
  const walk = async (currentPath: string, relativePath: string): Promise<void> => {
    const stats = await lstat(currentPath)
    if (stats.isSymbolicLink()) {
      throw new PublicError('INVALID_REQUEST', '待升级文件夹包含符号链接，无法安全迁移。')
    }
    const normalizedPath = relativePath.normalize('NFC')
    if (stats.isDirectory()) {
      digest.update('directory\0')
      digest.update(normalizedPath)
      digest.update('\0')
      const entries = await readdir(currentPath, { withFileTypes: true })
      assertNoPortableNameCollisions(entries.map(entry => entry.name))
      for (const entry of entries.sort((left, right) =>
        left.name.localeCompare(right.name, 'en-US'),
      )) {
        await walk(
          join(currentPath, entry.name),
          relativePath ? `${relativePath}/${entry.name}` : entry.name,
        )
      }
      return
    }
    if (!stats.isFile()) {
      throw new PublicError('INVALID_REQUEST', '待升级文件夹包含非普通文件，无法安全迁移。')
    }
    digest.update('file\0')
    digest.update(normalizedPath)
    digest.update('\0')
    digest.update(await readFile(currentPath))
    digest.update('\0')
  }
  await walk(path, '')
  return digest.digest('hex')
}

export class WorkspaceRuntimeManager {
  constructor(
    private readonly workspaceDatabases: WorkspaceDatabaseManager,
    private readonly workspaceRepository: WorkspaceRepository,
    readonly storage: WorkspaceStorageManager,
  ) {}

  async initializeActiveWorkspace(): Promise<WorkspaceRecord | null> {
    const active = this.workspaceRepository.getActiveWorkspace()
    if (!active) return null
    const containerRoot = containerForTemplateRoot(active.rootPath)
    if (!(await pathExists(containerRoot))) return null
    const paths = await this.storage.inspect(containerRoot).catch(() => null)
    if (!paths) return null
    return this.activateContainer(containerRoot, { intent: 'open' })
  }

  async activateContainer(
    containerPath: string,
    options: { intent: 'create' | 'open'; name?: string },
  ): Promise<WorkspaceRecord> {
    const containerRoot = resolve(containerPath)
    let paths = await this.storage.inspect(containerRoot)
    if (!paths) {
      const marker: WorkspaceMarker = {
        createdAt: new Date().toISOString(),
        formatVersion: 2,
        name: options.name ?? (basename(containerRoot) || '算法工作区'),
        templateDirectory: WORKSPACE_TEMPLATE_DIRECTORY,
        workspaceId: randomUUID(),
      }
      paths = await this.createCurrentWorkspace(containerRoot, marker, options.intent)
    }

    const conflict = this.workspaceRepository.getWorkspaceById(paths.marker.workspaceId)
    if (conflict && conflict.rootPath !== paths.templateRoot) {
      const oldRootAvailable = await pathExists(conflict.rootPath)
      if (oldRootAvailable) {
        throw new PublicError(
          'INVALID_REQUEST',
          '检测到同一工作区身份的另一个可用文件夹。为避免两个副本共享身份，已停止打开。',
        )
      }
      this.workspaceRepository.relocateUnavailableWorkspaceIdentity(
        paths.marker.workspaceId,
        paths.templateRoot,
        paths.marker.name,
      )
    }

    const workspace = this.workspaceRepository.upsertWorkspaceIdentity({
      createdAt: paths.marker.createdAt,
      id: paths.marker.workspaceId,
      name: paths.marker.name,
      rootPath: paths.templateRoot,
    })
    this.workspaceDatabases.open(paths.databasePath)
    this.workspaceRepository.ensureWorkspaceDatabaseRecord(workspace)
    this.storage.activate(paths)
    this.workspaceRepository.setActiveWorkspace(workspace.id)
    return workspace
  }

  private async createCurrentWorkspace(
    containerRoot: string,
    marker: WorkspaceMarker,
    intent: 'create' | 'open',
  ): Promise<WorkspaceStoragePaths> {
    const initialEntries = await readdir(containerRoot, { withFileTypes: true })
    if (intent === 'create' && initialEntries.length > 0) {
      throw new PublicError(
        'INVALID_REQUEST',
        '新建工作区需要空白文件夹；若要使用现有内容，请选择“打开工作区”进行升级。',
      )
    }

    const upgradeEntries =
      intent === 'open' ? await this.inspectUpgradeEntries(containerRoot, initialEntries) : []
    const stagingRoot = join(containerRoot, `${UPGRADE_STAGING_PREFIX}${randomUUID()}.tmp`)
    const stagedNames = new Set<string>()
    const publishedNames = new Set<string>()
    let paths: WorkspaceStoragePaths | null = null
    let databasePublished = false
    let markerPublished = false
    let originalTemplatesPublished = false
    const temporaryDatabaseName = `.workspace-${randomUUID()}.sqlite.tmp`

    try {
      if (upgradeEntries.length > 0) {
        await mkdir(stagingRoot, { mode: 0o700 })
        for (const entry of upgradeEntries) {
          await rename(join(containerRoot, entry.name), join(stagingRoot, entry.name))
          stagedNames.add(entry.name)
        }
      }

      paths = this.storage.paths(containerRoot, marker)
      await this.storage.initialize(containerRoot, marker)
      const temporaryDatabasePath = join(paths.dataRoot, temporaryDatabaseName)
      await this.createWorkspaceDatabase(temporaryDatabasePath, marker)

      if (stagedNames.has(WORKSPACE_TEMPLATE_DIRECTORY)) {
        await rmdir(paths.templateRoot)
        await rename(join(stagingRoot, WORKSPACE_TEMPLATE_DIRECTORY), paths.templateRoot)
        stagedNames.delete(WORKSPACE_TEMPLATE_DIRECTORY)
        publishedNames.add(WORKSPACE_TEMPLATE_DIRECTORY)
        originalTemplatesPublished = true
        const templatesEntry = upgradeEntries.find(
          entry => entry.name === WORKSPACE_TEMPLATE_DIRECTORY,
        )
        if (
          templatesEntry &&
          (await pathFingerprint(paths.templateRoot)) !== templatesEntry.fingerprint
        ) {
          throw new PublicError(
            'FILE_UNAVAILABLE',
            `升级后文件校验失败：${WORKSPACE_TEMPLATE_DIRECTORY}`,
          )
        }
      }
      for (const entry of upgradeEntries) {
        if (entry.name === WORKSPACE_TEMPLATE_DIRECTORY) continue
        await rename(join(stagingRoot, entry.name), join(paths.templateRoot, entry.name))
        stagedNames.delete(entry.name)
        publishedNames.add(entry.name)
      }
      for (const entry of upgradeEntries) {
        if (entry.name === WORKSPACE_TEMPLATE_DIRECTORY) continue
        const target = join(paths.templateRoot, entry.name)
        if ((await pathFingerprint(target)) !== entry.fingerprint) {
          throw new PublicError('FILE_UNAVAILABLE', `升级后文件校验失败：${entry.name}`)
        }
      }

      await rename(temporaryDatabasePath, paths.databasePath)
      databasePublished = true
      await this.storage.publishMarker(paths)
      markerPublished = true
      await rm(stagingRoot, { force: true, recursive: true })
      return paths
    } catch (error) {
      const rollbackOk = await this.rollbackWorkspaceCreation({
        containerRoot,
        databasePublished,
        markerPublished,
        originalTemplatesPublished,
        paths,
        publishedNames,
        stagedNames,
        stagingRoot,
        temporaryDatabaseName,
        upgradeEntries,
      })
      if (!rollbackOk) {
        throw new PublicError(
          'FILE_UNAVAILABLE',
          `工作区升级失败且未能完整自动回滚。请停止修改该文件夹，并保留 ${basename(stagingRoot)} 以便恢复。`,
        )
      }
      if (error instanceof PublicError) throw error
      throw new PublicError(
        'DATABASE_ERROR',
        intent === 'open'
          ? '无法升级为当前工作区，原文件已恢复。'
          : '无法创建当前工作区，未保留不完整数据。',
      )
    }
  }

  private async inspectUpgradeEntries(
    containerRoot: string,
    entries: Dirent<string>[],
  ): Promise<UpgradeEntry[]> {
    assertNoPortableNameCollisions(entries.map(entry => entry.name))
    for (const entry of entries) {
      const key = portableNameKey(entry.name)
      if (
        [...RESERVED_WORKSPACE_ENTRIES].some(reserved => portableNameKey(reserved) === key) ||
        entry.name.startsWith(UPGRADE_STAGING_PREFIX)
      ) {
        throw new PublicError(
          'INVALID_REQUEST',
          `文件夹包含当前工作区保留名称，无法直接升级：${entry.name}`,
        )
      }
      if (
        key === portableNameKey(WORKSPACE_TEMPLATE_DIRECTORY) &&
        entry.name !== WORKSPACE_TEMPLATE_DIRECTORY
      ) {
        throw new PublicError(
          'INVALID_REQUEST',
          `模板目录名称必须精确为 ${WORKSPACE_TEMPLATE_DIRECTORY}。`,
        )
      }
    }

    const existingTemplates = entries.find(entry => entry.name === WORKSPACE_TEMPLATE_DIRECTORY)
    if (existingTemplates && !existingTemplates.isDirectory()) {
      throw new PublicError('INVALID_REQUEST', 'templates 已存在但不是普通文件夹。')
    }
    if (existingTemplates) {
      const children = await readdir(join(containerRoot, WORKSPACE_TEMPLATE_DIRECTORY))
      const childKeys = new Set(children.map(portableNameKey))
      for (const entry of entries) {
        if (entry.name === WORKSPACE_TEMPLATE_DIRECTORY) continue
        if (childKeys.has(portableNameKey(entry.name))) {
          throw new PublicError('INVALID_REQUEST', `迁入 templates 时会发生路径冲突：${entry.name}`)
        }
      }
    }

    return Promise.all(
      entries.map(async entry => ({
        fingerprint: await pathFingerprint(join(containerRoot, entry.name)),
        name: entry.name,
      })),
    )
  }

  private async createWorkspaceDatabase(
    databasePath: string,
    marker: WorkspaceMarker,
  ): Promise<void> {
    const target = createDatabaseAtPath(databasePath)
    try {
      target.client
        .prepare(
          `INSERT INTO workspaces (created_at, id, name, root_path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(marker.createdAt, marker.workspaceId, marker.name, WORKSPACE_TEMPLATE_DIRECTORY)
      target.client
        .prepare(
          `INSERT INTO app_state (key, value) VALUES ('active_workspace_id', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(marker.workspaceId)
      const quickCheck = target.client.pragma('quick_check', { simple: true })
      const foreignKeys = target.client.pragma('foreign_key_check') as unknown[]
      if (quickCheck !== 'ok' || foreignKeys.length > 0) {
        throw new PublicError('DATABASE_ERROR', '当前工作区数据库初始化校验失败。')
      }
    } finally {
      target.close()
    }
  }

  private async rollbackWorkspaceCreation(options: {
    containerRoot: string
    databasePublished: boolean
    markerPublished: boolean
    originalTemplatesPublished: boolean
    paths: WorkspaceStoragePaths | null
    publishedNames: Set<string>
    stagedNames: Set<string>
    stagingRoot: string
    temporaryDatabaseName: string
    upgradeEntries: UpgradeEntry[]
  }): Promise<boolean> {
    const { paths } = options
    try {
      if (options.markerPublished && paths) await rm(paths.markerPath, { force: true })
      if (paths) {
        await rm(join(paths.dataRoot, options.temporaryDatabaseName), { force: true })
        await rm(`${join(paths.dataRoot, options.temporaryDatabaseName)}-wal`, { force: true })
        await rm(`${join(paths.dataRoot, options.temporaryDatabaseName)}-shm`, { force: true })
        if (options.databasePublished) await rm(paths.databasePath, { force: true })
      }

      if (paths) {
        for (const entry of [...options.upgradeEntries].reverse()) {
          if (entry.name === WORKSPACE_TEMPLATE_DIRECTORY) continue
          if (options.publishedNames.has(entry.name)) {
            await rename(
              join(paths.templateRoot, entry.name),
              join(options.containerRoot, entry.name),
            )
            options.publishedNames.delete(entry.name)
          }
        }
        if (options.originalTemplatesPublished) {
          await rename(
            paths.templateRoot,
            join(options.containerRoot, WORKSPACE_TEMPLATE_DIRECTORY),
          )
          options.publishedNames.delete(WORKSPACE_TEMPLATE_DIRECTORY)
        } else {
          await rmdir(paths.templateRoot).catch(error => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          })
        }
      }

      for (const entry of [...options.upgradeEntries].reverse()) {
        if (!options.stagedNames.has(entry.name)) continue
        await rename(join(options.stagingRoot, entry.name), join(options.containerRoot, entry.name))
        options.stagedNames.delete(entry.name)
      }
      await rm(options.stagingRoot, { force: true, recursive: true })
      if (paths) {
        await rm(paths.dataRoot, { force: true, recursive: true })
        await rm(join(paths.containerRoot, 'problem-assets'), { force: true, recursive: true })
      }
      return true
    } catch {
      return false
    }
  }
}
