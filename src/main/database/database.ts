import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

import BetterSqlite3 from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { runMigrations } from './migrations'
import { databaseSchema } from './schema'

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
  client.pragma('foreign_keys = ON')
  client.pragma('journal_mode = WAL')
  client.pragma('busy_timeout = 5000')
  runMigrations(client)

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

  open(databasePath: string): AppDatabase {
    if (this.isOpenAt(databasePath)) return this.requireActive()
    this.close()
    this.active = createDatabaseAtPath(databasePath)
    this.activePath = databasePath
    return this.active
  }

  close(): void {
    this.active?.close()
    this.active = null
    this.activePath = null
  }

  private requireActive(): AppDatabase {
    if (!this.active) {
      throw new Error('No workspace database is active')
    }
    return this.active
  }
}
