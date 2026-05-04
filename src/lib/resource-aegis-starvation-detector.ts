/**
 * SPEC-008 — Aegis review pipeline starvation detector (T132).
 *
 * Per FR-161. Runs on a 5-minute cadence against the background DB
 * connection. Counts tasks stuck in `status='quality_review'` whose
 * `updated_at` has not progressed in the last 5 minutes — those are
 * the queue of Aegis-pending reviews that the dispatcher has not
 * advanced. The count is published as a gauge metric and, when it
 * crosses a threshold, escalated to a high-priority activity row
 * (de-duped per (workspace_id, hour) so the alert path is not
 * spammed when the queue stays stuck across many ticks).
 *
 * Surface
 *   - `detectAegisStarvation({db, ...})` — single tick. Returns
 *     `{ count, alerts_emitted }`. Designed to run on a 5-min cadence;
 *     orchestrator wires actual scheduling.
 *
 * Metric
 *   - `mc.governance.aegis_review_pipeline_starvation_count` (gauge).
 *     Labels: `workspace_id` (string) | `'__total__'`.
 *
 * Escalation
 *   - When `count > AEGIS_STARVATION_THRESHOLD` (default 50 per the
 *     T132 prompt), `governance_aegis_starvation_detected` is recorded
 *     to `governance_health_events` (M64) with the count payload, de-
 *     duped per (workspace_id, hour) via the captured_at substring
 *     match pattern used elsewhere in this module set.
 *
 * @see specs/008-resource-governance/spec.md FR-161
 * @see specs/008-resource-governance/tasks.md T132
 * @see Constitution Convention J — strict-scope module
 */

import { incrementMetric } from '@/lib/observability/self-obs-metrics';
import type Database from 'better-sqlite3';

/** Default cadence (FR-161: 5 minutes). */
export const AEGIS_STARVATION_INTERVAL_MS = 5 * 60 * 1000;

/** Stale-threshold window (FR-161: 5 minutes since last progression). */
export const AEGIS_STARVATION_STALE_WINDOW_MS = 5 * 60 * 1000;

/** Alert-emission count threshold (T132 prompt: > 50). */
export const AEGIS_STARVATION_THRESHOLD = 50;

/** Gauge metric name (FR-105 self-obs surface). */
export const AEGIS_STARVATION_METRIC =
  'mc.governance.aegis_review_pipeline_starvation_count';

/** Per-workspace starvation count + total. */
export interface StarvationDetectorResult {
  /** Total stuck Aegis-pending tasks across all workspaces. */
  total_count: number;
  /** Per-workspace breakdown. */
  per_workspace: { workspace_id: number | null; count: number }[];
  /** Number of activity rows emitted this tick. */
  alerts_emitted: number;
}

interface CountRow {
  workspace_id: number | null;
  cnt: number;
}

/** Hour-bucket key in the form `YYYY-MM-DDTHH` (UTC). */
function hourBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 13);
}

/**
 * Single tick. Counts stuck tasks, publishes the gauge, and escalates
 * to an activity row when the count exceeds the threshold.
 *
 * The query targets `tasks.status='quality_review'` where
 * `updated_at <= now - 5 minutes` (Unix epoch seconds). That window
 * matches FR-161's "last 5 minutes had no progression" criterion.
 */
export function detectAegisStarvation(opts: {
  db: Database.Database;
  now?: Date;
  staleWindowMs?: number;
  threshold?: number;
}): StarvationDetectorResult {
  const now = opts.now ?? new Date();
  const staleMs = opts.staleWindowMs ?? AEGIS_STARVATION_STALE_WINDOW_MS;
  const threshold = opts.threshold ?? AEGIS_STARVATION_THRESHOLD;
  const cutoffEpochSeconds = Math.floor((now.getTime() - staleMs) / 1000);

  let rows: CountRow[] = [];
  try {
    rows = opts.db
      .prepare(
        `SELECT workspace_id, COUNT(*) AS cnt
           FROM tasks
          WHERE status = 'quality_review'
            AND updated_at <= ?
          GROUP BY workspace_id`,
      )
      .all(cutoffEpochSeconds) as CountRow[];
  } catch {
    // tasks table absent or workspace_id column missing in stripped
    // harnesses. Treat as zero stuck reviews.
    rows = [];
  }

  let total = 0;
  for (const r of rows) total += r.cnt;

  // Publish the gauge — total + per-workspace.
  // `incrementMetric(name, labels, amount)` — note the parameter order:
  // labels are the second positional, amount is third.
  try {
    incrementMetric(
      AEGIS_STARVATION_METRIC,
      { workspace_id: '__total__' },
      total,
    );
    for (const r of rows) {
      incrementMetric(
        AEGIS_STARVATION_METRIC,
        {
          workspace_id:
            r.workspace_id === null ? '__null__' : String(r.workspace_id),
        },
        r.cnt,
      );
    }
  } catch {
    // Metric registry should not fail; defensive.
  }

  // Escalate when the threshold is crossed. The escalation is per-
  // workspace-bucket so an unhealthy workspace does not silently
  // suppress alerts for healthy ones. De-dup per (workspace, hour)
  // via governance_health_events captured_at substring match.
  let alerts_emitted = 0;
  const bucket = hourBucket(now);
  for (const r of rows) {
    if (r.cnt <= threshold) continue;
    const wsLabel = r.workspace_id === null ? '__null__' : String(r.workspace_id);
    // Encode the (workspace, hour) into the `state` column so the de-dup
    // lookup is independent of `captured_at` (which uses CURRENT_TIMESTAMP
    // — the actual wall clock — and would not align with a test's
    // injected `now` in the future or past).
    const stateKey = `${wsLabel}|${bucket}`;
    try {
      const existing = opts.db
        .prepare(
          `SELECT id FROM governance_health_events
            WHERE component = 'aegis_starvation'
              AND state = ?
            LIMIT 1`,
        )
        .get(stateKey) as { id: number } | undefined;
      if (existing === undefined) {
        opts.db
          .prepare(
            `INSERT INTO governance_health_events
               (component, state, metric_json)
             VALUES ('aegis_starvation', ?, ?)`,
          )
          .run(
            stateKey,
            JSON.stringify({
              activity: 'governance_aegis_starvation_detected',
              workspace_id: r.workspace_id,
              count: r.cnt,
              threshold,
              hour_bucket: bucket,
            }),
          );
        alerts_emitted++;
      }
    } catch {
      // governance_health_events absent — drop silently.
    }
  }

  return {
    total_count: total,
    per_workspace: rows.map((r) => ({ workspace_id: r.workspace_id, count: r.cnt })),
    alerts_emitted,
  };
}
