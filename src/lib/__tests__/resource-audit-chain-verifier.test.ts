/**
 * SPEC-008 — Audit-chain verifier tests (T147).
 *
 * Coverage:
 *   - forward verify: clean chain → ok=true, cursor advanced
 *   - mid-chain mismatch detection (tampered row_hash)
 *   - resume from cursor (second invocation skips already-verified rows)
 *   - archive cross-check stub returns 'no_archives' until writer lands
 *
 * @see specs/008-resource-governance/tasks.md T147
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalAuditForm,
  canonicalizeJcs,
  hashAuditRow,
} from '@/lib/resource-audit-chain';
import { createHash } from 'node:crypto';

vi.mock('@/lib/db/connection-pool', () => ({
  getAuditDb: vi.fn(),
  closeAllConnections: vi.fn(),
}));

let db: Database.Database;

const ZERO_PREV = '0'.repeat(64);

const SCHEMA_DECISION_AUDIT = `
  CREATE TABLE resource_decision_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id TEXT NOT NULL,
    workspace_id INTEGER,
    actor TEXT,
    decision TEXT NOT NULL,
    reason TEXT,
    payload_json TEXT,
    prev_hash TEXT NOT NULL,
    row_hash TEXT NOT NULL,
    captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

const SCHEMA_RECOVERY = `
  CREATE TABLE recovery_action (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    actor TEXT NOT NULL,
    scope_kind TEXT,
    scope_id INTEGER,
    payload_json TEXT,
    prev_hash TEXT NOT NULL,
    row_hash TEXT NOT NULL,
    taken_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

const SCHEMA_LEDGER = `
  CREATE TABLE resource_budget_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_id INTEGER NOT NULL,
    counter_id INTEGER,
    window_start TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount REAL NOT NULL,
    unit TEXT NOT NULL,
    source_event_id INTEGER,
    decision_id TEXT,
    prev_hash TEXT NOT NULL,
    row_hash TEXT NOT NULL,
    partition_month TEXT NOT NULL,
    notes_json TEXT
  )
`;

const SCHEMA_VERIFIER_STATE = `
  CREATE TABLE governance_audit_verification_state (
    table_name TEXT PRIMARY KEY,
    last_verified_id INTEGER NOT NULL DEFAULT 0,
    last_verified_at TEXT,
    verification_status TEXT,
    notes_json TEXT
  )
`;

beforeEach(() => {
  db = new Database(':memory:');
  db.prepare(SCHEMA_DECISION_AUDIT).run();
  db.prepare(SCHEMA_RECOVERY).run();
  db.prepare(SCHEMA_LEDGER).run();
  db.prepare(SCHEMA_VERIFIER_STATE).run();
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
});

/**
 * Append a single decision-audit row using the same canonical form as
 * the M64 migration. Returns the appended row's row_hash.
 */
