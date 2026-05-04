/**
 * SPEC-008 — Async chunked counter rebuild with atomic swap.
 *
 * Per FR-058, FR-058a, FR-059, FR-066, FR-347, FR-348. When the FR-057 drift
 * detector hard-blocks a counter (drift_pct > 5%) it sets
 * `resource_budget_counters.pending_rebuild_job_id` to a fresh job id. This
 * module owns the lifecycle of that job:
 *
 *   assigned → running → verifying → swapped → completed
 *                                            \→ failed
 *
 * Lifecycle states:
 *   - assigned:  job row exists, no chunks processed yet.
 *   - running:   chunk loop in progress (cursor advances per call).
 *   - verifying: ledger scan finished, shadow_value materialized; ready
 *                for atomic swap.
 *   - swapped:   counter row's `consumed_<unit>` updated from shadow value
 *                inside ONE optimistic-lock transaction. `version` bumped,
 *                `pending_rebuild_job_id` cleared.
 *   - completed: job is closed; idempotent re-run is a no-op.
 *   - failed:    swap rejected (stale rebuild — counter.version advanced
 *                during rebuild) OR an internal exception.
 *
 * Atomicity contract (FR-066): the swap MUST reject if any writer bumped
 * `counter.version` while the rebuild was running. Stale rebuild → set
 * `state='failed'`, `failure_reason='stale_rebuild'`, leave the counter row
 * with `pending_rebuild_job_id` intact so the FR-345 reservation guard
 * keeps blocking new grants until a fresh job is assigned.
 *
 * Chunked: configurable `chunk_size` (default 1000 ledger rows). Each call
 * to `runRebuildChunk(jobId)` processes ONE chunk and persists the cursor
 * (the highest ledger row id seen so far) so a process crash mid-rebuild
 * resumes at the next chunk on restart.
 *
 * Job persistence:
 *   The schema does NOT yet include a `resource_counter_rebuild_jobs`
 *   table. Per the T072 task prompt verify-first directive, this module
 *   uses an in-memory `Map<jobId, RebuildJob>` at module scope. The
 *   resume-from-cursor and idempotency contracts hold within a single
 *   process (which is the SPEC-008 deployment model — single-process
 *   single-writer SQLite, see `connection-pool.ts`). Job state is lost on
 *   process restart, but the counter row's `pending_rebuild_job_id` field
 *   on the counters table remains, so a fresh job can be assigned.
 *
 *   T072.followup — when migration M65? lands `resource_counter_rebuild_jobs`,
 *   convert this module to a thin DB-backed implementation. The exported
 *   surface (`createRebuildJob`, `runRebuildChunk`, `attemptSwap`,
 *   `getRebuildJob`) is the persistence boundary; callers do NOT see the
 *   underlying storage.
 *
 * Activity log: on successful swap, write
 * `mc.governance.drift_rebuild_completed` to `resource_policy_events` so
 * the operator timeline mirrors the drift-detector activity rows.
 *
 * @see specs/008-resource-governance/spec.md FR-058, FR-058a, FR-059,
 *   FR-066, FR-347, FR-348
 * @see specs/008-resource-governance/tasks.md T072
 */

import { randomUUID } from 'node:crypto';
import { getAuditDb } from '@/lib/db/connection-pool';
import type Database from 'better-sqlite3';

/** Default chunk size when none is supplied to `createRebuildJob`. */
export const DEFAULT_CHUNK_SIZE = 1000;

/** Lifecycle states for a rebuild job. */
export type RebuildState =
  | 'assigned'
  | 'running'
  | 'verifying'
  | 'swapped'
  | 'completed'
  | 'failed';

/** Reason codes when a job lands in `state='failed'`. */
export type RebuildFailureReason =
  | 'stale_rebuild'
  | 'counter_missing'
  | 'internal_error';

