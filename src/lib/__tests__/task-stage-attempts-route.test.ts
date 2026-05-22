import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as getApiIndex } from '@/app/api/index/route'
import {
  appendTaskStageAttemptEvent,
  createTaskStageAttempt,
} from '../task-stage-attempts'

const stageAttemptsRoutePath = '@/app/api/tasks/[id]/stage-attempts/route'
const repoRoot = path.resolve(__dirname, '..', '..', '..')
const openapiPath = path.join(repoRoot, 'openapi.json')
const openDbs: Database.Database[] = []

interface OpenApiOperation {
  tags?: string[]
  parameters?: {
    name: string
    in: string
    required?: boolean
    schema?: Record<string, unknown>
  }[]
  responses?: Record<string, {
    content?: {
      'application/json'?: {
        schema?: {
          required?: string[]
          properties?: Record<string, Record<string, unknown>>
        }
      }
    }
  }>
}

interface OpenApiDoc {
  paths: Record<string, Record<string, OpenApiOperation>>
}

interface CountRow {
  readonly count: number
}

interface AttemptRow {
  readonly id: number
  readonly status: string
  readonly updated_at: string
  readonly started_at: string | null
  readonly completed_at: string | null
  readonly archived_at: string | null
}

interface StageAttemptsRouteModule {
  GET: (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => Promise<Response>
}

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
  vi.resetModules()
  vi.clearAllMocks()
})

function loadOpenApiDoc(): OpenApiDoc {
  const raw = fs.readFileSync(openapiPath, 'utf8')
  return JSON.parse(raw) as OpenApiDoc
}

function openRouteDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      tenant_id INTEGER NOT NULL,
      feature_flags TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT,
      actor TEXT,
      actor_id INTEGER,
      target_type TEXT,
      target_id INTEGER,
      detail TEXT,
      ip_address TEXT,
      user_agent TEXT
    );

    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT
    );

    CREATE TABLE task_stage_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL CHECK(length(trim(stage_key)) > 0),
      attempt_number INTEGER NOT NULL CHECK(attempt_number > 0),
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      archived_at TEXT,
      run_id TEXT,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      metadata_json TEXT,
      UNIQUE(workspace_id, task_id, stage_key, attempt_number)
    );

    CREATE TABLE task_stage_attempt_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES task_stage_attempts(id) ON DELETE CASCADE,
      workspace_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      actor_type TEXT,
      actor_id TEXT,
      message TEXT,
      metadata_json TEXT
    );

    CREATE INDEX idx_task_stage_attempts_task_stage_attempt
      ON task_stage_attempts(workspace_id, task_id, stage_key, attempt_number DESC);
    CREATE INDEX idx_task_stage_attempt_events_attempt_order
      ON task_stage_attempt_events(attempt_id, observed_at ASC, id ASC);

    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      agent_name TEXT,
      runtime TEXT,
      git_branch TEXT,
      git_commit TEXT,
      error TEXT,
      steps TEXT DEFAULT '[]',
      cost_usd REAL,
      metadata TEXT DEFAULT '{}'
    );
  `)
  db.prepare(`
    INSERT INTO workspaces (id, slug, name, tenant_id, feature_flags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 1)
  `).run(7, 'product-line-a', 'Product Line A', 1, JSON.stringify({
    FEATURE_WORKSPACE_SWITCHER: true,
    FEATURE_TASK_CONTROL_PLANE: false,
  }))
  db.prepare(`
    INSERT INTO workspaces (id, slug, name, tenant_id, feature_flags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 1)
  `).run(8, 'product-line-b', 'Product Line B', 1, JSON.stringify({
    FEATURE_WORKSPACE_SWITCHER: true,
  }))
  db.prepare(`
    INSERT INTO workspaces (id, slug, name, tenant_id, feature_flags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 1)
  `).run(99, 'other-tenant', 'Other Tenant', 2, JSON.stringify({
    FEATURE_WORKSPACE_SWITCHER: true,
  }))
  db.prepare(`
    INSERT INTO tasks (id, workspace_id, title, status, workflow_template_id, workflow_template_slug)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(101, 7, 'Remediate issue', 'in_progress', 22, 'mission-control_issue_remediation')
  db.prepare(`
    INSERT INTO tasks (id, workspace_id, title, status, workflow_template_id, workflow_template_slug)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(202, 8, 'Hidden task', 'todo', null, null)
  return db
}

function mockRouteDeps(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db }))
  vi.doMock('@/lib/auth', () => ({
    requireRole: vi.fn((request: Request, minRole: 'viewer' | 'operator' | 'admin') => {
      expect(minRole).toBe('viewer')
      const auth = request.headers.get('x-test-auth')
      if (auth === 'none') {
        return { error: 'Authentication required', status: 401 }
      }
      return {
        user: {
          id: 42,
          username: auth ?? 'viewer',
          role: auth ?? 'viewer',
          workspace_id: 7,
          tenant_id: 1,
        },
      }
    }),
  }))
  vi.doMock('@/lib/logger', () => ({
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  }))
}

async function loadStageAttemptsRoute(db: Database.Database): Promise<StageAttemptsRouteModule> {
  mockRouteDeps(db)
  return await import(stageAttemptsRoutePath) as StageAttemptsRouteModule
}

async function requestStageAttempts(
  db: Database.Database,
  taskId = '101',
  suffix = '?workspace_id=7',
  init: ConstructorParameters<typeof NextRequest>[1] = {},
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const { GET } = await loadStageAttemptsRoute(db)
  const response = await GET(
    new NextRequest(`http://localhost/api/tasks/${taskId}/stage-attempts${suffix}`, init),
    { params: Promise.resolve({ id: taskId }) },
  )
  const body = await response.json() as Record<string, unknown>
  return { response, body }
}

