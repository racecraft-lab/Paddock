/**
 * SPEC-008 - REST tests for /api/governance/policies/[id]/promote (T075).
 *
 * Per FR-201 (CRUD surface), FR-040 (policy promotion auditable: operator,
 * before, after, etag_pre, etag_post, ts).
 *
 * Coverage:
 *   - happy path: 200 with new ETag on promote of disabled policy
 *   - 409 when policy already enabled
 *   - 404 when policy missing
 *
 * @see specs/008-resource-governance/spec.md FR-201, FR-040
 * @see specs/008-resource-governance/tasks.md T075
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

function setupDatabase(): void {
  db = new Database(':memory:');
  db.prepare(`CREATE TABLE resource_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER,
      project_id INTEGER,
      agent_id INTEGER,
      policy_type TEXT NOT NULL,
      limit_kind TEXT NOT NULL,
      limit_value REAL,
      enforcement TEXT NOT NULL,
      enforce_mode TEXT DEFAULT 'shadow',
      window_spec_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      enabled_at TEXT,
      disabled_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      etag TEXT,
      notes TEXT,
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

function request(path: string): NextRequest {
  const init: Record<string, unknown> = { method: 'POST' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return new NextRequest(`http://localhost${path}`, init as any);
}

function insertPolicy(args: {
  enabled_at?: string | null;
  disabled_at?: string | null;
  version?: number;
}): number {
  const result = db
    .prepare(
      `INSERT INTO resource_policies
        (workspace_id, policy_type, limit_kind, enforcement,
         enabled, enabled_at, disabled_at, version)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(
      1,
      'wip_limit',
      'wip',
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
  mocks.requireRole.mockReturnValue({
    user: {
      id: 12,
      username: 'operator',
      display_name: 'Operator',
      role: 'operator',
      workspace_id: 1,
      tenant_id: 10,
    },
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

describe('POST /api/governance/policies/[id]/promote (FR-040, FR-201)', () => {
  it('promotes a disabled policy: 200 with new ETag', async () => {
    const id = insertPolicy({ enabled_at: null, version: 2 });
    const { POST } = await import('../route');
    const res = await POST(request(`/api/governance/policies/${id.toString()}/promote`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toMatch(/^W\/"\d+-[0-9a-f]{12}"$/);
    const body = (await res.json()) as { policy: { id: number; enabled_at: string | null } };
    expect(body.policy.id).toBe(id);
    expect(body.policy.enabled_at).not.toBeNull();

    const row = db
      .prepare('SELECT enabled_at, version FROM resource_policies WHERE id = ?')
      .get(id) as { enabled_at: string | null; version: number };
    expect(row.enabled_at).not.toBeNull();
    expect(row.version).toBe(3);
  });

  it('returns 409 with code already_enabled when enabled_at is set', async () => {
    const id = insertPolicy({ enabled_at: '2026-01-01T00:00:00.000Z' });
    const { POST } = await import('../route');
    const res = await POST(request(`/api/governance/policies/${id.toString()}/promote`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('already_enabled');
  });

  it('returns 404 when policy is missing', async () => {
    const { POST } = await import('../route');
    const res = await POST(request('/api/governance/policies/9999/promote'), {
      params: Promise.resolve({ id: '9999' }),
    });
    expect(res.status).toBe(404);
  });

  it('writes a policy_promoted activity row with before/after etag', async () => {
    const id = insertPolicy({ enabled_at: null });
    const { POST } = await import('../route');
    await POST(request(`/api/governance/policies/${id.toString()}/promote`), {
      params: Promise.resolve({ id: id.toString() }),
    });
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
    const call = mocks.logActivity.mock.calls[0]?.[1] as {
      type: string;
      data: Record<string, unknown>;
    };
    expect(call.type).toBe('policy_promoted');
    expect(call.data['etag_pre']).toMatch(/^W\/"/);
    expect(call.data['etag_post']).toMatch(/^W\/"/);
  });
});
