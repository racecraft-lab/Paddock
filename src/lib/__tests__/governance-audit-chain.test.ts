/**
 * SPEC-008 - Tests for unified appendChainEntry (T148).
 *
 * Verifies:
 *   - Empty chain seeds from GENESIS_PREV_HASH.
 *   - Tail row's row_hash becomes the next entry's prev_hash.
 *   - The computed row_hash is byte-equivalent to a manual chainHash
 *     invocation against the same content.
 *   - Multiple entries chain correctly (each links to its predecessor).
 *
 * @see specs/008-resource-governance/spec.md FR-368, FR-219o
 * @see specs/008-resource-governance/tasks.md T148
 */

import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendChainEntry,
  GENESIS_PREV_HASH,
} from '@/lib/governance-audit-chain';
import { chainHash } from '@/lib/resource-audit-chain';

interface RecoveryActionRow {
  id: number;
  prev_hash: string;
  row_hash: string;
}

const DDL = `
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

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // Mirror the M65m DDL for recovery_action minus FK constraints.
  db.prepare(DDL).run();
  return db;
}

describe('SPEC-008 governance-audit-chain (T148) - appendChainEntry', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
  });

  it('empty chain returns GENESIS_PREV_HASH as prev_hash', () => {
    const content = { kind: 'override_grant', actor: 'op', amount: 5 };
    const { prev_hash, row_hash } = appendChainEntry(
      'recovery_action',
      content,
      db,
    );
    expect(prev_hash).toBe(GENESIS_PREV_HASH);
    // row_hash is byte-equivalent with chainHash(GENESIS, content).
    expect(row_hash).toBe(chainHash(GENESIS_PREV_HASH, content));
  });

  it('next entry uses previous row_hash as prev_hash', () => {
    const first = appendChainEntry(
      'recovery_action',
      { kind: 'first', actor: 'a' },
      db,
    );
    db.prepare(
      `INSERT INTO recovery_action (kind, actor, prev_hash, row_hash, taken_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('first', 'a', first.prev_hash, first.row_hash, '2026-05-03T00:00:00.000Z');

    const second = appendChainEntry(
      'recovery_action',
      { kind: 'second', actor: 'b' },
      db,
    );
    expect(second.prev_hash).toBe(first.row_hash);
    expect(second.row_hash).toBe(
      chainHash(first.row_hash, { kind: 'second', actor: 'b' }),
    );
    expect(second.row_hash).not.toBe(first.row_hash);
  });

  it('chains three entries; each link is verifiable', () => {
    const persist = (content: unknown): { prev_hash: string; row_hash: string } => {
      const h = appendChainEntry('recovery_action', content, db);
      db.prepare(
        `INSERT INTO recovery_action (kind, actor, prev_hash, row_hash, taken_at)
         VALUES ('test', 'system', ?, ?, ?)`,
      ).run(h.prev_hash, h.row_hash, '2026-05-03T00:00:00.000Z');
      return h;
    };
    const a = persist({ n: 1 });
    const b = persist({ n: 2 });
    const c = persist({ n: 3 });

    expect(a.prev_hash).toBe(GENESIS_PREV_HASH);
    expect(b.prev_hash).toBe(a.row_hash);
    expect(c.prev_hash).toBe(b.row_hash);

    // Walk the chain back from disk and recompute.
    const rows = db
      .prepare(`SELECT id, prev_hash, row_hash FROM recovery_action ORDER BY id ASC`)
      .all() as RecoveryActionRow[];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.prev_hash).toBe(GENESIS_PREV_HASH);
    expect(rows[1]?.prev_hash).toBe(rows[0]?.row_hash);
    expect(rows[2]?.prev_hash).toBe(rows[1]?.row_hash);
  });

  it('content is canonicalized with sorted keys (key-order-independent hash)', () => {
    const a = appendChainEntry('recovery_action', { b: 2, a: 1 }, db);
    const b = appendChainEntry('recovery_action', { a: 1, b: 2 }, db);
    expect(a.row_hash).toBe(b.row_hash);
  });
});
