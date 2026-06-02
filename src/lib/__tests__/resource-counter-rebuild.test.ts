/**
 * SPEC-008 — Tests for `src/lib/resource-counter-rebuild.ts` (T073).
 *
 * Acceptance criteria per the task prompt:
 *   - idempotency: rebuilding the same scope twice produces identical
 *     results (no double-count).
 *   - resume from cursor: kill mid-run, restart from cursor, completes
 *     correctly.
 *   - atomic swap rejection on stale: bump counter.version during rebuild
 *     → swap rejected with code='stale_rebuild', job state='failed'.
 *   - pending_rebuild_job_id cleared on successful swap.
 *
 * @see specs/008-resource-governance/spec.md FR-058a, FR-066, FR-348
 * @see specs/008-resource-governance/tasks.md T073
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-rebuild-'));
  process.env['PADDOCK_DATA_DIR'] = tempDir;
  process.env['PADDOCK_DB_PATH'] = join(tempDir, 'paddock.db');
  db = new Database(process.env['PADDOCK_DB_PATH']);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = 1');
  db.pragma('busy_timeout = 5000');
  const { runMigrations } = await import('@/lib/migrations');
  runMigrations(db);
  db.pragma('foreign_keys = OFF');

  const { __resetJobStoreForTests } = await import(
    '@/lib/resource-counter-rebuild'
  );
  __resetJobStoreForTests();
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

/**
 * Append one debit-token row to the ledger using the canonical hash form.
 * Returns the inserted row id.
 */
function appendLedgerDebit(args: {
  policy_id: number;
  window_start: string;
  amount: number;
}): number {
  const tail = db
    .prepare(
      `SELECT row_hash FROM resource_budget_ledger ORDER BY id DESC LIMIT 1`,
    )
    .get() as { row_hash: string };
  const prev_hash = tail.row_hash;
  const partition_month = args.window_start.slice(0, 7);
  const canonical = [
    prev_hash,
    String(args.policy_id),
    '',
    args.window_start,
    'debit',
    String(args.amount),
    'token',
    '',
    '',
    partition_month,
    '',
  ].join('|');
  const row_hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  const result = db
    .prepare(
      `INSERT INTO resource_budget_ledger
         (policy_id, counter_id, window_start, kind, amount, unit,
          source_event_id, decision_id, prev_hash, row_hash,
          partition_month, notes_json)
       VALUES (?, NULL, ?, 'debit', ?, 'token', NULL, NULL, ?, ?, ?, NULL)`,
    )
    .run(
      args.policy_id,
      args.window_start,
      args.amount,
      prev_hash,
      row_hash,
      partition_month,
    );
  return Number(result.lastInsertRowid);
}

/**
 * Seed a flagged counter (pending_rebuild_job_id NOT NULL) with the
 * supplied consumed_token value. Returns the counter id.
 */
function seedFlaggedCounter(args: {
  policy_id: number;
  window_start: string;
  consumed_token: number;
  pending_rebuild_job_id: string;
}): number {
  const result = db
    .prepare(
      `INSERT INTO resource_budget_counters
         (policy_id, window_start, consumed_token, version,
          pending_rebuild_job_id)
       VALUES (?, ?, ?, 1, ?)`,
    )
    .run(
      args.policy_id,
      args.window_start,
      args.consumed_token,
      args.pending_rebuild_job_id,
    );
  return Number(result.lastInsertRowid);
}

