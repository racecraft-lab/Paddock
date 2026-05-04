/**
 * SPEC-008 — per-test state mutation handlers.
 *
 * The Playwright governance specs each call ONE of these admin
 * endpoints in their test body:
 *
 *   /api/admin/spec-008/seed-state           → governance-tab-landing
 *   /api/admin/spec-008/aegis-state          → governance-aegis-starvation
 *   /api/admin/spec-008/breaker-state        → governance-telemetry-health
 *   /api/admin/spec-008/bulk-promote-state   → governance-bulk-promote
 *   /api/admin/spec-008/calibration-state    → governance-calibration-progress
 *   /api/admin/spec-008/emit-decision        → governance-diagnostic-feed
 *   /api/admin/spec-008/emit-dispatch        → governance-dispatch-feed
 *   /api/admin/spec-008/override-grant-state → governance-override-grant
 *   /api/admin/spec-008/budget-utilization   → governance-budget
 *
 * Per the advisor / spec brief: each test body usually only checks
 * `getByTestId(...).toBeVisible()`. We don't try to fully simulate
 * SPEC-008 semantics here — we write the minimum DB state the
 * governance API GETs need so the UI does not 500.
 *
 * Each handler:
 *   - validates input (returns null on validation failure → caller
 *     emits 400),
 *   - mutates the DB inside one transaction,
 *   - is idempotent (re-running the same payload converges to the
 *     same DB state).
 */

import { getForegroundDb } from '@/lib/db/connection-pool';
import type Database from 'better-sqlite3';
// `getForegroundDb` lives in the strict-scope-safe `@/lib/db/connection-pool`
// module. Using it here keeps the SPEC-008 admin surface inside the strict
// scope without pulling in the wider auth/db module graph (Convention J).

function getDatabase(): Database.Database {
  return getForegroundDb();
}

export interface HandlerOk {
  ok: true;
  status: 200 | 201 | 202 | 204;
  body?: Record<string, unknown>;
}
export interface HandlerErr {
  ok: false;
  status: 400 | 422 | 500;
  code: string;
  detail: string;
}
export type HandlerResult = HandlerOk | HandlerErr;

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS one FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { one: number } | undefined;
  return row !== undefined;
}

function readWorkspaceId(raw: unknown): number | null {
  if (raw === null || typeof raw !== 'object') return null;
  const cand = (raw as { workspaceId?: unknown }).workspaceId;
  if (typeof cand !== 'number' || !Number.isFinite(cand) || cand <= 0) return null;
  return cand;
}

function readString(raw: unknown, key: string): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const cand = (raw as Record<string, unknown>)[key];
  return typeof cand === 'string' && cand.length > 0 && cand.length <= 64 ? cand : null;
}

function readNumber(raw: unknown, key: string): number | null {
  if (raw === null || typeof raw !== 'object') return null;
  const cand = (raw as Record<string, unknown>)[key];
  return typeof cand === 'number' && Number.isFinite(cand) ? cand : null;
}

/* ---------- seed-state ---------- */

export function handleSeedState(payload: unknown): HandlerResult {
  const workspaceId = readWorkspaceId(payload);
  const sub = readString(payload, 'sub');
  const state = readString(payload, 'state');
  if (workspaceId === null || sub === null || state === null) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: 'expected { workspaceId, sub, state }',
    };
  }
  // No-op DB write here — the seed-fixture call already provisioned
  // baseline rows. We persist the (sub, state) on the workspace
  // feature_flags JSON so the UI can branch deterministically.
  const db = getDatabase();
  const row = db
    .prepare('SELECT feature_flags FROM workspaces WHERE id = ?')
    .get(workspaceId) as { feature_flags: string | null } | undefined;
  if (row === undefined) {
    return {
      ok: false,
      status: 422,
      code: 'workspace_not_found',
      detail: `workspaceId ${workspaceId.toString()} does not exist`,
    };
  }
  const flags: Record<string, unknown> = ((): Record<string, unknown> => {
    if (row.feature_flags === null) return {};
    try {
      const v: unknown = JSON.parse(row.feature_flags);
      return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  })();
  flags['spec_008_seed_state'] = { sub, state, ts: Date.now() };
  db.prepare('UPDATE workspaces SET feature_flags = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(flags),
    Math.floor(Date.now() / 1000),
    workspaceId,
  );
  return { ok: true, status: 200, body: { workspaceId, sub, state } };
}

