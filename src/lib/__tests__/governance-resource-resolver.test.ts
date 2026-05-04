/**
 * SPEC-008 — Tests for the 404-vs-403 governance resource resolver (T150).
 *
 * Covers FR-219g/FR-211/FR-219l: enumeration-safe behavior on
 * cross-workspace and absent rows.
 *
 * @see specs/008-resource-governance/spec.md FR-219g, FR-211, FR-219l
 * @see specs/008-resource-governance/tasks.md T150
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface PolicyRow {
  id: number;
  workspace_id: number | null;
  policy_type: string;
}
interface OverrideRow {
  id: number;
  scope_kind: string;
  scope_id: number | null;
  reason: string;
}

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-resolver-'));
  process.env.MISSION_CONTROL_DATA_DIR = tempDir;
  process.env.MISSION_CONTROL_DB_PATH = join(tempDir, 'mission-control.db');
  db = new Database(process.env.MISSION_CONTROL_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = 1');
  db.pragma('busy_timeout = 50');
  const { runMigrations } = await import('@/lib/migrations');
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
  delete process.env.MISSION_CONTROL_DATA_DIR;
  delete process.env.MISSION_CONTROL_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('SPEC-008 governance-resource-resolver (T150)', () => {
  it('resolveResourceOrError returns 404 for absent rows', async () => {
    const { resolveResourceOrError } = await import(
      '@/lib/governance-resource-resolver'
    );
    const r = resolveResourceOrError<PolicyRow>(
      db,
      'resource_policies',
      9999,
      { workspaceIds: [1], isFacility: false },
      'id, workspace_id, policy_type',
    );
    expect(r.found).toBe(false);
    if (!r.found) expect(r.code).toBe(404);
  });

  it('returns 404 for cross-workspace access (no enumeration leak)', async () => {
    const { resolveResourceOrError } = await import(
      '@/lib/governance-resource-resolver'
    );
    const result = db
      .prepare(
        `INSERT INTO resource_policies
           (workspace_id, policy_type, limit_kind, enforcement, enabled, version)
         VALUES (?, 'wip_limit', 'wip', 'alert', 1, 1)`,
      )
      .run(7);
    const id = Number(result.lastInsertRowid);

    const r = resolveResourceOrError<PolicyRow>(
      db,
      'resource_policies',
      id,
      { workspaceIds: [1, 2, 3], isFacility: false }, // caller can't see ws 7
      'id, workspace_id, policy_type',
    );
    expect(r.found).toBe(false);
    if (!r.found) expect(r.code).toBe(404);
  });

  it('returns the row when workspace_id matches the caller scope', async () => {
    const { resolveResourceOrError } = await import(
      '@/lib/governance-resource-resolver'
    );
    const result = db
      .prepare(
        `INSERT INTO resource_policies
           (workspace_id, policy_type, limit_kind, enforcement, enabled, version)
         VALUES (?, 'wip_limit', 'wip', 'alert', 1, 1)`,
      )
      .run(2);
    const id = Number(result.lastInsertRowid);

    const r = resolveResourceOrError<PolicyRow>(
      db,
      'resource_policies',
      id,
      { workspaceIds: [1, 2, 3], isFacility: false },
      'id, workspace_id, policy_type',
    );
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.row.id).toBe(id);
      expect(r.workspace_id).toBe(2);
    }
  });

  it('facility-only row visible to facility caller', async () => {
    const { resolveResourceOrError } = await import(
      '@/lib/governance-resource-resolver'
    );
    const result = db
      .prepare(
        `INSERT INTO resource_policies
           (workspace_id, policy_type, limit_kind, enforcement, enabled, version)
         VALUES (NULL, 'wip_limit', 'wip', 'alert', 1, 1)`,
      )
      .run();
    const id = Number(result.lastInsertRowid);

    const facCaller = resolveResourceOrError<PolicyRow>(
      db,
      'resource_policies',
      id,
      { workspaceIds: [], isFacility: true },
      'id, workspace_id, policy_type',
    );
    expect(facCaller.found).toBe(true);

    const plCaller = resolveResourceOrError<PolicyRow>(
      db,
      'resource_policies',
      id,
      { workspaceIds: [1], isFacility: false },
      'id, workspace_id, policy_type',
    );
    expect(plCaller.found).toBe(false);
    if (!plCaller.found) expect(plCaller.code).toBe(404);
  });

  it('rejects non-whitelisted table names with 404', async () => {
    const { resolveResourceOrError } = await import(
      '@/lib/governance-resource-resolver'
    );
    const r = resolveResourceOrError<PolicyRow>(
      db,
      'users', // not a governance table
      1,
      { workspaceIds: [1], isFacility: false },
    );
    expect(r.found).toBe(false);
    if (!r.found) expect(r.code).toBe(404);
  });

  it('resolveOverrideRowOrError treats scope_kind=workspace, scope_id as the workspace_id', async () => {
    const { resolveOverrideRowOrError } = await import(
      '@/lib/governance-resource-resolver'
    );
    const result = db
      .prepare(
        `INSERT INTO resource_overrides
           (scope_kind, scope_id, granted_amount, granted_unit, reason,
            actor, idempotency_key, granted_at, expires_at)
         VALUES ('workspace', ?, 100, 'usd', 'r', 'op:1', 'k1', CURRENT_TIMESTAMP,
                 ?)`,
      )
      .run(5, new Date(Date.now() + 60_000).toISOString());
    const id = Number(result.lastInsertRowid);

    const sameWs = resolveOverrideRowOrError<OverrideRow>(
      db,
      id,
      { workspaceIds: [5], isFacility: false },
      'id, scope_kind, scope_id, reason',
    );
    expect(sameWs.found).toBe(true);

    const otherWs = resolveOverrideRowOrError<OverrideRow>(
      db,
      id,
      { workspaceIds: [1, 2, 3], isFacility: false },
      'id, scope_kind, scope_id, reason',
    );
    expect(otherWs.found).toBe(false);
    if (!otherWs.found) expect(otherWs.code).toBe(404);
  });

  it('resolveOverrideRowOrError treats non-workspace scope_kinds as facility-only', async () => {
    const { resolveOverrideRowOrError } = await import(
      '@/lib/governance-resource-resolver'
    );
    const result = db
      .prepare(
        `INSERT INTO resource_overrides
           (scope_kind, scope_id, granted_amount, granted_unit, reason,
            actor, idempotency_key, granted_at, expires_at)
         VALUES ('facility', NULL, 100, 'usd', 'r', 'op:1', 'k2', CURRENT_TIMESTAMP,
                 ?)`,
      )
      .run(new Date(Date.now() + 60_000).toISOString());
    const id = Number(result.lastInsertRowid);

    const facCaller = resolveOverrideRowOrError<OverrideRow>(
      db,
      id,
      { workspaceIds: [], isFacility: true },
      'id, scope_kind, scope_id, reason',
    );
    expect(facCaller.found).toBe(true);

    const plCaller = resolveOverrideRowOrError<OverrideRow>(
      db,
      id,
      { workspaceIds: [1, 2], isFacility: false },
      'id, scope_kind, scope_id, reason',
    );
    expect(plCaller.found).toBe(false);
  });
});
