import { closeSync, constants, lstatSync, openSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { PublicError } from '../errors/public-error'

// Outside .awb: creation rollback and portable data restore may replace .awb.
// Never unlink this file: another SQLite connection may still own its inode.
export const WORKSPACE_OWNERSHIP_FILE = '.awb-runtime-ownership.sqlite'
const APPLICATION_ID = 0x41574232
export const WORKSPACE_OWNERSHIP_ENTRIES = new Set([
  WORKSPACE_OWNERSHIP_FILE,
  `${WORKSPACE_OWNERSHIP_FILE}-journal`,
  `${WORKSPACE_OWNERSHIP_FILE}-wal`,
  `${WORKSPACE_OWNERSHIP_FILE}-shm`,
])
export interface WorkspaceOwnership {
  containerRoot: string
  release: () => void
}

/** A separate SQLite pager lock covers the entire active workspace lifetime.
 * The kernel releases it on process exit, including SIGKILL. It is independent
 * of the business database, its migrations, backup and restore transactions. */
export function acquireWorkspaceOwnership(containerRoot: string): WorkspaceOwnership {
  const path = join(containerRoot, WORKSPACE_OWNERSHIP_FILE)
  for (const entry of WORKSPACE_OWNERSHIP_ENTRIES) {
    try {
      const stats = lstatSync(join(containerRoot, entry))
      if (!stats.isFile() || stats.isSymbolicLink())
        throw new PublicError(
          'PATH_NOT_AUTHORIZED',
          '工作区所有权文件不是普通文件，请保留现场并检查。',
        )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  try {
    closeSync(
      openSync(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600,
      ),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const initialSize = lstatSync(path).size
  let lock: BetterSqlite3.Database | null = null
  try {
    lock = new BetterSqlite3(path, { timeout: 0 })
    lock.exec('BEGIN EXCLUSIVE')
    const id = lock.pragma('application_id', { simple: true })
    if (id === 0 && initialSize === 0) {
      lock.pragma(`application_id = ${APPLICATION_ID}`)
      lock.exec('COMMIT; BEGIN EXCLUSIVE')
    } else if (id !== APPLICATION_ID) {
      throw new PublicError('PATH_NOT_AUTHORIZED', '工作区所有权文件格式未知，请保留现场并检查。')
    }
    const owned = lock
    let released = false
    return {
      containerRoot,
      release: () => {
        if (released) return
        released = true
        try {
          owned.exec('ROLLBACK')
        } finally {
          owned.close()
        }
      },
    }
  } catch (error) {
    lock?.close()
    if (
      (error as { code?: string }).code?.startsWith('SQLITE_BUSY') ||
      (error as { code?: string }).code?.startsWith('SQLITE_LOCKED')
    )
      throw new PublicError(
        'TASK_CONFLICT',
        '该工作区正在另一个应用实例中使用，请先关闭其工作区再重试。',
      )
    if (error instanceof PublicError) throw error
    throw new PublicError(
      'FILE_UNAVAILABLE',
      '无法取得工作区独占访问，请检查权限并保留所有权文件。',
    )
  }
}