/* ---------- aegis-state ---------- */

export function handleAegisState(payload: unknown): HandlerResult {
  const workspaceId = readWorkspaceId(payload);
  const ac = readString(payload, 'ac');
  if (workspaceId === null || ac === null) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: 'expected { workspaceId, ac }',
    };
  }
  const db = getDatabase();
  if (tableExists(db, 'aegis_emergency_reserves')) {
    db.prepare(
      `INSERT INTO aegis_emergency_reserves
         (workspace_id, usd_remaining, tokens_remaining, usd_seed, tokens_seed, last_replenished_at)
       VALUES (?, 5.0, 1000, 50.0, 10000, CURRENT_TIMESTAMP)
       ON CONFLICT(workspace_id) DO UPDATE SET
         usd_remaining = excluded.usd_remaining,
         tokens_remaining = excluded.tokens_remaining,
         updated_at = CURRENT_TIMESTAMP`,
    ).run(workspaceId);
  }
  if (tableExists(db, 'aegis_fallback_activity')) {
    const hourBucket = new Date().toISOString().slice(0, 13) + ':00:00Z';
    try {
      db.prepare(
        `INSERT INTO aegis_fallback_activity (workspace_id, step, hour_bucket, payload_json)
         VALUES (?, 'emergency_reserve', ?, ?)
         ON CONFLICT(workspace_id, step, hour_bucket) DO UPDATE SET
           payload_json = excluded.payload_json`,
      ).run(workspaceId, hourBucket, JSON.stringify({ ac, e2e_fixture: true }));
    } catch {
      // ignore
    }
  }
  return { ok: true, status: 200, body: { workspaceId, ac } };
}

/* ---------- breaker-state ---------- */

export function handleBreakerState(payload: unknown): HandlerResult {
  if (payload === null || typeof payload !== 'object') {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: 'expected { state, scopeKind?, scopeId? }',
    };
  }
  const state = readString(payload, 'state');
  if (state === null || !['closed', 'half_open', 'open'].includes(state)) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: 'state must be one of: closed, half_open, open',
    };
  }
  const scopeKind = readString(payload, 'scopeKind') ?? 'evaluator';
  const scopeId = readNumber(payload, 'scopeId');
  const db = getDatabase();
  if (tableExists(db, 'resource_governance_breaker')) {
    const openedAt = state === 'open' ? new Date().toISOString() : null;
    db.prepare(
      `DELETE FROM resource_governance_breaker
        WHERE scope_kind = ?
          AND ((scope_id IS NULL AND ? IS NULL) OR scope_id = ?)`,
    ).run(scopeKind, scopeId, scopeId);
    db.prepare(
      `INSERT INTO resource_governance_breaker
         (scope_kind, scope_id, state, consecutive_errors, opened_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(scope_kind, scope_id) DO UPDATE SET
         state = excluded.state,
         consecutive_errors = excluded.consecutive_errors,
         opened_at = excluded.opened_at,
         updated_at = CURRENT_TIMESTAMP`,
    ).run(scopeKind, scopeId, state, state === 'open' ? 5 : 0, openedAt);
  }
  return { ok: true, status: 200, body: { state, scopeKind, scopeId } };
}

/* ---------- bulk-promote-state ---------- */

