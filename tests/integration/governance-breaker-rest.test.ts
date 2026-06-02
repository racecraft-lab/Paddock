/**
 * SPEC-008 — Breaker REST integration test (T163 — orchestrator plan).
 *
 * Per FR-006, FR-028, FR-356, FR-219d. Covers the three breaker REST
 * endpoints landed by T160-T162:
 *
 *   GET  /api/governance/breaker/state
 *   POST /api/governance/breaker/reset
 *   POST /api/governance/breaker/half-open-probe
 *
 * Coverage:
 *   - 401 (no auth) on each endpoint
 *   - 403 (viewer when admin required) on the reset endpoint
 *   - 200 happy path on each endpoint with the right role
 *   - 409 on half-open-probe when breaker is not in half_open
 *   - state-transition: open -> reset -> closed flips manually_reset_at
 *
 * Mocks `governance-route-context.requireRole` and uses a real on-disk
 * SQLite DB (production-equivalent WAL config) per the strict-clean
 * adapter pattern from T139's tests.
 *
 * @see specs/008-resource-governance/tasks.md T160-T163 (orchestrator plan)
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  mutationLimiter: vi.fn(() => null),
  logRouteError: vi.fn(),
  logGovernanceActivity: vi.fn(),
  resolveWorkspaceScopeFromRequest: vi.fn(),
  workspaceScopeError: vi.fn(() => null),
}));

vi.mock('@/lib/governance-route-context', () => ({
  requireRole: mocks.requireRole,
  mutationLimiter: mocks.mutationLimiter,
  logRouteError: mocks.logRouteError,
  logGovernanceActivity: mocks.logGovernanceActivity,
  resolveWorkspaceScopeFromRequest: mocks.resolveWorkspaceScopeFromRequest,
  workspaceScopeError: mocks.workspaceScopeError,
}));

const ADMIN_USER = {
  id: 1,
  username: 'admin-user',
  display_name: 'Admin',
  role: 'admin' as const,
  workspace_id: 1,
  tenant_id: 10,
};
const OPERATOR_USER = {
  id: 2,
  username: 'op-user',
  display_name: 'Operator',
  role: 'operator' as const,
  workspace_id: 1,
  tenant_id: 10,
};
const VIEWER_USER = {
  id: 3,
  username: 'viewer-user',
  display_name: 'Viewer',
  role: 'viewer' as const,
  workspace_id: 1,
  tenant_id: 10,
};

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-breaker-rest-'));
  process.env['PADDOCK_DATA_DIR'] = tempDir;
  process.env['PADDOCK_DB_PATH'] = join(tempDir, 'paddock.db');
  db = new Database(process.env['PADDOCK_DB_PATH']);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = 1');
  db.pragma('busy_timeout = 50');
  const { runMigrations } = await import('@/lib/migrations');
  runMigrations(db);
  db.pragma('foreign_keys = OFF');

  mocks.requireRole.mockReset();
  mocks.mutationLimiter.mockReset().mockReturnValue(null);
  mocks.logGovernanceActivity.mockReset();
  vi.resetModules();
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
  delete process.env['PADDOCK_DATA_DIR'];
  delete process.env['PADDOCK_DB_PATH'];
  rmSync(tempDir, { recursive: true, force: true });
});

function makeRequest(method: string, url: string, body?: unknown): Request {
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${url}`, {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
  });
}

describe('SPEC-008 GET /api/governance/breaker/state (T160)', () => {
  it('401 when no auth', async () => {
    mocks.requireRole.mockReturnValue({
      error: 'unauthorized',
      status: 401,
    });
    const route = await import('@/app/api/governance/breaker/state/route');
    const res = await route.GET(
      makeRequest('GET', '/api/governance/breaker/state') as never,
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('unauthorized');
  });

  it('returns default closed state when no breaker row exists', async () => {
    mocks.requireRole.mockReturnValue({ user: VIEWER_USER });
    const route = await import('@/app/api/governance/breaker/state/route');
    const res = await route.GET(
      makeRequest('GET', '/api/governance/breaker/state') as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      state: string;
      consecutive_errors: number;
      half_open_probe_budget_remaining: number;
    };
    expect(body.state).toBe('closed');
    expect(body.consecutive_errors).toBe(0);
    expect(body.half_open_probe_budget_remaining).toBe(3);
  });

  it('returns open state with opened_at after breaker trips', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    const { CircuitBreaker } = await import('@/lib/resource-circuit-breaker');
    const breaker = new CircuitBreaker({ db, errorThreshold: 1 });
    breaker.tickError('boom');

    const route = await import('@/app/api/governance/breaker/state/route');
    const res = await route.GET(
      makeRequest('GET', '/api/governance/breaker/state') as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      state: string;
      opened_at: string | null;
      consecutive_errors: number;
    };
    expect(body.state).toBe('open');
    expect(body.opened_at).not.toBeNull();
    expect(body.consecutive_errors).toBeGreaterThanOrEqual(1);
  });
});

describe('SPEC-008 POST /api/governance/breaker/reset (T161)', () => {
  it('401 when no auth', async () => {
    mocks.requireRole.mockReturnValue({
      error: 'unauthorized',
      status: 401,
    });
    const route = await import('@/app/api/governance/breaker/reset/route');
    const res = await route.POST(
      makeRequest('POST', '/api/governance/breaker/reset', {}) as never,
    );
    expect(res.status).toBe(401);
  });

  it('403 when caller is operator (admin required)', async () => {
    mocks.requireRole.mockReturnValue({
      error: 'forbidden',
      status: 403,
    });
    const route = await import('@/app/api/governance/breaker/reset/route');
    const res = await route.POST(
      makeRequest('POST', '/api/governance/breaker/reset', {}) as never,
    );
    expect(res.status).toBe(403);
  });

  it('200 + flips state to closed + records manually_reset_at when admin resets', async () => {
    mocks.requireRole.mockReturnValue({ user: ADMIN_USER });
    const { CircuitBreaker } = await import('@/lib/resource-circuit-breaker');
    const breaker = new CircuitBreaker({ db, errorThreshold: 1 });
    breaker.tickError('boom');

    const route = await import('@/app/api/governance/breaker/reset/route');
    const res = await route.POST(
      makeRequest('POST', '/api/governance/breaker/reset', {
        reason: 'operator on-call cleared incident',
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      before: { state: string };
      after: { state: string; manually_reset_at: string };
    };
    expect(body.ok).toBe(true);
    expect(body.before.state).toBe('open');
    expect(body.after.state).toBe('closed');
    expect(body.after.manually_reset_at).toMatch(/T/);

    // Verify persisted state.
    const row = db
      .prepare(
        `SELECT state, manually_reset_at, manually_reset_by
           FROM resource_governance_breaker
          WHERE scope_kind = 'evaluator' AND scope_id IS NULL`,
      )
      .get() as {
      state: string;
      manually_reset_at: string;
      manually_reset_by: string;
    };
    expect(row.state).toBe('closed');
    expect(row.manually_reset_at).toMatch(/T/);
    expect(row.manually_reset_by).toBe(ADMIN_USER.username);
  });

  it('422 when reason supplied but contains control characters', async () => {
    mocks.requireRole.mockReturnValue({ user: ADMIN_USER });
    const route = await import('@/app/api/governance/breaker/reset/route');
    const res = await route.POST(
      makeRequest('POST', '/api/governance/breaker/reset', {
        reason: 'bad\x00reason',
      }) as never,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('validation_failed');
  });
});

describe('SPEC-008 POST /api/governance/breaker/half-open-probe (T162)', () => {
  it('401 when no auth', async () => {
    mocks.requireRole.mockReturnValue({
      error: 'unauthorized',
      status: 401,
    });
    const route = await import(
      '@/app/api/governance/breaker/half-open-probe/route'
    );
    const res = await route.POST(
      makeRequest(
        'POST',
        '/api/governance/breaker/half-open-probe',
      ) as never,
    );
    expect(res.status).toBe(401);
  });

  it('409 when breaker is closed (probe undefined)', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    const route = await import(
      '@/app/api/governance/breaker/half-open-probe/route'
    );
    const res = await route.POST(
      makeRequest(
        'POST',
        '/api/governance/breaker/half-open-probe',
      ) as never,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('breaker_not_half_open');
  });

  it('200 admitted=true when breaker in half_open with budget', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    // Manually seed a half-open breaker row.
    db.prepare(
      `INSERT INTO resource_governance_breaker
         (scope_kind, scope_id, state, consecutive_errors,
          opened_at, notes_json)
       VALUES ('evaluator', NULL, 'half_open', 0, ?, ?)`,
    ).run(
      new Date(Date.now() - 120_000).toISOString(),
      JSON.stringify({ half_open_probes_in_flight: 0 }),
    );

    const route = await import(
      '@/app/api/governance/breaker/half-open-probe/route'
    );
    const res = await route.POST(
      makeRequest(
        'POST',
        '/api/governance/breaker/half-open-probe',
      ) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      admitted: boolean;
      probe_budget_remaining: number;
      state: string;
    };
    expect(body.admitted).toBe(true);
    expect(body.state).toBe('half_open');
    expect(body.probe_budget_remaining).toBeGreaterThanOrEqual(0);
  });
});
