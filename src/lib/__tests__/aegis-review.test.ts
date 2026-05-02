/**
 * SPEC-007 US11 — Aegis-review hook unit tests (FR-090, FR-134).
 */

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { AEGIS_FAILURE_REASONS, evaluateSpec007AegisSignals } from '../aegis-review'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
})

function createDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      description TEXT NOT NULL,
      data TEXT,
      workspace_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE task_dispositions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      disposition TEXT NOT NULL,
      reason TEXT,
      triaged_by_agent_id INTEGER,
      triaged_at INTEGER,
      workspace_id INTEGER NOT NULL
    );
  `)
  return db
}

describe('AEGIS_FAILURE_REASONS', () => {
  it('exports a frozen tuple of exactly two failure reasons', () => {
    expect(Object.isFrozen(AEGIS_FAILURE_REASONS)).toBe(true)
    expect(AEGIS_FAILURE_REASONS).toHaveLength(2)
    expect(AEGIS_FAILURE_REASONS).toEqual(['secret_in_artifact', 'disposition_validation_failed'])
  })
})

describe('evaluateSpec007AegisSignals — review window', () => {
  it('returns null when window.since is null', () => {
    const db = createDb()
    expect(evaluateSpec007AegisSignals(db, 1, { since: null })).toBeNull()
  })

  it('returns null when window.since is undefined', () => {
    const db = createDb()
    expect(evaluateSpec007AegisSignals(db, 1, { since: undefined })).toBeNull()
  })

  it('returns null when no signals present for the task', () => {
    const db = createDb()
    expect(evaluateSpec007AegisSignals(db, 42, { since: 0 })).toBeNull()
  })
})

describe('evaluateSpec007AegisSignals — security_violation', () => {
  it('returns secret_in_artifact when a security_violation activity exists in window', () => {
    const db = createDb()
    db.prepare(
      "INSERT INTO activities (type, entity_type, entity_id, actor, description, workspace_id, created_at) VALUES ('security_violation', 'task', 100, 'task-pipeline', 'secret detected', 1, 5000)",
    ).run()
    const result = evaluateSpec007AegisSignals(db, 100, { since: 1000 })
    expect(result).not.toBeNull()
    expect(result!.reason).toBe('secret_in_artifact')
    expect(result!.evidence).toMatchObject({ activity_created_at: 5000 })
  })

  it('ignores activities outside the review window', () => {
    const db = createDb()
    db.prepare(
      "INSERT INTO activities (type, entity_type, entity_id, actor, description, workspace_id, created_at) VALUES ('security_violation', 'task', 100, 'task-pipeline', 'old', 1, 50)",
    ).run()
    expect(evaluateSpec007AegisSignals(db, 100, { since: 1000 })).toBeNull()
  })

  it('ignores activities for other tasks', () => {
    const db = createDb()
    db.prepare(
      "INSERT INTO activities (type, entity_type, entity_id, actor, description, workspace_id, created_at) VALUES ('security_violation', 'task', 999, 'task-pipeline', 'other', 1, 5000)",
    ).run()
    expect(evaluateSpec007AegisSignals(db, 100, { since: 1000 })).toBeNull()
  })
})

describe('evaluateSpec007AegisSignals — disposition unknown', () => {
  it('returns disposition_validation_failed when an unknown disposition exists', () => {
    const db = createDb()
    db.prepare(
      "INSERT INTO task_dispositions (task_id, disposition, triaged_at, workspace_id) VALUES (200, 'unknown', 8000, 1)",
    ).run()
    const result = evaluateSpec007AegisSignals(db, 200, { since: 1000 })
    expect(result).not.toBeNull()
    expect(result!.reason).toBe('disposition_validation_failed')
    expect(result!.evidence).toMatchObject({ triaged_at: 8000 })
  })

  it('does not flag normal dispositions', () => {
    const db = createDb()
    db.prepare(
      "INSERT INTO task_dispositions (task_id, disposition, triaged_at, workspace_id) VALUES (200, 'closed', 8000, 1)",
    ).run()
    expect(evaluateSpec007AegisSignals(db, 200, { since: 1000 })).toBeNull()
  })
})

describe('evaluateSpec007AegisSignals — precedence', () => {
  it('returns secret_in_artifact when BOTH signals are present', () => {
    const db = createDb()
    db.prepare(
      "INSERT INTO activities (type, entity_type, entity_id, actor, description, workspace_id, created_at) VALUES ('security_violation', 'task', 300, 'task-pipeline', 'secret', 1, 5000)",
    ).run()
    db.prepare(
      "INSERT INTO task_dispositions (task_id, disposition, triaged_at, workspace_id) VALUES (300, 'unknown', 8000, 1)",
    ).run()
    const result = evaluateSpec007AegisSignals(db, 300, { since: 1000 })
    expect(result!.reason).toBe('secret_in_artifact')
  })
})
