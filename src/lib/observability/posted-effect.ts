/**
 * SPEC-008 — Canonical-budget-effect lifecycle (Q30 / FR-093 / FR-104).
 *
 * Per Q30 (canonical event budget effects), FR-093 (posted/reverted
 * lifecycle), FR-104 (correction-vs-revert distinction).
 *
 * Schema reality (M65d):
 *   `canonical_budget_effects` has columns
 *     (id, canonical_event_id, policy_id, counter_id, window_start,
 *      amount, unit, posted_at, reverted_at, reverted_reason)
 *   — but NO `state` column. The four-state lifecycle is therefore a
 *   *derived view* over (posted_at, reverted_at, reverted_reason) plus
 *   the existence of correction_ledger sibling rows referencing the
 *   same canonical_event_id.
 *
 * Lifecycle (derived):
 *   - `pending`   — row inserted but `posted_at` IS NULL (the migration
 *                   default is CURRENT_TIMESTAMP, so this state is
 *                   reachable only by an explicit pending insert path).
 *   - `posted`    — `posted_at` IS NOT NULL AND `reverted_at` IS NULL
 *                   AND no correction_ledger row exists.
 *   - `corrected` — `posted_at` IS NOT NULL AND `reverted_at` IS NULL
 *                   AND at least one correction_ledger row references
 *                   this row's `canonical_event_id`.
 *   - `voided`    — `reverted_at` IS NOT NULL.
 *
 * `transitionPostedEffect(canonicalId, fromState, toState, db)` updates
 * the M65d row corresponding to `canonical_event_id=canonicalId` so
 * that `getPostedEffectState(canonicalId, db)` returns `toState` after
 * the call. Optimistic-lock semantics: caller MUST pass the *current*
 * `fromState`; if the actual state has drifted, the call throws and
 * the writer is expected to retry from the current state.
 *
 * Caller MUST hold a write transaction so the read-modify-write of the
 * lifecycle column triple is atomic.
 *
 * @see specs/008-resource-governance/spec.md FR-093, FR-104
 * @see src/lib/migrations.ts (065d_canonical_budget_effects,
 *      065j_correction_ledger)
 * @see specs/008-resource-governance/tasks.md T082
 * @see Constitution Convention J — strict-scope module
 */

import type { PostedEffectState } from '@/types/observability';
import type Database from 'better-sqlite3';

/**
 * The valid lifecycle transitions.
 *
 *   pending   → posted | voided
 *   posted    → corrected | voided
 *   corrected → corrected (idempotent re-correct) | voided
 *   voided    → (terminal)
 */
const ALLOWED_TRANSITIONS: Record<PostedEffectState, readonly PostedEffectState[]> = {
  pending: ['posted', 'voided'],
  posted: ['corrected', 'voided'],
  corrected: ['corrected', 'voided'],
  voided: [],
};

/**
 * True when `from → to` is one of the allowed transitions.
 */
