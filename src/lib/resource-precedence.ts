/**
 * SPEC-008 — Decision precedence engine.
 *
 * Per FR-002, the evaluator MUST apply a documented decision precedence
 * across all matched policies; this module is the single source of truth
 * for the rule order. The seven-tier ladder (rank 1 = highest priority):
 *
 *   1. Breaker open                    → defer:circuit_open
 *   2. Blackout window match           → block:reservation_unavailable
 *      (a blackout window forbids the decision class outright)
 *   3. Hard budget exceeded            → block:hard_budget_exceeded
 *   4. WIP exceeded                    → defer:wip_limit
 *   5. Degraded window non-allowed     → defer:degraded_window
 *   6. Soft budget threshold tripped   → allow:soft_budget_alert
 *   7. All clear                       → allow:clear
 *
 * Per FR-029 the resulting `DispatchDecision.policy_ids` MUST include every
 * matched policy (even ones that did NOT win precedence) for diagnostic
 * traceability. This module accepts a list of `MatchedSignal` candidates
 * and returns a single winning verdict + the union of contributing policy
 * ids, sorted ascending for stable output.
 *
 * Per FR-049 the optional `priority_rank` integer per policy breaks ties
 * within the same tier (lower rank = higher priority). When ranks tie too
 * the lowest policy id wins.
 *
 * @see specs/008-resource-governance/spec.md FR-002, FR-029, FR-049
 * @see specs/008-resource-governance/tasks.md T057
 */

import type {
  EvaluatorDecision,
  EvaluatorReason,
} from '@/types/resource-governance';

/**
 * The kinds of constraints the evaluator can detect during snapshot
 * inspection. Each kind maps onto a fixed precedence rank below.
 */
export type PrecedenceSignalKind =
  | 'breaker_open'
  | 'blackout_window'
  | 'hard_budget_exceeded'
  | 'wip_exceeded'
  | 'degraded_window_non_allowed'
  | 'soft_budget_alert'
  | 'clear';

/**
 * A signal contributed by a matched policy. The evaluator builds these
 * from the FR-025 read snapshot (counters, breaker state, window state)
 * and feeds them into `selectVerdict`.
 *
 * `policy_id` MAY be `null` for synthetic signals that come from non-
 * policy state (e.g., the `breaker_open` signal sourced from
 * `resource_governance_breaker`). The synthetic signals still participate
 * in precedence but never contribute to `policy_ids[]` output.
 */
export interface PrecedenceSignal {
  kind: PrecedenceSignalKind;
  /** `resource_policies.id` (null for synthetic non-policy signals). */
  policy_id: number | null;
  /** FR-049 tie-breaker within the same tier (lower wins; default 100). */
  priority_rank?: number;
}

/**
 * Output of the precedence engine.
 *
 * - `decision` and `reason` map onto `EvaluatorDecision` / `EvaluatorReason`
 *   so callers can persist the result without an additional translation
 *   layer.
 * - `precedence_rank` is the 1..7 tier the winning signal occupies; this
 *   is the value persisted to `dispatch_decision_log.precedence_rank`
 *   (FR-189).
 * - `winning_policy_id` is the id of the policy that produced the winning
 *   signal, or `null` if the winning signal is synthetic.
 * - `policy_ids` is the union of all contributing policy ids per FR-029,
 *   sorted ascending.
 */
export interface PrecedenceVerdict {
  decision: EvaluatorDecision;
  reason: EvaluatorReason;
  precedence_rank: number;
  winning_policy_id: number | null;
  policy_ids: number[];
}

/** Tier ranks per FR-002 (1 = highest priority). */
const RANK_BY_KIND: Record<PrecedenceSignalKind, number> = {
  breaker_open: 1,
  blackout_window: 2,
  hard_budget_exceeded: 3,
  wip_exceeded: 4,
  degraded_window_non_allowed: 5,
  soft_budget_alert: 6,
  clear: 7,
};

/** Default tie-break rank when `priority_rank` is unset. */
const DEFAULT_PRIORITY_RANK = 100;

