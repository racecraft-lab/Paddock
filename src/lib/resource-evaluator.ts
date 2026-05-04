/**
 * SPEC-008 — Synchronous resource-policy admission evaluator.
 *
 * Per FR-001, FR-002, FR-003, FR-005, FR-005a, FR-008, FR-019, FR-025,
 * FR-326, FR-334. The evaluator is the single decision point invoked by
 * dispatchers (task admission, chain advancement, periodic re-eval, override
 * grant validation per FR-003). It is synchronous and runs on the foreground
 * connection (FR-331) under a 50 ms `busy_timeout`; the goal is the FR-326
 * latency envelope (`p50<5ms / p95<15ms / p99<25ms`).
 *
 * Decision contract:
 *   - {decision: 'allow'|'defer'|'block', reasons: EvaluatorReason[],
 *      policy_ids: number[], evaluated_at_ms: number}
 *   - `policy_ids` lists EVERY matched policy (FR-029) for downstream audit.
 *   - `reasons` ALWAYS contains at least one entry — the precedence-winning
 *     reason, with co-winning reasons folded into the same kind/code.
 *
 * Flow (FR-005a / FR-008 / FR-025 / FR-002):
 *   1. Resolve `FEATURE_RESOURCE_GOVERNANCE` via `resolveFlag` (FR-008,
 *      FR-019). Flag OFF → return byte-compat allow + a synthetic
 *      `feature_flag_off` reason. NO policy SELECT issued.
 *   2. Wrap the rest of the body in try/catch (FR-005a). On internal throw
 *      return defer with code `defer:evaluator_internal_exception`. NEVER
 *      block on internal error.
 *   3. Inside try: load active policies via `loadActivePolicies` (which
 *      runs a single read transaction per FR-025 read snapshot), build
 *      `PrecedenceSignal[]` from the matched rows, run `selectVerdict`
 *      from the precedence engine, and return the typed verdict.
 *
 * Post-commit hooks: notification dispatch is deferred to the dispatcher
 * caller via `notifyDecision(...)`; only non-allow decisions trigger it.
 * The hot-path evaluator does NOT write the decision row itself — that's
 * `resource-decision-writer` (T059) under the dispatcher's transaction.
 *
 * @see specs/008-resource-governance/spec.md FR-001, FR-002, FR-005,
 *      FR-005a, FR-008, FR-019, FR-025, FR-326
 * @see specs/008-resource-governance/tasks.md T056
 * @see Constitution Convention J (`src/lib/resource-*.ts` is in
 *      `tsconfig.spec-strict.json` and the strict-scope ESLint override)
 */

import { resolveFlag, type FeatureFlagContext } from '@/lib/feature-flags';
import { getLmStudioCapabilities } from '@/lib/observability/adapters/lm-studio-log';
import { recordAegisFallback } from '@/lib/resource-aegis-fallback-activity';
import {
  getAegisGovernanceMode,
  recordAegisSoftAlert,
} from '@/lib/resource-aegis-mode';
import {
  allocateFromReserve,
} from '@/lib/resource-aegis-reserve';
import {
  CircuitBreaker,
  type CircuitBreakerOptions,
} from '@/lib/resource-circuit-breaker';
import { loadActivePolicies, type LoadedPolicy } from '@/lib/resource-policy-loader';
import {
  selectVerdict,
  type PrecedenceSignal,
} from '@/lib/resource-precedence';
import type {
  EvaluatorReason,
} from '@/types/resource-governance';
import type Database from 'better-sqlite3';

/**
 * Decision class per FR-003 (the four gate points). The evaluator is shape-
 * compatible across all four; specialized matching logic per class is
 * delegated to the precedence engine via the policy `policy_type` field.
 */
export type DecisionClass =
  | 'task_dispatch'
  | 'aegis_review'
  | 'override_grant'
  | 'chain_advance'
  | 'periodic_re_eval';

/**
 * Scope axis for a decision. `facility` MUST be a `true` literal (not a
 * truthy/falsy generic boolean) so callers cannot accidentally pass `false`
 * and slip through scope checks.
 */
export type DecisionScope =
  | { facility: true; product_line_id?: undefined }
  | { facility?: undefined; product_line_id: number };

