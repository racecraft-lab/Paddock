/**
 * SPEC-008 — Stratified-sample drift detection (counter vs ledger SOT).
 *
 * Per FR-057, FR-095, FR-096, FR-108, FR-345, FR-346, FR-389. The
 * detector runs against the audit connection (long busy_timeout) and
 * samples up to 200 rows per stratum:
 *
 *   - small:  consumed_token < 1000
 *   - medium: 1000 ≤ consumed_token < 100000
 *   - large:  consumed_token ≥ 100000
 *
 * Each sampled `(policy_id, window_start)` counter is reconciled against
 * the FR-051 ledger SUM (the source of truth per FR-389) and the result
 * mapped to one of three tiers (FR-057):
 *
 *   - drift_pct ≤ 0.5%  → auto_repair (UPDATE counter to ledger value via
 *                         optimistic-lock; idempotent on second run)
 *   - 0.5% < drift_pct ≤ 5% → operator_confirmed (counter left alone; an
 *                              activity row is written so an operator can
 *                              approve manually)
 *   - drift_pct > 5%    → hard_block (set
 *                         counters.pending_rebuild_job_id = <new uuid>;
 *                         the FR-345 reservation guard then refuses
 *                         `reserve()` with code='rebuild_pending')
 *
 * Idempotency: per FR-346, repeated runs converge. After an auto_repair
 * UPDATE the next run sees no drift; after a hard_block flag the same
 * counter row stays flagged (rebuild_required) until a rebuild job
 * clears `pending_rebuild_job_id` and writes the swapped value.
 *
 * The detector never opens its own write transaction — each repair runs
 * inside a per-counter `db.transaction(...)` so the audit connection's
 * 30s busy_timeout absorbs lock contention without starving foreground.
 *
 * @see specs/008-resource-governance/spec.md FR-057, FR-095, FR-096,
 *   FR-108, FR-345, FR-346, FR-389
 * @see specs/008-resource-governance/tasks.md T070
 */

import { randomUUID } from 'node:crypto';
import { getAuditDb } from '@/lib/db/connection-pool';
import type Database from 'better-sqlite3';

/** Per-stratum sampling cap (FR-095 / FR-096). */
export const STRATUM_SAMPLE_CAP = 200;

/** Tier thresholds per FR-057. */
const AUTO_REPAIR_MAX_PCT = 0.5;
const OPERATOR_CONFIRM_MAX_PCT = 5.0;

/** Result of a single drift-detector pass. */
export interface DriftDetectionResult {
  sampled_total: number;
  sampled_breakdown: {
    small: number;
    medium: number;
    large: number;
  };
  drifted_count: number;
  repaired_count: number;
  tier_breakdown: {
    auto_repair: number;
    operator_confirmed: number;
    hard_block: number;
  };
}

/** One sampled counter row (subset of columns). */
interface SampledCounter {
  id: number;
  policy_id: number;
  window_start: string;
  consumed_usd: number;
  consumed_token: number;
  consumed_request: number;
  consumed_session: number;
  version: number;
  pending_rebuild_job_id: string | null;
}

/** Sample up to N rows from one stratum. */
function sampleStratum(
  db: Database.Database,
  predicate: string,
  limit: number,
): SampledCounter[] {
  return db
    .prepare(
      `SELECT id, policy_id, window_start,
              consumed_usd, consumed_token, consumed_request, consumed_session,
              version, pending_rebuild_job_id
         FROM resource_budget_counters
         WHERE ${predicate}
           AND pending_rebuild_job_id IS NULL
         ORDER BY id
         LIMIT ?`,
    )
    .all(limit) as SampledCounter[];
}