function insertRun(db: Database.Database, runId: string) {
  db.prepare(`
    INSERT INTO runs (
      id, workspace_id, status, started_at, ended_at, agent_name,
      runtime, git_branch, git_commit, error
    ) VALUES (?, 7, 'running', '2026-05-22T12:01:00.000Z', NULL, 'aegis',
      'mission-control', '013a-run-state-spine', 'abc123', NULL)
  `).run(runId)
}

function rowCount(db: Database.Database, tableName: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as CountRow).count
}

describe('SPEC-013A task stage attempts API documentation', () => {
  it('documents the read-only GET /api/tasks/{id}/stage-attempts OpenAPI contract', () => {
    const doc = loadOpenApiDoc()
    const pathItem = doc.paths['/api/tasks/{id}/stage-attempts']

    expect(pathItem).toBeDefined()
    if (!pathItem) throw new Error('OpenAPI path /api/tasks/{id}/stage-attempts is missing')
    expect(Object.keys(pathItem).sort()).toEqual(['get'])

    const operation = pathItem['get']
    expect(operation).toBeDefined()
    if (!operation) throw new Error('OpenAPI GET operation is missing')
    expect(operation.tags).toContain('Tasks')
    expect(JSON.stringify(operation).toLowerCase()).toContain('read-only')
    expect(JSON.stringify(operation).toLowerCase()).toContain('viewer')
    const idParam = operation.parameters?.find((param) => param.name === 'id' && param.in === 'path')
    expect(idParam).toMatchObject({ required: true })
    expect(idParam?.schema).toMatchObject({ type: 'integer' })

    const workspaceIdParam = operation.parameters?.find((param) => param.name === 'workspace_id' && param.in === 'query')
    expect(workspaceIdParam).toMatchObject({ required: false })

    const workspaceScopeParam = operation.parameters?.find((param) => param.name === 'workspace_scope' && param.in === 'query')
    expect(workspaceScopeParam).toMatchObject({ required: false })

    expect(Object.keys(operation.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
    ])

    const schema = operation.responses?.['200']?.content?.['application/json']?.schema
    expect(schema?.required).toEqual(expect.arrayContaining([
      'schema_version',
      'task',
      'attempts',
      'warnings',
    ]))
    expect(schema?.properties?.['schema_version']).toMatchObject({
      type: 'string',
      const: 'task_stage_attempts.v1',
    })
    expect(schema?.properties?.['attempts']).toMatchObject({ type: 'array' })
    expect(schema?.properties?.['warnings']).toMatchObject({ type: 'array' })
  })

  it('lists the stage attempts route in the local API index as viewer read-only', async () => {
    const response = getApiIndex()
    const payload = await response.json() as {
      endpoints: {
        path: string
        methods: string[]
        description: string
        tag: string
        auth: string
      }[]
    }

    const endpoint = payload.endpoints.find((entry) => entry.path === '/api/tasks/:id/stage-attempts')

    expect(endpoint).toBeDefined()
    expect(endpoint).toMatchObject({
      methods: ['GET'],
      tag: 'Tasks',
      auth: 'viewer',
    })
    expect(endpoint?.description).toMatch(/read-only/i)
    expect(endpoint?.description).toMatch(/stage attempts/i)
  })
})

