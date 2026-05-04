/**
 * SPEC-008 - REST contract tests for `src/app/api/governance/budgets/route.ts`
 * and `src/app/api/governance/budgets/[id]/route.ts` (T076).
 *
 * Budgets are stored in the unified `resource_policies` table with
 * `policy_type='budget'` (M060 CHECK constraint). The budget routes are
 * a thin filter atop policy CRUD: GET/POST/PUT/DELETE all enforce
 * `policy_type='budget'` and use `parseBudgetRequest()` for the tighter
 * monetary-bound validator.
 *
 * Coverage mirrors T074:
 *   - GET list (empty / paginated / scope filter)
 *   - GET by id (happy / 404 / 404 when policy_type != 'budget')
 *   - POST create (422 validation reject / 201 with Location + ETag)
 *   - PUT update (412 mismatch with FR-205a body / 200 with new ETag)
 *   - DELETE soft-delete (204 + disabled_at + version bump)
 *   - 401 / 403 / 429
 *
 * @see specs/008-resource-governance/spec.md FR-201, FR-205, FR-205a,
 *   FR-206, FR-208a
 * @see specs/008-resource-governance/tasks.md T076
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

function baseBudgetPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workspace_id: 1,
    policy_type: 'budget',
    limit_kind: 'usd',
    limit_value: 100,
    enforcement: 'defer',
    enforce_mode: 'shadow',
    ...overrides,
  };
}

function insertBudget(args: {
  policy_type?: string;
  limit_kind?: string;
  limit_value?: number;
  workspace_id?: number;
  enabled_at?: string | null;
  disabled_at?: string | null;
  version?: number;
}): number {
  const result = db
    .prepare(
      `INSERT INTO resource_policies
        (workspace_id, policy_type, limit_kind, limit_value, enforcement,
         enabled, enabled_at, disabled_at, version)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(
      args.workspace_id ?? 1,
      args.policy_type ?? 'budget',
      args.limit_kind ?? 'usd',
      args.limit_value ?? 100,
      'defer',
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

describe('GET /api/governance/budgets - list (FR-201)', () => {
  it('returns empty list when no budgets exist', async () => {
    const { GET } = await import('../route');
    const res = await GET(request('GET', '/api/governance/budgets'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { budgets: unknown[]; next_cursor: string | null };
    expect(body.budgets).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  it('only returns rows where policy_type=budget', async () => {
    insertBudget({ policy_type: 'wip_limit', limit_kind: 'wip', limit_value: 5 });
    insertBudget({ policy_type: 'budget', limit_kind: 'usd', limit_value: 200 });
    insertBudget({ policy_type: 'budget', limit_kind: 'token', limit_value: 5000 });
    const { GET } = await import('../route');
    const res = await GET(request('GET', '/api/governance/budgets'));
    const body = (await res.json()) as {
      budgets: { policy_type: string }[];
    };
    expect(body.budgets).toHaveLength(2);
    expect(body.budgets.every((b) => b.policy_type === 'budget')).toBe(true);
  });

  it('paginates with limit + cursor', async () => {
    for (let i = 0; i < 4; i++) insertBudget({ limit_value: 100 + i });
    const { GET } = await import('../route');
    const res = await GET(request('GET', '/api/governance/budgets?limit=2'));
    const body = (await res.json()) as {
      budgets: { id: number }[];
      next_cursor: string | null;
    };
    expect(body.budgets).toHaveLength(2);
    expect(body.next_cursor).not.toBeNull();
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.requireRole.mockReturnValueOnce({ error: 'unauthorized', status: 401 });
    const { GET } = await import('../route');
    const res = await GET(request('GET', '/api/governance/budgets'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/governance/budgets - create', () => {
  it('returns 201 with Location + ETag headers on happy path', async () => {
    const { POST } = await import('../route');
    const res = await POST(request('POST', '/api/governance/budgets', baseBudgetPayload()));
    expect(res.status).toBe(201);
    expect(res.headers.get('location')).toMatch(/^\/api\/governance\/budgets\/\d+$/);
    expect(res.headers.get('etag')).toMatch(/^W\/"\d+-[0-9a-f]{12}"$/);
    const body = (await res.json()) as { budget: { policy_type: string; limit_kind: string } };
    expect(body.budget.policy_type).toBe('budget');
    expect(body.budget.limit_kind).toBe('usd');
  });

  it('returns 422 when policy_type is not budget', async () => {
    const { POST } = await import('../route');
    const res = await POST(
      request('POST', '/api/governance/budgets', baseBudgetPayload({ policy_type: 'wip_limit' })),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('validation_failed');
  });

  it('returns 422 when limit_kind is not a monetary unit (parseBudgetRequest)', async () => {
    const { POST } = await import('../route');
    const res = await POST(
      request('POST', '/api/governance/budgets', baseBudgetPayload({ limit_kind: 'wip' })),
    );
    expect(res.status).toBe(422);
  });

  it('returns 403 when role is viewer', async () => {
    mocks.requireRole.mockReturnValueOnce({ error: 'forbidden', status: 403 });
    const { POST } = await import('../route');
    const res = await POST(request('POST', '/api/governance/budgets', baseBudgetPayload()));
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate-limited', async () => {
    const Response429 = new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
    mocks.mutationLimiter.mockReturnValueOnce(Response429 as unknown as null);
    const { POST } = await import('../route');
    const res = await POST(request('POST', '/api/governance/budgets', baseBudgetPayload()));
    expect(res.status).toBe(429);
  });

  it('logs budget_created activity row', async () => {
    const { POST } = await import('../route');
    await POST(request('POST', '/api/governance/budgets', baseBudgetPayload()));
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
    const call = mocks.logActivity.mock.calls[0]?.[1] as { type: string };
    expect(call.type).toBe('budget_created');
  });
});

describe('GET /api/governance/budgets/[id] - read', () => {
  it('returns 200 + ETag on happy read', async () => {
    const id = insertBudget({ limit_value: 250 });
    const { GET } = await import('../[id]/route');
    const res = await GET(request('GET', `/api/governance/budgets/${id.toString()}`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toMatch(/^W\/"\d+-[0-9a-f]{12}"$/);
    const body = (await res.json()) as { budget: { id: number; limit_value: number } };
    expect(body.budget.id).toBe(id);
    expect(body.budget.limit_value).toBe(250);
  });

  it('returns 404 when policy_type is not budget', async () => {
    const id = insertBudget({ policy_type: 'wip_limit', limit_kind: 'wip', limit_value: 5 });
    const { GET } = await import('../[id]/route');
    const res = await GET(request('GET', `/api/governance/budgets/${id.toString()}`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when row missing', async () => {
    const { GET } = await import('../[id]/route');
    const res = await GET(request('GET', '/api/governance/budgets/9999'), {
      params: Promise.resolve({ id: '9999' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/governance/budgets/[id] - update (FR-205, FR-205a)', () => {
  it('returns 412 with FR-205a body on If-Match mismatch', async () => {
    const id = insertBudget({});
    const { PUT } = await import('../[id]/route');
    const res = await PUT(
      request(
        'PUT',
        `/api/governance/budgets/${id.toString()}`,
        baseBudgetPayload({ limit_value: 200 }),
        { 'if-match': 'W/"99-deadbeefcafe"' },
      ),
      { params: Promise.resolve({ id: id.toString() }) },
    );
    expect(res.status).toBe(412);
    const body = (await res.json()) as { code: string; expected: string; observed: string };
    expect(body.code).toBe('precondition_failed');
    expect(body.observed).toBe('W/"99-deadbeefcafe"');
  });

  it('returns 200 with new ETag on happy update', async () => {
    const id = insertBudget({ limit_value: 100, version: 1 });
    const { GET, PUT } = await import('../[id]/route');
    const initial = await GET(request('GET', `/api/governance/budgets/${id.toString()}`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    const initialEtag = initial.headers.get('etag');
    expect(initialEtag).not.toBeNull();

    const res = await PUT(
      request(
        'PUT',
        `/api/governance/budgets/${id.toString()}`,
        baseBudgetPayload({ limit_value: 250 }),
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
    expect(updated.limit_value).toBe(250);
  });

  it('returns 428 when If-Match missing', async () => {
    const id = insertBudget({});
    const { PUT } = await import('../[id]/route');
    const res = await PUT(
      request(
        'PUT',
        `/api/governance/budgets/${id.toString()}`,
        baseBudgetPayload({ limit_value: 999 }),
      ),
      { params: Promise.resolve({ id: id.toString() }) },
    );
    expect(res.status).toBe(428);
  });

  it('returns 404 when target row is not a budget', async () => {
    const id = insertBudget({ policy_type: 'wip_limit', limit_kind: 'wip', limit_value: 5 });
    const { PUT } = await import('../[id]/route');
    const res = await PUT(
      request(
        'PUT',
        `/api/governance/budgets/${id.toString()}`,
        baseBudgetPayload({ limit_value: 999 }),
        { 'if-match': 'W/"1-aaaa"' },
      ),
      { params: Promise.resolve({ id: id.toString() }) },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/governance/budgets/[id] - soft delete', () => {
  it('returns 204 + writes disabled_at + bumps version', async () => {
    const id = insertBudget({ version: 4 });
    const { DELETE } = await import('../[id]/route');
    const res = await DELETE(request('DELETE', `/api/governance/budgets/${id.toString()}`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    expect(res.status).toBe(204);
    const row = db
      .prepare('SELECT disabled_at, version FROM resource_policies WHERE id = ?')
      .get(id) as { disabled_at: string | null; version: number };
    expect(row.disabled_at).not.toBeNull();
    expect(row.version).toBe(5);
  });

  it('returns 403 when role is operator (admin-only)', async () => {
    const id = insertBudget({});
    mocks.requireRole.mockReturnValueOnce({ error: 'forbidden', status: 403 });
    const { DELETE } = await import('../[id]/route');
    const res = await DELETE(request('DELETE', `/api/governance/budgets/${id.toString()}`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when target row is not a budget', async () => {
    const id = insertBudget({ policy_type: 'wip_limit', limit_kind: 'wip', limit_value: 5 });
    const { DELETE } = await import('../[id]/route');
    const res = await DELETE(request('DELETE', `/api/governance/budgets/${id.toString()}`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    expect(res.status).toBe(404);
  });
});
