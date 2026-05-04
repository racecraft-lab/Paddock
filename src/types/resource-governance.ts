/**
 * SPEC-008 — Resource Governance type domain.
 *
 * Single source of truth for the discriminated unions, enums, and record
 * shapes that flow across the evaluator, dispatch decision log, override
 * grants, drift detector, and source emission capability registry. Drawn
 * directly from `specs/008-resource-governance/spec.md` FR-001..FR-388 and
 * `specs/008-resource-governance/data-model.md` table CHECK constraints.
 *
 * Conventions:
 *   - All enum-like types are closed string-literal unions (no `string`
 *     escape hatch). The compile-time exhaustiveness check in
 *     `EvaluatorReason` callers (e.g., `switch(r.kind)`) guarantees that
 *     adding a new variant requires updating every call site.
 *   - The reason codes are namespaced by their `kind` ("allow:", "defer:",
 *     "block:", "override_required:"). This is structural: it lets us
 *     classify codes without consulting the `kind` discriminator (useful
 *     for log parsers and operator-facing UIs that get a flat string).
 *   - Strict-scope mode (`exactOptionalPropertyTypes`) is in force for
 *     this module. All optional fields are written as `field?: T | null`
 *     when the runtime value is allowed to be either absent OR null
 *     (matches SQLite NULL columns); pure optional-only fields use `?: T`.
 *
 * @see spec.md FR-001 (decision shape), FR-005a (defer:evaluator_internal_exception),
 *      FR-029 (precedence), FR-058a (counter rebuild shadow defer),
 *      FR-189 (dispatch feed), FR-171..FR-185 (overrides), FR-365 (reconcile_status),
 *      FR-057 (drift tiers), FR-333 (defer:db_busy), FR-363 (defer:no_fallback),
 *      FR-203b (rate limit deferral)
 * @see data-model.md tables: resource_policies, resource_reservations,
 *      resource_overrides, dispatch_decision_log, raw_usage_events,
 *      source_emission_capability
 * @see Constitution Convention J (strict-scope), Principle XIV (TDD)
 */

// =============================================================================
// EvaluatorDecision + reason codes (FR-001, FR-005, FR-005a, FR-026, FR-029,
// FR-049, FR-058a, FR-179, FR-180, FR-203b, FR-333, FR-363)
// =============================================================================

/**
 * Top-level evaluator decision. Returned by
 * `resourcePolicyEvaluator(decisionInput)` per FR-001 and persisted to
 * `dispatch_decision_log.decision` per FR-189.
 *
 * Note: `override_required` is conceptually a kind of `block` from the
 * dispatcher's perspective (the task does not start), but is exposed as a
 * separate decision so the UI can surface a "request override" affordance
 * (FR-171..FR-185) instead of a generic block.
 */
export type EvaluatorDecision = 'allow' | 'defer' | 'block' | 'override_required';

/**
 * Reason codes for `decision='allow'`.
 *
 * - `allow:clear` — no policies matched (or all signals were the synthetic
 *   "clear" fallback).
 * - `allow:soft_budget_alert` — a soft-budget threshold tripped (rank 6
 *   per FR-002) but the admission still succeeds with a warning surface.
 * - `allow:feature_flag_off` — `FEATURE_RESOURCE_GOVERNANCE` is OFF;
 *   evaluator returns byte-compat allow without consulting policies
 *   (FR-008). Distinct from `allow:clear` so log readers can tell "feature
 *   disabled" apart from "no policies matched".
 */
export type AllowReason =
  | 'allow:clear'
  | 'allow:soft_budget_alert'
  | 'allow:feature_flag_off'
  | 'allow:subscription_capped_skip_marginal'
  | 'allow:aegis_soft_alert'
  | 'allow:aegis_emergency_reserve'
  | 'allow:aegis_local_mode';

/**
 * Reason codes for `decision='defer'`. Each code MUST be distinct from
 * sibling defer codes per FR-005a (evaluator internal exception is NOT
 * folded into FR-012 retry_exhausted) and FR-333 (db_busy is NOT folded
 * into the optimistic-lock contention path).
 */
