import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import migration from '../../../drizzle/0010_template_classification_confirmations.sql?raw'

const databases: BetterSqlite3.Database[] = []

function databaseWithMigration0009(): BetterSqlite3.Database {
  const database = new BetterSqlite3(':memory:')
  databases.push(database)
  database.pragma('foreign_keys = ON')
  database.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE templates (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
    );
    CREATE TABLE batch_template_staging_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      staging_version INTEGER DEFAULT 0 NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE batch_template_staging_items (
      staging_id TEXT NOT NULL REFERENCES batch_template_staging_sessions(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      classification_json TEXT,
      source_hash TEXT NOT NULL,
      target_relative_path TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (staging_id, source_id)
    );
  `)
  return database
}

afterEach(() => {
  while (databases.length) databases.pop()!.close()
})

describe('migration 0010 template classification confirmations', () => {
  it('preserves 0009 rows and adds durable decision and per-item review fields', () => {
    const database = databaseWithMigration0009()
    database.exec(`
      INSERT INTO workspaces (id) VALUES ('40000000-0000-4000-8000-000000000001');
      INSERT INTO templates (id, workspace_id) VALUES ('template-a', '40000000-0000-4000-8000-000000000001');
      INSERT INTO batch_template_staging_sessions (id, workspace_id, updated_at)
      VALUES ('40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '2026-09-14T08:00:00.000Z');
      INSERT INTO batch_template_staging_items
        (staging_id, source_id, source_hash, updated_at)
      VALUES
        ('40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', '${'a'.repeat(64)}', '2026-09-14T08:00:00.000Z');
    `)

    database.exec(migration)

    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'template_classification_confirmations'",
        )
        .pluck()
        .get(),
    ).toBe('template_classification_confirmations')
    const columns = database
      .prepare('PRAGMA table_info(batch_template_staging_items)')
      .all() as Array<{ name: string }>
    expect(columns.map(column => column.name)).toEqual(
      expect.arrayContaining([
        'review_status',
        'review_decision_json',
        'review_source_hash',
        'review_classification_fingerprint',
        'review_target_fingerprint',
        'review_taxonomy_fingerprint',
        'review_revision',
        'reviewed_at',
      ]),
    )
    expect(
      database
        .prepare(
          'SELECT review_status AS status, review_revision AS revision FROM batch_template_staging_items',
        )
        .get(),
    ).toEqual({ revision: 0, status: 'pending' })
  })

  it('rolls back the whole migration when immutable migration 0009 is absent', () => {
    const database = new BetterSqlite3(':memory:')
    databases.push(database)
    database.exec('CREATE TABLE templates (id TEXT PRIMARY KEY NOT NULL);')

    expect(() => database.transaction(() => database.exec(migration))()).toThrow()
    expect(
      database
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'template_classification_confirmations'",
        )
        .get(),
    ).toBeUndefined()
  })
})
