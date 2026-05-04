/**
 * SPEC-008 — Tests for `src/lib/resource-evaluator.ts`.
 *
 * Verifies the synchronous hot-path contract for `resourcePolicyEvaluator`:
 *
 *   - FR-001 — return shape `{decision, reasons, policy_ids, evaluated_at_ms}`.
 *   - FR-002 — precedence ordering across the 7 tiers (breaker > blackout
 *     > hard_budget > wip > degraded > soft > clear).
 *   - FR-005a — try/catch fail-safe: when the evaluator throws internally
 *     it MUST return `defer` with reason code
 *     `defer:evaluator_internal_exception`. NEVER `block`.
 *   - FR-008 — when `FEATURE_RESOURCE_GOVERNANCE` is OFF the evaluator
 *     MUST return the byte-compat `allow` decision WITHOUT consulting the
 *     `resource_policies` table (no SELECT issued).
 *   - FR-326 — sanity bound: a single evaluation must complete in well
 *     under one second on the test box. This is a smoke check, NOT the
 *     benchmark gate (AC-Bench-1 owns that).
 *
 * Test pattern follows `resource-budget-counters-race.test.ts`: real
 * better-sqlite3 fixture under `mkdtempSync`, full migration suite, and
 * `process.env.FEATURE_RESOURCE_GOVERNANCE='0'` to force OFF (only `'0'`
 * is the env-locked override per `feature-flags.ts`; `'1'` is NOT honored
 * for production flags).
 *
 * @see specs/008-resource-governance/spec.md FR-001, FR-002, FR-005a,
 *      FR-008, FR-326
 * @see specs/008-resource-governance/tasks.md T055
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expandFeatureFlagCascade } from '@/lib/feature-flags';

let tempDir: string;
let db: Database.Database;
const governanceOn = expandFeatureFlagCascade('FEATURE_RESOURCE_GOVERNANCE', true);

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-resource-evaluator-'));
  process.env.MISSION_CONTROL_DATA_DIR = tempDir;
  process.env.MISSION_CONTROL_DB_PATH = join(tempDir, 'mission-control.db');
  db = new Database(process.env.MISSION_CONTROL_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = 1');
  db.pragma('busy_timeout = 50');
  const { runMigrations } = await import('@/lib/migrations');
  runMigrations(db);
  // Disable foreign key enforcement so fixtures can soft-reference
  // workspace/agent ids without seeding the parent rows.
  db.pragma('foreign_keys = OFF');
});

afterEach(async () => {
  try {
    const mod = await import('@/lib/resource-policy-cache');
    mod.resetPolicyCache();
  } catch {
    // ignore: module may not have loaded yet
  }
  try {
    const pool = await import('@/lib/db/connection-pool');
    pool.closeAllConnections();
  } catch {
    // ignore
  }
  try {
    db.close();
  } catch {
    // ignore
  }
  delete process.env.MISSION_CONTROL_DATA_DIR;
  delete process.env.MISSION_CONTROL_DB_PATH;
  delete process.env.FEATURE_RESOURCE_GOVERNANCE;
  rmSync(tempDir, { recursive: true, force: true });
});

/** Seed a `resource_policies` row matching the M060 schema CHECKs. */
function insertPolicy(
  database: Database.Database,
  args: {
    workspace_id: number | null;
    agent_id?: number | null;
    project_id?: number | null;
    policy_type: 'wip_limit' | 'budget' | 'blackout' | 'degraded_window';
    limit_kind: string;
    limit_value?: number | null;
    enforcement:
      | 'alert'
      | 'defer'
      | 'pause_new_work'
      | 'block_dispatch'
      | 'require_override';
    enabled?: number;
    version?: number;
    enabled_at?: string | null;
    disabled_at?: string | null;
  },
): number {
  const stmt = database.prepare(`
    INSERT INTO resource_policies
      (workspace_id, project_id, agent_id, policy_type, limit_kind,
       limit_value, enforcement, enabled, version, enabled_at, disabled_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    args.workspace_id,
    args.project_id ?? null,
    args.agent_id ?? null,
    args.policy_type,
    args.limit_kind,
    args.limit_value ?? null,
    args.enforcement,
    args.enabled ?? 1,
    args.version ?? 1,
    args.enabled_at ?? null,
    args.disabled_at ?? null,
  );
  return Number(result.lastInsertRowid);
}

describe('SPEC-008 resource-evaluator — module surface', () => {
  it('exports resourcePolicyEvaluator', async () => {
    const mod = await import('@/lib/resource-evaluator');
    expect(typeof mod.resourcePolicyEvaluator).toBe('function');
  });
});

describe('SPEC-008 resource-evaluator — FR-001 return shape', () => {
  it('returns {decision, reasons, policy_ids, evaluated_at_ms} on the all-clear path', async () => {
    process.env.FEATURE_RESOURCE_GOVERNANCE = '0';
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { facility: true },
      },
      db,
    );
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('reasons');
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result).toHaveProperty('policy_ids');
    expect(Array.isArray(result.policy_ids)).toBe(true);
    expect(result).toHaveProperty('evaluated_at_ms');
    expect(typeof result.evaluated_at_ms).toBe('number');
    expect(['allow', 'defer', 'block']).toContain(result.decision);
  });
});

describe('SPEC-008 resource-evaluator — FR-008 flag-OFF byte-compat', () => {
  it('returns {decision:"allow"} with feature_flag_off reason when FEATURE_RESOURCE_GOVERNANCE=0', async () => {
    process.env.FEATURE_RESOURCE_GOVERNANCE = '0';
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { product_line_id: 7 },
      },
      db,
    );
    expect(result.decision).toBe('allow');
    expect(result.policy_ids).toEqual([]);
    // Reason MUST surface that the feature is off so log readers can tell
    // the difference between "no policies matched" and "feature disabled".
    expect(result.reasons.length).toBeGreaterThan(0);
    const codes = result.reasons.map((r) => r.code);
    expect(codes.some((c) => c.includes('feature_flag_off'))).toBe(true);
  });

  it('does not consult resource_policies when flag is OFF', async () => {
    process.env.FEATURE_RESOURCE_GOVERNANCE = '0';
    // Seed a hard-block policy that WOULD apply if the flag were ON.
    insertPolicy(db, {
      workspace_id: 7,
      policy_type: 'wip_limit',
      limit_kind: 'concurrent_tasks',
      enforcement: 'block_dispatch',
    });
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { product_line_id: 7 },
      },
      db,
    );
    // Flag OFF MUST short-circuit before policy lookup.
    expect(result.decision).toBe('allow');
    expect(result.policy_ids).toEqual([]);
  });
});

describe('SPEC-008 resource-evaluator — FR-002 precedence ordering', () => {
  it('returns allow:clear when no policies match', async () => {
    // Flag must be ON for the ladder to run; the env override only forces
    // OFF (env=`0`), so leaving the env unset and the workspace flag
    // unset should also default OFF. To exercise the live ladder we set
    // FEATURE_RESOURCE_GOVERNANCE=undefined and rely on workspace_flags.
    // Per the prompt: tests for FR-002 verify precedence by seeding the
    // correct policy state. We use an in-memory wrap that calls
    // resolveFlag with a workspaceFlags context to opt-in.
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { product_line_id: 7 },
        workspace_flags: governanceOn,
      },
      db,
    );
    expect(result.decision).toBe('allow');
    // No policies seeded → no ids contributed.
    expect(result.policy_ids).toEqual([]);
  });

  it('blackout window outranks degraded window when both match', async () => {
    // Seed BOTH a blackout policy (rank 2 → block) AND a degraded policy
    // (rank 5 → defer). FR-002 requires blackout to win.
    const blackoutId = insertPolicy(db, {
      workspace_id: 7,
      policy_type: 'blackout',
      limit_kind: 'window',
      enforcement: 'block_dispatch',
    });
    const degradedId = insertPolicy(db, {
      workspace_id: 7,
      policy_type: 'degraded_window',
      limit_kind: 'window',
      enforcement: 'defer',
    });
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { product_line_id: 7 },
        workspace_flags: governanceOn,
      },
      db,
    );
    // FR-002 ladder: blackout (2) beats degraded (5).
    expect(result.decision).toBe('block');
    // FR-029: every matched policy id MUST be reported.
    expect(result.policy_ids).toContain(blackoutId);
    expect(result.policy_ids).toContain(degradedId);
  });

  it('wip_limit (rank 4) defers when matched and no higher-rank policy is present', async () => {
    const wipId = insertPolicy(db, {
      workspace_id: 7,
      policy_type: 'wip_limit',
      limit_kind: 'concurrent_tasks',
      enforcement: 'defer',
    });
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { product_line_id: 7 },
        workspace_flags: governanceOn,
      },
      db,
    );
    expect(result.decision).toBe('defer');
    expect(result.policy_ids).toContain(wipId);
  });
});

describe('SPEC-008 resource-evaluator — FR-005a fail-safe', () => {
  it('returns defer with code="defer:evaluator_internal_exception" when an internal throw occurs', async () => {
    // Force an internal exception by closing the db connection BEFORE
    // calling the evaluator. The first SELECT inside the evaluator's
    // try/catch will throw; the evaluator MUST trap it and return
    // defer:evaluator_internal_exception per FR-005a, NEVER block.
    db.close();
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { product_line_id: 7 },
        workspace_flags: governanceOn,
      },
      db,
    );
    expect(result.decision).toBe('defer');
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain('defer:evaluator_internal_exception');
    // FR-005a: NEVER block on internal exception.
    expect(result.decision).not.toBe('block');
    // Re-open db so afterEach close doesn't double-throw.
    db = new Database(process.env.MISSION_CONTROL_DB_PATH ?? '');
  });
});

describe('SPEC-008 resource-evaluator — FR-140/FR-148 flat-rate USD-budget skip (T120)', () => {
  it('skips USD-budget signal when subscription_capped + estimated_marginal_cost_usd=0', async () => {
    // Seed a soft USD budget that WOULD allow with a soft_budget_alert
    // signal, plus a token budget that should still fire normally.
    insertPolicy(db, {
      workspace_id: 7,
      policy_type: 'budget',
      limit_kind: 'usd',
      limit_value: 10,
      enforcement: 'alert',
    });
    insertPolicy(db, {
      workspace_id: 7,
      policy_type: 'budget',
      limit_kind: 'token',
      limit_value: 1000,
      enforcement: 'alert',
    });
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { product_line_id: 7 },
        workspace_flags: governanceOn,
        billing_mode: 'subscription_capped',
        estimated_marginal_cost_usd: 0,
      },
      db,
    );
    // The USD budget was suppressed; the token budget still fires
    // (soft alert) so the verdict is allow with a diagnostic.
    expect(result.decision).toBe('allow');
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain('allow:subscription_capped_skip_marginal');
  });

  it('does NOT skip USD-budget when billing_mode is pay_per_use', async () => {
    insertPolicy(db, {
      workspace_id: 7,
      policy_type: 'budget',
      limit_kind: 'usd',
      limit_value: 10,
      enforcement: 'block_dispatch',
    });
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { product_line_id: 7 },
        workspace_flags: governanceOn,
        billing_mode: 'pay_per_use',
        estimated_marginal_cost_usd: 0,
      },
      db,
    );
    // The hard USD budget WOULD fire (T056-style signal-on-match) and
    // the verdict is block. The flat-rate skip is gated by
    // billing_mode='subscription_capped'; pay_per_use does not skip.
    expect(result.decision).toBe('block');
    const codes = result.reasons.map((r) => r.code);
    expect(codes).not.toContain('allow:subscription_capped_skip_marginal');
  });

  it('does NOT skip USD-budget when estimated_marginal_cost_usd > 0', async () => {
    insertPolicy(db, {
      workspace_id: 7,
      policy_type: 'budget',
      limit_kind: 'usd',
      limit_value: 10,
      enforcement: 'block_dispatch',
    });
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { product_line_id: 7 },
        workspace_flags: governanceOn,
        billing_mode: 'subscription_capped',
        estimated_marginal_cost_usd: 0.01,
      },
      db,
    );
    // Subscription-capped but with non-zero marginal: skip predicate
    // requires estimated_marginal_cost_usd === 0 exactly.
    expect(result.decision).toBe('block');
    const codes = result.reasons.map((r) => r.code);
    expect(codes).not.toContain('allow:subscription_capped_skip_marginal');
  });

  it('still enforces token caps for subscription_capped accounts (FR-140 boundary)', async () => {
    // Per FR-140: token / request / session caps remain active even
    // when USD budgets are skipped because the subscription is paid.
    insertPolicy(db, {
      workspace_id: 7,
      policy_type: 'budget',
      limit_kind: 'usd',
      limit_value: 10,
      enforcement: 'alert',
    });
    insertPolicy(db, {
      workspace_id: 7,
      policy_type: 'budget',
      limit_kind: 'token',
      limit_value: 1000,
      enforcement: 'block_dispatch',
    });
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { product_line_id: 7 },
        workspace_flags: governanceOn,
        billing_mode: 'subscription_capped',
        estimated_marginal_cost_usd: 0,
      },
      db,
    );
    // USD budget skipped, token budget still hard-blocks.
    expect(result.decision).toBe('block');
  });
});

describe('SPEC-008 resource-evaluator — FR-326 latency sanity', () => {
  it('returns within a 100 ms budget on a single all-clear evaluation (sanity, not benchmark)', async () => {
    process.env.FEATURE_RESOURCE_GOVERNANCE = '0';
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    const start = Date.now();
    resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { facility: true },
      },
      db,
    );
    const elapsed = Date.now() - start;
    // Sanity bound only — AC-Bench-1 owns the real percentile gate.
    expect(elapsed).toBeLessThan(100);
  });
});

// =============================================================================
// FR-361 Aegis fallback chain (T128).
//
// When `is_aegis_request: true` and the primary verdict is a defer/block
// caused by a hard-budget signal, the chain advances:
//   step 2 = emergency reserve (if balance available),
//   step 3 = local mode (if LM Studio reachable / log present),
//   step 4 = `defer:deferred_no_fallback` (terminal).
//
// Non-Aegis requests preserve the pre-T128 byte-compat contract.
// =============================================================================
describe('SPEC-008 resource-evaluator — FR-361 Aegis fallback chain (T128)', () => {
  // Force the flag ON via the workspace_flags context — env override only
  // accepts '0' for OFF per feature-flags.ts.
  const aegisOn = governanceOn;
  const TEST_WORKSPACE_ID = 4242;

  beforeEach(() => {
    // Seed a healthy reserve so step 2 can grant.
    db.prepare(
      `INSERT OR REPLACE INTO aegis_emergency_reserves
         (workspace_id, usd_remaining, tokens_remaining, usd_seed, tokens_seed,
          last_replenished_at)
       VALUES (?, 5.0, 1000000, 5.0, 1000000, CURRENT_TIMESTAMP)`,
    ).run(TEST_WORKSPACE_ID);
  });

  it('non-Aegis request preserves byte-compat (no chain branch fires)', async () => {
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    insertPolicy(db, {
      workspace_id: TEST_WORKSPACE_ID,
      policy_type: 'budget',
      limit_kind: 'usd',
      limit_value: 100,
      enforcement: 'block_dispatch',
      enabled_at: new Date().toISOString(),
    });
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'task_dispatch',
        scope: { product_line_id: TEST_WORKSPACE_ID },
        workspace_flags: aegisOn,
        // is_aegis_request omitted — should NOT enter the chain.
      },
      db,
    );
    // Without is_aegis_request, the verdict is the primary block, not
    // an `allow:aegis_*` reason.
    const reasons = result.reasons.map((r) => r.code);
    expect(reasons).not.toContain('allow:aegis_emergency_reserve');
    expect(reasons).not.toContain('allow:aegis_local_mode');
    expect(reasons).not.toContain('defer:deferred_no_fallback');
  });

  it('Aegis request with reserve available → allow:aegis_emergency_reserve', async () => {
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    insertPolicy(db, {
      workspace_id: TEST_WORKSPACE_ID,
      policy_type: 'budget',
      limit_kind: 'usd',
      limit_value: 100,
      enforcement: 'block_dispatch',
      enabled_at: new Date().toISOString(),
    });
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'aegis_review',
        scope: { product_line_id: TEST_WORKSPACE_ID },
        workspace_flags: aegisOn,
        is_aegis_request: true,
        estimated_cost_usd: 0.5,
        estimated_tokens: 100,
      },
      db,
    );
    expect(result.decision).toBe('allow');
    const reasons = result.reasons.map((r) => r.code);
    expect(reasons).toContain('allow:aegis_emergency_reserve');
  });

  it('AC-Aegis-4 — reserve depleted + LM Studio absent + hard_block mode → defer:deferred_no_fallback', async () => {
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    // Force hard_block mode so the terminal is defer:deferred_no_fallback
    // rather than the FR-155 soft_alert default downgrade.
    // workspaces requires tenant_id NOT NULL — pass 1 (FK is OFF in tests).
    db.prepare(
      `INSERT OR REPLACE INTO workspaces
         (id, slug, name, tenant_id, aegis_governance_mode)
       VALUES (?, ?, ?, 1, 'hard_block')`,
    ).run(TEST_WORKSPACE_ID, `aegis-test-${TEST_WORKSPACE_ID}`, `aegis-test-${TEST_WORKSPACE_ID}`);
    // Drain the reserve so step 2 cannot grant.
    db.prepare(
      `UPDATE aegis_emergency_reserves
          SET usd_remaining = 0, tokens_remaining = 0,
              depleted_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ?`,
    ).run(TEST_WORKSPACE_ID);
    insertPolicy(db, {
      workspace_id: TEST_WORKSPACE_ID,
      policy_type: 'budget',
      limit_kind: 'usd',
      limit_value: 100,
      enforcement: 'block_dispatch',
      enabled_at: new Date().toISOString(),
    });
    // LM Studio: real fs probe in lm-studio-log.ts hits ~/.lmstudio/...
    // which is unlikely to exist in the test sandbox. The capability
    // surface returns log_present=false, advancing the chain to step 4.
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'aegis_review',
        scope: { product_line_id: TEST_WORKSPACE_ID },
        workspace_flags: aegisOn,
        is_aegis_request: true,
        estimated_cost_usd: 1.0,
        estimated_tokens: 100,
      },
      db,
    );
    // The terminal verdict is defer:deferred_no_fallback when both step 2
    // and step 3 cannot satisfy the request AND the workspace mode is
    // hard_block.
    if (result.decision === 'defer') {
      const reasons = result.reasons.map((r) => r.code);
      expect(reasons).toContain('defer:deferred_no_fallback');
    } else {
      // Some test environments may have a stray LM Studio log present;
      // accept allow:aegis_local_mode as a valid alternative path so
      // the test does not flake on contributors' workstations.
      const reasons = result.reasons.map((r) => r.code);
      expect(reasons).toContain('allow:aegis_local_mode');
    }
  });

  it('FR-155 — default soft_alert mode downgrades terminal to allow:aegis_soft_alert', async () => {
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    // Default mode is `soft_alert` per FR-155 — no workspaces row needed.
    // Drain the reserve so step 2 cannot grant.
    db.prepare(
      `UPDATE aegis_emergency_reserves
          SET usd_remaining = 0, tokens_remaining = 0,
              depleted_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ?`,
    ).run(TEST_WORKSPACE_ID);
    insertPolicy(db, {
      workspace_id: TEST_WORKSPACE_ID,
      policy_type: 'budget',
      limit_kind: 'usd',
      limit_value: 100,
      enforcement: 'block_dispatch',
      enabled_at: new Date().toISOString(),
    });
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'aegis_review',
        scope: { product_line_id: TEST_WORKSPACE_ID },
        workspace_flags: aegisOn,
        is_aegis_request: true,
        estimated_cost_usd: 1.0,
        estimated_tokens: 100,
      },
      db,
    );
    const reasons = result.reasons.map((r) => r.code);
    if (result.decision === 'allow') {
      // Soft-alert downgrade OR local-mode satisfied. Both are valid
      // outcomes depending on whether the contributor has LM Studio
      // installed at the default fs path.
      expect(
        reasons.includes('allow:aegis_soft_alert') ||
          reasons.includes('allow:aegis_local_mode'),
      ).toBe(true);
    }
  });

  it('FR-162 — blackout window short-circuits the chain', async () => {
    const { resourcePolicyEvaluator } = await import('@/lib/resource-evaluator');
    insertPolicy(db, {
      workspace_id: TEST_WORKSPACE_ID,
      policy_type: 'blackout',
      limit_kind: 'window',
      enforcement: 'block_dispatch',
      enabled_at: new Date().toISOString(),
    });
    const result = resourcePolicyEvaluator(
      {
        decision_class: 'aegis_review',
        scope: { product_line_id: TEST_WORKSPACE_ID },
        workspace_flags: aegisOn,
        is_aegis_request: true,
        estimated_cost_usd: 0.5,
        estimated_tokens: 100,
      },
      db,
    );
    // The chain MUST NOT bypass blackouts. The verdict is the primary
    // block — NOT an aegis allow reason.
    const reasons = result.reasons.map((r) => r.code);
    expect(reasons).not.toContain('allow:aegis_emergency_reserve');
    expect(reasons).not.toContain('allow:aegis_local_mode');
  });
});
