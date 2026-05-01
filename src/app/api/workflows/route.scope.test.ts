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
  db.prepare('INSERT INTO workspaces (id, slug, name, tenant_id, feature_flags) VALUES (?, ?, ?, ?, ?)').run(3, 'facility', 'Facility', 10, null)
  db.prepare('INSERT INTO workspaces (id, slug, name, tenant_id, feature_flags) VALUES (?, ?, ?, ?, ?)').run(4, 'assembly', 'Assembly', 10, null)
  db.prepare('INSERT INTO workspaces (id, slug, name, tenant_id, feature_flags) VALUES (?, ?, ?, ?, ?)').run(5, 'paint', 'Paint', 10, null)
  mocks.getDatabase.mockReturnValue(db)
}

function request(method: string, path: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  })
}

function insertTemplate(workspaceId: number, name: string, fields: Record<string, unknown> = {}) {
  const result = db.prepare(`
    INSERT INTO workflow_templates
      (name, description, model, task_prompt, timeout_seconds, agent_role, tags, created_by, workspace_id, slug, output_schema, routing_rules, next_template_slug, produces_pr, external_terminal_event, allow_redacted_artifacts)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    null,
    'sonnet',
    `Prompt for ${name}`,
    300,
    null,
    '[]',
    'system',
    workspaceId,
    fields.slug ?? null,
    fields.output_schema ? JSON.stringify(fields.output_schema) : null,
    fields.routing_rules ? JSON.stringify(fields.routing_rules) : '[]',
    fields.next_template_slug ?? null,
    fields.produces_pr ? 1 : 0,
    fields.external_terminal_event ?? null,
    fields.allow_redacted_artifacts ? 1 : 0
  )
  return Number(result.lastInsertRowid)
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Scoped Workflow',
    model: 'sonnet',
    task_prompt: 'Do scoped work',
    timeout_seconds: 300,
    tags: [],
    ...overrides,
  }
}

describe('/api/workflows Product Line scoping', () => {
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

  it('lists only the selected Product Line and does not fall back to auth.user.workspace_id', async () => {
    const { GET } = await import('./route')
    insertTemplate(1, 'Fallback Workspace')
    insertTemplate(4, 'Assembly Workflow')
    insertTemplate(5, 'Paint Workflow')

    const response = await GET(request('GET', '/api/workflows?workspace_id=4'))
    const payload = await response.json() as { templates: Array<{ name: string; workspace_id: number }> }

    expect(response.status).toBe(200)
    expect(payload.templates).toEqual([{ name: 'Assembly Workflow', workspace_id: 4, tags: [], output_schema: null, routing_rules: [], produces_pr: false, allow_redacted_artifacts: false, external_terminal_event: null, next_template_slug: null, slug: null, agent_role: null, description: null, id: expect.any(Number), model: 'sonnet', task_prompt: 'Prompt for Assembly Workflow', timeout_seconds: 300, created_by: 'system', created_at: expect.any(Number), updated_at: expect.any(Number), last_used_at: null, use_count: 0 }])
  })

  it('creates, updates, usage-tracks, and deletes in the selected Product Line scope', async () => {
    const { POST, PUT, DELETE } = await import('./route')

    const createResponse = await POST(request('POST', '/api/workflows?workspace_id=4', basePayload({
      slug: 'scoped-workflow',
      next_template_slug: 'next-step',
    })))
    const createPayload = await createResponse.json() as { template: { id: number; workspace_id: number } }

    expect(createResponse.status).toBe(201)
    expect(createPayload.template.workspace_id).toBe(4)

    const updateResponse = await PUT(request('PUT', '/api/workflows?workspace_id=4', {
      id: createPayload.template.id,
      name: 'Scoped Workflow Updated',
      allow_redacted_artifacts: true,
    }))
    const updatePayload = await updateResponse.json() as { template: { allow_redacted_artifacts: boolean; use_count: number; next_template_slug: string } }

    expect(updateResponse.status).toBe(200)
    expect(updatePayload.template.allow_redacted_artifacts).toBe(true)
    expect(updatePayload.template.next_template_slug).toBe('next-step')
    expect(updatePayload.template.use_count).toBe(0)

    const usageResponse = await PUT(request('PUT', '/api/workflows?workspace_id=4', { id: createPayload.template.id }))
    const usagePayload = await usageResponse.json() as { template: { use_count: number; next_template_slug: string; allow_redacted_artifacts: boolean } }

    expect(usageResponse.status).toBe(200)
    expect(usagePayload.template.use_count).toBe(1)
    expect(usagePayload.template.next_template_slug).toBe('next-step')
    expect(usagePayload.template.allow_redacted_artifacts).toBe(true)

    const deleteResponse = await DELETE(request('DELETE', `/api/workflows?id=${createPayload.template.id}&workspace_id=4`))
    const deleted = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(createPayload.template.id)

    expect(deleteResponse.status).toBe(200)
    expect(deleted).toBeUndefined()
  })

  it.each([
    ['POST', '/api/workflows?workspace_scope=facility', basePayload()],
    ['PUT', '/api/workflows?workspace_scope=facility', { id: 1, name: 'Nope' }],
    ['DELETE', '/api/workflows?id=1&workspace_scope=facility', undefined],
  ])('rejects Facility aggregate scope for %s mutations', async (method, path, body) => {
    const route = await import('./route')
    const response = await route[method as 'POST' | 'PUT' | 'DELETE'](request(method, path, body))
    const payload = await response.json() as { error?: string }

    expect(response.status).toBe(400)
    expect(payload.error).toContain('Product Line scope')
  })

  it('rejects unauthorized workspace ids before listing or mutating workflow templates', async () => {
    const { GET, POST } = await import('./route')

    const listResponse = await GET(request('GET', '/api/workflows?workspace_id=99'))
    const createResponse = await POST(request('POST', '/api/workflows?workspace_id=99', basePayload()))

    expect(listResponse.status).toBe(403)
    expect(createResponse.status).toBe(403)
  })
})
