import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  mutationLimiter: vi.fn(() => null),
  getDatabase: vi.fn(),
  logActivity: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/rate-limit', () => ({ mutationLimiter: mocks.mutationLimiter }))
vi.mock('@/lib/db', () => ({
  getDatabase: mocks.getDatabase,
  db_helpers: { logActivity: mocks.logActivity },
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

let db: Database.Database

function setupDatabase() {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      tenant_id INTEGER NOT NULL DEFAULT 10,
      feature_flags TEXT,
      created_at INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      actor_id INTEGER,
      target_type TEXT,
      target_id INTEGER,
      detail TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      model TEXT NOT NULL DEFAULT 'sonnet',
      task_prompt TEXT NOT NULL,
      timeout_seconds INTEGER NOT NULL DEFAULT 300,
      agent_role TEXT,
      tags TEXT,
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used_at INTEGER,
      use_count INTEGER NOT NULL DEFAULT 0,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      slug TEXT,
      output_schema JSON,
      routing_rules JSON,
      next_template_slug TEXT,
      produces_pr BOOLEAN NOT NULL DEFAULT 0,
      external_terminal_event TEXT,
      allow_redacted_artifacts BOOLEAN NOT NULL DEFAULT 0
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, name, tenant_id, feature_flags) VALUES (?, ?, ?, ?, ?)').run(
    1,
    'default',
    'Default',
    10,
    '{"FEATURE_WORKSPACE_SWITCHER":true}'
  )
  db.prepare('INSERT INTO workspaces (id, slug, name, tenant_id, feature_flags) VALUES (?, ?, ?, ?, ?)').run(4, 'assembly', 'Assembly', 10, null)
  mocks.getDatabase.mockReturnValue(db)
}

function request(method: string, path: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  })
}

function insertTemplate() {
  return Number(db.prepare(`
    INSERT INTO workflow_templates (name, task_prompt, tags, workspace_id)
    VALUES (?, ?, ?, ?)
  `).run('Delete Me', 'Delete prompt', '[]', 4).lastInsertRowid)
}

describe('DELETE /api/workflows compatibility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    setupDatabase()
    mocks.requireRole.mockReturnValue({
      user: { id: 12, username: 'operator', role: 'operator', workspace_id: 1, tenant_id: 10 },
    })
  })

  afterEach(() => {
    db.close()
  })

  it('deletes by query parameter without requiring a JSON body', async () => {
    const { DELETE } = await import('./route')
    const id = insertTemplate()

    const response = await DELETE(request('DELETE', `/api/workflows?id=${id}&workspace_id=4`))

    expect(response.status).toBe(200)
    expect(db.prepare('SELECT id FROM workflow_templates WHERE id = ?').get(id)).toBeUndefined()
  })

  it('keeps JSON-body delete backward compatible', async () => {
    const { DELETE } = await import('./route')
    const id = insertTemplate()

    const response = await DELETE(request('DELETE', '/api/workflows?workspace_id=4', { id }))

    expect(response.status).toBe(200)
    expect(db.prepare('SELECT id FROM workflow_templates WHERE id = ?').get(id)).toBeUndefined()
  })
})
