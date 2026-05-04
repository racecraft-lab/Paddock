/**
 * SPEC-008 — Tests for `src/lib/resource-reservation.ts`.
 *
 * Verifies the FR-054 / FR-055 / FR-065 / FR-173 / FR-174 atomic grant
 * transaction:
 *
 *   1. BEGIN IMMEDIATE wraps the counter UPDATE + reservation INSERT +
 *      ledger append in one atomic write tx.
 *   2. Counter conditional UPDATE follows the optimistic-lock pattern from
 *      T061 (`reserve()` from resource-budget-counters).
 *   3. Reservation row is inserted with `state='active'` (the M65g CHECK
 *      admits only `'active'|'consumed'|'released'|'expired'` — there is
 *      no `'pending'` state).
 *   4. Audit row appends to `resource_budget_ledger` with `kind='reservation'`
 *      so the chain reconciles end-to-end.
 *   5. Window predicate (FR-027/FR-048) gates the grant: a policy outside
 *      its `enabled_at`/`disabled_at` window MUST return
 *      `code='reservation_window_invalid'` with no side-effects.
 *   6. Counter contention returns `code='counter_conflict'`.
 *   7. Budget exhaustion returns `code='budget_exhausted'`.
 *
 * @see specs/008-resource-governance/spec.md FR-054, FR-055, FR-065,
 *      FR-173, FR-174
 * @see specs/008-resource-governance/tasks.md T063
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-resource-reservation-'));
  process.env.MISSION_CONTROL_DATA_DIR = tempDir;
  process.env.MISSION_CONTROL_DB_PATH = join(tempDir, 'mission-control.db');
  db = new Database(process.env.MISSION_CONTROL_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = 1');
  db.pragma('busy_timeout = 50');
  const { runMigrations } = await import('@/lib/migrations');
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
});

afterEach(async () => {
  try {
    const pool = await import('@/lib/db/connection-pool');
    pool.closeAllConnections();
  } catch {
    // ignore
  }
  try {
    db.close();
  } catch {
    // ignore
  }
  delete process.env.MISSION_CONTROL_DATA_DIR;
  delete process.env.MISSION_CONTROL_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Insert a `resource_policies` row matching the M060 schema. Returns the
 * inserted policy's id so the test can pass it to `reserveBudget`.
 */
function insertBudgetPolicy(
  database: Database.Database,
  args: {
    workspace_id: number | null;
    limit_value: number;
    limit_kind: string;
    enforcement?: string;
    enabled_at?: string | null;
    disabled_at?: string | null;
  },
): number {
  const stmt = database.prepare(`
    INSERT INTO resource_policies
      (workspace_id, policy_type, limit_kind, limit_value, enforcement,
       enabled, version, enabled_at, disabled_at)
    VALUES
      (?, 'budget', ?, ?, ?, 1, 1, ?, ?)
  `);
  const result = stmt.run(
    args.workspace_id,
    args.limit_kind,
    args.limit_value,
    args.enforcement ?? 'defer',
    args.enabled_at ?? null,
    args.disabled_at ?? null,
  );
  return Number(result.lastInsertRowid);
}

describe('SPEC-008 resource-reservation — module surface', () => {
  it('exports reserveBudget', async () => {
    const mod = await import('@/lib/resource-reservation');
    expect(typeof mod.reserveBudget).toBe('function');
  });
});

