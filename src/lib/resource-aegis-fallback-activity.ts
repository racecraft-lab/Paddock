/**
 * SPEC-008 — Aegis fallback chain step recorder (T134).
 *
 * Per FR-361. The Aegis dispatch decision chain advances through steps:
 *   1. primary provider (Claude Code OTel)
 *   2. emergency reserve (FR-153)
 *   3. local mode (FR-362, LM Studio)
 *   4. `deferred_no_fallback` (FR-363, terminal)
 *
 * Each transition emits a one-time activity row per
 * `(workspace_id, step, hour_bucket)` so the UI / alert path is not
 * spammed when the chain repeatedly fails over within an hour. The
 * de-dup is keyed on the M68 `aegis_fallback_activity` UNIQUE index
 * — `INSERT OR IGNORE` collapses repeated emissions in the same bucket.
 *
 * @see specs/008-resource-governance/spec.md FR-361
 * @see specs/008-resource-governance/tasks.md T134
 * @see Constitution Convention J — strict-scope module
 */

import type Database from 'better-sqlite3';

/** Closed set of fallback chain step labels per FR-361. */
export type AegisFallbackStep =
  | 'emergency_reserve'
  | 'local_mode'
  | 'deferred_no_fallback';

/** Result envelope. `emitted=false` means the step was already recorded for this hour. */
export interface RecordResult {
  emitted: boolean;
  hour_bucket: string;
}

/** Hour-bucket key in the form `YYYY-MM-DDTHH` (UTC). */
function hourBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 13);
}

/**
 * Record a `governance_aegis_fallback_<step>` activity row, de-duped per
 * `(workspace_id, step, hour_bucket)`. Returns `{emitted:true}` on first
 * write in the bucket; subsequent calls within the same hour return
 * `{emitted:false}`.
 *
 * The write uses `INSERT OR IGNORE` so two concurrent writers race on
 * the M68 UNIQUE index and the loser is a clean no-op.
 */
export function recordAegisFallback(
  workspace_id: number,
  step: AegisFallbackStep,
  db: Database.Database,
  payload: Record<string, unknown> = {},
  now: Date = new Date(),
): RecordResult {
  const bucket = hourBucket(now);
  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO aegis_fallback_activity
           (workspace_id, step, hour_bucket, payload_json)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        workspace_id,
        step,
        bucket,
        JSON.stringify({
          activity: `governance_aegis_fallback_${step}`,
          ...payload,
        }),
      );
    return result.changes > 0;
  });
  const emitted = tx.immediate();
  return { emitted, hour_bucket: bucket };
}