/**
 * Map a winning signal kind to the canonical decision + reason. Defined
 * separately so callers can introspect which reason a kind would emit
 * without invoking the full ladder.
 */
function reasonForKind(kind: PrecedenceSignalKind): {
  decision: EvaluatorDecision;
  reason: EvaluatorReason;
} {
  switch (kind) {
    case 'breaker_open':
      return {
        decision: 'defer',
        reason: { kind: 'defer', code: 'defer:circuit_open' },
      };
    case 'blackout_window':
      return {
        decision: 'block',
        reason: { kind: 'block', code: 'block:reservation_unavailable' },
      };
    case 'hard_budget_exceeded':
      return {
        decision: 'block',
        reason: { kind: 'block', code: 'block:hard_budget_exceeded' },
      };
    case 'wip_exceeded':
      return {
        decision: 'defer',
        reason: { kind: 'defer', code: 'defer:wip_limit' },
      };
    case 'degraded_window_non_allowed':
      return {
        decision: 'defer',
        reason: { kind: 'defer', code: 'defer:degraded_window' },
      };
    case 'soft_budget_alert':
      return {
        decision: 'allow',
        reason: { kind: 'allow', code: 'allow:soft_budget_alert' },
      };
    case 'clear':
      return {
        decision: 'allow',
        reason: { kind: 'allow', code: 'allow:clear' },
      };
  }
}

/**
 * Pick the precedence-winning signal from a candidate list.
 *
 * Tie-break order (most-specific first):
 *   1. Lower precedence rank wins (FR-002).
 *   2. Within the same tier, lower `priority_rank` wins (FR-049).
 *   3. Within the same `priority_rank`, lower `policy_id` wins (stable;
 *      synthetic signals with `policy_id=null` lose to numeric ids on tie
 *      so an operator-defined policy is always preferred over a synthetic
 *      one when both exist in the same tier).
 *
 * The function does NOT mutate `signals`. If `signals` is empty the verdict
 * is the synthetic `clear` allow.
 */
export function selectVerdict(signals: PrecedenceSignal[]): PrecedenceVerdict {
  // Always include a synthetic 'clear' so callers never need to special-case
  // the empty-signals path. Seed `winner` with the synthetic 'clear' so the
  // ladder never has a nullable winner.
  let winner: PrecedenceSignal = { kind: 'clear', policy_id: null };
  for (const sig of signals) {
    if (compareSignals(sig, winner) < 0) winner = sig;
  }

  // FR-029: every matched policy id (excluding synthetic 'clear' fallback
  // we appended) contributes to policy_ids. We dedupe + sort ascending.
  const policyIds = new Set<number>();
  for (const sig of signals) {
    if (sig.policy_id !== null) policyIds.add(sig.policy_id);
  }

  const { decision, reason } = reasonForKind(winner.kind);
  return {
    decision,
    reason,
    precedence_rank: RANK_BY_KIND[winner.kind],
    winning_policy_id: winner.policy_id,
    policy_ids: [...policyIds].sort((a, b) => a - b),
  };
}

/**
 * Comparator: return < 0 if `a` outranks `b`, > 0 otherwise. See tie-break
 * order documentation on `selectVerdict`.
 */
function compareSignals(a: PrecedenceSignal, b: PrecedenceSignal): number {
  const rankDiff = RANK_BY_KIND[a.kind] - RANK_BY_KIND[b.kind];
  if (rankDiff !== 0) return rankDiff;
  const prDiff =
    (a.priority_rank ?? DEFAULT_PRIORITY_RANK) -
    (b.priority_rank ?? DEFAULT_PRIORITY_RANK);
  if (prDiff !== 0) return prDiff;
  // Synthetic policies (policy_id = null) sort AFTER numeric ids, so a
  // numeric id wins ties. Use Number.MAX_SAFE_INTEGER for nulls.
  const aId = a.policy_id ?? Number.MAX_SAFE_INTEGER;
  const bId = b.policy_id ?? Number.MAX_SAFE_INTEGER;
  return aId - bId;
}

/** Public alias of the rank table for downstream traceability. */
export const PRECEDENCE_RANK = RANK_BY_KIND;
