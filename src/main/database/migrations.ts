import type BetterSqlite3 from 'better-sqlite3'

import initialMigration from '../../../drizzle/0000_initial.sql?raw'
import problemsMigration from '../../../drizzle/0001_problems_relations.sql?raw'
import aiProvidersMigration from '../../../drizzle/0002_ai_providers.sql?raw'
import templateManagementMigration from '../../../drizzle/0003_template_management.sql?raw'

const migrations = [
  { id: '0000_initial', sql: initialMigration },
  { id: '0001_problems_relations', sql: problemsMigration },
  { id: '0002_ai_providers', sql: aiProvidersMigration },
  { id: '0003_template_management', sql: templateManagementMigration },
] as const

export function runMigrations(client: BetterSqlite3.Database): void {
  client.exec(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const hasMigration = client.prepare('SELECT 1 FROM app_migrations WHERE id = ?')
  const recordMigration = client.prepare(
    'INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)',
  )

  for (const migration of migrations) {
    if (hasMigration.get(migration.id)) {
      continue
    }

    const applyMigration = client.transaction(() => {
      client.exec(migration.sql)
      recordMigration.run(migration.id, new Date().toISOString())
    })
    applyMigration()
  }
}