/** Public job shape (matches the prompt-defined contract). */
export interface RebuildJob {
  id: string;
  counter_id: number;
  state: RebuildState;
  /** Last ledger entry id processed (resume cursor). */
  cursor: number;
  chunk_size: number;
  /** Materialized shadow value once verifying succeeds. NULL while running. */
  shadow_value: number | null;
  /**
   * Counter `version` observed at the start of the rebuild loop. Captured
   * on the assigned → running transition so the FR-066 atomic swap can
   * detect a concurrent writer that bumped `version` during the rebuild.
   */
  version_at_start: number | null;
  started_at_ms: number;
  completed_at_ms: number | null;
  failure_reason: string | null;
}

/** Result of `attemptSwap`. */
export type SwapResult =
  | { ok: true }
  | { ok: false; code: 'stale_rebuild' | 'still_running' | 'job_missing' | 'counter_missing' };

/**
 * Module-scope job store. Keys are job ids (the same string written to
 * `resource_budget_counters.pending_rebuild_job_id`). See module docstring
 * for the persistence-table followup.
 */
const jobStore = new Map<string, RebuildJob>();

/** Counter row subset needed by the rebuild loop. */
interface CounterRow {
  id: number;
  policy_id: number;
  window_start: string;
  consumed_token: number;
  version: number;
  pending_rebuild_job_id: string | null;
}

/** Read the counter row for the job's counter_id. */
function readCounter(
  db: Database.Database,
  counter_id: number,
): CounterRow | null {
  const row = db
    .prepare(
      `SELECT id, policy_id, window_start, consumed_token, version,
              pending_rebuild_job_id
         FROM resource_budget_counters
         WHERE id = ?`,
    )
    .get(counter_id) as CounterRow | undefined;
  return row ?? null;
}

/**
 * Create a new rebuild job for the given counter id. The counter row
 * MUST already have `pending_rebuild_job_id` set (typically by the FR-057
 * hard-block tier of the drift detector). This function does NOT bind the
 * counter — the binding has already happened at flag time. The job id
 * returned is the SAME string in `pending_rebuild_job_id` IF the counter
 * already carries one; otherwise a fresh `rebuild_<uuid>` is generated and
 * the counter row is updated to claim it.
 *
 * The newly-created job starts in `state='assigned'` with `cursor=0`.
 */
export function createRebuildJob(
  counterId: number,
  opts: { chunk_size?: number; db?: Database.Database } = {},
): RebuildJob {
  const db = opts.db ?? getAuditDb();
  const counter = readCounter(db, counterId);
  if (counter === null) {
    throw new Error(
      `resource-counter-rebuild: counter ${counterId.toString()} not found`,
    );
  }
  const chunk_size =
    opts.chunk_size !== undefined && opts.chunk_size > 0
      ? Math.floor(opts.chunk_size)
      : DEFAULT_CHUNK_SIZE;

  // Reuse the counter's existing pending_rebuild_job_id if present so a
  // restart-after-crash reattaches to the same logical job. Otherwise
  // mint a fresh id and bind it on the counter row.
  let jobId: string;
  if (counter.pending_rebuild_job_id !== null) {
    jobId = counter.pending_rebuild_job_id;
  } else {
    jobId = `rebuild_${randomUUID()}`;
    db.prepare(
      `UPDATE resource_budget_counters
          SET pending_rebuild_job_id = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND pending_rebuild_job_id IS NULL`,
    ).run(jobId, counterId);
  }

  // If a job under this id already exists in the store, return it
  // (idempotent — a re-creation must not reset cursor / state).
  const existing = jobStore.get(jobId);
  if (existing !== undefined) return existing;

  const job: RebuildJob = {
    id: jobId,
    counter_id: counterId,
    state: 'assigned',
    cursor: 0,
    chunk_size,
    shadow_value: null,
    version_at_start: null,
    started_at_ms: Date.now(),
    completed_at_ms: null,
    failure_reason: null,
  };
  jobStore.set(jobId, job);
  return job;
}