/**
 * Input record for one admission decision. Matches the FR-025 read-snapshot
 * shape: caller declares the gate, scope, and an optional cost estimate
 * the precedence engine uses to predict budget tripping.
 *
 * `workspace_flags` is OPTIONAL test seam for FR-019 — production callers
 * fetch the row from `workspaces` and pass through as-is. If unset, the
 * evaluator falls back to `process.env` via `resolveFlag`'s default ctx.
 */
export interface DecisionInput {
  decision_class: DecisionClass;
  scope: DecisionScope;
  agent_id?: number;
  estimated_cost_usd?: number;
  estimated_tokens?: number;
  /** FR-019 / SPEC-002 — workspace `feature_flags` JSON column. */
  workspace_flags?: Record<string, unknown> | string | null;
  /**
   * FR-140, FR-141, FR-148 — provider account billing-mode context.
   * When `billing_mode='subscription_capped'` AND
   * `estimated_marginal_cost_usd === 0`, USD-budget signals are skipped
   * because the subscription is flat-rate (the operator already paid).
   * Token/request/session caps still enforce — those are independent of
   * marginal USD cost. The evaluator emits the diagnostic
   * `allow:subscription_capped_skip_marginal` reason when the skip
   * actually fires (i.e., a USD-budget policy was matched but
   * suppressed). Absent this field, the evaluator behaves byte-compat
   * with the pre-T120 contract.
   */
  billing_mode?: 'subscription_capped' | 'pay_per_use' | 'unknown' | null;
  estimated_marginal_cost_usd?: number;
  /**
   * FR-361 — Aegis dispatch fallback chain. When `true`, the evaluator
   * applies the FR-361 chain on a `defer` verdict caused by
   * `hard_budget_exceeded` / `budget_threshold` / equivalent hard-budget
   * signals: step 2 = emergency reserve (FR-153), step 3 = local mode
   * (FR-362, LM Studio), step 4 = `defer:deferred_no_fallback` (FR-363
   * terminal). Each step transition emits a one-time
   * `governance_aegis_fallback_<step>` activity row per
   * `(workspace_id, hour)` via `recordAegisFallback`.
   *
   * Absent / `false` preserves the pre-T128 evaluator contract byte-for-
   * byte. Only set to `true` for tasks routed to the Aegis review path.
   */
  is_aegis_request?: boolean;
}

/**
 * Synchronous decision result. `reasons` is always non-empty: even the
 * all-clear path emits one `allow:clear` entry so downstream consumers
 * never need a special case.
 */
export interface DecisionOutput {
  decision: 'allow' | 'defer' | 'block';
  reasons: EvaluatorReason[];
  /** All matched policies (FR-029), id-ascending. Empty when none matched. */
  policy_ids: number[];
  evaluated_at_ms: number;
}

/**
 * Map a `resource_policies.policy_type` row to a `PrecedenceSignal`. The
 * mapping mirrors the FR-002 ladder:
 *
 * | policy_type        | enforcement       | signal kind                  | rank |
 * |--------------------|-------------------|------------------------------|-----:|
 * | blackout           | block_dispatch    | blackout_window              |    2 |
 * | budget             | block_dispatch    | hard_budget_exceeded         |    3 |
 * | budget             | else              | soft_budget_alert            |    6 |
 * | wip_limit          | block_dispatch    | hard_budget_exceeded (rare)  |    3 |
 * | wip_limit          | else              | wip_exceeded                 |    4 |
 * | degraded_window    | any               | degraded_window_non_allowed  |    5 |
 *
 * NOTE: this skeleton matches policies present-in-scope as "would fire"
 * signals. The follow-up tasks T064/T065/T066 wire up real counter and
 * window-state checks so the matcher only emits a signal when the policy
 * ACTUALLY trips. For the FR-001/FR-002/FR-005a/FR-008 acceptance bar
 * (T055) the present-in-scope mapping is sufficient and deterministic.
 */
