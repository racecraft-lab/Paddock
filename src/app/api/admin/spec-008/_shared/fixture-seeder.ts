/**
 * SPEC-008 — programmatic per-test fixture seeder.
 *
 * Each Playwright spec calls `seedGovernanceFixture()` once in
 * `beforeAll`; that POSTs to `/api/admin/spec-008/seed-fixture`
 * which delegates here. We:
 *
 *   1. Create a fresh workspace (slug taken from request, or random)
 *      tagged with `spec_008_e2e_fixture: true` in feature_flags.
 *   2. Seed 4 agents (1 emergency-eligible Aegis singleton + 3 generic)
 *      attached to that workspace.
 *   3. Seed default WIP policies, a daily USD budget, one weekly
 *      blackout window, and one open override grant.
 *   4. Anchor every timestamp to `Date.now()` so live windows / 24h
 *      caches do not roll off mid-run.
 *
 * `flagOn=true` enables the SPEC-008 governance flag on the fresh
 * workspace; `flagOn=false` keeps it off (used by feature-flag-matrix
 * tests).
 *
 * Cleanup is by `tearDownFixture(workspaceId)` — best-effort delete
 * of every row tagged with the workspace_id.
 *
 * NOTE: Mirrors the cleanup-then-seed transactional pattern in
 * `scripts/seed-e2e-spec-007.cjs`, just expressed in the strict-typed
 * server runtime.
 *
 * @see scripts/seed-e2e-spec-007.cjs
 * @see tests/e2e/spec-008/governance-fixtures.ts
 */

import { getForegroundDb } from '@/lib/db/connection-pool';
import { expandFeatureFlagCascade } from '@/lib/feature-flags';
import type Database from 'better-sqlite3';
// `getForegroundDb` lives in the strict-scope-safe `@/lib/db/connection-pool`
// module. Using it here keeps the SPEC-008 admin surface inside the strict
// scope without pulling in the wider auth/db module graph (Convention J).

function getDatabase(): Database.Database {
  return getForegroundDb();
}

interface SeedOptions {
  slug: string;
  flagOn: boolean;
  seedPolicies?: boolean;
}

interface SeedResult {
  workspaceId: number;
  agentIds: number[];
}

const FIXTURE_FLAG_KEY = 'spec_008_e2e_fixture';

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS one FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { one: number } | undefined;
  return row !== undefined;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildFlagsJson(flagOn: boolean): string {
  const flags: Record<string, boolean> = {
    [FIXTURE_FLAG_KEY]: true,
    FEATURE_WORKSPACE_SWITCHER: true,
  };
  if (flagOn) {
    Object.assign(flags, expandFeatureFlagCascade('FEATURE_OPENCLAW_HEALTH_COSTS', true));
  }
  return JSON.stringify(flags);
}

function insertWorkspace(db: Database.Database, slug: string, flagOn: boolean): number {
  const ts = nowSeconds();
  const info = db
    .prepare(
      `INSERT INTO workspaces (name, slug, tenant_id, feature_flags, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?, ?)`,
    )
    .run(`SPEC-008 Fixture ${slug}`, slug, buildFlagsJson(flagOn), ts, ts);
  return Number(info.lastInsertRowid);
}

function insertAgents(db: Database.Database, workspaceId: number): number[] {
  const ts = nowSeconds();
  const ids: number[] = [];
  const stmt = db.prepare(
    `INSERT INTO agents (name, role, status, scope, workspace_id, config, created_at, updated_at)
     VALUES (?, ?, 'offline', ?, ?, ?, ?, ?)`,
  );
  // Aegis singleton — emergency-eligible (scope='global' per FR-150 / SPEC-003).
  ids.push(
    Number(
      stmt.run(
        `aegis-spec-008-${workspaceId.toString()}`,
        'reviewer',
        'global',
        workspaceId,
        JSON.stringify({ e2e_fixture: 'spec-008', emergency_eligible: true }),
        ts,
        ts,
      ).lastInsertRowid,
    ),
  );
  for (let i = 0; i < 3; i += 1) {
    ids.push(
      Number(
        stmt.run(
          `spec-008-agent-${workspaceId.toString()}-${i.toString()}`,
          'tester',
          'workspace',
          workspaceId,
          JSON.stringify({ e2e_fixture: 'spec-008' }),
          ts,
          ts,
        ).lastInsertRowid,
      ),
    );
  }
  return ids;
}

function insertResourcePolicies(
  db: Database.Database,
  workspaceId: number,
  agentIds: readonly number[],
): void {
  if (!tableExists(db, 'resource_policies')) return;
  const stmt = db.prepare(
    `INSERT INTO resource_policies
       (workspace_id, agent_id, policy_type, limit_kind, limit_value,
        enforcement, soft_threshold_pct, hard_threshold_pct, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  // Default WIP policies (one shadow agent-scoped, one workspace-scoped hard).
  if (agentIds[0] !== undefined) {
    stmt.run(workspaceId, agentIds[0], 'wip_limit', 'concurrent_tasks', 1, 'defer', 80, 100);
  }
  stmt.run(workspaceId, null, 'wip_limit', 'concurrent_tasks', 5, 'block_dispatch', 80, 100);
  // Default daily USD budget (workspace-scoped).
  stmt.run(workspaceId, null, 'budget', 'usd_daily', 25.0, 'defer', 80, 100);
  // One weekly blackout window (workspace-scoped). Schedule JSON encodes
  // the recurrence — material details exercised by governance-windows e2e.
  const blackoutSchedule = JSON.stringify({
    timezone: 'America/Chicago',
    weekly: [{ day: 'Sun', start: '22:00', end: '06:00' }],
  });
  db.prepare(
    `INSERT INTO resource_policies
       (workspace_id, policy_type, limit_kind, limit_value, enforcement,
        timezone, schedule_json, enabled)
     VALUES (?, 'blackout', 'weekly_window', 1, 'block_dispatch', 'America/Chicago', ?, 1)`,
  ).run(workspaceId, blackoutSchedule);
}

function insertOverrideGrant(db: Database.Database, workspaceId: number): void {
  if (!tableExists(db, 'resource_overrides')) return;
  const grantedAt = nowIso();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO resource_overrides
       (scope_kind, scope_id, granted_amount, granted_unit, reason, actor,
        idempotency_key, granted_at, expires_at)
     VALUES ('workspace', ?, 50.0, 'usd', ?, 'admin', ?, ?, ?)`,
  ).run(
    workspaceId,
    'spec-008 e2e fixture seed',
    `spec-008-fixture-${workspaceId.toString()}-${Date.now().toString()}`,
    grantedAt,
    expiresAt,
  );
}