export type DeferReason =
  | 'defer:cooldown'
  | 'defer:queue_full'
  | 'defer:budget_threshold'
  | 'defer:wip_limit'
  | 'defer:blackout_window'
  | 'defer:degraded_window'
  | 'defer:circuit_open'
  | 'defer:retry_exhausted'                    // FR-012
  | 'defer:invalid_policy'                     // FR-026
  | 'defer:evaluator_internal_exception'       // FR-005a
  | 'defer:db_busy'                            // FR-333
  | 'defer:rate_limited'                       // FR-203b
  | 'defer:shadow_due_to_counter_rebuild'      // FR-058a
  | 'defer:no_fallback'                        // FR-363 (alias retained for compat)
  | 'defer:deferred_no_fallback';              // FR-363 (canonical spec literal)

/** Reason codes for `decision='block'`. */
export type BlockReason =
  | 'block:hard_budget_exceeded'
  | 'block:no_override_authority'
  | 'block:reservation_unavailable'
  | 'block:policy_locked'
  | 'block:validation_failed'
  | 'block:etag_stale';

/**
 * Reason codes for `decision='override_required'`. Operator may file a
 * grant via the `OverrideRequest` REST endpoint (FR-171).
 */
export type OverrideRequiredReason =
  | 'override_required:hard_budget'
  | 'override_required:wip_breach';

/**
 * Tagged union of evaluator reasons. The `kind` discriminator narrows the
 * `code` member to the matching reason set. Switch statements on `r.kind`
 * are exhaustively typed — adding a new branch to `EvaluatorReason` requires
 * updating every call site.
 */
export type EvaluatorReason =
  | { kind: 'allow'; code: AllowReason }
  | { kind: 'defer'; code: DeferReason }
  | { kind: 'block'; code: BlockReason }
  | { kind: 'override_required'; code: OverrideRequiredReason };

// =============================================================================
// Type guards (runtime classification of flat reason codes — useful for log
// parsers, REST clients, and Storybook fixtures that receive a string).
// =============================================================================

/** All AllowReason literals as a runtime-readable Set. */
const ALLOW_REASONS = new Set<AllowReason>([
  'allow:clear',
  'allow:soft_budget_alert',
  'allow:feature_flag_off',
  'allow:subscription_capped_skip_marginal',
  'allow:aegis_soft_alert',
  'allow:aegis_emergency_reserve',
  'allow:aegis_local_mode',
]);

/** All DeferReason literals as a runtime-readable Set. */
const DEFER_REASONS = new Set<DeferReason>([
  'defer:cooldown',
  'defer:queue_full',
  'defer:budget_threshold',
  'defer:wip_limit',
  'defer:blackout_window',
  'defer:degraded_window',
  'defer:circuit_open',
  'defer:retry_exhausted',
  'defer:invalid_policy',
  'defer:evaluator_internal_exception',
  'defer:db_busy',
  'defer:rate_limited',
  'defer:shadow_due_to_counter_rebuild',
  'defer:no_fallback',
  'defer:deferred_no_fallback',
]);

/** All BlockReason literals as a runtime-readable Set. */
const BLOCK_REASONS = new Set<BlockReason>([
  'block:hard_budget_exceeded',
  'block:no_override_authority',
  'block:reservation_unavailable',
  'block:policy_locked',
  'block:validation_failed',
  'block:etag_stale',
]);

/** All OverrideRequiredReason literals as a runtime-readable Set. */
const OVERRIDE_REQUIRED_REASONS = new Set<OverrideRequiredReason>([
  'override_required:hard_budget',
  'override_required:wip_breach',
]);

/** Type guard — returns true iff the code is a valid `AllowReason`. */
export function isAllowReason(code: string): code is AllowReason {
  return ALLOW_REASONS.has(code as AllowReason);
}

/** Type guard — returns true iff the code is a valid `DeferReason`. */
export function isDeferReason(code: string): code is DeferReason {
  return DEFER_REASONS.has(code as DeferReason);
}

/** Type guard — returns true iff the code is a valid `BlockReason`. */
export function isBlockReason(code: string): code is BlockReason {
  return BLOCK_REASONS.has(code as BlockReason);
}

/** Type guard — returns true iff the code is a valid `OverrideRequiredReason`. */
export function isOverrideRequiredReason(
  code: string,
): code is OverrideRequiredReason {
  return OVERRIDE_REQUIRED_REASONS.has(code as OverrideRequiredReason);
}

// =============================================================================
// Policy + scope enums (FR-027, FR-029, FR-038, FR-049, FR-153)
// =============================================================================

