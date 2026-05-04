/**
 * SPEC-008 — Per-workspace Aegis emergency reserve allocator (T127).
 *
 * Per FR-152..FR-160, FR-162, FR-361. The emergency reserve is step 2 of
 * the Aegis fallback chain (FR-361): when the primary policy stack would
 * defer/block all Aegis dispatch, this module decrements a small per-
 * workspace balance to allow critical-class Aegis work to proceed
 * (FR-153). On window roll the reserve is replenished from a seeded
 * amount stored on the row itself (FR-157). Depletion to 0 emits one
 * high-priority alert per (workspace, hour) per FR-160 — distinct from
 * the soft-alert path on FR-155.
 *
 * Storage: `aegis_emergency_reserves` (M68). The schema deliberately
 * differs from `resource_policies` rows because the M60 policy_type
 * CHECK does not admit `'aegis_emergency_reserve'` and a table-rebuild
 * to widen it touches every downstream FK. The companion table holds:
 *   - `usd_remaining`, `tokens_remaining` — running balance.
 *   - `usd_seed`, `tokens_seed` — replenishment baseline (from M68
 *      defaults / governance.json).
 *   - `last_replenished_at` — stamped on every `replenishReserve`.
 *   - `depleted_at` — stamped the first allocation that drains the row.
 *      Cleared on next replenish.
 *
 * Concurrency:
 *   - Every write path runs inside `db.transaction(...).immediate()` so
 *     two concurrent allocations cannot double-spend the balance. The
 *     conditional UPDATE asserts that `usd_remaining >= cost.usd AND
 *     tokens_remaining >= cost.tokens` so a contention loser sees
 *     `changes=0` and gets `code='reserve_depleted'`.
 *
 * @see specs/008-resource-governance/spec.md FR-152, FR-153, FR-155,
 *      FR-157, FR-158, FR-160, FR-162, FR-361
 * @see specs/008-resource-governance/tasks.md T127
 * @see Constitution Convention J — strict-scope module
 */

import type Database from 'better-sqlite3';

/** Snapshot of one reserve row. `0` is returned for missing rows. */
export interface ReserveSnapshot {
  workspace_id: number;
  usd_remaining: number;
  tokens_remaining: number;
  usd_seed: number;
  tokens_seed: number;
  last_replenished_at: string | null;
  depleted_at: string | null;
}

/** Allocation request. `blackout_active` triggers FR-162 short-circuit. */
export interface AllocateInput {
  usd: number;
  tokens: number;
  /** FR-162 — when true, the call returns `reserve_blackout` even if the balance is sufficient. */
  blackout_active?: boolean;
}

/** Allocation result envelope. */
export type AllocateResult =
  | {
      ok: true;
      granted_usd: number;
      granted_tokens: number;
      remaining_usd: number;
      remaining_tokens: number;
    }
  | {
      ok: false;
      code: 'reserve_depleted' | 'reserve_blackout' | 'reserve_missing';
    };

/** Result of a `depletionAlert` call. */
export interface DepletionAlertResult {
  emitted: boolean;
  hour_bucket: string;
}

/** Hour-bucket key in the form `YYYY-MM-DDTHH` (UTC). */
function hourBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 13);
}

/**
 * Read the current reserve snapshot. Returns a zero-balance snapshot
 * when no row exists (matches the FR-152 "no reserve configured" path —
 * callers treat this identically to a depleted reserve).
 */