/** Sum the ledger amount for a (policy_id, window_start, unit) tuple. */
function ledgerSum(
  db: Database.Database,
  args: { policy_id: number; window_start: string; unit: 'usd' | 'token' | 'request' | 'session' },
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM resource_budget_ledger
         WHERE policy_id = ? AND window_start = ? AND unit = ?
           AND kind IN ('debit','correction')`,
    )
    .get(args.policy_id, args.window_start, args.unit) as { total: number };
  return row.total;
}

/** Compute drift percentage |observed - expected| / max(expected,1) * 100. */
function driftPct(observed: number, expected: number): number {
  const denom = Math.max(Math.abs(expected), 1);
  return (Math.abs(observed - expected) / denom) * 100;
}

/** Auto-repair: optimistic-lock UPDATE counter to ledger value. */
function autoRepair(
  db: Database.Database,
  row: SampledCounter,
  ledgerToken: number,
): boolean {
  const result = db
    .prepare(
      `UPDATE resource_budget_counters
          SET consumed_token = ?,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND version = ?
          AND pending_rebuild_job_id IS NULL`,
    )
    .run(ledgerToken, row.id, row.version);
  return result.changes > 0;
}

/** Hard-block: mark counter for rebuild. */
function flagHardBlock(db: Database.Database, row: SampledCounter): string {
  const jobId = `rebuild_${randomUUID()}`;
  db.prepare(
    `UPDATE resource_budget_counters
        SET pending_rebuild_job_id = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND pending_rebuild_job_id IS NULL`,
  ).run(jobId, row.id);
  return jobId;
}

/** Activity log shim — writes one row to resource_policy_events. */
function recordActivity(
  db: Database.Database,
  args: {
    policy_id: number;
    decision: 'allow' | 'defer' | 'block' | 'override_required' | 'override';
    reason: string;
    metadata: Record<string, unknown>;
  },
): void {
  db.prepare(
    `INSERT INTO resource_policy_events
       (policy_id, task_id, agent_id, decision, reason, observed_value,
        limit_value, metadata, decision_id, actor, details_json,
        prev_hash, row_hash)
     VALUES (?, NULL, NULL, ?, ?, NULL, NULL, ?, NULL, 'system', ?, '', '')`,
  ).run(
    args.policy_id,
    args.decision,
    args.reason,
    JSON.stringify(args.metadata),
    JSON.stringify(args.metadata),
  );
}

/**
 * Run one drift-detector pass over a stratified sample. Repairs the
 * auto-tier rows in place, flags the operator-confirmed tier with an
 * activity row, flags the hard-block tier by setting
 * `pending_rebuild_job_id` so the FR-345 reservation guard blocks new
 * grants.
 */
export function detectDrift(dbArg?: Database.Database): DriftDetectionResult {
  const db = dbArg ?? getAuditDb();

  const small = sampleStratum(
    db,
    'consumed_token < 1000',
    STRATUM_SAMPLE_CAP,
  );
  const medium = sampleStratum(
    db,
    'consumed_token >= 1000 AND consumed_token < 100000',
    STRATUM_SAMPLE_CAP,
  );
  const large = sampleStratum(
    db,
    'consumed_token >= 100000',
    STRATUM_SAMPLE_CAP,
  );

  const sampled: SampledCounter[] = [...small, ...medium, ...large];
  const result: DriftDetectionResult = {
    sampled_total: sampled.length,
    sampled_breakdown: {
      small: small.length,
      medium: medium.length,
      large: large.length,
    },
    drifted_count: 0,
    repaired_count: 0,
    tier_breakdown: {
      auto_repair: 0,
      operator_confirmed: 0,
      hard_block: 0,
    },
  };

  for (const row of sampled) {
    const expected = ledgerSum(db, {
      policy_id: row.policy_id,
      window_start: row.window_start,
      unit: 'token',
    });
    if (expected === row.consumed_token) continue;

    result.drifted_count += 1;
    const pct = driftPct(row.consumed_token, expected);

    if (pct <= AUTO_REPAIR_MAX_PCT) {
      const tx = db.transaction(() => autoRepair(db, row, expected));
      const repaired = tx();
      if (repaired) {
        result.repaired_count += 1;
        result.tier_breakdown.auto_repair += 1;
        recordActivity(db, {
          policy_id: row.policy_id,
          decision: 'allow',
          reason: 'mc.governance.drift_auto_repair',
          metadata: {
            counter_id: row.id,
            window_start: row.window_start,
            observed: row.consumed_token,
            expected,
            drift_pct: pct,
          },
        });
      }
    } else if (pct <= OPERATOR_CONFIRM_MAX_PCT) {
      result.tier_breakdown.operator_confirmed += 1;
      recordActivity(db, {
        policy_id: row.policy_id,
        decision: 'defer',
        reason: 'mc.governance.drift_detected',
        metadata: {
          counter_id: row.id,
          window_start: row.window_start,
          observed: row.consumed_token,
          expected,
          drift_pct: pct,
          tier: 'operator_confirmed',
        },
      });
    } else {
      const jobId = flagHardBlock(db, row);
      result.tier_breakdown.hard_block += 1;
      recordActivity(db, {
        policy_id: row.policy_id,
        decision: 'block',
        reason: 'mc.governance.drift_hard_block',
        metadata: {
          counter_id: row.id,
          window_start: row.window_start,
          observed: row.consumed_token,
          expected,
          drift_pct: pct,
          rebuild_job_id: jobId,
        },
      });
    }
  }

  return result;
}