describe('SPEC-008 resource-reservation — happy path (FR-054, FR-055, FR-173)', () => {
  it('grants a reservation atomically: counter UPDATE + reservation INSERT + ledger append', async () => {
    const policy_id = insertBudgetPolicy(db, {
      workspace_id: 7,
      limit_value: 100,
      limit_kind: 'usd',
    });
    const { reserveBudget } = await import('@/lib/resource-reservation');
    const { ensureCounter } = await import('@/lib/resource-budget-counters');
    ensureCounter(db, {
      policy_id,
      window_start: '2026-05-01T00:00:00Z',
    });

    const result = reserveBudget(
      {
        policy_id,
        window_start: '2026-05-01T00:00:00Z',
        unit: 'usd',
        amount: 5,
        granted_by: 'system',
        ttl_ms: 60_000,
      },
      db,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.reservation_id).toBe('string');
      expect(result.reservation_id.length).toBeGreaterThan(0);
      expect(result.counter_after).toBeGreaterThan(0);
    }

    // Reservation row exists in `state='active'` (NOT 'pending' — see M65g
    // CHECK).
    const resRow = db
      .prepare(
        `SELECT state, amount, unit, granted_by
         FROM resource_reservations
         WHERE policy_id = ? AND window_start = ?`,
      )
      .get(policy_id, '2026-05-01T00:00:00Z') as
      | { state: string; amount: number; unit: string; granted_by: string }
      | undefined;
    expect(resRow).toBeDefined();
    expect(resRow?.state).toBe('active');
    expect(resRow?.amount).toBe(5);
    expect(resRow?.unit).toBe('usd');
    expect(resRow?.granted_by).toBe('system');

    // Counter is updated.
    const counter = db
      .prepare(
        `SELECT reserved_usd, version FROM resource_budget_counters
         WHERE policy_id = ? AND window_start = ?`,
      )
      .get(policy_id, '2026-05-01T00:00:00Z') as
      | { reserved_usd: number; version: number }
      | undefined;
    expect(counter?.reserved_usd).toBe(5);
    expect((counter?.version ?? 0) >= 2).toBe(true);

    // Ledger row exists with kind='reservation'.
    const ledger = db
      .prepare(
        `SELECT kind, amount, unit FROM resource_budget_ledger
         WHERE policy_id = ? AND window_start = ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(policy_id, '2026-05-01T00:00:00Z') as
      | { kind: string; amount: number; unit: string }
      | undefined;
    expect(ledger?.kind).toBe('reservation');
    expect(ledger?.amount).toBe(5);
    expect(ledger?.unit).toBe('usd');
  });
});

describe('SPEC-008 resource-reservation — window predicate (FR-027, FR-048)', () => {
  it('returns code="reservation_window_invalid" when policy is outside enabled_at/disabled_at window', async () => {
    // Insert a policy whose disabled_at is in the past — out of window.
    const policy_id = insertBudgetPolicy(db, {
      workspace_id: 7,
      limit_value: 100,
      limit_kind: 'usd',
      disabled_at: '2020-01-01T00:00:00Z', // long past
    });
    const { reserveBudget } = await import('@/lib/resource-reservation');
    const { ensureCounter } = await import('@/lib/resource-budget-counters');
    ensureCounter(db, {
      policy_id,
      window_start: '2026-05-01T00:00:00Z',
    });

    const result = reserveBudget(
      {
        policy_id,
        window_start: '2026-05-01T00:00:00Z',
        unit: 'usd',
        amount: 5,
        granted_by: 'system',
        ttl_ms: 60_000,
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('reservation_window_invalid');
    }

    // No reservation row created.
    const resCount = db
      .prepare(
        `SELECT COUNT(*) AS n FROM resource_reservations
         WHERE policy_id = ?`,
      )
      .get(policy_id) as { n: number };
    expect(resCount.n).toBe(0);

    // Counter NOT updated (reserved stays 0).
    const counter = db
      .prepare(
        `SELECT reserved_usd FROM resource_budget_counters
         WHERE policy_id = ?`,
      )
      .get(policy_id) as { reserved_usd: number } | undefined;
    expect(counter?.reserved_usd ?? 0).toBe(0);
  });
});

describe('SPEC-008 resource-reservation — budget exhaustion (FR-055)', () => {
  it('returns code="budget_exhausted" when reserve+consumed would exceed limit_value', async () => {
    const policy_id = insertBudgetPolicy(db, {
      workspace_id: 7,
      limit_value: 10,
      limit_kind: 'usd',
    });
    const { reserveBudget } = await import('@/lib/resource-reservation');
    const { ensureCounter } = await import('@/lib/resource-budget-counters');
    ensureCounter(db, {
      policy_id,
      window_start: '2026-05-01T00:00:00Z',
    });
    // Burn 10 USD.
    db.prepare(
      `UPDATE resource_budget_counters
          SET consumed_usd = ?, version = version + 1
        WHERE policy_id = ? AND window_start = ?`,
    ).run(10, policy_id, '2026-05-01T00:00:00Z');

    const result = reserveBudget(
      {
        policy_id,
        window_start: '2026-05-01T00:00:00Z',
        unit: 'usd',
        amount: 1,
        granted_by: 'system',
        ttl_ms: 60_000,
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('budget_exhausted');
      expect(typeof result.observed).toBe('number');
      expect(typeof result.version).toBe('number');
    }
  });
});

describe('SPEC-008 resource-reservation — counter conflict (FR-053, FR-054)', () => {
  it('returns code="counter_conflict" when expected_version is stale', async () => {
    const policy_id = insertBudgetPolicy(db, {
      workspace_id: 7,
      limit_value: 100,
      limit_kind: 'usd',
    });
    const { reserveBudget } = await import('@/lib/resource-reservation');
    const { ensureCounter } = await import('@/lib/resource-budget-counters');
    ensureCounter(db, {
      policy_id,
      window_start: '2026-05-01T00:00:00Z',
    });
    // Bump the version out from under the caller.
    db.prepare(
      `UPDATE resource_budget_counters
          SET version = version + 100
        WHERE policy_id = ? AND window_start = ?`,
    ).run(policy_id, '2026-05-01T00:00:00Z');

    const result = reserveBudget(
      {
        policy_id,
        window_start: '2026-05-01T00:00:00Z',
        unit: 'usd',
        amount: 5,
        granted_by: 'system',
        ttl_ms: 60_000,
        expected_version: 1, // stale
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('counter_conflict');
      expect(result.expected_old).toBe(1);
      expect(result.version).toBeGreaterThan(1);
    }
  });
});

describe('SPEC-008 resource-reservation — atomicity (FR-054)', () => {
  it('rolls back all writes when the reservation INSERT throws', async () => {
    // Force the INSERT into resource_reservations to fail by passing an
    // `unit` value that violates the M65g CHECK constraint. The whole
    // transaction MUST roll back, leaving the counter and ledger untouched.
    const policy_id = insertBudgetPolicy(db, {
      workspace_id: 7,
      limit_value: 100,
      limit_kind: 'usd',
    });
    const { reserveBudget } = await import('@/lib/resource-reservation');
    const { ensureCounter } = await import('@/lib/resource-budget-counters');
    ensureCounter(db, {
      policy_id,
      window_start: '2026-05-01T00:00:00Z',
    });
    const counterBefore = db
      .prepare(
        `SELECT reserved_usd, version FROM resource_budget_counters
         WHERE policy_id = ?`,
      )
      .get(policy_id) as { reserved_usd: number; version: number };
    const ledgerCountBefore = db
      .prepare(`SELECT COUNT(*) AS n FROM resource_budget_ledger`)
      .get() as { n: number };

    let threw = false;
    try {
      reserveBudget(
        {
          policy_id,
          window_start: '2026-05-01T00:00:00Z',
          // @ts-expect-error — forced bad unit triggers M65g CHECK failure
          unit: 'bogus_unit',
          amount: 5,
          granted_by: 'system',
          ttl_ms: 60_000,
        },
        db,
      );
    } catch {
      threw = true;
    }
    // The bad unit should surface as either a thrown error OR an ok=false
    // response — either way the transaction MUST roll back.
    void threw;

    const counterAfter = db
      .prepare(
        `SELECT reserved_usd, version FROM resource_budget_counters
         WHERE policy_id = ?`,
      )
      .get(policy_id) as { reserved_usd: number; version: number };
    const ledgerCountAfter = db
      .prepare(`SELECT COUNT(*) AS n FROM resource_budget_ledger`)
      .get() as { n: number };

    expect(counterAfter.reserved_usd).toBe(counterBefore.reserved_usd);
    expect(counterAfter.version).toBe(counterBefore.version);
    expect(ledgerCountAfter.n).toBe(ledgerCountBefore.n);
  });
});