/**
 * FR-140, FR-141, FR-148 — flat-rate USD-budget skip predicate.
 *
 * When the caller's `provider_account` is in `subscription_capped`
 * billing mode AND the estimated marginal USD cost of this admission
 * is exactly 0, USD-budget policies do NOT fire. The operator already
 * paid the flat subscription fee; counting one more call against a
 * USD budget would double-count. Token, request, and session caps
 * STILL enforce — those are independent of marginal USD.
 *
 * The predicate is precise: only `policy_type='budget'` AND
 * `limit_kind='usd'` rows are skipped. Token/request/session budgets
 * (same `policy_type='budget'` but different `limit_kind`) pass
 * through unchanged.
 */
function shouldSkipUsdBudget(input: DecisionInput, p: LoadedPolicy): boolean {
  if (input.billing_mode !== 'subscription_capped') return false;
  if (input.estimated_marginal_cost_usd !== 0) return false;
  if (p.policy_type !== 'budget') return false;
  if (p.limit_kind !== 'usd') return false;
  return true;
}

function policyToSignal(
  p: LoadedPolicy,
  input: DecisionInput,
): PrecedenceSignal | null {
  const isBlock = p.enforcement === 'block_dispatch';
  switch (p.policy_type) {
    case 'blackout':
      return {
        kind: 'blackout_window',
        policy_id: p.id,
        priority_rank: 100,
      };
    case 'degraded_window':
      return {
        kind: 'degraded_window_non_allowed',
        policy_id: p.id,
        priority_rank: 100,
      };
    case 'budget':
      // FR-140 / FR-148 — skip USD-budget signals when the caller is
      // on a flat-rate subscription with zero marginal cost. The skip
      // is recorded by the caller (it adds the
      // `allow:subscription_capped_skip_marginal` reason when at least
      // one such policy was suppressed).
      if (shouldSkipUsdBudget(input, p)) return null;
      return {
        kind: isBlock ? 'hard_budget_exceeded' : 'soft_budget_alert',
        policy_id: p.id,
        priority_rank: 100,
      };
    case 'wip_limit':
      return {
        kind: isBlock ? 'hard_budget_exceeded' : 'wip_exceeded',
        policy_id: p.id,
        priority_rank: 100,
      };
    default:
      // Unknown policy_type defaults to no signal so a forward-compat row
      // does not crash the evaluator.
      return null;
  }
}

/**
 * Resolve `FEATURE_RESOURCE_GOVERNANCE` against the requesting workspace's
 * flag JSON. Per FR-008 / FR-019 / Constitution Principle V the evaluator
 * MUST funnel every flag check through `resolveFlag(name, ctx)`.
 */
function isGovernanceEnabled(input: DecisionInput): boolean {
  const ctx: FeatureFlagContext = {};
  if (input.workspace_flags !== undefined && input.workspace_flags !== null) {
    ctx.workspaceFlags = input.workspace_flags;
  }
  return resolveFlag('FEATURE_RESOURCE_GOVERNANCE', ctx);
}

/**
 * Build the policy-loader scope from a `DecisionInput.scope`. `facility`
 * scope passes `workspace_id: null` so the loader returns only facility-
 * level rows; `product_line_id` scope passes the numeric workspace id.
 */
function loaderScopeFromInput(input: DecisionInput): {
  workspace_id: number | null;
} {
  if (input.scope.facility === true) return { workspace_id: null };
  return { workspace_id: input.scope.product_line_id };
}

/**
 * Synchronous resource-policy evaluator (FR-001, FR-002, FR-326).
 *
 * @returns DecisionOutput — never throws. FR-005a guarantees an internal
 * exception is mapped to `defer:evaluator_internal_exception` and not
 * propagated.
 */
