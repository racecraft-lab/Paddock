/**
 * SPEC-008 — Smoke tests for `src/lib/resource-budget-ledger.ts`.
 *
 * These tests are NOT marked T-RED in tasks.md (the T-RED tests for the
 * ledger live under T077/T070 drift and reconciler suites). The smoke tests
 * here cover the FR-176a / FR-219m append-only contract that is implicit in
 * the writer surface so a regression in the ledger writer can never go
 * undetected.
 *
 * @see specs/008-resource-governance/spec.md FR-051, FR-061, FR-176a,
 *      FR-219m
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-budget-ledger-'));
  process.env.PADDOCK_DATA_DIR = tempDir;
  process.env.PADDOCK_DB_PATH = join(tempDir, 'paddock.db');
  db = new Database(process.env.PADDOCK_DB_PATH);
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
  delete process.env.PADDOCK_DATA_DIR;
  delete process.env.PADDOCK_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('SPEC-008 resource-budget-ledger — append + chain integrity', () => {
  it('appendLedger links prev_hash to the genesis row on first append', async () => {
    const { appendLedger, GENESIS_PREV_HASH } = await import('@/lib/resource-budget-ledger');

    const genesis = db
      .prepare(
        `SELECT row_hash FROM resource_budget_ledger WHERE prev_hash = ? AND policy_id = 0`,
      )
      .get(GENESIS_PREV_HASH) as { row_hash: string };

    const tx = db.transaction(() =>
      appendLedger(db, {
        policy_id: 7,
        counter_id: null,
        window_start: '2026-05-01T00:00:00Z',
        kind: 'debit',
        amount: 12.5,
        unit: 'usd',
        source_event_id: null,
        decision_id: null,
        notes_json: null,
      }),
    );
    const row = tx();

    expect(row.prev_hash).toBe(genesis.row_hash);
    expect(row.row_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.partition_month).toBe('2026-05');
  });

  it('chain advances row-by-row with prev_hash = previous row_hash', async () => {
    const { appendLedger } = await import('@/lib/resource-budget-ledger');

    const append = (kind: 'debit' | 'credit', amt: number) =>
      db.transaction(() =>
        appendLedger(db, {
          policy_id: 11,
          counter_id: null,
          window_start: '2026-05-01T00:00:00Z',
          kind,
          amount: amt,
          unit: 'usd',
          source_event_id: null,
          decision_id: null,
          notes_json: null,
        }),
      )();

    const a = append('debit', 1);
    const b = append('debit', 2);
    const c = append('credit', 1);

    expect(b.prev_hash).toBe(a.row_hash);
    expect(c.prev_hash).toBe(b.row_hash);
  });

  it('UPDATE on resource_budget_ledger is rejected (FR-176a trigger)', async () => {
    const { appendLedger } = await import('@/lib/resource-budget-ledger');
    const row = db.transaction(() =>
      appendLedger(db, {
        policy_id: 1,
        counter_id: null,
        window_start: '2026-05-01T00:00:00Z',
        kind: 'debit',
        amount: 1,
        unit: 'usd',
        source_event_id: null,
        decision_id: null,
        notes_json: null,
      }),
    )();
    expect(() =>
      db
        .prepare(`UPDATE resource_budget_ledger SET amount = 999 WHERE id = ?`)
        .run(row.id),
    ).toThrow(/append-only/i);
  });

  it('sumLedger returns sum across the requested kinds', async () => {
    const { appendLedger, sumLedger } = await import('@/lib/resource-budget-ledger');
    const append = (kind: 'debit' | 'credit', amt: number) =>
      db.transaction(() =>
        appendLedger(db, {
          policy_id: 21,
          counter_id: null,
          window_start: '2026-05-01T00:00:00Z',
          kind,
          amount: amt,
          unit: 'usd',
          source_event_id: null,
          decision_id: null,
          notes_json: null,
        }),
      )();

    append('debit', 5);
    append('debit', 3);
    append('credit', 2);

    const debitsOnly = sumLedger(db, {
      policy_id: 21,
      window_start: '2026-05-01T00:00:00Z',
      unit: 'usd',
      kinds: ['debit'],
    });
    expect(debitsOnly).toBe(8);
  });
});
