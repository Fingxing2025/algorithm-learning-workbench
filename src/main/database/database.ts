import { join } from 'node:path'

import BetterSqlite3 from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { runMigrations } from './migrations'
import { databaseSchema } from './schema'

export interface AppDatabase {
  client: BetterSqlite3.Database
  close: () => void
  orm: BetterSQLite3Database<typeof databaseSchema>
}

export function createAppDatabase(userDataPath: string): AppDatabase {
  const client = new BetterSqlite3(join(userDataPath, 'algorithm-workbench.sqlite'))
  client.pragma('foreign_keys = ON')
  client.pragma('journal_mode = WAL')
  client.pragma('busy_timeout = 5000')
  runMigrations(client)

  return {
    client,
    close: () => client.close(),
    orm: drizzle(client, { schema: databaseSchema }),
  }
}
