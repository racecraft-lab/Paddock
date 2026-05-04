/**
 * SPEC-008 — Override-anomaly auto-disable + admin re-enable (T144).
 *
 * Per FR-219d. Two surfaces:
 *
 *   1. `recordAnomaly(actor, db)` — called by `grantOverride` AFTER a
 *      successful insert when the override row's `reason` field carries
 *      the `defer:anomaly` discriminator. When 3+ override grants by
 *      the same actor exhibit `defer:anomaly` reason within a 60-minute
 *      sliding window, the function flips
 *      `users.governance_grants_disabled_at` to the current ISO-8601
 *      timestamp. Subsequent grant attempts by that actor see the
 *      non-null column at the top of `grantOverride`'s tx and short-
 *      circuit with `code='governance_grants_disabled'`.
 *
 *   2. `reEnableGrants(operatorId, adminUserId, db)` — admin-class only.
 *      Clears `governance_grants_disabled_at` and appends a recovery_action
 *      audit row tagged `operator_grant_capability_restored`. Returns
 *      `{ok:true, before, after}` describing the toggle.
 *
 *   3. `isGrantsDisabled(actor, db)` — read-side helper used by
 *      `grantOverride` to gate every grant attempt before the INSERT.
 *      Returns true when `users.governance_grants_disabled_at IS NOT NULL`.
 *
 * Why look up by username:
 *   `resource_overrides.actor` is a TEXT column carrying the username
 *   string (e.g., `"operator"`). The grant column on `users` is keyed
 *   on `users.id`, so we resolve `actor → users.id` via the username
 *   index when toggling. Lookup miss → no-op (a grant by an unknown
 *   actor cannot disable an unknown user — the grant flow already
 *   rejects unauthorized callers via `requireRole`, so this branch is
 *   defense-in-depth only).
 *
 * Detection thresholds (FR-219d clarification):
 *   - Window: 60 minutes (sliding).
 *   - Threshold: 3+ grants by same actor with `reason LIKE '%defer:anomaly%'`.
 *   - Counter: `resource_overrides.granted_at >= now - 60min`.
 *
 * @see specs/008-resource-governance/spec.md FR-219d, FR-219c
 * @see specs/008-resource-governance/tasks.md T144
 * @see Constitution Convention J (strict-scope: resource-*.ts)
 */

import { appendChainEntry } from '@/lib/governance-audit-chain';
import type Database from 'better-sqlite3';

/** Anomaly detection window (FR-219d clarification). */
export const ANOMALY_WINDOW_MS = 60 * 60 * 1000;

/** Anomaly grant threshold (FR-219d clarification). */
export const ANOMALY_THRESHOLD = 3;

/** Result returned by re-enable. */
export interface ReEnableResult {
  ok: true;
  /** Previous `governance_grants_disabled_at` value (null when not disabled). */
  before: string | null;
  /** Always `null` after re-enable. */
  after: null;
  /** Audit row hash appended to recovery_action. */
  audit_row_hash: string;
}

/** Failure envelope. */
export interface ReEnableErr {
  ok: false;
  code: 'operator_not_found' | 'not_disabled';
  detail?: string;
}

interface UserIdRow {
  id: number;
  governance_grants_disabled_at: string | null;
}

interface AnomalyCountRow {
  cnt: number;
}

/**
 * Look up the user by username. Returns `null` when the user does not
 * exist; this is a defensive fallback because role-checked grants only
 * succeed for known users.
 */
function findUserByUsername(
  db: Database.Database,
  username: string,
): UserIdRow | null {
  const row = db
    .prepare(
      `SELECT id, governance_grants_disabled_at
         FROM users
         WHERE username = ?
         LIMIT 1`,
    )
    .get(username) as UserIdRow | undefined;
  return row ?? null;
}

/**
 * Read-side helper. Returns true iff the actor's
 * `governance_grants_disabled_at` is non-null. Called by
 * `grantOverride` BEFORE the INSERT so disabled actors hit a typed
 * 423 envelope without consuming a row id.
 */
export function isGrantsDisabled(
  actor: string,
  db: Database.Database,
): boolean {
  const row = findUserByUsername(db, actor);
  if (row === null) return false;
  return row.governance_grants_disabled_at !== null;
}

/**
 * Count `defer:anomaly`-reason grants by `actor` within the last
 * `ANOMALY_WINDOW_MS`. The match is `LIKE '%defer:anomaly%'` so the
 * detector tolerates operators wrapping the discriminator in extra text
 * (e.g., `"defer:anomaly: hard_budget_breach"`).
 */
