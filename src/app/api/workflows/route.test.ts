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
  db.prepare('INSERT INTO workspaces (id, slug, name, tenant_id, feature_flags) VALUES (?, ?, ?, ?, ?)').run(
    4,
    'assembly',
    'Assembly',
    10,
    null
  )
  mocks.getDatabase.mockReturnValue(db)
}

function request(method: string, path: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  })
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Review Intake',
    description: 'Review incoming request',
    model: 'sonnet',
    task_prompt: 'Review the request and return structured output.',
    timeout_seconds: 300,
    agent_role: 'reviewer',
    tags: ['review', 'pipeline'],
    ...overrides,
  }
}

describe('/api/workflows chain-field contract', () => {
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

  it('persists and returns chain fields on create and update', async () => {
    const { POST, PUT } = await import('./route')
    const outputSchema = {
      type: 'object',
      properties: { outcome: { type: 'string' } },
      required: ['outcome'],
    }
    const routingRules = [{ when: '$.outcome == "ready"', next_template_slug: 'publish-pr' }]

    const createResponse = await POST(request('POST', '/api/workflows?workspace_id=4', basePayload({
      slug: 'review-intake',
      output_schema: outputSchema,
      routing_rules: routingRules,
      next_template_slug: 'manual-review',
      produces_pr: true,
      external_terminal_event: 'review.completed',
      allow_redacted_artifacts: true,
    })))
    const createPayload = await createResponse.json() as { template: Record<string, unknown> }

    expect(createResponse.status).toBe(201)
    expect(createPayload.template).toMatchObject({
      workspace_id: 4,
      slug: 'review-intake',
      output_schema: outputSchema,
      routing_rules: routingRules,
      next_template_slug: 'manual-review',
      produces_pr: true,
      external_terminal_event: 'review.completed',
      allow_redacted_artifacts: true,
      tags: ['review', 'pipeline'],
    })

    const updateRules = [{ when: '$.outcome == "blocked"', next_template_slug: 'blocked-review' }]
    const updateResponse = await PUT(request('PUT', '/api/workflows?workspace_id=4', {
      id: createPayload.template.id,
      slug: 'review-intake-v2',
      output_schema: outputSchema,
      routing_rules: updateRules,
      next_template_slug: 'archive',
      produces_pr: false,
      external_terminal_event: 'review.archived',
      allow_redacted_artifacts: false,
      tags: ['updated'],
    }))
    const updatePayload = await updateResponse.json() as { template: Record<string, unknown> }

    expect(updateResponse.status).toBe(200)
    expect(updatePayload.template).toMatchObject({
      slug: 'review-intake-v2',
      output_schema: outputSchema,
      routing_rules: updateRules,
      next_template_slug: 'archive',
      produces_pr: false,
      external_terminal_event: 'review.archived',
      allow_redacted_artifacts: false,
      tags: ['updated'],
    })
  })

  it('rejects routing_rules without output_schema', async () => {
    const { POST } = await import('./route')

    const response = await POST(request('POST', '/api/workflows?workspace_id=4', basePayload({
      routing_rules: [{ when: '$.outcome == "ready"', next_template_slug: 'publish-pr' }],
    })))
    const payload = await response.json() as { error?: string; details?: string[] }

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Validation failed')
    expect(payload.details?.join('\n')).toContain('routing_rules')
    expect(payload.details?.join('\n')).toContain('output_schema')
  })

  it('allows static next_template_slug without output_schema', async () => {
    const { POST } = await import('./route')

    const response = await POST(request('POST', '/api/workflows?workspace_id=4', basePayload({
      slug: 'static-successor',
      next_template_slug: 'manual-review',
    })))
    const payload = await response.json() as { template: Record<string, unknown> }

    expect(response.status).toBe(201)
    expect(payload.template).toMatchObject({
      slug: 'static-successor',
      output_schema: null,
      routing_rules: [],
      next_template_slug: 'manual-review',
    })
  })
})