/**
 * Read one ledger chunk starting strictly above `cursor`. Returns the
 * rows AND the new max-id-seen (so the caller can advance the cursor
 * deterministically without a second SELECT MAX query).
 */
function readLedgerChunk(
  db: Database.Database,
  args: {
    policy_id: number;
    window_start: string;
    cursor: number;
    chunk_size: number;
  },
): { rows: { id: number; kind: string; amount: number }[]; chunk_max_id: number } {
  const rows = db
    .prepare(
      `SELECT id, kind, amount
         FROM resource_budget_ledger
         WHERE policy_id = ?
           AND window_start = ?
           AND unit = 'token'
           AND id > ?
         ORDER BY id ASC
         LIMIT ?`,
    )
    .all(
      args.policy_id,
      args.window_start,
      args.cursor,
      args.chunk_size,
    ) as { id: number; kind: string; amount: number }[];
  const chunk_max_id =
    rows.length > 0 ? (rows[rows.length - 1]?.id ?? args.cursor) : args.cursor;
  return { rows, chunk_max_id };
}

/**
 * Roll forward the chunk's contribution to the shadow consumed value.
 * Mirrors the drift detector's ledger-sum predicate:
 * `kind IN ('debit','correction')` summed.
 */
function applyChunkToShadow(
  shadow: number,
  rows: { kind: string; amount: number }[],
): number {
  let next = shadow;
  for (const r of rows) {
    if (r.kind === 'debit' || r.kind === 'correction') {
      next += r.amount;
    }
  }
  return next;
}

/**
 * Process one chunk of the rebuild. The first call transitions the job
 * from `assigned` → `running` and starts the shadow accumulator at 0.
 * When the chunk read returns fewer rows than `chunk_size`, the job
 * advances to `verifying` (no more rows to process). Subsequent calls
 * after `verifying` are no-ops; the swap step is the next call to
 * `attemptSwap(jobId)`.
 *
 * Idempotency: a single chunk is processed per call. If the cursor has
 * already advanced past the available rows, the function transitions the
 * state to `verifying` without doing extra work.
 */
export function runRebuildChunk(
  jobId: string,
  opts: { db?: Database.Database } = {},
): RebuildJob {
  const db = opts.db ?? getAuditDb();
  const job = jobStore.get(jobId);
  if (job === undefined) {
    throw new Error(`resource-counter-rebuild: job ${jobId} not found`);
  }
  if (job.state === 'verifying' || job.state === 'swapped' ||
      job.state === 'completed' || job.state === 'failed') {
    return job;
  }

  const counter = readCounter(db, job.counter_id);
  if (counter === null) {
    job.state = 'failed';
    job.failure_reason = 'counter_missing';
    job.completed_at_ms = Date.now();
    return job;
  }

  if (job.state === 'assigned') {
    job.state = 'running';
    job.shadow_value = 0;
    // Capture the counter's version at rebuild start so attemptSwap can
    // detect a concurrent bump (FR-066 stale rebuild).
    job.version_at_start = counter.version;
  }

  const startShadow = job.shadow_value ?? 0;
  const { rows, chunk_max_id } = readLedgerChunk(db, {
    policy_id: counter.policy_id,
    window_start: counter.window_start,
    cursor: job.cursor,
    chunk_size: job.chunk_size,
  });

  job.shadow_value = applyChunkToShadow(startShadow, rows);
  job.cursor = chunk_max_id;

  // Final chunk: rows.length < chunk_size means we exhausted the ledger.
  if (rows.length < job.chunk_size) {
    job.state = 'verifying';
  }
  return job;
}

/**
 * Attempt the atomic swap. Requires `state='verifying'`. Builds an
 * optimistic-lock UPDATE that asserts both `pending_rebuild_job_id = jobId`
 * AND `version = counter.version_at_rebuild_start + chunks_processed`.
 *
 * Per FR-066: if any writer bumped `counter.version` during the rebuild,
 * the UPDATE rowcount is 0 and we MUST reject with `code='stale_rebuild'`,
 * setting `state='failed'`, `failure_reason='stale_rebuild'`. The counter
 * row is left with `pending_rebuild_job_id` still set so the FR-345
 * reservation guard keeps blocking new grants — a follow-up fresh job is
 * required to clear the flag.
 *
 * Per FR-348: on successful swap, clear `pending_rebuild_job_id`,
 * increment `version`, write the activity row.
 */