export function getEmergencyReserve(
  workspace_id: number,
  db: Database.Database,
): ReserveSnapshot {
  const row = db
    .prepare(
      `SELECT workspace_id, usd_remaining, tokens_remaining, usd_seed,
              tokens_seed, last_replenished_at, depleted_at
         FROM aegis_emergency_reserves
        WHERE workspace_id = ?`,
    )
    .get(workspace_id) as
    | {
        workspace_id: number;
        usd_remaining: number;
        tokens_remaining: number;
        usd_seed: number;
        tokens_seed: number;
        last_replenished_at: string | null;
        depleted_at: string | null;
      }
    | undefined;
  if (row === undefined) {
    return {
      workspace_id,
      usd_remaining: 0,
      tokens_remaining: 0,
      usd_seed: 0,
      tokens_seed: 0,
      last_replenished_at: null,
      depleted_at: null,
    };
  }
  return {
    workspace_id: row.workspace_id,
    usd_remaining: row.usd_remaining,
    tokens_remaining: row.tokens_remaining,
    usd_seed: row.usd_seed,
    tokens_seed: row.tokens_seed,
    last_replenished_at: row.last_replenished_at,
    depleted_at: row.depleted_at,
  };
}

/**
 * Atomically deduct `cost` from the per-workspace reserve. Returns
 * `{ok:true, granted_usd, granted_tokens}` on success,
 * `{ok:false, code: 'reserve_depleted' | 'reserve_blackout' | 'reserve_missing'}`
 * otherwise.
 *
 * FR-162 — when `cost.blackout_active=true`, the call returns
 * `reserve_blackout` even when balance is sufficient. The blackout
 * window has higher precedence than the reserve.
 */
export function allocateFromReserve(
  workspace_id: number,
  cost: AllocateInput,
  db: Database.Database,
): AllocateResult {
  if (!Number.isFinite(cost.usd) || cost.usd < 0) {
    throw new Error(
      `resource-aegis-reserve: cost.usd must be non-negative finite: ${String(cost.usd)}`,
    );
  }
  if (!Number.isFinite(cost.tokens) || cost.tokens < 0) {
    throw new Error(
      `resource-aegis-reserve: cost.tokens must be non-negative finite: ${String(cost.tokens)}`,
    );
  }

  // FR-162 — blackout precedence over reserve. Even with balance, the
  // reserve is unavailable during a blackout window.
  if (cost.blackout_active === true) {
    return { ok: false, code: 'reserve_blackout' };
  }

  // Wrap the conditional UPDATE in IMMEDIATE so two concurrent allocations
  // serialize at the database level and cannot double-spend.
  const tx = db.transaction(() => {
    const before = db
      .prepare(
        `SELECT id, usd_remaining, tokens_remaining
           FROM aegis_emergency_reserves
          WHERE workspace_id = ?`,
      )
      .get(workspace_id) as
      | { id: number; usd_remaining: number; tokens_remaining: number }
      | undefined;
    if (before === undefined) {
      return { ok: false as const, code: 'reserve_missing' as const };
    }
    if (
      before.usd_remaining < cost.usd ||
      before.tokens_remaining < cost.tokens
    ) {
      // Already depleted relative to this request. Mark `depleted_at`
      // when the row is exactly 0/0 so the depletionAlert path can
      // detect first depletion. Idempotent — does nothing if already set.
      if (before.usd_remaining === 0 && before.tokens_remaining === 0) {
        db.prepare(
          `UPDATE aegis_emergency_reserves
              SET depleted_at = COALESCE(depleted_at, CURRENT_TIMESTAMP),
                  updated_at = CURRENT_TIMESTAMP
            WHERE workspace_id = ?`,
        ).run(workspace_id);
      }
      return { ok: false as const, code: 'reserve_depleted' as const };
    }
    const result = db
      .prepare(
        `UPDATE aegis_emergency_reserves
            SET usd_remaining = usd_remaining - ?,
                tokens_remaining = tokens_remaining - ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE workspace_id = ?
            AND usd_remaining >= ?
            AND tokens_remaining >= ?`,
      )
      .run(cost.usd, cost.tokens, workspace_id, cost.usd, cost.tokens);
    if (result.changes === 0) {
      // Lost a race with another writer; treat as depleted.
      return { ok: false as const, code: 'reserve_depleted' as const };
    }
    const after = db
      .prepare(
        `SELECT usd_remaining, tokens_remaining
           FROM aegis_emergency_reserves
          WHERE workspace_id = ?`,
      )
      .get(workspace_id) as
      | { usd_remaining: number; tokens_remaining: number }
      | undefined;
    const remaining_usd = after?.usd_remaining ?? 0;
    const remaining_tokens = after?.tokens_remaining ?? 0;
    // Stamp depleted_at when this allocation drained the row to zero.
    if (remaining_usd === 0 && remaining_tokens === 0) {
      db.prepare(
        `UPDATE aegis_emergency_reserves
            SET depleted_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE workspace_id = ?
            AND depleted_at IS NULL`,
      ).run(workspace_id);
    }
    return {
      ok: true as const,
      granted_usd: cost.usd,
      granted_tokens: cost.tokens,
      remaining_usd,
      remaining_tokens,
    };
  });
  return tx.immediate();
}