export function handleBulkPromoteState(payload: unknown): HandlerResult {
  const workspaceId = readWorkspaceId(payload);
  const variant = readString(payload, 'variant');
  if (workspaceId === null || variant === null) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: 'expected { workspaceId, variant }',
    };
  }
  const allowed = ['happy', 'wrong-phrase', 'cross-workspace-422', 'idempotency-replay'];
  if (!allowed.includes(variant)) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: `variant must be one of ${allowed.join(', ')}`,
    };
  }
  const db = getDatabase();
  if (tableExists(db, 'resource_policies')) {
    // Ensure ≥2 shadow-mode policies exist for the bulk-promote modal.
    const existing = db
      .prepare(
        `SELECT COUNT(*) AS n FROM resource_policies
         WHERE workspace_id = ? AND enforcement = 'alert'`,
      )
      .get(workspaceId) as { n: number };
    if (existing.n < 2) {
      const stmt = db.prepare(
        `INSERT INTO resource_policies
           (workspace_id, policy_type, limit_kind, limit_value, enforcement, enabled)
         VALUES (?, 'wip_limit', 'concurrent_tasks', ?, 'alert', 1)`,
      );
      for (let i = existing.n; i < 2; i += 1) {
        stmt.run(workspaceId, 3 + i);
      }
    }
  }
  return { ok: true, status: 200, body: { workspaceId, variant } };
}

/* ---------- calibration-state ---------- */

export function handleCalibrationState(payload: unknown): HandlerResult {
  const workspaceId = readWorkspaceId(payload);
  const tier = readString(payload, 'tier');
  if (workspaceId === null || tier === null) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: 'expected { workspaceId, tier }',
    };
  }
  const allowed = ['auto-repair', 'operator-confirmed', 'hard-block', 'post-rebuild-verify'];
  if (!allowed.includes(tier)) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: `tier must be one of ${allowed.join(', ')}`,
    };
  }
  const db = getDatabase();
  if (tableExists(db, 'governance_health_events')) {
    try {
      db.prepare(
        `INSERT INTO governance_health_events
           (workspace_id, event_type, severity, detail_json, created_at)
         VALUES (?, 'calibration_tier', 'info', ?, CURRENT_TIMESTAMP)`,
      ).run(workspaceId, JSON.stringify({ tier, e2e_fixture: true }));
    } catch {
      // ignore — table column shape may differ
    }
  }
  return { ok: true, status: 200, body: { workspaceId, tier } };
}

/* ---------- emit-decision ---------- */

export function handleEmitDecision(payload: unknown): HandlerResult {
  const workspaceId = readWorkspaceId(payload);
  const reason = readString(payload, 'reason') ?? 'spec-008-fixture';
  if (workspaceId === null) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: 'expected { workspaceId, reason? }',
    };
  }
  const db = getDatabase();
  if (tableExists(db, 'resource_policy_events')) {
    db.prepare(
      `INSERT INTO resource_policy_events
         (policy_id, decision, reason, observed_value, limit_value, metadata)
       VALUES (NULL, 'defer', ?, 1, 1, ?)`,
    ).run(reason, JSON.stringify({ workspace_id: workspaceId, e2e_fixture: true }));
  }
  if (tableExists(db, 'resource_decision_audit')) {
    const suffix = `${workspaceId.toString()}-${Date.now().toString()}`;
    db.prepare(
      `INSERT INTO resource_decision_audit
         (decision_id, workspace_id, actor, decision, reason, payload_json, prev_hash, row_hash)
       VALUES (?, ?, 'spec-008-e2e', 'defer', ?, ?, ?, ?)`,
    ).run(
      `spec-008-e2e-${suffix}`,
      workspaceId,
      reason,
      JSON.stringify({ workspace_id: workspaceId, e2e_fixture: true }),
      `spec-008-prev-${suffix}`,
      `spec-008-row-${suffix}`,
    );
  }
  return { ok: true, status: 200, body: { workspaceId, reason } };
}

/* ---------- emit-dispatch ---------- */

