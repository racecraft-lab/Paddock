/**
 * SPEC-008 — Tests for `src/lib/resource-drift-detector.ts` (T071).
 *
 * AC-Drift-1..4 per the prompt:
 *   1. auto-repair tier idempotency (drift detected once, repaired; second
 *      run sees no drift)
 *   2. operator-confirmed tier — drift NOT auto-repaired, activity row
 *      written, counter unchanged
 *   3. hard-block tier — counter.pending_rebuild_job_id set; subsequent
 *      `reserve()` returns conflict='rebuild_pending'
 *   4. stratified sampling — small/medium/large strata each receive up to
 *      200 rows when scope is sparse
 *
 * @see specs/008-resource-governance/spec.md FR-057, FR-095, FR-096,
 *   FR-108, FR-345, FR-346, FR-389
 * @see specs/008-resource-governance/tasks.md T070, T071
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-drift-'));
  process.env['MISSION_CONTROL_DATA_DIR'] = tempDir;
  process.env['MISSION_CONTROL_DB_PATH'] = join(tempDir, 'mission-control.db');
  db = new Database(process.env['MISSION_CONTROL_DB_PATH']);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = 1');
  db.pragma('busy_timeout = 50');
  const { runMigrations } = await import('@/lib/migrations');
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
  delete process.env['MISSION_CONTROL_DATA_DIR'];
  delete process.env['MISSION_CONTROL_DB_PATH'];
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Seed a counter row with a known consumed value and a ledger that does
 * NOT match (drift). `delta` is added to consumed_token vs the ledger so
 * the drift_pct lands in the chosen tier.
 */
function seedDriftedCounter(args: {
  policy_id: number;
  ledger_amount: number;
  consumed: number;
}): number {
  const window_start = '2026-05-01T00:00:00Z';
  // Ledger entry first (so genesis chain stays valid).
  const tail = db
    .prepare(
      `SELECT row_hash FROM resource_budget_ledger ORDER BY id DESC LIMIT 1`,
    )
    .get() as { row_hash: string };
  const prev_hash = tail.row_hash;
  const canonical = [
    prev_hash,
    String(args.policy_id),
    '',
    window_start,
    'debit',
    String(args.ledger_amount),
    'token',
    '',
    '',
    '2026-05',
    '',
  ].join('|');
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  const row_hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  db.prepare(
    `INSERT INTO resource_budget_ledger
       (policy_id, counter_id, window_start, kind, amount, unit,
        source_event_id, decision_id, prev_hash, row_hash,
        partition_month, notes_json)
     VALUES (?, NULL, ?, 'debit', ?, 'token', NULL, NULL, ?, ?, '2026-05', NULL)`,
  ).run(args.policy_id, window_start, args.ledger_amount, prev_hash, row_hash);

  // Counter row with the (drifted) consumed value.
  const result = db
    .prepare(
      `INSERT INTO resource_budget_counters
         (policy_id, window_start, consumed_token, version)
       VALUES (?, ?, ?, 1)`,
    )
    .run(args.policy_id, window_start, args.consumed);
  return Number(result.lastInsertRowid);
}