function countRecentAnomalyGrants(
  db: Database.Database,
  actor: string,
): number {
  const cutoff = new Date(Date.now() - ANOMALY_WINDOW_MS).toISOString();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt
         FROM resource_overrides
         WHERE actor = ?
           AND reason LIKE '%defer:anomaly%'
           AND granted_at >= ?`,
    )
    .get(actor, cutoff) as AnomalyCountRow;
  return row.cnt;
}

/**
 * Append a recovery_action row with the supplied content. Used both by
 * the auto-disable trigger and by the admin re-enable endpoint so the
 * audit chain remains continuous across both surfaces.
 *
 * Caller MUST hold a write transaction; this function does not open one.
 */
function appendRecoveryAction(
  db: Database.Database,
  args: {
    kind: string;
    actor: string;
    scope_kind: string | null;
    scope_id: number | null;
    payload: Record<string, unknown>;
  },
): { row_hash: string } {
  const taken_at = new Date().toISOString();
  const content = {
    actor: args.actor,
    kind: args.kind,
    payload: args.payload,
    scope_id: args.scope_id,
    scope_kind: args.scope_kind,
    taken_at,
  };
  const { prev_hash, row_hash } = appendChainEntry(
    'recovery_action',
    content,
    db,
  );
  db.prepare(
    `INSERT INTO recovery_action
       (kind, actor, scope_kind, scope_id, payload_json,
        prev_hash, row_hash, taken_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    args.kind,
    args.actor,
    args.scope_kind,
    args.scope_id,
    JSON.stringify(content),
    prev_hash,
    row_hash,
    taken_at,
  );
  return { row_hash };
}

/**
 * Called by `grantOverride` AFTER a successful insert when the
 * accepted override's `reason` matches the anomaly discriminator. If
 * the actor's recent anomaly count meets or exceeds
 * `ANOMALY_THRESHOLD`, the user's `governance_grants_disabled_at`
 * column is set to the current ISO timestamp and a recovery_action
 * audit row is appended.
 *
 * Idempotent: if the column is already non-null, the UPDATE is a no-op
 * (no second audit row, no double-toggle). Caller MUST hold a write
 * transaction.
 *
 * Returns true when a fresh disable was applied; false otherwise (under
 * threshold, already disabled, or unknown actor).
 */
export function recordAnomaly(
  actor: string,
  db: Database.Database,
): boolean {
  const cnt = countRecentAnomalyGrants(db, actor);
  if (cnt < ANOMALY_THRESHOLD) return false;

  const user = findUserByUsername(db, actor);
  if (user === null) return false;
  if (user.governance_grants_disabled_at !== null) return false;

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE users
          SET governance_grants_disabled_at = ?
          WHERE id = ?
            AND governance_grants_disabled_at IS NULL`,
    )
    .run(now, user.id);
  if (result.changes !== 1) return false;

  appendRecoveryAction(db, {
    kind: 'operator_grant_capability_disabled',
    actor: 'system',
    scope_kind: 'operator',
    scope_id: user.id,
    payload: {
      anomaly_count: cnt,
      disabled_actor: actor,
      disabled_at: now,
      threshold: ANOMALY_THRESHOLD,
      window_ms: ANOMALY_WINDOW_MS,
    },
  });
  return true;
}

/**
 * Admin re-enable. Clears `governance_grants_disabled_at` and appends a
 * `kind='operator_grant_capability_restored'` audit row. Returns a typed
 * envelope so the route layer maps it to HTTP responses (200 / 404 / 409).
 *
 * Atomicity: the column UPDATE and the audit append commit together
 * inside `db.transaction(fn).immediate(args)` so partial commit is
 * impossible.
 */
export function reEnableGrants(
  operatorId: number,
  adminUserId: number,
  reason: string,
  dbArg: Database.Database,
): ReEnableResult | ReEnableErr {
  const db = dbArg;
  const tx = db.transaction(
    (args: {
      operatorId: number;
      adminUserId: number;
      reason: string;
    }): ReEnableResult | ReEnableErr => {
      const before = db
        .prepare(
          `SELECT id, governance_grants_disabled_at
             FROM users
             WHERE id = ?
             LIMIT 1`,
        )
        .get(args.operatorId) as UserIdRow | undefined;
      if (before === undefined) {
        return { ok: false, code: 'operator_not_found' };
      }
      if (before.governance_grants_disabled_at === null) {
        return { ok: false, code: 'not_disabled' };
      }

      const result = db
        .prepare(
          `UPDATE users
              SET governance_grants_disabled_at = NULL
              WHERE id = ?
                AND governance_grants_disabled_at IS NOT NULL`,
        )
        .run(args.operatorId);
      if (result.changes !== 1) {
        return { ok: false, code: 'not_disabled' };
      }

      const audit = appendRecoveryAction(db, {
        kind: 'operator_grant_capability_restored',
        actor: `admin:${args.adminUserId.toString()}`,
        scope_kind: 'operator',
        scope_id: args.operatorId,
        payload: {
          admin_user_id: args.adminUserId,
          previous_disabled_at: before.governance_grants_disabled_at,
          reason: args.reason,
          restored_at: new Date().toISOString(),
        },
      });

      return {
        ok: true,
        before: before.governance_grants_disabled_at,
        after: null,
        audit_row_hash: audit.row_hash,
      };
    },
  );

  return tx.immediate({ operatorId, adminUserId, reason });
}