function insertSampleDispatch(
  db: Database.Database,
  workspaceId: number,
  agentIds: readonly number[],
): void {
  // Per-test sample dispatch + decision rows. We deliberately do NOT
  // insert into `tasks` from this strict-scope module because every
  // production task row must originate from `src/lib/task-create.ts`
  // (SPEC-004 task-create.direct-insert-guard). The host-side
  // `scripts/seed-e2e-spec-008.cjs` already provisions a baseline
  // task/disposition fixture; the resource_policy_events rows below
  // are the actual source data for the diagnostic feed.

  // Resource decision rows for the diagnostic feed.
  if (tableExists(db, 'resource_policy_events')) {
    const evStmt = db.prepare(
      `INSERT INTO resource_policy_events
         (policy_id, agent_id, decision, reason, observed_value, limit_value, metadata)
       VALUES (NULL, ?, ?, ?, ?, ?, ?)`,
    );
    if (agentIds[0] !== undefined) {
      evStmt.run(
        agentIds[0],
        'allow',
        'spec-008 fixture seed: clear admit',
        0,
        100,
        JSON.stringify({ workspace_id: workspaceId }),
      );
      evStmt.run(
        agentIds[0],
        'defer',
        'wip_exceeded',
        2,
        1,
        JSON.stringify({ workspace_id: workspaceId }),
      );
    }
  }
  if (tableExists(db, 'resource_decision_audit')) {
    const auditStmt = db.prepare(
      `INSERT INTO resource_decision_audit
         (decision_id, workspace_id, actor, decision, reason, payload_json, prev_hash, row_hash)
       VALUES (?, ?, 'spec-008-fixture', ?, ?, ?, ?, ?)`,
    );
    auditStmt.run(
      `spec-008-allow-${workspaceId.toString()}`,
      workspaceId,
      'allow',
      'clear_admit',
      JSON.stringify({ workspace_id: workspaceId, e2e_fixture: true }),
      `fixture-prev-${workspaceId.toString()}`,
      `fixture-allow-${workspaceId.toString()}`,
    );
    auditStmt.run(
      `spec-008-defer-${workspaceId.toString()}`,
      workspaceId,
      'defer',
      'wip_exceeded',
      JSON.stringify({ workspace_id: workspaceId, e2e_fixture: true }),
      `fixture-allow-${workspaceId.toString()}`,
      `fixture-defer-${workspaceId.toString()}`,
    );
  }
}

/**
 * Seed a SPEC-008 e2e fixture inside one transaction.
 */
export function seedSpec008Fixture(opts: SeedOptions): SeedResult {
  const db = getDatabase();
  const result: SeedResult = db.transaction(
    (input: SeedOptions): SeedResult => {
      const workspaceId = insertWorkspace(db, input.slug, input.flagOn);
      const agentIds = insertAgents(db, workspaceId);
      if (input.seedPolicies !== false) {
        insertResourcePolicies(db, workspaceId, agentIds);
      }
      insertOverrideGrant(db, workspaceId);
      insertSampleDispatch(db, workspaceId, agentIds);
      return { workspaceId, agentIds };
    },
  )(opts);
  return result;
}

/**
 * Best-effort tear-down: remove every row tied to the fixture
 * workspace. Order matters because of FK references.
 */
export function teardownSpec008Fixture(workspaceId: number): void {
  if (!Number.isFinite(workspaceId) || workspaceId <= 0) return;
  const db = getDatabase();
  db.transaction(() => {
    const tablesByWorkspace = [
      'task_artifacts',
      'task_dispositions',
      'task_subscriptions',
      'comments',
      'quality_reviews',
      'tasks',
      'agents',
      'projects',
      'resource_policies',
      'resource_overrides',
      'aegis_emergency_reserves',
      'aegis_fallback_activity',
      'governance_health_events',
    ];
    for (const tbl of tablesByWorkspace) {
      if (!tableExists(db, tbl)) continue;
      try {
        const cols = db.prepare(`PRAGMA table_info(${tbl})`).all() as { name: string }[];
        const hasWorkspaceId = cols.some((c) => c.name === 'workspace_id');
        const hasScopeId = cols.some((c) => c.name === 'scope_id');
        if (hasWorkspaceId) {
          db.prepare(`DELETE FROM ${tbl} WHERE workspace_id = ?`).run(workspaceId);
        }
        if (hasScopeId && tbl === 'resource_overrides') {
          db.prepare(
            `DELETE FROM resource_overrides WHERE scope_kind='workspace' AND scope_id = ?`,
          ).run(workspaceId);
        }
      } catch {
        // ignore — best effort.
      }
    }
    if (tableExists(db, 'workspaces')) {
      db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
    }
  })();
}