export function resourcePolicyEvaluator(
  input: DecisionInput,
  db: Database.Database,
): DecisionOutput {
  const evaluated_at_ms = Date.now();

  // FR-008 — flag OFF returns byte-compat allow without consulting policies.
  if (!isGovernanceEnabled(input)) {
    return {
      decision: 'allow',
      reasons: [
        // Distinct from `allow:clear` so log readers can tell "feature
        // disabled" apart from "no policies matched". The reason code is
        // namespaced under the `allow` kind per the FR-001 typed contract.
        { kind: 'allow', code: 'allow:feature_flag_off' },
      ],
      policy_ids: [],
      evaluated_at_ms,
    };
  }

  // FR-005a — wrap the live evaluator body in try/catch. Internal exceptions
  // MUST defer, never block.
  try {
    const policies = loadActivePolicies(db, loaderScopeFromInput(input));
    const signals: PrecedenceSignal[] = [];
    let usdBudgetSkipped = false;
    for (const p of policies) {
      // FR-140 — track when at least one USD-budget policy was
      // suppressed by the subscription_capped flat-rate skip so the
      // diagnostic `allow:subscription_capped_skip_marginal` reason can
      // surface alongside the verdict.
      if (shouldSkipUsdBudget(input, p)) {
        usdBudgetSkipped = true;
      }
      const sig = policyToSignal(p, input);
      if (sig !== null) signals.push(sig);
    }
    const verdict = selectVerdict(signals);
    // The verdict's `decision` may include `'allow' | 'defer' | 'block'`
    // (no `override_required` from this skeleton's signal vocabulary).
    if (
      verdict.decision === 'allow' ||
      verdict.decision === 'defer' ||
      verdict.decision === 'block'
    ) {
      // FR-140 — when at least one USD-budget policy was suppressed by
      // the flat-rate skip AND the verdict resolved to `allow`, surface
      // the diagnostic reason so log readers can audit the skip.
      // Defer/block outcomes are emitted as-is — the skip only matters
      // when the suppressed signal would have downgraded the decision.
      const reasons: EvaluatorReason[] = [verdict.reason];
      if (usdBudgetSkipped && verdict.decision === 'allow') {
        reasons.push({
          kind: 'allow',
          code: 'allow:subscription_capped_skip_marginal',
        });
      }
      // FR-361 — Aegis dispatch fallback chain. Only triggered when:
      //   1. caller declared `is_aegis_request=true`,
      //   2. the primary verdict is a defer/block (not allow),
      //   3. the primary cause is a hard-budget signal (the chain does
      //      NOT bypass blackout windows per FR-162 — those carry
      //      higher precedence than the reserve and short-circuit the
      //      chain).
      // FR-155 — when the workspace's resolved mode is `soft_alert`,
      // the chain's step 4 terminal returns `allow:aegis_soft_alert`
      // (downgrade) instead of `defer:deferred_no_fallback`. The
      // chain helper consults `getAegisGovernanceMode()` directly so
      // step 4 has access to the resolved mode.
      if (
        input.is_aegis_request === true &&
        (verdict.decision === 'defer' || verdict.decision === 'block')
      ) {
        const chained = applyAegisFallbackChain({
          input,
          db,
          evaluated_at_ms,
          policyIds: verdict.policy_ids,
          primaryReason: verdict.reason,
          signals,
        });
        if (chained !== null) return chained;
      }
      return {
        decision: verdict.decision,
        reasons,
        policy_ids: verdict.policy_ids,
        evaluated_at_ms,
      };
    }
    // Unreachable today (no signal kind maps to override_required) — fall
    // through to a defensive defer so downstream consumers never see an
    // unexpected decision class.
    return {
      decision: 'defer',
      reasons: [
        {
          kind: 'defer',
          code: 'defer:evaluator_internal_exception',
        },
      ],
      policy_ids: verdict.policy_ids,
      evaluated_at_ms,
    };
  } catch {
    // FR-005a: NEVER block on internal exception. Defer with the canonical
    // code so log readers can distinguish from FR-012 retry exhaustion.
    return {
      decision: 'defer',
      reasons: [
        {
          kind: 'defer',
          code: 'defer:evaluator_internal_exception',
        },
      ],
      policy_ids: [],
      evaluated_at_ms,
    };
  }
}

