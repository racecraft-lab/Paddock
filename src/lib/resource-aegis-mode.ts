/**
 * SPEC-008 — Aegis governance mode resolver (T131).
 *
 * Per FR-155 (default `soft_alert`) and FR-166 (workspace-level
 * override). M68 added a dedicated `workspaces.aegis_governance_mode`
 * column whose default is `'soft_alert'`. The column is the
 * authoritative store; FR-166 also permits the override to be carried
 * via `workspaces.feature_flags.aegis_governance_mode_override` JSON
 * for legacy callers / migrations. The column wins when both are
 * present.
 *
 * Mode semantics
 *   - `soft_alert` (default): when an Aegis-class request would be
 *     blocked by a hard limit, the evaluator returns `'allow'` with
 *     reason `'allow:aegis_soft_alert'` instead of the hard block. A
 *     high-priority activity row is emitted alongside so operators
 *     are alerted but the work is not stalled.
 *   - `hard_block`: legacy/strict — the evaluator returns the primary
 *     block verdict unchanged.
 *
 * Surface
 *   - `getAegisGovernanceMode(workspaceId, db, options?)` — synchronous
 *     resolver. Returns `'soft_alert' | 'hard_block'`. Reads the
 *     column first, then the feature_flags override, then falls back
 *     to the FR-155 default.
 *   - `recordAegisSoftAlert(workspaceId, db)` — writes a high-priority
 *     activity row (de-duped per (workspace_id, hour) using the
 *     existing M68 fallback activity de-dup table — synthetic step
 *     value `'soft_alert_aegis'` would violate the CHECK, so we use
 *     the dedicated `aegis_fallback_activity` row with
 *     `step='emergency_reserve'` and a payload distinguisher OR a
 *     simple in-table flag — see comment on the function.
 *
 * @see specs/008-resource-governance/spec.md FR-155, FR-166
 * @see specs/008-resource-governance/tasks.md T131
 * @see Constitution Convention J — strict-scope module
 */

import type Database from 'better-sqlite3';

/** Closed set of Aegis governance modes. */
export type AegisGovernanceMode = 'soft_alert' | 'hard_block';

/** FR-155 default. */
export const DEFAULT_AEGIS_GOVERNANCE_MODE: AegisGovernanceMode = 'soft_alert';

/** Optional override carrier read out of `workspaces.feature_flags` JSON. */
export const AEGIS_MODE_OVERRIDE_FLAG_KEY = 'aegis_governance_mode_override';

interface ModeRow {
  aegis_governance_mode: string | null;
  feature_flags: string | null;
}

function isMode(value: unknown): value is AegisGovernanceMode {
  return value === 'soft_alert' || value === 'hard_block';
}

/**
 * Resolve the Aegis governance mode for a workspace.
 *
 * Resolution order (highest precedence first):
 *   1. `workspaces.aegis_governance_mode` column (the authoritative
 *      store, set by M68's default).
 *   2. `workspaces.feature_flags.aegis_governance_mode_override` JSON
 *      string (legacy override carrier per FR-166).
 *   3. `DEFAULT_AEGIS_GOVERNANCE_MODE` (`'soft_alert'`).
 *
 * Best-effort: missing tables / NULL rows / parse errors all fall
 * through to the default. The function MUST NOT throw — callers wire
 * it into the evaluator hot path.
 */
export function getAegisGovernanceMode(
  workspaceId: number,
  db: Database.Database,
): AegisGovernanceMode {
  let row: ModeRow | undefined;
  try {
    row = db
      .prepare(
        `SELECT aegis_governance_mode, feature_flags
           FROM workspaces
          WHERE id = ?`,
      )
      .get(workspaceId) as ModeRow | undefined;
  } catch {
    return DEFAULT_AEGIS_GOVERNANCE_MODE;
  }
  if (row === undefined) return DEFAULT_AEGIS_GOVERNANCE_MODE;
  // 1) Column wins.
  if (isMode(row.aegis_governance_mode)) {
    return row.aegis_governance_mode;
  }
  // 2) feature_flags JSON fallback (FR-166 override carrier).
  if (typeof row.feature_flags === 'string' && row.feature_flags !== '') {
    try {
      const parsed = JSON.parse(row.feature_flags) as Record<string, unknown>;
      const override = parsed[AEGIS_MODE_OVERRIDE_FLAG_KEY];
      if (isMode(override)) return override;
    } catch {
      // Malformed JSON — fall through to default.
    }
  }
  // 3) FR-155 default.
  return DEFAULT_AEGIS_GOVERNANCE_MODE;
}

/**
 * Record a high-priority `governance_aegis_soft_alert_triggered`
 * activity row, de-duped per (workspace_id, hour) using a dedicated
 * `aegis_fallback_activity` row.
 *
 * Step encoding: the M68 CHECK admits only
 * {emergency_reserve, local_mode, deferred_no_fallback}. To keep the
 * soft-alert activity from colliding with chain rows on the same
 * UNIQUE(workspace_id, step, hour_bucket) index, this writer falls
 * back to a stand-alone `governance_health_events` row (M64) which
 * has no CHECK on `state` or `metric_json`. Best-effort only — the
 * caller cares about the alert being recorded, not the storage layer.
 */
export interface SoftAlertResult {
  emitted: boolean;
  hour_bucket: string;
}

function hourBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 13);
}

export function recordAegisSoftAlert(
  workspaceId: number,
  db: Database.Database,
  payload: Record<string, unknown> = {},
  now: Date = new Date(),
): SoftAlertResult {
  const bucket = hourBucket(now);
  // The de-dup is implemented at the read layer: we look for an
  // existing governance_health_events row in the current hour bucket
  // for component='aegis_soft_alert'. Concurrent writers may both
  // insert if they hit the same hour boundary — that's acceptable
  // because this is observability, not enforcement.
  let emitted = false;
  try {
    const existing = db
      .prepare(
        `SELECT id FROM governance_health_events
          WHERE component = 'aegis_soft_alert'
            AND substr(captured_at, 1, 13) = ?
            AND state = ?
          LIMIT 1`,
      )
      .get(bucket, String(workspaceId)) as { id: number } | undefined;
    if (existing === undefined) {
      db.prepare(
        `INSERT INTO governance_health_events
           (component, state, metric_json)
         VALUES ('aegis_soft_alert', ?, ?)`,
      ).run(
        String(workspaceId),
        JSON.stringify({
          activity: 'governance_aegis_soft_alert_triggered',
          workspace_id: workspaceId,
          hour_bucket: bucket,
          ...payload,
        }),
      );
      emitted = true;
    }
  } catch {
    // Table absent — observability writer is best-effort.
    emitted = false;
  }
  return { emitted, hour_bucket: bucket };
}
