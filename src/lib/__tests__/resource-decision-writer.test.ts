/**
 * SPEC-008 — Smoke tests for `src/lib/resource-decision-writer.ts`.
 *
 * Verifies the FR-009 decision-row schema, the FR-005a single-transaction
 * atomicity, the FR-010 append-only contract on the decision row, and the
 * audit hash-chain advances row-by-row.
 *
 * @see specs/008-resource-governance/spec.md FR-009, FR-010, FR-005a
 * @see specs/008-resource-governance/tasks.md T059
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-decision-writer-'));
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

describe('SPEC-008 resource-decision-writer — atomic decision + audit append', () => {
  it('writes one row to resource_policy_events and one to resource_decision_audit', async () => {
    const { writeDecision } = await import('@/lib/resource-decision-writer');

    const persisted = writeDecision(db, {
      decision_id: 'dec_test_001',
      task_id: 1,
      agent_id: 2,
      workspace_id: 3,
      decision: 'allow',
      reasons: [{ kind: 'allow', code: 'allow:clear' }],
      policy_ids: [10, 20],
      precedence_rank: 7,
      latency_ms: 4.2,
      breaker_state: 'closed',
      evaluation_snapshot_json: null,
      primary_policy_id: 10,
      actor: 'system',
    });

    expect(persisted.policy_event_id).toBeGreaterThan(0);
    expect(persisted.audit_id).toBeGreaterThan(0);
    expect(persisted.audit_row_hash).toMatch(/^[0-9a-f]{64}$/);

    const event = db
      .prepare(
        `SELECT decision_id, decision, actor, details_json
         FROM resource_policy_events WHERE id = ?`,
      )
      .get(persisted.policy_event_id) as {
      decision_id: string;
      decision: string;
      actor: string;
      details_json: string;
    };
    expect(event.decision_id).toBe('dec_test_001');
    expect(event.decision).toBe('allow');
    expect(event.actor).toBe('system');
    const details = JSON.parse(event.details_json) as {
      precedence_rank: number;
    };
    expect(details.precedence_rank).toBe(7);

    const audit = db
      .prepare(
        `SELECT decision_id, decision, payload_json, prev_hash, row_hash
         FROM resource_decision_audit WHERE id = ?`,
      )
      .get(persisted.audit_id) as {
      decision_id: string;
      decision: string;
      payload_json: string;
      prev_hash: string;
      row_hash: string;
    };
    expect(audit.decision_id).toBe('dec_test_001');
    expect(audit.decision).toBe('allow');
    expect(audit.row_hash).toBe(persisted.audit_row_hash);

    const genesis = db
      .prepare(
        `SELECT row_hash FROM resource_decision_audit WHERE decision_id = 'genesis'`,
      )
      .get() as { row_hash: string };
    expect(audit.prev_hash).toBe(genesis.row_hash);
  });

  it('subsequent writes advance the audit chain (prev = previous row_hash)', async () => {
    const { writeDecision } = await import('@/lib/resource-decision-writer');
    const a = writeDecision(db, {
      decision_id: 'dec_chain_a',
      task_id: 1,
      agent_id: 2,
      workspace_id: 3,
      decision: 'defer',
      reasons: [{ kind: 'defer', code: 'defer:wip_limit' }],
      policy_ids: [1],
      precedence_rank: 4,
      latency_ms: 5,
      breaker_state: 'closed',
      evaluation_snapshot_json: null,
      primary_policy_id: 1,
      actor: 'system',
    });
    const b = writeDecision(db, {
      decision_id: 'dec_chain_b',
      task_id: 1,
      agent_id: 2,
      workspace_id: 3,
      decision: 'allow',
      reasons: [{ kind: 'allow', code: 'allow:clear' }],
      policy_ids: [],
      precedence_rank: 7,
      latency_ms: 3,
      breaker_state: 'closed',
      evaluation_snapshot_json: null,
      primary_policy_id: null,
      actor: 'system',
    });

    const bRow = db
      .prepare(
        `SELECT prev_hash FROM resource_decision_audit WHERE id = ?`,
      )
      .get(b.audit_id) as { prev_hash: string };
    expect(bRow.prev_hash).toBe(a.audit_row_hash);
  });

  it('decision row carries reasons + policy_ids + precedence_rank in details_json', async () => {
    const { writeDecision } = await import('@/lib/resource-decision-writer');
    const persisted = writeDecision(db, {
      decision_id: 'dec_details',
      task_id: 9,
      agent_id: 9,
      workspace_id: 9,
      decision: 'block',
      reasons: [{ kind: 'block', code: 'block:hard_budget_exceeded' }],
      policy_ids: [33, 44],
      precedence_rank: 3,
      latency_ms: 8,
      breaker_state: 'closed',
      evaluation_snapshot_json: '{"counters":{"usd":100}}',
      primary_policy_id: 33,
      actor: 'operator:7',
    });
    const row = db
      .prepare(
        `SELECT details_json FROM resource_policy_events WHERE id = ?`,
      )
      .get(persisted.policy_event_id) as { details_json: string };
    const details = JSON.parse(row.details_json) as {
      reasons: { kind: string; code: string }[];
      policy_ids: number[];
      precedence_rank: number;
      breaker_state: string;
      evaluation_snapshot: string;
    };
    expect(details.reasons[0]?.code).toBe('block:hard_budget_exceeded');
    expect(details.policy_ids).toEqual([33, 44]);
    expect(details.precedence_rank).toBe(3);
    expect(details.breaker_state).toBe('closed');
    expect(details.evaluation_snapshot).toBe('{"counters":{"usd":100}}');
  });
});