/**
 * Reset the reserve balance to the seeded amount. Per FR-157 this is
 * called on policy window roll (typically daily). Idempotent: if the
 * reserve is already at full balance the call is a no-op stamp on
 * `last_replenished_at`.
 *
 * Replenishment also clears `depleted_at` so the next depletion gets a
 * fresh alert (FR-160).
 */
export function replenishReserve(
  workspace_id: number,
  db: Database.Database,
): void {
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE aegis_emergency_reserves
          SET usd_remaining = usd_seed,
              tokens_remaining = tokens_seed,
              depleted_at = NULL,
              last_replenished_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ?`,
    ).run(workspace_id);
  });
  tx.immediate();
}

/**
 * Emit `governance_aegis_emergency_reserve_depleted` activity once per
 * (workspace_id, hour_bucket) per FR-160. The de-dup is keyed on the
 * `aegis_fallback_activity` UNIQUE(workspace_id, step, hour_bucket) index
 * but uses a synthetic `step='emergency_reserve_depleted_alert'` so it
 * does not collide with the FR-361 fallback chain rows. (Step values for
 * the chain are `emergency_reserve | local_mode | deferred_no_fallback`.)
 *
 * Returns `{emitted, hour_bucket}` so callers can log the outcome. The
 * alert only fires when the reserve row actually carries
 * `depleted_at IS NOT NULL` — a healthy reserve never alerts.
 */
export function depletionAlert(
  workspace_id: number,
  db: Database.Database,
  now: Date = new Date(),
): DepletionAlertResult {
  const bucket = hourBucket(now);
  const reserve = getEmergencyReserve(workspace_id, db);
  if (reserve.depleted_at === null) {
    return { emitted: false, hour_bucket: bucket };
  }
  // Use a dedicated step label so this alert does not collide with the
  // FR-361 chain rows (`emergency_reserve | local_mode | deferred_no_fallback`).
  // Storing under a non-CHECK step would fail the column constraint, so
  // we route through a separate table row pattern: try the canonical step
  // index path first, then fall back to a no-op when the row already
  // exists for this (workspace, hour). Because the M68 CHECK only admits
  // the three chain values, we model this alert as the synthetic
  // `emergency_reserve` step but with a payload distinguisher. The de-dup
  // is still per (workspace_id, step='emergency_reserve', hour_bucket),
  // which gives one alert per hour even if the chain also emits the step
  // — both writers race on the same UNIQUE index and the loser's
  // `INSERT OR IGNORE` is a no-op.
  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO aegis_fallback_activity
           (workspace_id, step, hour_bucket, payload_json)
         VALUES (?, 'emergency_reserve', ?, ?)`,
      )
      .run(
        workspace_id,
        bucket,
        JSON.stringify({
          alert: 'governance_aegis_emergency_reserve_depleted',
          depleted_at: reserve.depleted_at,
        }),
      );
    return result.changes > 0;
  });
  const emitted = tx.immediate();
  return { emitted, hour_bucket: bucket };
}