/**
 * FR-361 — Aegis dispatch fallback chain.
 *
 * When the primary policy stack would defer/block an Aegis-class
 * dispatch, walk the chain:
 *   step 2: emergency reserve (FR-153)
 *      → returns `{decision:'allow', reason:'allow:aegis_emergency_reserve'}`
 *   step 3: local mode (FR-362, LM Studio reachable + log present)
 *      → returns `{decision:'allow', reason:'allow:aegis_local_mode'}`
 *   step 4: terminal — `defer:deferred_no_fallback` (FR-363).
 *
 * Each step transition records `recordAegisFallback(workspaceId, step)`
 * once per (workspace_id, hour) per FR-361. The recorder is best-
 * effort; a missing M68 table is tolerated so the chain still
 * advances.
 *
 * Returns the chained `DecisionOutput` when a fallback path produced
 * a verdict, OR `null` when the chain does not apply (e.g., blackout
 * window short-circuit per FR-162). The caller falls back to the
 * primary verdict on `null` so byte-compat is preserved.
 *
 * Notes:
 *   - The function reads `input.scope.product_line_id` as the
 *     `workspace_id` for the fallback bookkeeping. Facility-scope
 *     Aegis requests (no product line) skip the chain because the
 *     reserve is per-workspace and a facility-wide reserve is not
 *     yet defined (FR-152 talks per-workspace).
 *   - Blackout window signals carry higher precedence than the
 *     reserve (FR-162). The chain detects this by looking at the
 *     primary reason and short-circuiting on a blackout cause. The
 *     `allocateFromReserve` call also accepts `blackout_active=true`
 *     for an extra safety net at the reserve layer.
 */
function applyAegisFallbackChain(args: {
  input: DecisionInput;
  db: Database.Database;
  evaluated_at_ms: number;
  policyIds: number[];
  primaryReason: EvaluatorReason;
  signals: PrecedenceSignal[];
}): DecisionOutput | null {
  const { input, db, evaluated_at_ms, policyIds, primaryReason, signals } = args;

  // Facility-scope reserves are not modeled in M68; the chain only
  // applies to product-line scoped Aegis requests. The DecisionScope
  // discriminated union guarantees `product_line_id` is set on the
  // non-facility branch, so we narrow on the facility flag.
  if (input.scope.facility === true) {
    return null;
  }
  const workspaceId = input.scope.product_line_id;

  // FR-162 — blackout windows preempt the reserve. When the primary
  // verdict came from a blackout signal, the chain MUST NOT bypass it.
  const blackoutActive = signals.some(
    (s) => s.kind === 'blackout_window',
  );
  if (blackoutActive) {
    return null;
  }

  // The chain only fires when the primary cause is a hard-budget /
  // budget-threshold class signal. WIP-only or degraded-window
  // verdicts are not in scope (Aegis review is special-cased only for
  // budget exhaustion per the Phase 7.6 prompt).
  const isBudgetCause =
    primaryReason.code === 'block:hard_budget_exceeded' ||
    primaryReason.code === 'defer:budget_threshold' ||
    primaryReason.code === 'defer:wip_limit';
  if (!isBudgetCause) {
    return null;
  }

  // Step 2 — emergency reserve.
  const cost: AllocateInputForEvaluator = {
    usd: input.estimated_cost_usd ?? 0,
    tokens: input.estimated_tokens ?? 0,
  };
  let reserveOutcome: 'granted' | 'depleted' | 'blackout' | 'missing';
  try {
    const result = allocateFromReserve(workspaceId, cost, db);
    if (result.ok) {
      reserveOutcome = 'granted';
    } else if (result.code === 'reserve_blackout') {
      reserveOutcome = 'blackout';
    } else if (result.code === 'reserve_missing') {
      reserveOutcome = 'missing';
    } else {
      reserveOutcome = 'depleted';
    }
  } catch {
    // The reserve table may be absent in stripped harnesses. Treat as
    // depleted so the chain advances to step 3.
    reserveOutcome = 'depleted';
  }

  if (reserveOutcome === 'granted') {
    safeRecordFallback(workspaceId, 'emergency_reserve', db);
    return {
      decision: 'allow',
      reasons: [{ kind: 'allow', code: 'allow:aegis_emergency_reserve' }],
      policy_ids: policyIds,
      evaluated_at_ms,
    };
  }
  if (reserveOutcome === 'blackout') {
    // The reserve layer detected a blackout we did not see at the
    // signal layer. Bail out so the primary verdict applies.
    return null;
  }

  // Step 3 — local mode (LM Studio).
  let localAvailable = false;
  try {
    const caps = getLmStudioCapabilities();
    localAvailable = caps.log_present;
  } catch {
    localAvailable = false;
  }
  if (localAvailable) {
    safeRecordFallback(workspaceId, 'local_mode', db);
    return {
      decision: 'allow',
      reasons: [{ kind: 'allow', code: 'allow:aegis_local_mode' }],
      policy_ids: policyIds,
      evaluated_at_ms,
    };
  }

  // Step 4 — terminal. FR-155 soft-alert mode downgrades the terminal
  // to `allow:aegis_soft_alert` instead of the `defer:deferred_no_fallback`
  // FR-363 default. The mode is resolved per-workspace from
  // `workspaces.aegis_governance_mode` (M68).
  let mode: 'soft_alert' | 'hard_block';
  try {
    mode = getAegisGovernanceMode(workspaceId, db);
  } catch {
    mode = 'soft_alert';
  }
  if (mode === 'soft_alert') {
    safeRecordFallback(workspaceId, 'deferred_no_fallback', db);
    try {
      recordAegisSoftAlert(workspaceId, db, {
        primary_reason: primaryReason.code,
        decision_class: input.decision_class,
        chain_step: 'soft_alert_terminal',
      });
    } catch {
      // Drop silently — observability only.
    }
    return {
      decision: 'allow',
      reasons: [{ kind: 'allow', code: 'allow:aegis_soft_alert' }],
      policy_ids: policyIds,
      evaluated_at_ms,
    };
  }
  safeRecordFallback(workspaceId, 'deferred_no_fallback', db);
  return {
    decision: 'defer',
    reasons: [{ kind: 'defer', code: 'defer:deferred_no_fallback' }],
    policy_ids: policyIds,
    evaluated_at_ms,
  };
}