describe('SPEC-008 resource-counter-rebuild — T073', () => {
  it('rebuilds from ledger and clears pending_rebuild_job_id on swap (FR-348)', async () => {
    const {
      createRebuildJob,
      runRebuildChunk,
      attemptSwap,
    } = await import('@/lib/resource-counter-rebuild');

    const policy_id = 11;
    const window_start = '2026-05-01T00:00:00Z';
    appendLedgerDebit({ policy_id, window_start, amount: 1000 });
    appendLedgerDebit({ policy_id, window_start, amount: 2500 });
    appendLedgerDebit({ policy_id, window_start, amount: 1500 });
    // Counter is "drifted" — claims 9999 consumed when ledger SUM=5000.
    const counterId = seedFlaggedCounter({
      policy_id,
      window_start,
      consumed_token: 9999,
      pending_rebuild_job_id: 'rebuild_seeded_a',
    });

    const job = createRebuildJob(counterId, { chunk_size: 10, db });
    expect(job.state).toBe('assigned');
    expect(job.cursor).toBe(0);
    expect(job.id).toBe('rebuild_seeded_a'); // reused existing flag

    const after1 = runRebuildChunk(job.id, { db });
    // 3 ledger rows < chunk_size=10 → final chunk → verifying.
    expect(after1.state).toBe('verifying');
    expect(after1.shadow_value).toBe(5000);

    const swapResult = attemptSwap(job.id, { db });
    expect(swapResult.ok).toBe(true);

    const counterAfter = db
      .prepare(
        `SELECT consumed_token, version, pending_rebuild_job_id
           FROM resource_budget_counters WHERE id = ?`,
      )
      .get(counterId) as {
        consumed_token: number;
        version: number;
        pending_rebuild_job_id: string | null;
      };
    expect(counterAfter.consumed_token).toBe(5000);
    expect(counterAfter.version).toBe(2); // version bumped
    expect(counterAfter.pending_rebuild_job_id).toBeNull();
  });

  it('idempotency: rebuild twice produces same result (FR-058a)', async () => {
    const {
      createRebuildJob,
      runRebuildChunk,
      attemptSwap,
    } = await import('@/lib/resource-counter-rebuild');

    const policy_id = 12;
    const window_start = '2026-05-01T00:00:00Z';
    appendLedgerDebit({ policy_id, window_start, amount: 750 });
    appendLedgerDebit({ policy_id, window_start, amount: 250 });
    const counterId = seedFlaggedCounter({
      policy_id,
      window_start,
      consumed_token: 5000,
      pending_rebuild_job_id: 'rebuild_seeded_b',
    });

    const job1 = createRebuildJob(counterId, { chunk_size: 100, db });
    runRebuildChunk(job1.id, { db });
    const swap1 = attemptSwap(job1.id, { db });
    expect(swap1.ok).toBe(true);

    const after1 = db
      .prepare(`SELECT consumed_token, version FROM resource_budget_counters WHERE id = ?`)
      .get(counterId) as { consumed_token: number; version: number };
    expect(after1.consumed_token).toBe(1000);

    // Re-flag the counter (simulates a second drift incident with the same
    // ledger state) and run again — must arrive at same value.
    db.prepare(
      `UPDATE resource_budget_counters SET pending_rebuild_job_id = ?, consumed_token = 9999 WHERE id = ?`,
    ).run('rebuild_seeded_b2', counterId);

    const job2 = createRebuildJob(counterId, { chunk_size: 100, db });
    runRebuildChunk(job2.id, { db });
    const swap2 = attemptSwap(job2.id, { db });
    expect(swap2.ok).toBe(true);

    const after2 = db
      .prepare(`SELECT consumed_token, pending_rebuild_job_id FROM resource_budget_counters WHERE id = ?`)
      .get(counterId) as { consumed_token: number; pending_rebuild_job_id: string | null };
    expect(after2.consumed_token).toBe(1000); // identical to after1
    expect(after2.pending_rebuild_job_id).toBeNull();
  });

  it('resume from cursor: process partial → resume → complete', async () => {
    const {
      createRebuildJob,
      runRebuildChunk,
      attemptSwap,
      getRebuildJob,
    } = await import('@/lib/resource-counter-rebuild');

    const policy_id = 13;
    const window_start = '2026-05-01T00:00:00Z';
    // Seed 25 ledger rows of 100 tokens each → total 2500.
    for (let i = 0; i < 25; i++) {
      appendLedgerDebit({ policy_id, window_start, amount: 100 });
    }
    const counterId = seedFlaggedCounter({
      policy_id,
      window_start,
      consumed_token: 0,
      pending_rebuild_job_id: 'rebuild_seeded_c',
    });

    const job = createRebuildJob(counterId, { chunk_size: 10, db });
    expect(job.state).toBe('assigned');

    // Chunk 1: 10 rows processed, still running.
    const j1 = runRebuildChunk(job.id, { db });
    expect(j1.state).toBe('running');
    expect(j1.shadow_value).toBe(1000);
    const cursorAfter1 = j1.cursor;
    expect(cursorAfter1).toBeGreaterThan(0);

    // Chunk 2: 10 more rows, still running.
    const j2 = runRebuildChunk(job.id, { db });
    expect(j2.state).toBe('running');
    expect(j2.shadow_value).toBe(2000);
    expect(j2.cursor).toBeGreaterThan(cursorAfter1);

    // Simulate restart: re-fetch the job (in our in-memory store the
    // identity is stable) and continue. Cursor must be preserved.
    const resumed = getRebuildJob(job.id);
    expect(resumed).not.toBeNull();
    expect(resumed?.cursor).toBe(j2.cursor);
    expect(resumed?.shadow_value).toBe(2000);

    // Chunk 3: only 5 rows remaining → < chunk_size → verifying.
    const j3 = runRebuildChunk(job.id, { db });
    expect(j3.state).toBe('verifying');
    expect(j3.shadow_value).toBe(2500);

    const swap = attemptSwap(job.id, { db });
    expect(swap.ok).toBe(true);

    const after = db
      .prepare(`SELECT consumed_token FROM resource_budget_counters WHERE id = ?`)
      .get(counterId) as { consumed_token: number };
    expect(after.consumed_token).toBe(2500);
  });

  it('stale rebuild: counter.version bumped mid-rebuild → swap rejected (FR-066)', async () => {
    const {
      createRebuildJob,
      runRebuildChunk,
      attemptSwap,
      getRebuildJob,
    } = await import('@/lib/resource-counter-rebuild');

    const policy_id = 14;
    const window_start = '2026-05-01T00:00:00Z';
    appendLedgerDebit({ policy_id, window_start, amount: 500 });
    appendLedgerDebit({ policy_id, window_start, amount: 500 });
    const counterId = seedFlaggedCounter({
      policy_id,
      window_start,
      consumed_token: 9999,
      pending_rebuild_job_id: 'rebuild_seeded_d',
    });

    const job = createRebuildJob(counterId, { chunk_size: 100, db });
    runRebuildChunk(job.id, { db });
    const j = getRebuildJob(job.id);
    expect(j?.state).toBe('verifying');
    expect(j?.shadow_value).toBe(1000);

    // Concurrent writer bumps version while we are about to swap. We are
    // ALSO bumping pending_rebuild_job_id back to the same job id so the
    // pending_rebuild_job_id predicate still matches; only `version`
    // changes. (A real concurrent writer would not normally do this since
    // pending_rebuild_job_id IS NOT NULL prevents reservations — but we
    // deliberately decouple to test the version-mismatch branch.)
    db.prepare(
      `UPDATE resource_budget_counters
          SET version = version + 1,
              pending_rebuild_job_id = 'rebuild_seeded_d',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    ).run(counterId);

    const swap = attemptSwap(job.id, { db });
    expect(swap.ok).toBe(false);
    if (!swap.ok) {
      expect(swap.code).toBe('stale_rebuild');
    }

    const j2 = getRebuildJob(job.id);
    expect(j2?.state).toBe('failed');
    expect(j2?.failure_reason).toBe('stale_rebuild');

    // Counter row keeps pending_rebuild_job_id set so the FR-345 guard
    // continues to block reservations until a fresh job is assigned.
    const after = db
      .prepare(
        `SELECT consumed_token, pending_rebuild_job_id
           FROM resource_budget_counters WHERE id = ?`,
      )
      .get(counterId) as { consumed_token: number; pending_rebuild_job_id: string | null };
    expect(after.consumed_token).toBe(9999); // not swapped
    expect(after.pending_rebuild_job_id).toBe('rebuild_seeded_d');
  });
});