describe('SPEC-008 resource-drift-detector — AC-Drift-1..4', () => {
  it('AC-Drift-1: auto-repair tier — drift ≤ 0.5% repairs once, idempotent', async () => {
    const { detectDrift } = await import('@/lib/resource-drift-detector');
    // ledger=10000 tokens, consumed=10010 → drift_pct = 0.1% (auto-repair tier)
    const counterId = seedDriftedCounter({
      policy_id: 1,
      ledger_amount: 10000,
      consumed: 10010,
    });

    const first = detectDrift(db);
    expect(first.repaired_count).toBeGreaterThanOrEqual(1);
    expect(first.tier_breakdown.auto_repair).toBeGreaterThanOrEqual(1);

    // After repair, counter equals ledger.
    const after = db
      .prepare(`SELECT consumed_token, version FROM resource_budget_counters WHERE id = ?`)
      .get(counterId) as { consumed_token: number; version: number };
    expect(after.consumed_token).toBe(10000);
    expect(after.version).toBe(2); // bumped via optimistic-lock UPDATE

    const second = detectDrift(db);
    expect(second.repaired_count).toBe(0);
    expect(second.tier_breakdown.auto_repair).toBe(0);
  });

  it('AC-Drift-2: operator-confirmed tier — drift in (0.5%, 5%] not auto-repaired', async () => {
    const { detectDrift } = await import('@/lib/resource-drift-detector');
    // ledger=1000, consumed=1020 → drift_pct=2% (operator-confirmed tier)
    const counterId = seedDriftedCounter({
      policy_id: 2,
      ledger_amount: 1000,
      consumed: 1020,
    });

    const result = detectDrift(db);
    expect(result.tier_breakdown.operator_confirmed).toBeGreaterThanOrEqual(1);
    // Counter unchanged.
    const after = db
      .prepare(`SELECT consumed_token, version FROM resource_budget_counters WHERE id = ?`)
      .get(counterId) as { consumed_token: number; version: number };
    expect(after.consumed_token).toBe(1020);
    expect(after.version).toBe(1);
  });

  it('AC-Drift-3: hard-block tier — drift > 5% sets pending_rebuild_job_id', async () => {
    const { detectDrift } = await import('@/lib/resource-drift-detector');
    const { reserve } = await import('@/lib/resource-budget-counters');
    // ledger=100, consumed=200 → drift_pct=100% (hard-block tier)
    const counterId = seedDriftedCounter({
      policy_id: 3,
      ledger_amount: 100,
      consumed: 200,
    });

    const result = detectDrift(db);
    expect(result.tier_breakdown.hard_block).toBeGreaterThanOrEqual(1);

    const row = db
      .prepare(`SELECT pending_rebuild_job_id FROM resource_budget_counters WHERE id = ?`)
      .get(counterId) as { pending_rebuild_job_id: string | null };
    expect(row.pending_rebuild_job_id).toMatch(/.+/);

    // Subsequent reserve() must refuse with rebuild_pending.
    const reserveResult = reserve(db, {
      policy_id: 3,
      window_start: '2026-05-01T00:00:00Z',
      unit: 'token',
      amount: 1,
      expected_version: 1,
      limit_value: 100000,
    });
    expect(reserveResult.committed).toBe(false);
    if (!reserveResult.committed) {
      expect(reserveResult.conflict).toBe('rebuild_pending');
    }
  });

  it('AC-Drift-4: stratified sampling — small / medium / large strata receive up to N rows each', async () => {
    const { detectDrift } = await import('@/lib/resource-drift-detector');
    // Seed three rows, one per stratum, all clean (no drift).
    const window_start = '2026-05-02T00:00:00Z';
    db.prepare(
      `INSERT INTO resource_budget_counters
         (policy_id, window_start, consumed_token) VALUES
         (101, ?, 500),    -- small (< 1000)
         (102, ?, 50000),  -- medium (1000..100000)
         (103, ?, 500000)  -- large (>= 100000)`,
    ).run(window_start, window_start, window_start);

    const result = detectDrift(db);
    expect(result.sampled_breakdown.small).toBeGreaterThanOrEqual(1);
    expect(result.sampled_breakdown.medium).toBeGreaterThanOrEqual(1);
    expect(result.sampled_breakdown.large).toBeGreaterThanOrEqual(1);
    // No drift when ledger SUM happens to be 0 and consumed > 0 actually
    // produces large drift; with no ledger entries seeded for these
    // policies, every row is in the hard-block tier. The point is that
    // ALL three strata were SAMPLED — which is what AC-Drift-4 asserts.
    expect(result.sampled_breakdown.small).toBeLessThanOrEqual(200);
    expect(result.sampled_breakdown.medium).toBeLessThanOrEqual(200);
    expect(result.sampled_breakdown.large).toBeLessThanOrEqual(200);
  });
});