export function attemptSwap(
  jobId: string,
  opts: { db?: Database.Database } = {},
): SwapResult {
  const db = opts.db ?? getAuditDb();
  const job = jobStore.get(jobId);
  if (job === undefined) {
    return { ok: false, code: 'job_missing' };
  }
  if (job.state !== 'verifying') {
    if (job.state === 'failed' || job.state === 'completed' ||
        job.state === 'swapped') {
      // already finalized
      return job.state === 'failed'
        ? { ok: false, code: 'stale_rebuild' }
        : { ok: true };
    }
    return { ok: false, code: 'still_running' };
  }

  const counter = readCounter(db, job.counter_id);
  if (counter === null) {
    job.state = 'failed';
    job.failure_reason = 'counter_missing';
    job.completed_at_ms = Date.now();
    return { ok: false, code: 'counter_missing' };
  }

  const shadow = job.shadow_value ?? 0;
  const expectedVersion = job.version_at_start;
  if (expectedVersion === null) {
    // Defensive: should never happen since assigned → running set it. Fail closed.
    job.state = 'failed';
    job.failure_reason = 'internal_error';
    job.completed_at_ms = Date.now();
    return { ok: false, code: 'stale_rebuild' };
  }

  // Optimistic-lock UPDATE: predicate asserts the job still owns the
  // counter row (pending_rebuild_job_id matches) AND the version observed
  // at the start of the rebuild is still current. Any concurrent
  // reserve/release/consume bump on `version` invalidates the swap
  // (FR-066 stale rebuild rejection).
  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE resource_budget_counters
            SET consumed_token = ?,
                version = version + 1,
                pending_rebuild_job_id = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND pending_rebuild_job_id = ?
            AND version = ?`,
      )
      .run(shadow, counter.id, jobId, expectedVersion);
    if (result.changes === 0) return false;

    // Write activity row for operator timeline.
    db.prepare(
      `INSERT INTO resource_policy_events
         (policy_id, task_id, agent_id, decision, reason, observed_value,
          limit_value, metadata, decision_id, actor, details_json,
          prev_hash, row_hash)
       VALUES (?, NULL, NULL, 'allow', 'mc.governance.drift_rebuild_completed',
               NULL, NULL, ?, NULL, 'system', ?, '', '')`,
    ).run(
      counter.policy_id,
      JSON.stringify({
        counter_id: counter.id,
        window_start: counter.window_start,
        rebuild_job_id: jobId,
        new_consumed_token: shadow,
        previous_consumed_token: counter.consumed_token,
      }),
      JSON.stringify({
        rebuild_job_id: jobId,
        cursor: job.cursor,
        chunk_size: job.chunk_size,
      }),
    );
    return true;
  });

  const swapped = tx.immediate();

  if (!swapped) {
    job.state = 'failed';
    job.failure_reason = 'stale_rebuild';
    job.completed_at_ms = Date.now();
    return { ok: false, code: 'stale_rebuild' };
  }

  job.state = 'swapped';
  job.completed_at_ms = Date.now();
  // Mark fully finalized (caller-visible terminal state).
  job.state = 'completed';
  return { ok: true };
}

/** Read-only accessor for a job by id; null if unknown. */
export function getRebuildJob(jobId: string): RebuildJob | null {
  return jobStore.get(jobId) ?? null;
}

/**
 * TEST-ONLY helper. Resets the in-memory store. Production code MUST NOT
 * call this — the persistence-table followup will replace it with a
 * SQL-backed reset (or, more typically, no reset at all).
 */
export function __resetJobStoreForTests(): void {
  jobStore.clear();
}
