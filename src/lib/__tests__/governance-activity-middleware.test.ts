/**
 * SPEC-008 — `withGovernanceActivity` middleware tests (T152).
 *
 * Per FR-217 / FR-217a:
 *   - Wraps a Next.js route handler
 *   - Captures method, URL pathname, actor info, status_code, latency_ms
 *   - Writes ONE `governance_api_request` activity row per mutation
 *   - `path_family` derived from URL: 'policies' | 'budgets' | 'overrides' |
 *     'quarantine' | etc.
 *   - GET handlers are NOT wrapped at the route level — middleware is
 *     applied only to POST / PUT / DELETE; the wrapper itself is
 *     method-agnostic.
 *
 * @see specs/008-resource-governance/tasks.md T152
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/governance-route-context', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
  };
});

interface ActivityRow {
  type: string;
  entity_type: string;
  entity_id: number;
  actor: string;
  description: string;
  data: string;
  workspace_id: number;
}

let db: Database.Database;

const SCHEMA_ACTIVITIES = `
  CREATE TABLE activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    actor TEXT NOT NULL,
    description TEXT NOT NULL,
    data TEXT,
    workspace_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

beforeEach(() => {
  db = new Database(':memory:');
  db.prepare(SCHEMA_ACTIVITIES).run();
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
});

function readActivities(): ActivityRow[] {
  return db
    .prepare(
      `SELECT type, entity_type, entity_id, actor, description, data, workspace_id
       FROM activities ORDER BY id ASC`,
    )
    .all() as ActivityRow[];
}

function makeRequest(method: string, url: string): Request {
  return new Request(url, { method });
}

describe('SPEC-008 withGovernanceActivity (T152)', () => {
  it('writes governance_api_request activity row after handler returns', async () => {
    const { withGovernanceActivity } = await import(
      '@/lib/governance-activity-middleware'
    );

    const handler = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );
    const wrapped = withGovernanceActivity(handler, {
      db,
      pathFamily: 'policies',
      actor: { kind: 'user', id: 'op-42' },
    });

    const response = await wrapped(
      makeRequest('POST', 'http://localhost/api/governance/policies'),
    );
    expect(response.status).toBe(201);

    const rows = readActivities();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('governance_api_request');

    const payload = JSON.parse(rows[0]?.data ?? '{}') as {
      method: string;
      path_family: string;
      actor_kind: string;
      actor_id: string;
      status_code: number;
      latency_ms: number;
    };
    expect(payload.method).toBe('POST');
    expect(payload.path_family).toBe('policies');
    expect(payload.actor_kind).toBe('user');
    expect(payload.actor_id).toBe('op-42');
    expect(payload.status_code).toBe(201);
    expect(payload.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('captures non-2xx status code in payload', async () => {
    const { withGovernanceActivity } = await import(
      '@/lib/governance-activity-middleware'
    );
    const handler = vi.fn(
      async () => new Response('forbidden', { status: 403 }),
    );
    const wrapped = withGovernanceActivity(handler, {
      db,
      pathFamily: 'budgets',
      actor: { kind: 'agent', id: 'aegis' },
    });

    await wrapped(makeRequest('PUT', 'http://localhost/api/governance/budgets/1'));

    const rows = readActivities();
    expect(rows).toHaveLength(1);
    const payload = JSON.parse(rows[0]?.data ?? '{}') as {
      status_code: number;
      actor_kind: string;
    };
    expect(payload.status_code).toBe(403);
    expect(payload.actor_kind).toBe('agent');
  });

  it('still writes the activity row when handler throws', async () => {
    const { withGovernanceActivity } = await import(
      '@/lib/governance-activity-middleware'
    );
    const handler = vi.fn(async () => {
      throw new Error('boom');
    });
    const wrapped = withGovernanceActivity(handler, {
      db,
      pathFamily: 'overrides',
      actor: { kind: 'user', id: 'admin' },
    });

    await expect(
      wrapped(
        makeRequest('DELETE', 'http://localhost/api/governance/overrides/9'),
      ),
    ).rejects.toThrow('boom');

    const rows = readActivities();
    expect(rows).toHaveLength(1);
    const payload = JSON.parse(rows[0]?.data ?? '{}') as {
      status_code: number;
      method: string;
    };
    // 5xx synthesized when handler throws
    expect(payload.status_code).toBe(500);
    expect(payload.method).toBe('DELETE');
  });

  it('derives path_family from URL when pathFamily not explicit', async () => {
    const { withGovernanceActivity, pathFamilyFromUrl } = await import(
      '@/lib/governance-activity-middleware'
    );
    expect(pathFamilyFromUrl('/api/governance/policies')).toBe('policies');
    expect(pathFamilyFromUrl('/api/governance/policies/42')).toBe('policies');
    expect(pathFamilyFromUrl('/api/governance/budgets')).toBe('budgets');
    expect(pathFamilyFromUrl('/api/governance/overrides/77')).toBe('overrides');
    expect(pathFamilyFromUrl('/api/governance/quarantine/12')).toBe(
      'quarantine',
    );
    expect(pathFamilyFromUrl('/api/governance/breaker/state')).toBe('breaker');
    expect(pathFamilyFromUrl('/api/health')).toBe('unknown');

    const handler = vi.fn(
      async () => new Response(null, { status: 200 }),
    );
    const wrapped = withGovernanceActivity(handler, {
      db,
      actor: { kind: 'user', id: 'op-1' },
    });
    await wrapped(
      makeRequest('POST', 'http://localhost/api/governance/quarantine/3'),
    );
    const rows = readActivities();
    expect(rows).toHaveLength(1);
    const payload = JSON.parse(rows[0]?.data ?? '{}') as {
      path_family: string;
    };
    expect(payload.path_family).toBe('quarantine');
  });

  it('records request_id when X-Request-Id header is present', async () => {
    const { withGovernanceActivity } = await import(
      '@/lib/governance-activity-middleware'
    );
    const handler = vi.fn(
      async () => new Response(null, { status: 204 }),
    );
    const wrapped = withGovernanceActivity(handler, {
      db,
      pathFamily: 'policies',
      actor: { kind: 'user', id: 'op-1' },
    });
    const req = new Request('http://localhost/api/governance/policies/5', {
      method: 'PUT',
      headers: { 'X-Request-Id': 'req-abc-123' },
    });
    await wrapped(req);
    const rows = readActivities();
    const payload = JSON.parse(rows[0]?.data ?? '{}') as {
      request_id: string | null;
    };
    expect(payload.request_id).toBe('req-abc-123');
  });

  it('writes only one activity row per request even when handler is sync-resolving', async () => {
    const { withGovernanceActivity } = await import(
      '@/lib/governance-activity-middleware'
    );
    const handler = vi.fn(
      async () => new Response(null, { status: 200 }),
    );
    const wrapped = withGovernanceActivity(handler, {
      db,
      pathFamily: 'policies',
      actor: { kind: 'user', id: 'op-1' },
    });
    await wrapped(
      makeRequest('POST', 'http://localhost/api/governance/policies'),
    );
    await wrapped(
      makeRequest('POST', 'http://localhost/api/governance/policies'),
    );
    const rows = readActivities();
    expect(rows).toHaveLength(2);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