describe('GET /api/tasks/[id]/stage-attempts route', () => {
  it('requires authentication and allows viewer-or-higher reads', async () => {
    const db = openRouteDb()

    const unauthenticated = await requestStageAttempts(db, '101', '?workspace_id=7', {
      headers: { 'x-test-auth': 'none' },
    })
    expect(unauthenticated.response.status).toBe(401)
    expect(unauthenticated.body).toEqual({ error: 'unauthenticated' })

    for (const role of ['viewer', 'operator', 'admin']) {
      vi.resetModules()
      const scopedDb = openRouteDb()
      const { response, body } = await requestStageAttempts(scopedDb, '101', '?workspace_id=7', {
        headers: { 'x-test-auth': role },
      })
      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        schema_version: 'task_stage_attempts.v1',
        task: { id: '101', workspace_id: '7' },
      })
    }
  })

  it('maps malformed, forbidden, and out-of-scope workspace access to the route contract', async () => {
    const db = openRouteDb()

    const malformed = await requestStageAttempts(db, '101', '?workspace_id=7&workspace_id=8')
    expect(malformed.response.status).toBe(400)
    expect(malformed.body).toEqual({ error: 'invalid_workspace_scope' })

    vi.resetModules()
    const forbiddenDb = openRouteDb()
    const forbidden = await requestStageAttempts(forbiddenDb, '101', '?workspace_id=99')
    expect(forbidden.response.status).toBe(403)
    expect(forbidden.body).toEqual({ error: 'forbidden_workspace_scope' })

    vi.resetModules()
    const maskedDb = openRouteDb()
    const masked = await requestStageAttempts(maskedDb, '202', '?workspace_id=7')
    expect(masked.response.status).toBe(404)
    expect(masked.body).toEqual({ error: 'task_not_found' })
  })

  it('returns the versioned envelope for a visible task with no attempts', async () => {
    const db = openRouteDb()

    const { response, body } = await requestStageAttempts(db)

    expect(response.status).toBe(200)
    expect(body).toEqual({
      schema_version: 'task_stage_attempts.v1',
      task: {
        id: '101',
        workspace_id: '7',
        title: 'Remediate issue',
        status: 'in_progress',
      },
      attempts: [],
      warnings: [],
    })
  })

  it('serializes active attempts, attempt ordering, linked and missing runs, invalid state, and bounded lifecycle snippets', async () => {
    const db = openRouteDb()
    insertRun(db, 'run-linked')
    createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'remediation',
      attemptNumber: 1,
      status: 'failed',
      observedAt: '2026-05-22T12:00:00.000Z',
      runId: 'missing-run',
    })
    const linked = createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'remediation',
      attemptNumber: 2,
      status: 'running',
      observedAt: '2026-05-22T12:01:00.000Z',
      runId: 'run-linked',
    })
    createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'analysis',
      attemptNumber: 1,
      status: 'running',
      observedAt: '2026-05-22T12:02:00.000Z',
    })
    const verbose = createTaskStageAttempt(db, {
      workspaceId: 7,
      taskId: 101,
      stageKey: 'validation',
      attemptNumber: 1,
      status: 'created',
      observedAt: '2026-05-22T12:03:00.000Z',
    })
    for (let index = 0; index < 12; index += 1) {
      appendTaskStageAttemptEvent(db, {
        attemptId: Number(verbose.id),
        status: index % 2 === 0 ? 'running' : 'released',
        observedAt: `2026-05-22T12:${String(index + 4).padStart(2, '0')}:00.000Z`,
        message: `event-${String(index).padStart(2, '0')}`,
      })
    }
    const invalidAttemptId = db.prepare(`
      INSERT INTO task_stage_attempts (
        workspace_id, task_id, stage_key, attempt_number, status,
        created_at, updated_at, started_at, completed_at, archived_at,
        run_id, workflow_template_id, workflow_template_slug, metadata_json
      ) VALUES (
        7, 101, 'zz_invalid', 1, 'paused',
        '2026-05-22T12:20:00.000Z', '2026-05-22T12:20:00.000Z',
        NULL, NULL, NULL, NULL, 22, 'mission-control_issue_remediation', NULL
      )
    `).run().lastInsertRowid

    const { response, body } = await requestStageAttempts(db)
    const attempts = body['attempts'] as Record<string, unknown>[]
    const warnings = body['warnings'] as Record<string, unknown>[]

    expect(response.status).toBe(200)
    expect(attempts.map((attempt) => `${String(attempt['stage_key'])}:${String(attempt['attempt_number'])}`)).toEqual([
      'analysis:1',
      'remediation:2',
      'remediation:1',
      'validation:1',
      'zz_invalid:1',
    ])
    expect(attempts[1]).toMatchObject({
      id: linked.id,
      status: 'running',
      run_link: { state: 'linked', run_id: 'run-linked' },
      run_summary: {
        id: 'run-linked',
        status: 'running',
        agent_name: 'aegis',
        runtime: 'mission-control',
      },
    })
    expect(attempts[2]).toMatchObject({
      run_link: { state: 'missing_unavailable', run_id: 'missing-run' },
      run_summary: null,
    })
    expect(attempts[3]?.['lifecycle']).toHaveLength(10)
    expect((attempts[3]?.['lifecycle'] as Record<string, unknown>[])[0]?.['message']).toBe('event-02')
    expect(attempts[4]).toMatchObject({
      id: String(invalidAttemptId),
      status: 'invalid_state',
    })
    expect(warnings).toEqual(expect.arrayContaining([
      {
        code: 'invalid_attempt_state',
        attempt_id: String(invalidAttemptId),
        field: 'status',
      },
    ]))
  })

  it('reports projection drift for every derived field without read-time mutation', async () => {
    const db = openRouteDb()
    const result = db.prepare(`
      INSERT INTO task_stage_attempts (
        workspace_id, task_id, stage_key, attempt_number, status,
        created_at, updated_at, started_at, completed_at, archived_at,
        run_id, workflow_template_id, workflow_template_slug, metadata_json
      ) VALUES (
        7, 101, 'remediation', 1, 'running',
        '2026-05-22T12:00:00.000Z', '2026-05-22T12:00:30.000Z',
        NULL, NULL, NULL, NULL, 22, 'mission-control_issue_remediation', NULL
      )
    `).run()
    const attemptId = Number(result.lastInsertRowid)
    const insertEvent = db.prepare(`
      INSERT INTO task_stage_attempt_events (
        attempt_id, workspace_id, task_id, stage_key, attempt_number,
        status, observed_at, actor_type, actor_id, message, metadata_json
      ) VALUES (?, 7, 101, 'remediation', 1, ?, ?, 'test', 'route', NULL, NULL)
    `)
    insertEvent.run(attemptId, 'created', '2026-05-22T12:00:00.000Z')
    insertEvent.run(attemptId, 'running', '2026-05-22T12:01:00.000Z')
    insertEvent.run(attemptId, 'failed', '2026-05-22T12:05:00.000Z')
    insertEvent.run(attemptId, 'archived', '2026-05-22T12:10:00.000Z')
    const before = db.prepare(`
      SELECT id, status, updated_at, started_at, completed_at, archived_at
      FROM task_stage_attempts
      WHERE id = ?
    `).get(attemptId) as AttemptRow
    const eventCountBefore = rowCount(db, 'task_stage_attempt_events')

    const { response, body } = await requestStageAttempts(db)
    const after = db.prepare(`
      SELECT id, status, updated_at, started_at, completed_at, archived_at
      FROM task_stage_attempts
      WHERE id = ?
    `).get(attemptId) as AttemptRow
    const warnings = body['warnings'] as Record<string, unknown>[]

    expect(response.status).toBe(200)
    expect(after).toEqual(before)
    expect(rowCount(db, 'task_stage_attempt_events')).toBe(eventCountBefore)
    expect(warnings.filter((warning) => warning['code'] === 'projection_drift')).toEqual([
      {
        code: 'projection_drift',
        attempt_id: String(attemptId),
        field: 'status',
        projection_value: 'running',
        expected_value: 'archived',
        latest_valid_lifecycle: {
          status: 'archived',
          observed_at: '2026-05-22T12:10:00.000Z',
        },
      },
      {
        code: 'projection_drift',
        attempt_id: String(attemptId),
        field: 'updated_at',
        projection_value: '2026-05-22T12:00:30.000Z',
        expected_value: '2026-05-22T12:10:00.000Z',
        latest_valid_lifecycle: {
          status: 'archived',
          observed_at: '2026-05-22T12:10:00.000Z',
        },
      },
      {
        code: 'projection_drift',
        attempt_id: String(attemptId),
        field: 'started_at',
        projection_value: null,
        expected_value: '2026-05-22T12:01:00.000Z',
        latest_valid_lifecycle: {
          status: 'archived',
          observed_at: '2026-05-22T12:10:00.000Z',
        },
      },
      {
        code: 'projection_drift',
        attempt_id: String(attemptId),
        field: 'completed_at',
        projection_value: null,
        expected_value: '2026-05-22T12:05:00.000Z',
        latest_valid_lifecycle: {
          status: 'archived',
          observed_at: '2026-05-22T12:10:00.000Z',
        },
      },
      {
        code: 'projection_drift',
        attempt_id: String(attemptId),
        field: 'archived_at',
        projection_value: null,
        expected_value: '2026-05-22T12:10:00.000Z',
        latest_valid_lifecycle: {
          status: 'archived',
          observed_at: '2026-05-22T12:10:00.000Z',
        },
      },
    ])
  })
})