function appendDecisionRow(args: {
  decision_id: string;
  actor: string;
  decision: string;
  reason: string;
  payload_json: string;
}): string {
  const tail = db
    .prepare(`SELECT row_hash FROM resource_decision_audit ORDER BY id DESC LIMIT 1`)
    .get() as { row_hash: string } | undefined;
  const prev_hash = tail?.row_hash ?? ZERO_PREV;
  const canonical = canonicalAuditForm({
    prev_hash,
    decision_id: args.decision_id,
    actor: args.actor,
    decision: args.decision,
    reason: args.reason,
    payload_json: args.payload_json,
  });
  const row_hash = hashAuditRow(canonical);
  db.prepare(
    `INSERT INTO resource_decision_audit
       (decision_id, actor, decision, reason, payload_json, prev_hash, row_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    args.decision_id,
    args.actor,
    args.decision,
    args.reason,
    args.payload_json,
    prev_hash,
    row_hash,
  );
  return row_hash;
}

/** Append a recovery_action row using JCS canonicalization. */
function appendRecoveryRow(args: {
  kind: string;
  actor: string;
  scope_kind: string;
  scope_id: number;
  content: Record<string, unknown>;
}): string {
  const tail = db
    .prepare(`SELECT row_hash FROM recovery_action ORDER BY id DESC LIMIT 1`)
    .get() as { row_hash: string } | undefined;
  const prev_hash = tail?.row_hash ?? ZERO_PREV;
  const body = canonicalizeJcs(args.content);
  const row_hash = createHash('sha256')
    .update(prev_hash, 'utf8')
    .update('|', 'utf8')
    .update(body, 'utf8')
    .digest('hex');
  db.prepare(
    `INSERT INTO recovery_action
       (kind, actor, scope_kind, scope_id, payload_json, prev_hash, row_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    args.kind,
    args.actor,
    args.scope_kind,
    args.scope_id,
    JSON.stringify(args.content),
    prev_hash,
    row_hash,
  );
  return row_hash;
}

describe('SPEC-008 verifyChain — resource_decision_audit (T147)', () => {
  it('clean chain forward-walk returns ok=true with cursor advanced', async () => {
    appendDecisionRow({
      decision_id: 'genesis',
      actor: 'system',
      decision: 'genesis',
      reason: 'initial',
      payload_json: '{"chain":"resource_decision_audit","schema_version":1}',
    });
    appendDecisionRow({
      decision_id: 'd-001',
      actor: 'aegis',
      decision: 'allow',
      reason: 'within_budget',
      payload_json: '{"policy_id":1,"amount":5}',
    });
    appendDecisionRow({
      decision_id: 'd-002',
      actor: 'aegis',
      decision: 'deny',
      reason: 'exceeds_budget',
      payload_json: '{"policy_id":1,"amount":100}',
    });

    const { verifyChain } = await import('@/lib/resource-audit-chain-verifier');
    const result = verifyChain('resource_decision_audit', db);

    expect(result.ok).toBe(true);
    expect(result.mismatches).toHaveLength(0);
    expect(result.rows_walked).toBe(3);
    expect(result.last_verified_id).toBe(3);

    const cursor = db
      .prepare(
        `SELECT last_verified_id, verification_status FROM governance_audit_verification_state WHERE table_name = ?`,
      )
      .get('resource_decision_audit') as {
      last_verified_id: number;
      verification_status: string;
    };
    expect(cursor.last_verified_id).toBe(3);
    expect(cursor.verification_status).toBe('ok');
  });

  it('detects mid-chain row_hash tampering', async () => {
    appendDecisionRow({
      decision_id: 'genesis',
      actor: 'system',
      decision: 'genesis',
      reason: 'initial',
      payload_json: '{}',
    });
    appendDecisionRow({
      decision_id: 'd-001',
      actor: 'aegis',
      decision: 'allow',
      reason: 'r1',
      payload_json: '{"a":1}',
    });
    appendDecisionRow({
      decision_id: 'd-002',
      actor: 'aegis',
      decision: 'allow',
      reason: 'r2',
      payload_json: '{"a":2}',
    });

    // Tamper: rewrite row 2's payload without recomputing row_hash.
    db.prepare(
      `UPDATE resource_decision_audit SET payload_json = ? WHERE id = ?`,
    ).run('{"tampered":true}', 2);

    const { verifyChain } = await import('@/lib/resource-audit-chain-verifier');
    const result = verifyChain('resource_decision_audit', db);

    expect(result.ok).toBe(false);
    expect(result.mismatches.length).toBeGreaterThanOrEqual(1);
    const tamperedRow = result.mismatches.find((m) => m.row_id === 2);
    expect(tamperedRow).toBeDefined();
    expect(tamperedRow?.reason).toBe('row_hash_mismatch');

    const cursor = db
      .prepare(
        `SELECT verification_status FROM governance_audit_verification_state WHERE table_name = ?`,
      )
      .get('resource_decision_audit') as { verification_status: string };
    expect(cursor.verification_status).toBe('mismatch');
  });

  it('resume from cursor does not re-walk already-verified rows', async () => {
    appendDecisionRow({
      decision_id: 'genesis',
      actor: 'system',
      decision: 'genesis',
      reason: 'initial',
      payload_json: '{}',
    });
    appendDecisionRow({
      decision_id: 'd-001',
      actor: 'a',
      decision: 'allow',
      reason: 'r1',
      payload_json: '{"a":1}',
    });

    const { verifyChain } = await import('@/lib/resource-audit-chain-verifier');
    const first = verifyChain('resource_decision_audit', db);
    expect(first.rows_walked).toBe(2);
    expect(first.last_verified_id).toBe(2);

    // Append a third row.
    appendDecisionRow({
      decision_id: 'd-002',
      actor: 'a',
      decision: 'deny',
      reason: 'r2',
      payload_json: '{"a":2}',
    });

    const second = verifyChain('resource_decision_audit', db);
    // Resume from cursor — only the third row is walked.
    expect(second.rows_walked).toBe(1);
    expect(second.last_verified_id).toBe(3);
    expect(second.ok).toBe(true);
  });

  it('mode=full restarts walk from genesis', async () => {
    appendDecisionRow({
      decision_id: 'genesis',
      actor: 'system',
      decision: 'genesis',
      reason: 'initial',
      payload_json: '{}',
    });
    appendDecisionRow({
      decision_id: 'd-001',
      actor: 'a',
      decision: 'allow',
      reason: 'r1',
      payload_json: '{"a":1}',
    });

    const { verifyChain } = await import('@/lib/resource-audit-chain-verifier');
    verifyChain('resource_decision_audit', db); // advance cursor

    const full = verifyChain('resource_decision_audit', db, { mode: 'full' });
    expect(full.rows_walked).toBe(2);
    expect(full.last_verified_id).toBe(2);
  });
});

describe('SPEC-008 verifyChain — recovery_action JCS chain', () => {
  it('clean recovery_action chain returns ok=true', async () => {
    appendRecoveryRow({
      kind: 'override_grant',
      actor: 'op',
      scope_kind: 'workspace',
      scope_id: 1,
      content: { kind: 'override_grant', amount: 50, policy_id: 100 },
    });
    appendRecoveryRow({
      kind: 'override_revoke',
      actor: 'op',
      scope_kind: 'workspace',
      scope_id: 1,
      content: {
        kind: 'override_revoke',
        override_id: 1,
        actor: 'op',
        revoked_at: '2026-05-03T00:00:00.000Z',
        reservation_id: null,
        scope_kind: 'workspace',
        scope_id: 1,
        policy_id: 100,
      },
    });

    const { verifyChain } = await import('@/lib/resource-audit-chain-verifier');
    const result = verifyChain('recovery_action', db);

    expect(result.ok).toBe(true);
    expect(result.rows_walked).toBe(2);
    expect(result.mismatches).toHaveLength(0);
  });

  it('detects payload tamper in recovery_action JCS chain', async () => {
    appendRecoveryRow({
      kind: 'override_grant',
      actor: 'op',
      scope_kind: 'workspace',
      scope_id: 1,
      content: { kind: 'override_grant', amount: 50 },
    });

    // Tamper with payload JSON without recomputing row_hash.
    db.prepare(
      `UPDATE recovery_action SET payload_json = ? WHERE id = ?`,
    ).run(JSON.stringify({ kind: 'override_grant', amount: 9999 }), 1);

    const { verifyChain } = await import('@/lib/resource-audit-chain-verifier');
    const result = verifyChain('recovery_action', db);
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.reason === 'row_hash_mismatch')).toBe(true);
  });
});