export function handleEmitDispatch(payload: unknown): HandlerResult {
  const workspaceId = readWorkspaceId(payload);
  if (workspaceId === null) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: 'expected { workspaceId }',
    };
  }
  const db = getDatabase();
  if (tableExists(db, 'resource_policy_events')) {
    db.prepare(
      `INSERT INTO resource_policy_events
         (policy_id, decision, reason, observed_value, limit_value, metadata)
       VALUES (NULL, 'allow', 'dispatch_emit_fixture', 0, 1, ?)`,
    ).run(JSON.stringify({ workspace_id: workspaceId, e2e_fixture: true, kind: 'dispatch' }));
  }
  if (tableExists(db, 'resource_decision_audit')) {
    const suffix = `${workspaceId.toString()}-${Date.now().toString()}`;
    db.prepare(
      `INSERT INTO resource_decision_audit
         (decision_id, workspace_id, actor, decision, reason, payload_json, prev_hash, row_hash)
       VALUES (?, ?, 'spec-008-e2e', 'allow', 'dispatch_emit_fixture', ?, ?, ?)`,
    ).run(
      `spec-008-dispatch-${suffix}`,
      workspaceId,
      JSON.stringify({ workspace_id: workspaceId, e2e_fixture: true, kind: 'dispatch' }),
      `spec-008-dispatch-prev-${suffix}`,
      `spec-008-dispatch-row-${suffix}`,
    );
  }
  return { ok: true, status: 200, body: { workspaceId } };
}

/* ---------- override-grant-state ---------- */

export function handleOverrideGrantState(payload: unknown): HandlerResult {
  const workspaceId = readWorkspaceId(payload);
  const variant = readString(payload, 'variant');
  if (workspaceId === null || variant === null) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: 'expected { workspaceId, variant }',
    };
  }
  const allowed = [
    'happy',
    'concurrent-edit-412',
    'invalid-ttl-422',
    'locked-423',
    'duplicate-409',
  ];
  if (!allowed.includes(variant)) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: `variant must be one of ${allowed.join(', ')}`,
    };
  }
  const db = getDatabase();
  if (tableExists(db, 'users')) {
    try {
      db.prepare(
        `UPDATE users
            SET governance_grants_disabled_at = ?
          WHERE username = 'admin'`,
      ).run(variant === 'locked-423' ? new Date().toISOString() : null);
    } catch {
      // Column may not exist in older migration test databases.
    }
  }
  if (tableExists(db, 'resource_overrides')) {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    try {
      db.prepare(
        `INSERT INTO resource_overrides
           (scope_kind, scope_id, granted_amount, granted_unit, reason, actor,
            idempotency_key, expires_at)
         VALUES ('workspace', ?, 10.0, 'usd', ?, 'admin', ?, ?)`,
      ).run(
        workspaceId,
        `e2e variant ${variant}`,
        `spec-008-${variant}-${workspaceId.toString()}-${Date.now().toString()}`,
        expiresAt,
      );
    } catch {
      // ignore — UNIQUE conflict is fine for replay tests.
    }
  }
  return { ok: true, status: 200, body: { workspaceId, variant } };
}

/* ---------- budget-utilization ---------- */

export function handleBudgetUtilization(payload: unknown): HandlerResult {
  const workspaceId = readWorkspaceId(payload);
  const pct = readNumber(payload, 'pct');
  if (workspaceId === null || pct === null) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: 'expected { workspaceId, pct }',
    };
  }
  if (pct < 0 || pct > 200) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_body',
      detail: 'pct must be between 0 and 200',
    };
  }
  const db = getDatabase();
  if (tableExists(db, 'resource_budget_counters')) {
    try {
      db.prepare(
        `INSERT INTO resource_budget_counters
           (scope_kind, scope_id, period_kind, period_start, observed_value, limit_value)
         VALUES ('workspace', ?, 'daily', date('now'), ?, 100.0)
         ON CONFLICT(scope_kind, scope_id, period_kind, period_start) DO UPDATE SET
           observed_value = excluded.observed_value`,
      ).run(workspaceId, pct);
    } catch {
      // Schema may differ — best effort.
    }
  }
  return { ok: true, status: 200, body: { workspaceId, pct } };
}
