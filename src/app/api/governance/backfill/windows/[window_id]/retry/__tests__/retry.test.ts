/**
 * SPEC-008 — REST tests for /api/governance/backfill/windows/[window_id]/retry (T093).
 *
 * Per FR-114a / FR-114b / FR-203.
 *
 * Coverage:
 *   - happy path: 200 + state flipped to pending + attempts incremented
 *   - 404 when window missing
 *   - 409 when state is not retry-eligible (running, completed, etc.)
 *   - cursor_stuck path: row with last_row_cursor set + state=failed
 *     succeeds (it qualifies as failed, which is retry-eligible)
 *   - 401 when unauthorized
 *
 * @see specs/008-resource-governance/tasks.md T093
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  mutationLimiter: vi.fn(() => null),
  logActivity: vi.fn(),
  logRouteError: vi.fn(),
  getForegroundDb: vi.fn(),
}));

vi.mock('@/lib/governance-route-context', () => ({
  requireRole: mocks.requireRole,
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
  db.exec(`
    CREATE TABLE reconciliation_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending','running','completed','failed','failed_timeout','failed_permanent')),
      rows_processed INTEGER NOT NULL DEFAULT 0,
      last_row_cursor TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      max_duration_seconds INTEGER NOT NULL DEFAULT 600,
      started_at TEXT,
      completed_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, window_start, window_end)
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      actor TEXT,
      description TEXT,
      data TEXT,
      workspace_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  mocks.getForegroundDb.mockReturnValue(db);
}

function request(path: string): NextRequest {
  const init: Record<string, unknown> = { method: 'POST' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return new NextRequest(`http://localhost${path}`, init as any);
}

function insertBatch(args: {
  state: string;
  attempts?: number;
  error_message?: string | null;
  last_row_cursor?: string | null;
  source_id?: string;
  window_start?: string;
  window_end?: string;
}): number {
  const result = db
    .prepare(
      `INSERT INTO reconciliation_batches
         (source_id, window_start, window_end, state,
          attempts, error_message, last_row_cursor)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.source_id ?? 'native_otel',
      args.window_start ?? '2026-05-01T00:00:00Z',
      args.window_end ?? '2026-05-01T00:05:00Z',
      args.state,
      args.attempts ?? 1,
      args.error_message ?? null,
      args.last_row_cursor ?? null,
    );
  return Number(result.lastInsertRowid);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  setupDatabase();
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
});

afterEach(() => {
  db.close();
});

describe('POST /api/governance/backfill/windows/[window_id]/retry (FR-114a, FR-114b)', () => {
  it('re-queues a failed window: 200 + state=pending + attempts incremented', async () => {
    const id = insertBatch({ state: 'failed', attempts: 2, error_message: 'boom' });
    const { POST } = await import('../route');
    const res = await POST(request(`/api/governance/backfill/windows/${id.toString()}/retry`), {
      params: Promise.resolve({ window_id: id.toString() }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { window: { id: number; state: string; attempts: number; error_message: string | null } };
    expect(body.window.id).toBe(id);
    expect(body.window.state).toBe('pending');
    expect(body.window.attempts).toBe(3);
    expect(body.window.error_message).toBeNull();
  });

  it('re-queues a failed_timeout window successfully', async () => {
    const id = insertBatch({
      state: 'failed_timeout',
      attempts: 4,
      window_start: '2026-05-02T00:00:00Z',
      window_end: '2026-05-02T00:05:00Z',
    });
    const { POST } = await import('../route');
    const res = await POST(request(`/api/governance/backfill/windows/${id.toString()}/retry`), {
      params: Promise.resolve({ window_id: id.toString() }),
    });
    expect(res.status).toBe(200);
  });

  it("re-queues a 'cursor_stuck' shape: state=failed AND last_row_cursor IS NOT NULL", async () => {
    const id = insertBatch({
      state: 'failed',
      attempts: 1,
      last_row_cursor: '12345',
      window_start: '2026-05-03T00:00:00Z',
      window_end: '2026-05-03T00:05:00Z',
    });
    const { POST } = await import('../route');
    const res = await POST(request(`/api/governance/backfill/windows/${id.toString()}/retry`), {
      params: Promise.resolve({ window_id: id.toString() }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { window: { state: string; last_row_cursor: string | null } };
    expect(body.window.state).toBe('pending');
    // Cursor preserved so the reconciler resumes from where it failed.
    expect(body.window.last_row_cursor).toBe('12345');
  });

  it('returns 404 when window_id is missing', async () => {
    const { POST } = await import('../route');
    const res = await POST(request('/api/governance/backfill/windows/9999/retry'), {
      params: Promise.resolve({ window_id: '9999' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('not_found');
  });

  it('returns 400 when window_id is not a positive integer', async () => {
    const { POST } = await import('../route');
    const res = await POST(request('/api/governance/backfill/windows/abc/retry'), {
      params: Promise.resolve({ window_id: 'abc' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('invalid_window_id');
  });

  it('returns 409 when state is running', async () => {
    const id = insertBatch({ state: 'running' });
    const { POST } = await import('../route');
    const res = await POST(request(`/api/governance/backfill/windows/${id.toString()}/retry`), {
      params: Promise.resolve({ window_id: id.toString() }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; state: string };
    expect(body.code).toBe('not_retry_eligible');
    expect(body.state).toBe('running');
  });

  it('returns 409 when state is completed', async () => {
    const id = insertBatch({ state: 'completed' });
    const { POST } = await import('../route');
    const res = await POST(request(`/api/governance/backfill/windows/${id.toString()}/retry`), {
      params: Promise.resolve({ window_id: id.toString() }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 409 when state is failed_permanent (terminal)', async () => {
    const id = insertBatch({ state: 'failed_permanent' });
    const { POST } = await import('../route');
    const res = await POST(request(`/api/governance/backfill/windows/${id.toString()}/retry`), {
      params: Promise.resolve({ window_id: id.toString() }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 409 when state is pending (already queued)', async () => {
    const id = insertBatch({ state: 'pending' });
    const { POST } = await import('../route');
    const res = await POST(request(`/api/governance/backfill/windows/${id.toString()}/retry`), {
      params: Promise.resolve({ window_id: id.toString() }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 401 when caller is not authorized', async () => {
    mocks.requireRole.mockReturnValue({ error: 'no token', status: 401 });
    const id = insertBatch({ state: 'failed' });
    const { POST } = await import('../route');
    const res = await POST(request(`/api/governance/backfill/windows/${id.toString()}/retry`), {
      params: Promise.resolve({ window_id: id.toString() }),
    });
    expect(res.status).toBe(401);
  });

  it('writes a backfill_window_retry activity row on success', async () => {
    const id = insertBatch({ state: 'failed_timeout', attempts: 3, error_message: 'timeout' });
    const { POST } = await import('../route');
    await POST(request(`/api/governance/backfill/windows/${id.toString()}/retry`), {
      params: Promise.resolve({ window_id: id.toString() }),
    });
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
    const call = mocks.logActivity.mock.calls[0]?.[1] as {
      type: string;
      entity_id: number;
      data: Record<string, unknown>;
    };
    expect(call.type).toBe('backfill_window_retry');
    expect(call.entity_id).toBe(id);
    const before = call.data['before'] as Record<string, unknown>;
    expect(before['state']).toBe('failed_timeout');
    expect(before['attempts']).toBe(3);
    const after = call.data['after'] as Record<string, unknown>;
    expect(after['state']).toBe('pending');
    expect(after['attempts']).toBe(4);
  });
});
