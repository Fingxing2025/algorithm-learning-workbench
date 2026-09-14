import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

import BetterSqlite3 from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { runMigrations } from './migrations'
import { databaseSchema } from './schema'
import type { WorkspaceOwnership } from '../services/workspace-runtime-ownership'

export interface AppDatabase {
  client: BetterSqlite3.Database
  close: () => void
  orm: BetterSQLite3Database<typeof databaseSchema>
  path?: string
}

export function createAppDatabase(userDataPath: string): AppDatabase {
  return createDatabaseAtPath(join(userDataPath, 'algorithm-workbench.sqlite'))
}

export function createDatabaseAtPath(databasePath: string): AppDatabase {
  mkdirSync(dirname(databasePath), { recursive: true })
  const client = new BetterSqlite3(databasePath)
  try {
    client.pragma('foreign_keys = ON')
    client.pragma('journal_mode = WAL')
    client.pragma('busy_timeout = 5000')
    runMigrations(client)
  } catch (error) {
    client.close()
    throw error
  }

  return {
    client,
    close: () => client.close(),
    orm: drizzle(client, { schema: databaseSchema }),
    path: databasePath,
  }
}

export class WorkspaceDatabaseManager {
  private active: AppDatabase | null = null
  private activePath: string | null = null
  private ownership: WorkspaceOwnership | null = null

  readonly database: AppDatabase

  constructor() {
    const database = {
      close: () => this.close(),
    } as AppDatabase
    Object.defineProperties(database, {
      client: { enumerable: true, get: () => this.requireActive().client },
      orm: { enumerable: true, get: () => this.requireActive().orm },
      path: { enumerable: true, get: () => this.activePath ?? undefined },
    })
    this.database = database
  }

  get path(): string | null {
    return this.activePath
  }

  isOpenAt(databasePath: string): boolean {
    return this.activePath === databasePath
  }

  ownsContainer(containerRoot: string): boolean {
    return this.ownership?.containerRoot === containerRoot
  }

  open(databasePath: string, ownership?: WorkspaceOwnership, initialize?: () => void): AppDatabase {
    if (this.isOpenAt(databasePath)) {
      initialize?.()
      return this.requireActive()
    }
    // Keep the prior database and ownership alive until the complete switch
    // succeeds. A migration/initialization failure must leave old services safe.
    const next = createDatabaseAtPath(databasePath)
    const previous = { database: this.active, path: this.activePath, ownership: this.ownership }
    this.active = next
    this.activePath = databasePath
    this.ownership = ownership ?? null
    try {
      initialize?.()
    } catch (error) {
      this.active = previous.database
      this.activePath = previous.path
      this.ownership = previous.ownership
      next.close()
      throw error
    }
    previous.database?.close()
    previous.ownership?.release()
    return next
  }

  close(): void {
    try {
      this.active?.close()
    } finally {
      this.active = null
      this.activePath = null
      this.ownership?.release()
      this.ownership = null
    }
  }

  private requireActive(): AppDatabase {
    if (!this.active) {
      throw new Error('No workspace database is active')
    }
    return this.active
  }
}
