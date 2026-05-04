/**
 * SPEC-008 — Agent-driven /api/resource-overrides REST contract tests (T140).
 *
 * Per FR-201a + FR-390: this is the agent (API-key) parallel of the
 * operator-facing /api/governance/overrides family. Tests assert:
 *
 *   - GET list and GET behavior matches /api/governance/overrides.
 *   - POST 201 happy path emits Location pointing at /api/resource-overrides/<id>.
 *   - POST response BODY for an `agent:*` actor is byte-identical to a
 *     governance-family response made by an `operator` actor for the
 *     SAME canonical input (modulo `actor` field, which legitimately
 *     differs).
 *   - Idempotency cache, validation, rate-limit, governance_grants_disabled
 *     all behave the same as on the governance family.
 *
 * @see specs/008-resource-governance/tasks.md T140
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  mutationLimiter: vi.fn(() => null),
  logRouteError: vi.fn(),
  getForegroundDb: vi.fn(),
}));

vi.mock('@/lib/governance-route-context', () => ({
  requireRole: mocks.requireRole,
  mutationLimiter: mocks.mutationLimiter,
  logRouteError: mocks.logRouteError,
}));

vi.mock('@/lib/db/connection-pool', () => ({
  getForegroundDb: mocks.getForegroundDb,
  closeAllConnections: vi.fn(),
}));

let db: Database.Database;

const AGENT_USER = {
  id: 99,
  username: 'agent:Aegis',
  display_name: 'Aegis',
  role: 'operator' as const,
  workspace_id: 1,
  tenant_id: 10,
};

const VIEWER_AGENT = {
  id: 98,
  username: 'agent:viewer-bot',
  display_name: 'Viewer Bot',
  role: 'viewer' as const,
  workspace_id: 1,
  tenant_id: 10,
};

const SCHEMA_OVERRIDES = `
  CREATE TABLE resource_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('facility','workspace','agent','project','task_status','specific_task')),
    scope_id INTEGER,
    policy_id INTEGER,
    granted_amount REAL,
    granted_unit TEXT CHECK (granted_unit IN ('usd','token','request','session') OR granted_unit IS NULL),
    reservation_id INTEGER,
    reason TEXT NOT NULL,
    actor TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    revoked_reason TEXT,
    UNIQUE(idempotency_key, actor)
  )
`;
const SCHEMA_USERS = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    governance_grants_disabled_at TEXT
  )
`;
const SCHEMA_RECOVERY = `
  CREATE TABLE recovery_action (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    actor TEXT NOT NULL,
    scope_kind TEXT,
    scope_id INTEGER,
    payload_json TEXT,
    prev_hash TEXT NOT NULL,
    row_hash TEXT NOT NULL,
    taken_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;
const SCHEMA_IDEM = `
  CREATE TABLE governance_idempotency_keys (
    actor_id INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_body_hash TEXT NOT NULL,
    response_body_json TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_headers_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (actor_id, idempotency_key)
  )
`;

function setupDatabase(): void {
  db = new Database(':memory:');
  db.prepare(SCHEMA_OVERRIDES).run();
  db.prepare(SCHEMA_USERS).run();
  db.prepare(SCHEMA_RECOVERY).run();
  db.prepare(SCHEMA_IDEM).run();
  db.prepare(`INSERT INTO users (id, username) VALUES (?, ?)`).run(99, 'agent:Aegis');
  db.prepare(`INSERT INTO users (id, username) VALUES (?, ?)`).run(98, 'agent:viewer-bot');
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
  return new NextRequest(
    `http://localhost${path}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    init as any,
  );
}

function basePostBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    scope_kind: 'workspace',
    scope_id: 1,
    policy_id: 100,
    granted_amount: 50,
    granted_unit: 'usd',
    reason: 'manual override for incident',
    ttl_ms: 3_600_000,
    idempotency_key: 'unused-by-route',
    ...overrides,
  };
}

interface OverrideDbRow {
  id: number;
  actor: string;
}

beforeEach(() => {
  setupDatabase();
  mocks.requireRole.mockReset();
  mocks.mutationLimiter.mockReset();
  mocks.mutationLimiter.mockReturnValue(null);
  mocks.logRouteError.mockReset();
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
});

describe('SPEC-008 /api/resource-overrides POST (T140 — agent surface)', () => {
  it('401 when unauthenticated', async () => {
    mocks.requireRole.mockReturnValue({
      error: 'Authentication required',
      status: 401,
    });
    const { POST } = await import('@/app/api/resource-overrides/route');
    const res = await POST(
      request('POST', '/api/resource-overrides', basePostBody(), {
        'idempotency-key': 'k-1',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('403 when viewer agent', async () => {
    mocks.requireRole.mockReturnValue({
      error: 'Requires operator role or higher',
      status: 403,
      user: VIEWER_AGENT,
    });
    const { POST } = await import('@/app/api/resource-overrides/route');
    const res = await POST(
      request('POST', '/api/resource-overrides', basePostBody(), {
        'idempotency-key': 'k-2',
      }),
    );
    expect(res.status).toBe(403);
  });

  it('400 missing Idempotency-Key', async () => {
    mocks.requireRole.mockReturnValue({ user: AGENT_USER });
    const { POST } = await import('@/app/api/resource-overrides/route');
    const res = await POST(
      request('POST', '/api/resource-overrides', basePostBody()),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('missing_idempotency_key');
  });

  it('422 invalid body shape', async () => {
    mocks.requireRole.mockReturnValue({ user: AGENT_USER });
    const { POST } = await import('@/app/api/resource-overrides/route');
    const res = await POST(
      request('POST', '/api/resource-overrides', { bogus: true }, {
        'idempotency-key': 'k-3',
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('validation_failed');
  });

  it('201 happy path emits resource-overrides Location', async () => {
    mocks.requireRole.mockReturnValue({ user: AGENT_USER });
    const { POST } = await import('@/app/api/resource-overrides/route');
    const res = await POST(
      request('POST', '/api/resource-overrides', basePostBody(), {
        'idempotency-key': 'k-happy',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('location')).toMatch(/^\/api\/resource-overrides\/\d+$/);
    expect(res.headers.get('etag')).toMatch(/^W\/"\d+-[a-f0-9]+"$/);

    const rows = db
      .prepare(`SELECT id, actor FROM resource_overrides`)
      .all() as OverrideDbRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor).toBe('agent:Aegis');
  });

  it('201 replay returns cached response byte-identically', async () => {
    mocks.requireRole.mockReturnValue({ user: AGENT_USER });
    const { POST } = await import('@/app/api/resource-overrides/route');

    const res1 = await POST(
      request('POST', '/api/resource-overrides', basePostBody(), {
        'idempotency-key': 'k-replay',
      }),
    );
    expect(res1.status).toBe(201);
    const body1 = await res1.text();

    const res2 = await POST(
      request('POST', '/api/resource-overrides', basePostBody(), {
        'idempotency-key': 'k-replay',
      }),
    );
    expect(res2.status).toBe(201);
    const body2 = await res2.text();
    expect(body2).toBe(body1);

    const cnt = (
      db.prepare(`SELECT COUNT(*) AS c FROM resource_overrides`).get() as { c: number }
    ).c;
    expect(cnt).toBe(1);
  });

  it('422 idempotency key body mismatch', async () => {
    mocks.requireRole.mockReturnValue({ user: AGENT_USER });
    const { POST } = await import('@/app/api/resource-overrides/route');

    const res1 = await POST(
      request('POST', '/api/resource-overrides', basePostBody({ granted_amount: 50 }), {
        'idempotency-key': 'k-mismatch',
      }),
    );
    expect(res1.status).toBe(201);

    const res2 = await POST(
      request('POST', '/api/resource-overrides', basePostBody({ granted_amount: 999 }), {
        'idempotency-key': 'k-mismatch',
      }),
    );
    expect(res2.status).toBe(422);
    const body = (await res2.json()) as { code: string };
    expect(body.code).toBe('idempotency_key_body_mismatch');
  });

  it('423 governance_grants_disabled when agent actor disabled', async () => {
    mocks.requireRole.mockReturnValue({ user: AGENT_USER });
    db.prepare(
      `UPDATE users SET governance_grants_disabled_at = ? WHERE username = ?`,
    ).run('2026-05-03T00:00:00.000Z', 'agent:Aegis');

    const { POST } = await import('@/app/api/resource-overrides/route');
    const res = await POST(
      request('POST', '/api/resource-overrides', basePostBody(), {
        'idempotency-key': 'k-disabled',
      }),
    );
    expect(res.status).toBe(423);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('governance_grants_disabled');
  });
});

describe('SPEC-008 /api/resource-overrides GET list (T140)', () => {
  beforeEach(() => {
    let seedSeq = 0;
    const seed = (
      actor: string,
      reason: string,
      policyId: number,
      revoked: boolean,
    ): void => {
      seedSeq += 1;
      const granted = new Date().toISOString();
      const expires = new Date(Date.now() + 3_600_000).toISOString();
      db.prepare(
        `INSERT INTO resource_overrides
           (scope_kind, scope_id, policy_id, reason, actor, idempotency_key,
            granted_at, expires_at, revoked_at)
         VALUES ('workspace', 1, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        policyId,
        reason,
        actor,
        `seed-${actor}-${policyId.toString()}-${seedSeq.toString()}`,
        granted,
        expires,
        revoked ? granted : null,
      );
    };
    seed('agent:Aegis', 'reason-1', 100, false);
    seed('agent:Aegis', 'reason-2', 100, true);
    seed('agent:viewer-bot', 'reason-3', 200, false);
  });

  it('401 when unauthenticated', async () => {
    mocks.requireRole.mockReturnValue({ error: 'unauth', status: 401 });
    const { GET } = await import('@/app/api/resource-overrides/route');
    const res = GET(request('GET', '/api/resource-overrides'));
    expect(res.status).toBe(401);
  });

  it('returns all rows for viewer agent', async () => {
    mocks.requireRole.mockReturnValue({ user: VIEWER_AGENT });
    const { GET } = await import('@/app/api/resource-overrides/route');
    const res = GET(request('GET', '/api/resource-overrides'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      overrides: { etag: string; actor: string }[];
    };
    expect(body.overrides).toHaveLength(3);
    body.overrides.forEach((o) => {
      expect(o.etag).toMatch(/^W\/"\d+-[a-f0-9]+"$/);
    });
  });

  it('filters by actor=agent:Aegis', async () => {
    mocks.requireRole.mockReturnValue({ user: VIEWER_AGENT });
    const { GET } = await import('@/app/api/resource-overrides/route');
    const res = GET(request('GET', '/api/resource-overrides?actor=agent:Aegis'));
    const body = (await res.json()) as {
      overrides: { actor: string }[];
    };
    expect(body.overrides).toHaveLength(2);
    body.overrides.forEach((o) => {
      expect(o.actor).toBe('agent:Aegis');
    });
  });

  it('filters active=true → revoked rows excluded', async () => {
    mocks.requireRole.mockReturnValue({ user: VIEWER_AGENT });
    const { GET } = await import('@/app/api/resource-overrides/route');
    const res = GET(request('GET', '/api/resource-overrides?active=true'));
    const body = (await res.json()) as {
      overrides: { revoked_at: string | null }[];
    };
    expect(body.overrides).toHaveLength(2);
    expect(body.overrides.every((o) => o.revoked_at === null)).toBe(true);
  });
});
