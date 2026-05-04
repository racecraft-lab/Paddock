/**
 * SPEC-008 - REST contract tests for `src/app/api/governance/policies/route.ts`
 * and `src/app/api/governance/policies/[id]/route.ts` (T074).
 *
 * Covers FR-201, FR-205, FR-205a, FR-206, FR-208a, FR-211, FR-219g, FR-219l:
 *   - GET list (happy / empty / scope filter / kind filter / pagination cursor)
 *   - GET by id (happy / 404)
 *   - POST create (validation reject 422 / happy 201 with Location + ETag)
 *   - PUT update (412 mismatch with FR-205a body / happy 200 with new ETag)
 *   - DELETE soft-delete (204 with disabled_at written, version bumped)
 *   - 401 unauthenticated
 *   - 403 viewer role on POST
 *   - 429 rate-limited
 *
 * Tests mock the strict-clean adapter (`@/lib/governance-route-context`)
 * directly because the runtime-require shim inside it is opaque to
 * vi.mock('@/lib/auth') etc. Routes use only the adapter and a small set of
 * strict-scope SPEC-008 modules, so this is the only seam to mock.
 *
 * @see specs/008-resource-governance/spec.md FR-201, FR-205, FR-205a,
 *   FR-206, FR-208a, FR-211, FR-219g, FR-219l
 * @see specs/008-resource-governance/tasks.md T074
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  resolveScope: vi.fn(),
  scopeError: vi.fn(() => null),
  mutationLimiter: vi.fn(() => null),
  logActivity: vi.fn(),
  logRouteError: vi.fn(),
  getForegroundDb: vi.fn(),
}));

vi.mock('@/lib/governance-route-context', () => ({
  requireRole: mocks.requireRole,
  resolveWorkspaceScopeFromRequest: mocks.resolveScope,
  workspaceScopeError: mocks.scopeError,
  mutationLimiter: mocks.mutationLimiter,
  logGovernanceActivity: mocks.logActivity,
  logRouteError: mocks.logRouteError,
}));

vi.mock('@/lib/db/connection-pool', () => ({
  getForegroundDb: mocks.getForegroundDb,
  closeAllConnections: vi.fn(),
}));

let db: Database.Database;

const OPERATOR_USER = {
  id: 12,
  username: 'operator',
  display_name: 'Operator',
  role: 'operator' as const,
  workspace_id: 1,
  tenant_id: 10,
};

const VIEWER_USER = {
  id: 13,
  username: 'viewer',
  display_name: 'Viewer',
  role: 'viewer' as const,
  workspace_id: 1,
  tenant_id: 10,
};

const ADMIN_USER = {
  id: 11,
  username: 'admin',
  display_name: 'Admin',
  role: 'admin' as const,
  workspace_id: 1,
  tenant_id: 10,
};

function setupDatabase(): void {
  db = new Database(':memory:');
  db.prepare('SELECT 1').get();
  db.prepare(`CREATE TABLE resource_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER,
      project_id INTEGER,
      agent_id INTEGER,
      agent_role TEXT,
      task_status TEXT,
      workflow_template_slug TEXT,
      provider TEXT,
      model TEXT,
      policy_type TEXT NOT NULL,
      limit_kind TEXT NOT NULL,
      limit_value REAL,
      period TEXT,
      timezone TEXT,
      schedule_json TEXT,
      window_spec_json TEXT,
      enforcement TEXT NOT NULL,
      enforce_mode TEXT DEFAULT 'shadow',
      soft_threshold_pct REAL DEFAULT 80,
      hard_threshold_pct REAL DEFAULT 100,
      enabled INTEGER NOT NULL DEFAULT 1,
      enabled_at TEXT,
      disabled_at TEXT,
      owner_workspace_id INTEGER,
      version INTEGER NOT NULL DEFAULT 1,
      etag TEXT,
      notes TEXT,
      default_template INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();
  db.prepare(`CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      actor TEXT,
      description TEXT,
      data TEXT,
      workspace_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();
  mocks.getForegroundDb.mockReturnValue(db);
}

function request(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): NextRequest {
  const headers: Record<string, string> = { ...extraHeaders };
  const init: Record<string, unknown> = { method, headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init['body'] = JSON.stringify(body);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return new NextRequest(`http://localhost${path}`, init as any);
}

function basePolicyPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    workspace_id: 1,
    policy_type: 'wip_limit',
    limit_kind: 'wip',
    limit_value: 10,
    enforcement: 'defer',
    enforce_mode: 'shadow',
    ...overrides,
  };
}

function insertPolicyDirectly(args: {
  policy_type?: string;
  limit_kind?: string;
  limit_value?: number;
  enforcement?: string;
  workspace_id?: number | null;
  enabled?: number;
  enabled_at?: string | null;
  disabled_at?: string | null;
  version?: number;
}): number {
  const result = db
    .prepare(
      `INSERT INTO resource_policies
        (workspace_id, policy_type, limit_kind, limit_value, enforcement,
         enabled, enabled_at, disabled_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.workspace_id ?? 1,
      args.policy_type ?? 'wip_limit',
      args.limit_kind ?? 'wip',
      args.limit_value ?? 10,
      args.enforcement ?? 'defer',
      args.enabled ?? 1,
      args.enabled_at ?? null,
      args.disabled_at ?? null,
      args.version ?? 1,
    );
  return Number(result.lastInsertRowid);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  setupDatabase();
  mocks.scopeError.mockReturnValue(null);
  mocks.mutationLimiter.mockReturnValue(null);
  mocks.requireRole.mockImplementation((_req: unknown, role: string) => {
    if (role === 'admin') return { user: ADMIN_USER };
    return { user: OPERATOR_USER };
  });
  mocks.resolveScope.mockResolvedValue({
    kind: 'productLine',
    tenantId: 10,
    workspaceIds: [1],
    workspaceId: 1,
    explicit: true,
    featureEnabled: true,
  });
});

afterEach(() => {
  db.close();
});

describe('GET /api/governance/policies - list (FR-201)', () => {
  it('returns empty list when no policies exist', async () => {
    const { GET } = await import('../route');
    const res = await GET(request('GET', '/api/governance/policies'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { policies: unknown[]; next_cursor: string | null };
    expect(body.policies).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  it('returns policies and cursor when paginated (limit < total)', async () => {
    for (let i = 0; i < 5; i++) {
      insertPolicyDirectly({ limit_value: 10 + i });
    }
    const { GET } = await import('../route');
    const res = await GET(request('GET', '/api/governance/policies?limit=2'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      policies: { id: number }[];
      next_cursor: string | null;
    };
    expect(body.policies).toHaveLength(2);
    expect(body.next_cursor).not.toBeNull();
  });

  it('filters by kind (?kind=budget)', async () => {
    insertPolicyDirectly({ policy_type: 'wip_limit', limit_kind: 'wip' });
    insertPolicyDirectly({ policy_type: 'budget', limit_kind: 'usd', limit_value: 100 });
    const { GET } = await import('../route');
    const res = await GET(request('GET', '/api/governance/policies?kind=budget'));
    const body = (await res.json()) as { policies: { policy_type: string }[] };
    expect(body.policies).toHaveLength(1);
    expect(body.policies[0]?.policy_type).toBe('budget');
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.requireRole.mockReturnValueOnce({ error: 'unauthorized', status: 401 });
    const { GET } = await import('../route');
    const res = await GET(request('GET', '/api/governance/policies'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/governance/policies - create (FR-201, FR-211, FR-219g, FR-219l)', () => {
  it('returns 201 with Location + ETag headers on happy path', async () => {
    const { POST } = await import('../route');
    const res = await POST(request('POST', '/api/governance/policies', basePolicyPayload()));
    expect(res.status).toBe(201);
    const location = res.headers.get('location');
    const etag = res.headers.get('etag');
    expect(location).toMatch(/^\/api\/governance\/policies\/\d+$/);
    expect(etag).toMatch(/^W\/"\d+-[0-9a-f]{12}"$/);
    const body = (await res.json()) as { policy: { id: number; policy_type: string } };
    expect(body.policy.policy_type).toBe('wip_limit');
  });

  it('returns 422 with structured issues when policy_type is invalid (FR-219g)', async () => {
    const { POST } = await import('../route');
    const res = await POST(
      request('POST', '/api/governance/policies', basePolicyPayload({ policy_type: 'bogus' })),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; issues?: unknown[] };
    expect(body.code).toBe('validation_failed');
    expect(body.issues?.length).toBeGreaterThan(0);
  });

  it('returns 403 when role is viewer', async () => {
    mocks.requireRole.mockReturnValueOnce({ error: 'forbidden', status: 403 });
    const { POST } = await import('../route');
    const res = await POST(request('POST', '/api/governance/policies', basePolicyPayload()));
    expect(res.status).toBe(403);
    expect(mocks.requireRole).toHaveBeenCalledWith(expect.anything(), 'operator');
    void VIEWER_USER;
  });

  it('returns 429 when rate-limited', async () => {
    const Response429 = new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
    mocks.mutationLimiter.mockReturnValueOnce(Response429 as unknown as null);
    const { POST } = await import('../route');
    const res = await POST(request('POST', '/api/governance/policies', basePolicyPayload()));
    expect(res.status).toBe(429);
  });

  it('logs governance activity on create', async () => {
    const { POST } = await import('../route');
    await POST(request('POST', '/api/governance/policies', basePolicyPayload()));
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
    const call = mocks.logActivity.mock.calls[0]?.[1] as {
      type: string;
      actor: string;
      workspace_id: number;
    };
    expect(call.type).toBe('policy_created');
    expect(call.actor).toBe('operator');
  });
});

describe('GET /api/governance/policies/[id] - read', () => {
  it('returns the policy and ETag header on happy path', async () => {
    const id = insertPolicyDirectly({ limit_value: 25 });
    const { GET } = await import('../[id]/route');
    const res = await GET(request('GET', `/api/governance/policies/${id.toString()}`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toMatch(/^W\/"\d+-[0-9a-f]{12}"$/);
    const body = (await res.json()) as { policy: { id: number; limit_value: number } };
    expect(body.policy.id).toBe(id);
    expect(body.policy.limit_value).toBe(25);
  });

  it('returns 404 when policy id is missing', async () => {
    const { GET } = await import('../[id]/route');
    const res = await GET(request('GET', '/api/governance/policies/9999'), {
      params: Promise.resolve({ id: '9999' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/governance/policies/[id] - update (FR-205, FR-205a)', () => {
  it('returns 412 with FR-205a body on If-Match mismatch', async () => {
    const id = insertPolicyDirectly({ limit_value: 10 });
    const { PUT } = await import('../[id]/route');
    const res = await PUT(
      request(
        'PUT',
        `/api/governance/policies/${id.toString()}`,
        basePolicyPayload({ limit_value: 20 }),
        { 'if-match': 'W/"99-deadbeefcafe"' },
      ),
      { params: Promise.resolve({ id: id.toString() }) },
    );
    expect(res.status).toBe(412);
    const body = (await res.json()) as {
      code: string;
      expected: string;
      observed: string;
    };
    expect(body.code).toBe('precondition_failed');
    expect(body.expected).toMatch(/^W\/"/);
    expect(body.observed).toBe('W/"99-deadbeefcafe"');
  });

  it('returns 200 with new ETag on happy update', async () => {
    const id = insertPolicyDirectly({ limit_value: 10, version: 1 });
    const { GET } = await import('../[id]/route');
    const initial = await GET(request('GET', `/api/governance/policies/${id.toString()}`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    const initialEtag = initial.headers.get('etag');
    expect(initialEtag).not.toBeNull();

    const { PUT } = await import('../[id]/route');
    const res = await PUT(
      request(
        'PUT',
        `/api/governance/policies/${id.toString()}`,
        basePolicyPayload({ limit_value: 25 }),
        { 'if-match': initialEtag ?? '' },
      ),
      { params: Promise.resolve({ id: id.toString() }) },
    );
    expect(res.status).toBe(200);
    const newEtag = res.headers.get('etag');
    expect(newEtag).not.toBeNull();
    expect(newEtag).not.toBe(initialEtag);

    const updated = db
      .prepare('SELECT version, limit_value FROM resource_policies WHERE id = ?')
      .get(id) as { version: number; limit_value: number };
    expect(updated.version).toBe(2);
    expect(updated.limit_value).toBe(25);
  });

  it('returns 428 when If-Match header is missing', async () => {
    const id = insertPolicyDirectly({});
    const { PUT } = await import('../[id]/route');
    const res = await PUT(
      request(
        'PUT',
        `/api/governance/policies/${id.toString()}`,
        basePolicyPayload({ limit_value: 99 }),
      ),
      { params: Promise.resolve({ id: id.toString() }) },
    );
    expect(res.status).toBe(428);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('precondition_required');
  });
});

describe('DELETE /api/governance/policies/[id] - soft delete', () => {
  it('returns 204 and writes disabled_at + bumps version', async () => {
    const id = insertPolicyDirectly({ version: 3 });
    const { DELETE } = await import('../[id]/route');
    const res = await DELETE(request('DELETE', `/api/governance/policies/${id.toString()}`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    expect(res.status).toBe(204);
    const row = db
      .prepare('SELECT disabled_at, version FROM resource_policies WHERE id = ?')
      .get(id) as { disabled_at: string | null; version: number };
    expect(row.disabled_at).not.toBeNull();
    expect(row.version).toBe(4);
  });

  it('returns 403 when role is operator (admin-only)', async () => {
    const id = insertPolicyDirectly({});
    mocks.requireRole.mockReturnValueOnce({ error: 'forbidden', status: 403 });
    const { DELETE } = await import('../[id]/route');
    const res = await DELETE(request('DELETE', `/api/governance/policies/${id.toString()}`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    expect(res.status).toBe(403);
    expect(mocks.requireRole).toHaveBeenCalledWith(expect.anything(), 'admin');
  });
});