/** Allocation request shape used by the chain (alias of the public type). */
interface AllocateInputForEvaluator {
  usd: number;
  tokens: number;
  blackout_active?: boolean;
}

/** Best-effort fallback recorder that swallows missing-table errors. */
function safeRecordFallback(
  workspaceId: number,
  step: 'emergency_reserve' | 'local_mode' | 'deferred_no_fallback',
  db: Database.Database,
): void {
  try {
    recordAegisFallback(workspaceId, step, db);
  } catch {
    // Drop silently — recorder is observability-only.
  }
}

/**
 * Post-commit hook (FR-005a). The notification dispatch + circuit-breaker
 * tick happen on transaction commit at the dispatcher caller; this helper
 * is a no-op for `allow` decisions and ticks the circuit-breaker on
 * `defer:evaluator_internal_exception` reasons (FR-006/FR-007/FR-022).
 *
 * Wired separately from the synchronous decision so the FR-326 latency
 * envelope excludes notification cost (per the FR-326 measurement boundary).
 *
 * The breaker tick path:
 *   - Reasons containing `evaluator_internal_exception` ⇒
 *     `breaker.tickError(reason.code)`. Five consecutive errors flip the
 *     breaker `closed → open` per FR-022.
 *   - Other defer/block reasons (budget exhausted, blackout window, etc.)
 *     are normal admission outcomes and do NOT tick the breaker.
 *
 * The breaker is opt-in via the `breakerOptions` argument so tests can
 * inject a `FakeBreakerClock` (T067). When omitted, the production
 * configuration uses `getBackgroundDb()` and the real wall clock.
 */
export function notifyDecision(
  decision: DecisionOutput,
  db: Database.Database,
  breakerOptions: CircuitBreakerOptions | null = null,
): void {
  if (decision.decision === 'allow') return;
  // Only `evaluator_internal_exception` reasons indicate a programming
  // bug or runtime fault; budget/blackout/wip outcomes are by-design.
  const isInternal = decision.reasons.some((r) =>
    r.code.includes('evaluator_internal_exception'),
  );
  if (!isInternal) return;
  try {
    const breaker = new CircuitBreaker(breakerOptions ?? { db });
    const code = decision.reasons[0]?.code ?? 'defer:evaluator_internal_exception';
    breaker.tickError(code);
  } catch {
    // Breaker tick is best-effort: notifyDecision MUST NOT throw or it
    // pollutes the dispatcher's commit path. Drop silently.
  }
}