/**
 * Closed set of policy kinds the evaluator can match. Note: the M63
 * migration's `resource_policies.policy_type` CHECK includes
 * `'wip','budget','window','composite','aegis_emergency_reserve'`. Here we
 * disambiguate the budget axis (USD/token/request/session) and window axis
 * (blackout/degraded) at the type level — the storage column collapses them.
 */
export type PolicyKind =
  | 'wip'
  | 'budget_usd'
  | 'budget_token'
  | 'budget_request'
  | 'budget_session'
  | 'blackout_window'
  | 'degraded_window'
  | 'aegis_emergency_reserve';

/**
 * Scope axes a policy can target. `task_status` is the per-status WIP
 * dimension introduced in FR-032 (composite WIP scope `agent + status`).
 */
export type ScopeKind = 'facility' | 'workspace' | 'agent' | 'project' | 'task_status';

/**
 * Enforcement mode for a policy row. `dry_run` is M63's storage-time
 * "evaluate but never deny" tier; the evaluator's runtime mode set is the
 * three values below. `dry_run` is documented separately (it gates promotion).
 */
export type EnforceMode = 'shadow' | 'soft' | 'hard';

/**
 * Window kinds for budgets. Rolling windows reset on a sliding clock;
 * calendar windows reset at the boundary in the configured timezone.
 */
export type BudgetWindowKind =
  | 'rolling_hour'
  | 'rolling_day'
  | 'rolling_week'
  | 'calendar_day'
  | 'calendar_week'
  | 'calendar_month';

// =============================================================================
// Reconcile status (FR-365) — distinct from M64b storage CHECK; this is the
// runtime classifier the dedup/canonicalize pipeline returns.
// =============================================================================

/**
 * Result of T1 (schema validation) + T2 (canonical promotion eligibility)
 * per FR-365.
 *
 * - `ok`: T1 + T2 pass; row promotes to `canonical_usage_events`.
 * - `schema_broken`: T1 pass, T2 fail (benign drift); raw row persisted with
 *   `raw_attributes_json` verbatim per FR-083; no canonical promotion.
 * - `schema_malicious`: T1 fail OR adversarial pattern detected per FR-366;
 *   row diverted to `quarantined_raw_events` (NOT `raw_usage_events`).
 *
 * Note: the storage `raw_usage_events.reconcile_status` CHECK admits
 * `'pending'`, `'canonicalized'`, `'dropped'`, `'schema_broken'`,
 * `'quarantined'` (data-model.md). The runtime classifier in this module
 * uses `'ok'` (= will canonicalize) so the type conveys the
 * decision intent rather than the post-decision storage state. Adapters
 * map `'ok' → 'pending'` on insert; the canonicalizer flips to
 * `'canonicalized'` after promotion.
 */
export type ReconcileStatus = 'ok' | 'schema_broken' | 'schema_malicious';

// =============================================================================
// Drift tiers (FR-057)
// =============================================================================

/**
 * Counter↔ledger drift tier per FR-057. The auto-repair tier runs
 * idempotent reconcile-from-ledger on the background connection. The
 * operator-confirmed tier writes an activity row + dashboard panel and
 * waits for operator approval. The hard-block tier triggers FR-058
 * async chunked rebuild and admissions for the affected scope fall through
 * to `defer:shadow_due_to_counter_rebuild`.
 */
export type DriftTier = 'auto-repair' | 'operator-confirmed' | 'hard-block';

// =============================================================================
// Dedup confidence (FR-100..FR-115 dedup pipeline)
// =============================================================================

/** Confidence label attached to dedup decisions. */
export type DedupeConfidence = 'high' | 'medium' | 'singleton';

// =============================================================================
// Source emission capability (M64a CHECK + FR-090d)
// =============================================================================

/**
 * Enforcement eligibility per source per the M64a
 * `source_emission_capability.enforcement_eligibility` CHECK. The storage
 * CHECK admits `'hard'`, `'soft'`, `'advisory'`. We add
 * `'reconciliation_only'` at the type level for sources that contribute
 * only to drift detection / late-arriving reconciliation and never to
 * admission decisions.
 */
export type EnforcementEligibility =
  | 'hard'
  | 'soft'
  | 'reconciliation_only'
  | 'advisory';

