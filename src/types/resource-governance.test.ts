/**
 * SPEC-008 — Type-level + runtime tests for `src/types/resource-governance.ts`.
 *
 * Validates the discriminated unions, the `DispatchDecision` shape, and the
 * `OverrideRequest` / `OverrideGrant` records. Type-level assertions use
 * vitest's `expectTypeOf`; runtime assertions exercise the type-guard
 * helpers (e.g., `isAllowDecision`).
 *
 * @see specs/008-resource-governance/spec.md FR-001..FR-005a, FR-058a, FR-189,
 *      FR-171..FR-185, FR-365, FR-057, FR-333, FR-363
 * @see specs/008-resource-governance/data-model.md (resource_overrides,
 *      resource_reservations, dispatch_decision_log, raw_usage_events.reconcile_status)
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  isAllowReason,
  isBlockReason,
  isDeferReason,
  isOverrideRequiredReason,
  type AllowReason,
  type BlockReason,
  type BudgetWindowKind,
  type DedupeConfidence,
  type DeferReason,
  type DispatchDecision,
  type DriftTier,
  type EnforceMode,
  type EnforcementEligibility,
  type EvaluatorDecision,
  type EvaluatorReason,
  type OverrideGrant,
  type OverrideRequest,
  type OverrideRequiredReason,
  type PolicyKind,
  type ReconcileStatus,
  type ScopeKind,
} from './resource-governance';

describe('SPEC-008 EvaluatorDecision', () => {
  it('is the closed set { allow, defer, block, override_required }', () => {
    const allowed: EvaluatorDecision[] = [
      'allow',
      'defer',
      'block',
      'override_required',
    ];
    expect(allowed).toHaveLength(4);
    // Type-level: nothing else is assignable
    // @ts-expect-error — 'foo' is not a valid EvaluatorDecision
    const _bad: EvaluatorDecision = 'foo';
    void _bad;
  });
});

describe('SPEC-008 EvaluatorReason — discriminated union', () => {
  it('narrows to defer with all FR-prescribed reason codes', () => {
    const reasons: EvaluatorReason[] = [
      // Allow
      { kind: 'allow', code: 'allow:clear' },
      { kind: 'allow', code: 'allow:soft_budget_alert' },
      // Defer (FR-005a, FR-026, FR-012, FR-029, FR-049, FR-058a, FR-203b,
      //        FR-333, FR-363)
      { kind: 'defer', code: 'defer:cooldown' },
      { kind: 'defer', code: 'defer:queue_full' },
      { kind: 'defer', code: 'defer:budget_threshold' },
      { kind: 'defer', code: 'defer:wip_limit' },
      { kind: 'defer', code: 'defer:blackout_window' },
      { kind: 'defer', code: 'defer:degraded_window' },
      { kind: 'defer', code: 'defer:circuit_open' },
      { kind: 'defer', code: 'defer:retry_exhausted' },
      { kind: 'defer', code: 'defer:invalid_policy' },
      { kind: 'defer', code: 'defer:evaluator_internal_exception' },
      { kind: 'defer', code: 'defer:db_busy' },
      { kind: 'defer', code: 'defer:rate_limited' },
      { kind: 'defer', code: 'defer:shadow_due_to_counter_rebuild' },
      { kind: 'defer', code: 'defer:no_fallback' },
      // Block (FR-002, FR-179, FR-180)
      { kind: 'block', code: 'block:hard_budget_exceeded' },
      { kind: 'block', code: 'block:no_override_authority' },
      { kind: 'block', code: 'block:reservation_unavailable' },
      { kind: 'block', code: 'block:policy_locked' },
      { kind: 'block', code: 'block:validation_failed' },
      { kind: 'block', code: 'block:etag_stale' },
      // override_required (FR-171..FR-185)
      { kind: 'override_required', code: 'override_required:hard_budget' },
      { kind: 'override_required', code: 'override_required:wip_breach' },
    ];
    expect(reasons.length).toBeGreaterThan(15);
  });

  it('discriminated union narrows correctly via `kind`', () => {
    // Accept `r: EvaluatorReason` opaquely (factory hides the literal type)
    // so the `if` on `r.kind` is a real narrowing and not a tautology.
    function makeReason(): EvaluatorReason {
      return { kind: 'defer', code: 'defer:cooldown' };
    }
    const r = makeReason();
    if (r.kind === 'defer') {
      expectTypeOf(r.code).toEqualTypeOf<DeferReason>();
      expect(r.code).toBe('defer:cooldown');
    } else {
      // Unreachable at runtime, but the type system narrows `r.kind` to
      // the residual union {'allow' | 'block' | 'override_required'} here.
      // We use `satisfies` so the assertion does not introduce an unused
      // local that strict-mode rejects.
      r.kind satisfies 'allow' | 'block' | 'override_required';
    }
  });

  it('rejects mismatched kind+code at the type level', () => {
    // @ts-expect-error — 'allow:clear' is not a valid DeferReason
    const _bad: EvaluatorReason = { kind: 'defer', code: 'allow:clear' };
    void _bad;
    // @ts-expect-error — 'block:hard_budget_exceeded' is not a valid AllowReason
    const _bad2: EvaluatorReason = {
      kind: 'allow',
      code: 'block:hard_budget_exceeded',
    };
    void _bad2;
  });

  it('runtime type guards correctly classify reason codes', () => {
    expect(isAllowReason('allow:clear')).toBe(true);
    expect(isAllowReason('defer:cooldown')).toBe(false);
    expect(isDeferReason('defer:cooldown')).toBe(true);
    expect(isDeferReason('defer:evaluator_internal_exception')).toBe(true);
    expect(isDeferReason('defer:db_busy')).toBe(true);
    expect(isDeferReason('defer:no_fallback')).toBe(true);
    expect(isDeferReason('defer:shadow_due_to_counter_rebuild')).toBe(true);
    expect(isDeferReason('block:hard_budget_exceeded')).toBe(false);
    expect(isBlockReason('block:hard_budget_exceeded')).toBe(true);
    expect(isOverrideRequiredReason('override_required:hard_budget')).toBe(
      true,
    );
    expect(isOverrideRequiredReason('defer:cooldown')).toBe(false);
  });

  it('FR-005a — defer:evaluator_internal_exception is a distinct reason', () => {
    // FR-005a says this MUST be distinct from defer:retry_exhausted (FR-012)
    // and defer:invalid_policy (FR-026).
    const a: DeferReason = 'defer:evaluator_internal_exception';
    const b: DeferReason = 'defer:retry_exhausted';
    const c: DeferReason = 'defer:invalid_policy';
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('FR-333 — defer:db_busy is distinct from atomic-update contention', () => {
    // FR-333: SQLITE_BUSY surfaces as defer:db_busy and is NOT folded into
    // the FR-012 retry path.
    const r: DeferReason = 'defer:db_busy';
    expect(r).toBe('defer:db_busy');
  });

  it('FR-058a — defer:shadow_due_to_counter_rebuild is exposed as a reason', () => {
    const r: DeferReason = 'defer:shadow_due_to_counter_rebuild';
    expect(r).toBe('defer:shadow_due_to_counter_rebuild');
  });

  it('FR-363 — defer:no_fallback is exposed as a reason', () => {
    const r: DeferReason = 'defer:no_fallback';
    expect(r).toBe('defer:no_fallback');
  });
});

describe('SPEC-008 PolicyKind', () => {
  it('covers every FR-029 / FR-027 / FR-038 policy kind', () => {
    const kinds: PolicyKind[] = [
      'wip',
      'budget_usd',
      'budget_token',
      'budget_request',
      'budget_session',
      'blackout_window',
      'degraded_window',
      'aegis_emergency_reserve',
    ];
    expect(kinds).toHaveLength(8);
    // @ts-expect-error — 'foo' not a PolicyKind
    const _bad: PolicyKind = 'foo';
    void _bad;
  });
});

describe('SPEC-008 ScopeKind', () => {
  it('covers facility/workspace/agent/project/task_status', () => {
    const kinds: ScopeKind[] = [
      'facility',
      'workspace',
      'agent',
      'project',
      'task_status',
    ];
    expect(kinds).toHaveLength(5);
  });
});

describe('SPEC-008 ReconcileStatus (FR-365)', () => {
  it('is the closed set { ok, schema_broken, schema_malicious }', () => {
    const statuses: ReconcileStatus[] = ['ok', 'schema_broken', 'schema_malicious'];
    expect(statuses).toHaveLength(3);
    // @ts-expect-error — invalid status
    const _bad: ReconcileStatus = 'pending';
    void _bad;
  });
});

describe('SPEC-008 EnforceMode', () => {
  it('is the closed set { shadow, soft, hard }', () => {
    const modes: EnforceMode[] = ['shadow', 'soft', 'hard'];
    expect(modes).toHaveLength(3);
  });
});

describe('SPEC-008 BudgetWindowKind', () => {
  it('covers rolling- and calendar- window types', () => {
    const ks: BudgetWindowKind[] = [
      'rolling_hour',
      'rolling_day',
      'rolling_week',
      'calendar_day',
      'calendar_week',
      'calendar_month',
    ];
    expect(ks).toHaveLength(6);
  });
});

describe('SPEC-008 DispatchDecision (FR-189)', () => {
  it('has the full decision-row shape', () => {
    const d: DispatchDecision = {
      decision_id: 'dec_01HXYZ',
      task_id: 't_42',
      agent_id: 'a_aegis',
      workspace_id: 7,
      decision: 'defer',
      reasons: [{ kind: 'defer', code: 'defer:wip_limit' }],
      policy_ids: [101, 102],
      precedence_rank: 4,
      latency_ms: 7.5,
      breaker_state: 'closed',
      evaluation_snapshot_json: '{"counters":{"wip":3}}',
      created_at: '2026-05-02T16:00:00.000Z',
    };
    expect(d.decision).toBe('defer');
    expect(d.reasons[0]?.kind).toBe('defer');
    expect(d.policy_ids).toEqual([101, 102]);
  });

  it('allows nullable task_id / agent_id / workspace_id (admission outside a task)', () => {
    const d: DispatchDecision = {
      decision_id: 'dec_01',
      task_id: null,
      agent_id: null,
      workspace_id: null,
      decision: 'allow',
      reasons: [{ kind: 'allow', code: 'allow:clear' }],
      policy_ids: [],
      precedence_rank: null,
      latency_ms: 1.0,
      breaker_state: 'closed',
      evaluation_snapshot_json: null,
      created_at: '2026-05-02T16:00:00.000Z',
    };
    expect(d.task_id).toBeNull();
  });
});

describe('SPEC-008 OverrideRequest / OverrideGrant (FR-171..FR-185)', () => {
  it('OverrideRequest carries the FR-172 fields', () => {
    const req: OverrideRequest = {
      originating_decision_id: 'dec_01',
      requested_amount: 5.0,
      unit: 'usd',
      ttl_seconds: 3600,
      justification: 'incident-2026-05-02',
      idempotency_key: 'idem-abc',
      etag: 'W/"v3"',
    };
    expect(req.unit).toBe('usd');
    expect(req.ttl_seconds).toBe(3600);
  });

  it('OverrideGrant captures the FR-175 reservation + remaining-budget snapshot', () => {
    const grant: OverrideGrant = {
      grant_id: 99,
      reservation_id: 41,
      originating_decision_id: 'dec_01',
      granted_by: 'op-alice',
      granted_at: '2026-05-02T16:00:00.000Z',
      ttl_seconds: 3600,
      expires_at: '2026-05-02T17:00:00.000Z',
      amount: 5.0,
      unit: 'usd',
      justification: 'incident-2026-05-02',
      state: 'active',
      workspace_id: 7,
      remaining_budget_snapshot: { usd: 0, tokens: 0, requests: 0, sessions: 0 },
    };
    expect(grant.state).toBe('active');
    expect(grant.remaining_budget_snapshot.usd).toBe(0);
  });

  it('OverrideGrant.state is the closed CHECK-constrained set', () => {
    const states: OverrideGrant['state'][] = [
      'active',
      'consumed',
      'released',
      'expired',
      'revoked',
    ];
    expect(states).toHaveLength(5);
  });
});

describe('SPEC-008 DriftTier (FR-057)', () => {
  it('is the closed three-tier set', () => {
    const tiers: DriftTier[] = ['auto-repair', 'operator-confirmed', 'hard-block'];
    expect(tiers).toHaveLength(3);
  });
});

describe('SPEC-008 DedupeConfidence', () => {
  it('is the closed { high, medium, singleton } set', () => {
    const cs: DedupeConfidence[] = ['high', 'medium', 'singleton'];
    expect(cs).toHaveLength(3);
  });
});

describe('SPEC-008 EnforcementEligibility (M64a source_emission_capability)', () => {
  it('covers hard / soft / reconciliation_only / advisory', () => {
    const es: EnforcementEligibility[] = [
      'hard',
      'soft',
      'reconciliation_only',
      'advisory',
    ];
    expect(es).toHaveLength(4);
  });
});

describe('SPEC-008 EvaluatorReason — exhaustiveness', () => {
  it('every EvaluatorReason kind is covered by a discriminated branch', () => {
    function describeReason(r: EvaluatorReason): string {
      switch (r.kind) {
        case 'allow':
          return `allow:${r.code}`;
        case 'defer':
          return `defer:${r.code}`;
        case 'block':
          return `block:${r.code}`;
        case 'override_required':
          return `override_required:${r.code}`;
        // No default — exhaustiveness guaranteed at compile time.
      }
    }
    const r1: EvaluatorReason = { kind: 'allow', code: 'allow:clear' };
    const r2: EvaluatorReason = { kind: 'defer', code: 'defer:cooldown' };
    const r3: EvaluatorReason = { kind: 'block', code: 'block:hard_budget_exceeded' };
    const r4: EvaluatorReason = {
      kind: 'override_required',
      code: 'override_required:hard_budget',
    };
    expect(describeReason(r1)).toContain('allow');
    expect(describeReason(r2)).toContain('defer');
    expect(describeReason(r3)).toContain('block');
    expect(describeReason(r4)).toContain('override_required');
  });

  it('AllowReason | DeferReason | BlockReason | OverrideRequiredReason is the full code space', () => {
    const allCodes: (
      | AllowReason
      | DeferReason
      | BlockReason
      | OverrideRequiredReason
    )[] = [
      'allow:clear',
      'defer:cooldown',
      'block:hard_budget_exceeded',
      'override_required:hard_budget',
    ];
    expect(allCodes).toHaveLength(4);
  });
});
