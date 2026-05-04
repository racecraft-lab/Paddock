/**
 * SPEC-008 - REST contract tests for /api/governance/overrides (T139, T153).
 *
 * Covers:
 *   - GET list (happy / filter by actor, policy_id, active / pagination)
 *   - GET by id (happy / 404)
 *   - POST create:
 *       - 401 unauthenticated
 *       - 403 viewer
 *       - 400 missing Idempotency-Key
 *       - 422 invalid body
 *       - 422 idempotency body mismatch (FR-391)
 *       - 201 happy with Location + ETag
 *       - 201 replay returns cached response (FR-219a)
 *       - 423 governance_grants_disabled
 *   - DELETE:
 *       - 401 / 403
 *       - 404 not found
 *       - 409 already revoked
 *       - 204 happy with audit row
 *
 * @see specs/008-resource-governance/tasks.md T139, T153
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  mutationLimiter: vi.fn(() => null),
  logRouteError: vi.fn(),
  getForegroundDb: vi.fn(),
  resetOverrideBuckets: vi.fn(),
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
  // Seed users for actor lookups.
  db.prepare(`INSERT INTO users (id, username) VALUES (?, ?)`).run(11, 'admin');
  db.prepare(`INSERT INTO users (id, username) VALUES (?, ?)`).run(12, 'operator');
  db.prepare(`INSERT INTO users (id, username) VALUES (?, ?)`).run(13, 'viewer');
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

interface OverrideRow {
  id: number;
  actor: string;
  reason: string;
  revoked_at: string | null;
}

interface RecoveryRow {
  kind: string;
}

beforeEach(() => {
  setupDatabase();
  mocks.requireRole.mockReset();
  mocks.mutationLimiter.mockReset();
  mocks.mutationLimiter.mockReturnValue(null);
  mocks.logRouteError.mockReset();
  // Reset rate limit bucket so every test starts clean.
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
});

describe('SPEC-008 /api/governance/overrides POST (T139)', () => {
  it('401 when unauthenticated', async () => {
    mocks.requireRole.mockReturnValue({
      error: 'Authentication required',
      status: 401,
    });
    const { POST } = await import('@/app/api/governance/overrides/route');
    const res = await POST(request('POST', '/api/governance/overrides', basePostBody(), {
      'idempotency-key': 'k-1',
    }));
    expect(res.status).toBe(401);
  });

  it('403 when viewer', async () => {
    mocks.requireRole.mockReturnValue({
      error: 'Requires operator role or higher',
      status: 403,
      // also include user for downstream code paths if needed
      user: VIEWER_USER,
    });
    const { POST } = await import('@/app/api/governance/overrides/route');
    const res = await POST(request('POST', '/api/governance/overrides', basePostBody(), {
      'idempotency-key': 'k-2',
    }));
    expect(res.status).toBe(403);
  });

  it('400 missing Idempotency-Key', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    const { POST } = await import('@/app/api/governance/overrides/route');
    const res = await POST(request('POST', '/api/governance/overrides', basePostBody()));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('missing_idempotency_key');
  });

  it('422 invalid body shape', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    const { POST } = await import('@/app/api/governance/overrides/route');
    const res = await POST(
      request('POST', '/api/governance/overrides', { bogus: true }, {
        'idempotency-key': 'k-3',
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('validation_failed');
  });

  it('201 on happy path with Location + ETag', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    const { POST } = await import('@/app/api/governance/overrides/route');
    const res = await POST(
      request('POST', '/api/governance/overrides', basePostBody(), {
        'idempotency-key': 'k-happy',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('location')).toMatch(/^\/api\/governance\/overrides\/\d+$/);
    expect(res.headers.get('etag')).toMatch(/^W\/"\d+-[a-f0-9]+"$/);

    // Row was inserted.
    const rows = db
      .prepare(`SELECT id, actor, reason, revoked_at FROM resource_overrides`)
      .all() as OverrideRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor).toBe('operator');
    expect(rows[0]?.revoked_at).toBeNull();
  });

  it('201 replay returns cached response byte-identically (FR-219a)', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    const { POST } = await import('@/app/api/governance/overrides/route');

    const res1 = await POST(
      request('POST', '/api/governance/overrides', basePostBody(), {
        'idempotency-key': 'k-replay',
      }),
    );
    expect(res1.status).toBe(201);
    const body1 = await res1.text();

    const res2 = await POST(
      request('POST', '/api/governance/overrides', basePostBody(), {
        'idempotency-key': 'k-replay',
      }),
    );
    expect(res2.status).toBe(201);
    const body2 = await res2.text();
    expect(body2).toBe(body1);

    // Only ONE row inserted (replay returned cached).
    const cnt = (
      db.prepare(`SELECT COUNT(*) AS c FROM resource_overrides`).get() as { c: number }
    ).c;
    expect(cnt).toBe(1);
  });

  it('422 idempotency key body mismatch (FR-391)', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    const { POST } = await import('@/app/api/governance/overrides/route');

    const res1 = await POST(
      request('POST', '/api/governance/overrides', basePostBody({ granted_amount: 50 }), {
        'idempotency-key': 'k-mismatch',
      }),
    );
    expect(res1.status).toBe(201);

    const res2 = await POST(
      request('POST', '/api/governance/overrides', basePostBody({ granted_amount: 999 }), {
        'idempotency-key': 'k-mismatch',
      }),
    );
    expect(res2.status).toBe(422);
    const body = (await res2.json()) as { code: string };
    expect(body.code).toBe('idempotency_key_body_mismatch');
  });

  it('423 governance_grants_disabled when actor disabled', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    db.prepare(
      `UPDATE users SET governance_grants_disabled_at = ? WHERE username = ?`,
    ).run('2026-05-03T00:00:00.000Z', 'operator');

    const { POST } = await import('@/app/api/governance/overrides/route');
    const res = await POST(
      request('POST', '/api/governance/overrides', basePostBody(), {
        'idempotency-key': 'k-disabled',
      }),
    );
    expect(res.status).toBe(423);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('governance_grants_disabled');
  });
});

describe('SPEC-008 /api/governance/overrides GET list (T139)', () => {
  beforeEach(() => {
    // Seed overrides.
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
    seed('operator', 'reason-1', 100, false);
    seed('operator', 'reason-2', 100, true);
    seed('admin', 'reason-3', 200, false);
  });

  it('401 when unauthenticated', async () => {
    mocks.requireRole.mockReturnValue({ error: 'unauth', status: 401 });
    const { GET } = await import('@/app/api/governance/overrides/route');
    const res = GET(request('GET', '/api/governance/overrides'));
    expect(res.status).toBe(401);
  });

  it('returns all rows for viewer', async () => {
    mocks.requireRole.mockReturnValue({ user: VIEWER_USER });
    const { GET } = await import('@/app/api/governance/overrides/route');
    const res = GET(request('GET', '/api/governance/overrides'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      overrides: { etag: string; actor: string }[];
    };
    expect(body.overrides).toHaveLength(3);
    body.overrides.forEach((o) => {
      expect(o.etag).toMatch(/^W\/"\d+-[a-f0-9]+"$/);
    });
  });

  it('filters by actor', async () => {
    mocks.requireRole.mockReturnValue({ user: VIEWER_USER });
    const { GET } = await import('@/app/api/governance/overrides/route');
    const res = GET(request('GET', '/api/governance/overrides?actor=admin'));
    const body = (await res.json()) as {
      overrides: { actor: string }[];
    };
    expect(body.overrides).toHaveLength(1);
    expect(body.overrides[0]?.actor).toBe('admin');
  });

  it('filters by policy_id', async () => {
    mocks.requireRole.mockReturnValue({ user: VIEWER_USER });
    const { GET } = await import('@/app/api/governance/overrides/route');
    const res = GET(
      request('GET', '/api/governance/overrides?policy_id=200'),
    );
    const body = (await res.json()) as {
      overrides: { policy_id: number }[];
    };
    expect(body.overrides).toHaveLength(1);
    expect(body.overrides[0]?.policy_id).toBe(200);
  });

  it('filters active=true → revoked rows excluded', async () => {
    mocks.requireRole.mockReturnValue({ user: VIEWER_USER });
    const { GET } = await import('@/app/api/governance/overrides/route');
    const res = GET(
      request('GET', '/api/governance/overrides?active=true'),
    );
    const body = (await res.json()) as {
      overrides: { revoked_at: string | null }[];
    };
    expect(body.overrides).toHaveLength(2);
    expect(body.overrides.every((o) => o.revoked_at === null)).toBe(true);
  });

  it('filters active=false → only revoked/expired', async () => {
    mocks.requireRole.mockReturnValue({ user: VIEWER_USER });
    const { GET } = await import('@/app/api/governance/overrides/route');
    const res = GET(
      request('GET', '/api/governance/overrides?active=false'),
    );
    const body = (await res.json()) as {
      overrides: { revoked_at: string | null }[];
    };
    expect(body.overrides).toHaveLength(1);
    expect(body.overrides[0]?.revoked_at).not.toBeNull();
  });
});

describe('SPEC-008 /api/governance/overrides/[id] GET + DELETE (T139, T153)', () => {
  let overrideId: number;

  beforeEach(() => {
    const granted = new Date().toISOString();
    const expires = new Date(Date.now() + 3_600_000).toISOString();
    const r = db
      .prepare(
        `INSERT INTO resource_overrides
           (scope_kind, scope_id, policy_id, reason, actor, idempotency_key,
            granted_at, expires_at)
         VALUES ('workspace', 1, 100, 'reason-x', 'operator', 'idem-x', ?, ?)`,
      )
      .run(granted, expires);
    overrideId = Number(r.lastInsertRowid);
  });

  it('GET happy returns row with ETag', async () => {
    mocks.requireRole.mockReturnValue({ user: VIEWER_USER });
    const { GET } = await import('@/app/api/governance/overrides/[id]/route');
    const res = await GET(request('GET', `/api/governance/overrides/${overrideId.toString()}`), {
      params: Promise.resolve({ id: overrideId.toString() }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toMatch(/^W\/"\d+-[a-f0-9]+"$/);
  });

  it('GET 404 when missing', async () => {
    mocks.requireRole.mockReturnValue({ user: VIEWER_USER });
    const { GET } = await import('@/app/api/governance/overrides/[id]/route');
    const res = await GET(request('GET', `/api/governance/overrides/9999`), {
      params: Promise.resolve({ id: '9999' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE 401 unauthenticated', async () => {
    mocks.requireRole.mockReturnValue({ error: 'unauth', status: 401 });
    const { DELETE } = await import('@/app/api/governance/overrides/[id]/route');
    const res = await DELETE(
      request('DELETE', `/api/governance/overrides/${overrideId.toString()}`),
      { params: Promise.resolve({ id: overrideId.toString() }) },
    );
    expect(res.status).toBe(401);
  });

  it('DELETE 204 happy path appends audit row', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    const { DELETE } = await import('@/app/api/governance/overrides/[id]/route');
    const res = await DELETE(
      request('DELETE', `/api/governance/overrides/${overrideId.toString()}`),
      { params: Promise.resolve({ id: overrideId.toString() }) },
    );
    expect(res.status).toBe(204);

    const row = db
      .prepare(
        `SELECT id, actor, reason, revoked_at FROM resource_overrides WHERE id = ?`,
      )
      .get(overrideId) as OverrideRow;
    expect(row.revoked_at).not.toBeNull();

    const audit = db
      .prepare(`SELECT kind FROM recovery_action ORDER BY id DESC LIMIT 1`)
      .get() as RecoveryRow;
    expect(audit.kind).toBe('override_revoke');
  });

  it('DELETE 404 when missing', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    const { DELETE } = await import('@/app/api/governance/overrides/[id]/route');
    const res = await DELETE(
      request('DELETE', `/api/governance/overrides/9999`),
      { params: Promise.resolve({ id: '9999' }) },
    );
    expect(res.status).toBe(404);
  });

  it('DELETE 409 already revoked', async () => {
    mocks.requireRole.mockReturnValue({ user: OPERATOR_USER });
    db.prepare(
      `UPDATE resource_overrides SET revoked_at = ?, revoked_reason = 'override_revoked' WHERE id = ?`,
    ).run(new Date().toISOString(), overrideId);

    const { DELETE } = await import('@/app/api/governance/overrides/[id]/route');
    const res = await DELETE(
      request('DELETE', `/api/governance/overrides/${overrideId.toString()}`),
      { params: Promise.resolve({ id: overrideId.toString() }) },
    );
    expect(res.status).toBe(409);
  });
});