export function isAllowedPostedEffectTransition(
  from: PostedEffectState,
  to: PostedEffectState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

interface CanonicalEffectRow {
  id: number;
  canonical_event_id: number;
  posted_at: string | null;
  reverted_at: string | null;
  reverted_reason: string | null;
}

function loadEffectByCanonical(
  db: Database.Database,
  canonical_event_id: number,
): CanonicalEffectRow | null {
  const row = db
    .prepare(
      `SELECT id, canonical_event_id, posted_at, reverted_at, reverted_reason
         FROM canonical_budget_effects
        WHERE canonical_event_id = ?
        ORDER BY id ASC
        LIMIT 1`,
    )
    .get(canonical_event_id) as
    | {
        id?: number;
        canonical_event_id?: number;
        posted_at?: string | null;
        reverted_at?: string | null;
        reverted_reason?: string | null;
      }
    | undefined;
  if (row === undefined) return null;
  return {
    id: row.id ?? 0,
    canonical_event_id: row.canonical_event_id ?? 0,
    posted_at: row.posted_at ?? null,
    reverted_at: row.reverted_at ?? null,
    reverted_reason: row.reverted_reason ?? null,
  };
}

function correctionsExistForCanonical(
  db: Database.Database,
  canonical_event_id: number,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM correction_ledger WHERE canonical_event_id = ? LIMIT 1`,
    )
    .get(canonical_event_id) as { ok?: number } | undefined;
  return row?.ok === 1;
}

function deriveState(
  effect: CanonicalEffectRow,
  hasCorrection: boolean,
): PostedEffectState {
  if (effect.reverted_at !== null) return 'voided';
  if (effect.posted_at === null) return 'pending';
  if (hasCorrection) return 'corrected';
  return 'posted';
}

/**
 * Read the current derived state of the posted-effect row for
 * `canonical_event_id`. Throws when no row exists.
 */
export function getPostedEffectState(
  db: Database.Database,
  canonical_event_id: number,
): PostedEffectState {
  const effect = loadEffectByCanonical(db, canonical_event_id);
  if (effect === null) {
    throw new Error(
      `posted-effect: canonical_budget_effects row not found for canonical_event_id=${String(canonical_event_id)}`,
    );
  }
  const hasCorrection = correctionsExistForCanonical(db, effect.canonical_event_id);
  return deriveState(effect, hasCorrection);
}

/**
 * Transition the posted-effect row for `canonical_event_id` from
 * `fromState` to `toState`. Optimistic lock — throws when the current
 * state differs from `fromState` or the transition is not in the
 * allowed set.
 *
 * Mutation rules per state:
 *   - `pending → posted`:  set `posted_at = CURRENT_TIMESTAMP`.
 *   - `pending → voided`:  set `reverted_at = CURRENT_TIMESTAMP`,
 *                          `reverted_reason='voided_pre_post'`.
 *   - `posted → corrected`: no-op write to the M65d row (the corrected
 *                          state is signalled by the existence of a
 *                          correction_ledger row, which the caller
 *                          MUST have already inserted via T081). The
 *                          function VERIFIES a correction row exists.
 *   - `posted → voided`:    set `reverted_at = CURRENT_TIMESTAMP`,
 *                          `reverted_reason` taken from the optional
 *                          `reason` argument (default 'voided').
 *   - `corrected → corrected`: idempotent — verifies a correction row
 *                          exists, no UPDATE.
 *   - `corrected → voided`: same as `posted → voided`.
 *
 * The `reason` argument defaults to a context-appropriate string. Tests
 * may override it.
 */
export function transitionPostedEffect(
  db: Database.Database,
  canonical_event_id: number,
  fromState: PostedEffectState,
  toState: PostedEffectState,
  reason: string | null = null,
): void {
  if (!isAllowedPostedEffectTransition(fromState, toState)) {
    throw new Error(
      `posted-effect: transition not allowed: ${fromState} -> ${toState}`,
    );
  }

  const effect = loadEffectByCanonical(db, canonical_event_id);
  if (effect === null) {
    throw new Error(
      `posted-effect: canonical_budget_effects row not found for canonical_event_id=${String(canonical_event_id)}`,
    );
  }
  const hasCorrection = correctionsExistForCanonical(db, effect.canonical_event_id);
  const current = deriveState(effect, hasCorrection);
  if (current !== fromState) {
    throw new Error(
      `posted-effect: optimistic lock failed — actual=${current}, expected fromState=${fromState}`,
    );
  }

  switch (toState) {
    case 'pending':
      // Defensive — only reachable via an unsupported `pending → pending`
      // self-transition above, which `isAllowedPostedEffectTransition`
      // already rejected. No mutation to perform.
      return;
    case 'posted':
      db.prepare(
        `UPDATE canonical_budget_effects
            SET posted_at = COALESCE(posted_at, CURRENT_TIMESTAMP),
                reverted_at = NULL,
                reverted_reason = NULL
          WHERE id = ?`,
      ).run(effect.id);
      return;
    case 'corrected':
      if (!hasCorrection) {
        throw new Error(
          'posted-effect: cannot transition to corrected without a correction_ledger row — caller must invoke appendCorrection (T081) inside the same transaction first',
        );
      }
      // No M65d mutation required — the derived state is already
      // 'corrected' once a correction row exists.
      return;
    case 'voided':
      db.prepare(
        `UPDATE canonical_budget_effects
            SET reverted_at = CURRENT_TIMESTAMP,
                reverted_reason = ?
          WHERE id = ?`,
      ).run(reason ?? (fromState === 'pending' ? 'voided_pre_post' : 'voided'), effect.id);
      return;
    default: {
      const unreachable: never = toState;
      throw new Error(`posted-effect: unhandled toState=${String(unreachable)}`);
    }
  }
}