describe('SPEC-008 verifyChain — archive cross-check', () => {
  it('returns no_archives when retention/archive writer not yet active', async () => {
    appendDecisionRow({
      decision_id: 'genesis',
      actor: 'system',
      decision: 'genesis',
      reason: 'initial',
      payload_json: '{}',
    });

    const { verifyChain } = await import('@/lib/resource-audit-chain-verifier');
    const result = verifyChain('resource_decision_audit', db);

    expect(result.archive_cross_check).toBe('no_archives');
  });
});

describe('SPEC-008 verifyAllChains — multi-chain walk', () => {
  it('returns one result per chain', async () => {
    appendDecisionRow({
      decision_id: 'genesis',
      actor: 'system',
      decision: 'genesis',
      reason: 'initial',
      payload_json: '{}',
    });
    appendRecoveryRow({
      kind: 'override_grant',
      actor: 'op',
      scope_kind: 'workspace',
      scope_id: 1,
      content: { kind: 'override_grant' },
    });

    const { verifyAllChains } = await import(
      '@/lib/resource-audit-chain-verifier'
    );
    const results = verifyAllChains(db);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.table)).toEqual([
      'resource_decision_audit',
      'resource_budget_ledger',
      'recovery_action',
    ]);
    // resource_budget_ledger has no rows in this test → walk returns 0.
    expect(
      results.find((r) => r.table === 'resource_budget_ledger')?.rows_walked,
    ).toBe(0);
  });
});
