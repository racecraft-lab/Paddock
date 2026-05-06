import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '@/lib/migrations'

describe('M71 workflow contract diagnostics migration', () => {
  it('creates generic diagnostics and snapshot tables idempotently', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    runMigrations(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'workflow_contract_%' ORDER BY name").all() as Array<{ name: string }>
    expect(tables.map(row => row.name)).toEqual([
      'workflow_contract_run_errors',
      'workflow_contract_runs',
      'workflow_contract_snapshots',
    ])
    expect(db.prepare("SELECT id FROM schema_migrations WHERE id = '071_workflow_contract_diagnostics'").get()).toEqual({ id: '071_workflow_contract_diagnostics' })
  })
})