// =============================================================================
// DispatchDecision (FR-189) — full decision-row shape persisted to
// dispatch_decision_log and streamed via SSE per FR-090j.
// =============================================================================

/** Persistent snapshot of breaker state at decision time. */
export type BreakerState = 'closed' | 'half_open' | 'open';

/**
 * One persisted decision row from `dispatch_decision_log`. The `reasons`
 * field is the typed `EvaluatorReason[]` (NOT a flat string array) so the
 * UI can route `kind`-specific affordances. The wire format serializes
 * `reasons` to JSON in `reasons_json` (per data-model.md).
 *
 * Nullable columns (`task_id`, `agent_id`, `workspace_id`) reflect that an
 * admission decision MAY occur outside any concrete task/agent/workspace
 * (e.g., scheduled dry-run benchmarks).
 */
export interface DispatchDecision {
  /** Stable opaque id (`dec_<ulid>`) referenced by audit + override rows. */
  decision_id: string;
  task_id: string | null;
  agent_id: string | null;
  workspace_id: number | null;
  decision: EvaluatorDecision;
  reasons: EvaluatorReason[];
  /** `resource_policies.id` rows that contributed to the decision. */
  policy_ids: number[];
  /**
   * Precedence rank per FR-002 (1 = breaker-open … 7 = clear). Null means
   * the decision short-circuited before precedence iteration (e.g.,
   * `defer:db_busy`).
   */
  precedence_rank: number | null;
  /** Evaluator latency in milliseconds (entry → return), per FR-326. */
  latency_ms: number;
  breaker_state: BreakerState;
  /**
   * JCS-canonical JSON of the FR-025 read-snapshot (counters, breaker,
   * window, policy versions). Null when the snapshot was suppressed by the
   * cardinality cap. Stored verbatim for FR-190 expand-trace UI.
   */
  evaluation_snapshot_json: string | null;
  /** ISO-8601 UTC. */
  created_at: string;
}

// =============================================================================
// Override request + grant (FR-171..FR-185)
// =============================================================================

/** Unit of measure for an override grant. */
export type OverrideUnit = 'usd' | 'token' | 'request' | 'session';

/**
 * Operator-issued override request body per FR-171/FR-172.
 *
 * Validated against:
 *   - FR-179 sanity bounds (`ttl_seconds` ≤ `max_grant_ttl_hours * 3600`,
 *     `requested_amount` ≤ `max_grant_amount_per_unit`)
 *   - FR-219b (TTL between 60s and 24h)
 *   - FR-219c (justification UTF-8, no C0/C1 control chars except `\t`/`\n`,
 *     no NUL bytes)
 *
 * `etag` MUST match the latest `resource_policies.etag` for the policy
 * affected by the originating decision; mismatch returns HTTP 412 per
 * FR-180. `idempotency_key` is required per FR-219a (24h replay window).
 */
export interface OverrideRequest {
  originating_decision_id: string;
  requested_amount: number;
  unit: OverrideUnit;
  ttl_seconds: number;
  justification: string;
  idempotency_key: string;
  etag: string;
}

/** Lifecycle state of an override grant per `resource_overrides.state` CHECK. */
export type OverrideGrantState =
  | 'active'
  | 'consumed'
  | 'released'
  | 'expired'
  | 'revoked';

/**
 * Snapshot of remaining hard-budget capacity after a grant atomically
 * reserved its requested amount. Per FR-175.
 *
 * Note: the four canonical units are reported regardless of the granted
 * unit so the UI can render a single-row remaining-budget pane.
 */
export interface RemainingBudgetSnapshot {
  usd: number;
  tokens: number;
  requests: number;
  sessions: number;
}

/**
 * Persisted grant per `resource_overrides` (M64h). The
 * `remaining_budget_snapshot` is computed on commit and returned in the
 * 201 response body per FR-175; it is NOT a stored column.
 */
export interface OverrideGrant {
  grant_id: number;
  reservation_id: number;
  originating_decision_id: string;
  granted_by: string;
  granted_at: string;
  ttl_seconds: number;
  expires_at: string;
  amount: number;
  unit: OverrideUnit;
  /** Optional free-text justification per FR-172. */
  justification: string | null;
  state: OverrideGrantState;
  workspace_id: number | null;
  remaining_budget_snapshot: RemainingBudgetSnapshot;
}
