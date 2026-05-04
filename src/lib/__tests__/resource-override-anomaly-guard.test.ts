/**
 * SPEC-008 - Tests for override-anomaly auto-disable + re-enable (T144).
 *
 * Verifies:
 *   - 3+ defer:anomaly grants in 60min trips disable
 *   - 2 grants do NOT trip disable
 *   - Already-disabled user is idempotent (no re-disable, no double audit)
 *   - reEnableGrants on disabled user clears column + appends audit row
 *   - reEnableGrants on enabled user returns 'not_disabled'
 *   - reEnableGrants on missing user returns 'operator_not_found'
 *   - isGrantsDisabled mirrors the column state
 *
 * @see specs/008-resource-governance/spec.md FR-219d
 * @see specs/008-resource-governance/tasks.md T144
 */

import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANOMALY_THRESHOLD,
  ANOMALY_WINDOW_MS,
  isGrantsDisabled,
  recordAnomaly,
  reEnableGrants,
} from '@/lib/resource-override-anomaly-guard';

interface UserRow {
  id: number;
  governance_grants_disabled_at: string | null;
}

interface RecoveryRow {
  kind: string;
  payload_json: string;
}

const SCHEMA_USERS = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    governance_grants_disabled_at TEXT
  )
`;
const SCHEMA_OVERRIDES = `
  CREATE TABLE resource_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_kind TEXT NOT NULL,
    scope_id INTEGER,
    policy_id INTEGER,
    granted_amount REAL,
    granted_unit TEXT,
    reservation_id INTEGER,
    reason TEXT NOT NULL,
    actor TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    revoked_reason TEXT
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

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.prepare(SCHEMA_USERS).run();
  db.prepare(SCHEMA_OVERRIDES).run();
  db.prepare(SCHEMA_RECOVERY).run();
  return db;
}

function seedUser(db: Database.Database, username: string): number {
  const r = db
    .prepare(`INSERT INTO users (username) VALUES (?)`)
    .run(username);
  return Number(r.lastInsertRowid);
}

function seedAnomalyGrant(
  db: Database.Database,
  actor: string,
  ageMinutes: number,
  reason = 'defer:anomaly: hard_budget_breach',
  idemSuffix?: string,
): void {
  const granted = new Date(Date.now() - ageMinutes * 60_000).toISOString();
  const expires = new Date(Date.now() + 60_000).toISOString();
  db.prepare(
    `INSERT INTO resource_overrides
       (scope_kind, scope_id, reason, actor, idempotency_key,
        granted_at, expires_at)
     VALUES ('workspace', 1, ?, ?, ?, ?, ?)`,
  ).run(
    reason,
    actor,
    `key-${actor}-${ageMinutes.toString()}-${idemSuffix ?? Math.random().toString()}`,
    granted,
    expires,
  );
}

describe('SPEC-008 override-anomaly-guard (T144)', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
  });

  describe('isGrantsDisabled', () => {
    it('returns false for unknown actor', () => {
      expect(isGrantsDisabled('ghost', db)).toBe(false);
    });

    it('returns false when column is null', () => {
      seedUser(db, 'op');
      expect(isGrantsDisabled('op', db)).toBe(false);
    });

    it('returns true when column is non-null', () => {
      seedUser(db, 'op');
      db.prepare(
        `UPDATE users SET governance_grants_disabled_at = ? WHERE username = ?`,
      ).run('2026-05-03T00:00:00.000Z', 'op');
      expect(isGrantsDisabled('op', db)).toBe(true);
    });
  });

  describe('recordAnomaly', () => {
    it('does nothing when count < threshold', () => {
      seedUser(db, 'op');
      seedAnomalyGrant(db, 'op', 5);
      seedAnomalyGrant(db, 'op', 10);
      const tripped = recordAnomaly('op', db);
      expect(tripped).toBe(false);
      const row = db
        .prepare(
          `SELECT id, governance_grants_disabled_at FROM users WHERE username = ?`,
        )
        .get('op') as UserRow;
      expect(row.governance_grants_disabled_at).toBeNull();
    });

    it('trips disable when count meets threshold', () => {
      seedUser(db, 'op');
      // Seed THRESHOLD anomaly grants in window.
      for (let i = 0; i < ANOMALY_THRESHOLD; i++) {
        seedAnomalyGrant(db, 'op', i, undefined, `seed-${i.toString()}`);
      }
      const tripped = recordAnomaly('op', db);
      expect(tripped).toBe(true);
      const row = db
        .prepare(
          `SELECT id, governance_grants_disabled_at FROM users WHERE username = ?`,
        )
        .get('op') as UserRow;
      expect(row.governance_grants_disabled_at).not.toBeNull();
      // And a recovery_action audit row was appended.
      const recovery = db
        .prepare(
          `SELECT kind, payload_json FROM recovery_action ORDER BY id DESC LIMIT 1`,
        )
        .get() as RecoveryRow;
      expect(recovery.kind).toBe('operator_grant_capability_disabled');
      const payload = JSON.parse(recovery.payload_json) as Record<string, unknown>;
      const innerPayload = payload['payload'] as Record<string, unknown>;
      expect(innerPayload['anomaly_count']).toBe(ANOMALY_THRESHOLD);
      expect(innerPayload['threshold']).toBe(ANOMALY_THRESHOLD);
      expect(innerPayload['window_ms']).toBe(ANOMALY_WINDOW_MS);
    });

    it('does NOT count grants outside the 60-min window', () => {
      seedUser(db, 'op');
      // 3 grants but two are outside the window (90min ago).
      seedAnomalyGrant(db, 'op', 90, undefined, 'a');
      seedAnomalyGrant(db, 'op', 90, undefined, 'b');
      seedAnomalyGrant(db, 'op', 5, undefined, 'c');
      const tripped = recordAnomaly('op', db);
      expect(tripped).toBe(false);
    });

    it('idempotent on already-disabled user (no second audit row)', () => {
      seedUser(db, 'op');
      for (let i = 0; i < ANOMALY_THRESHOLD; i++) {
        seedAnomalyGrant(db, 'op', i, undefined, `seed-${i.toString()}`);
      }
      expect(recordAnomaly('op', db)).toBe(true);
      const audit1 = db
        .prepare(`SELECT COUNT(*) AS cnt FROM recovery_action`)
        .get() as { cnt: number };
      expect(audit1.cnt).toBe(1);

      // Re-call: column is already non-null, should be no-op.
      expect(recordAnomaly('op', db)).toBe(false);
      const audit2 = db
        .prepare(`SELECT COUNT(*) AS cnt FROM recovery_action`)
        .get() as { cnt: number };
      expect(audit2.cnt).toBe(1);
    });

    it('returns false for unknown actor', () => {
      expect(recordAnomaly('ghost', db)).toBe(false);
    });
  });

  describe('reEnableGrants', () => {
    it('returns operator_not_found for missing user', () => {
      const res = reEnableGrants(99, 1, 'restoring access', db);
      expect(res.ok).toBe(false);
      expect((res as { code: string }).code).toBe('operator_not_found');
    });

    it('returns not_disabled when user was never disabled', () => {
      const operatorId = seedUser(db, 'op');
      const adminId = seedUser(db, 'admin');
      const res = reEnableGrants(operatorId, adminId, 'restore', db);
      expect(res.ok).toBe(false);
      expect((res as { code: string }).code).toBe('not_disabled');
    });

    it('clears the column and appends audit row when previously disabled', () => {
      const operatorId = seedUser(db, 'op');
      const adminId = seedUser(db, 'admin');
      // Disable manually.
      db.prepare(
        `UPDATE users SET governance_grants_disabled_at = ? WHERE id = ?`,
      ).run('2026-05-03T00:00:00.000Z', operatorId);

      const res = reEnableGrants(
        operatorId,
        adminId,
        'reviewed manually',
        db,
      );
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.before).toBe('2026-05-03T00:00:00.000Z');
        expect(res.after).toBeNull();
        expect(res.audit_row_hash).toMatch(/^[a-f0-9]{64}$/);
      }

      const row = db
        .prepare(
          `SELECT governance_grants_disabled_at FROM users WHERE id = ?`,
        )
        .get(operatorId) as { governance_grants_disabled_at: string | null };
      expect(row.governance_grants_disabled_at).toBeNull();

      const recovery = db
        .prepare(
          `SELECT kind, payload_json FROM recovery_action ORDER BY id DESC LIMIT 1`,
        )
        .get() as RecoveryRow;
      expect(recovery.kind).toBe('operator_grant_capability_restored');
      const payload = JSON.parse(recovery.payload_json) as Record<string, unknown>;
      const innerPayload = payload['payload'] as Record<string, unknown>;
      expect(innerPayload['admin_user_id']).toBe(adminId);
      expect(innerPayload['reason']).toBe('reviewed manually');
    });
  });
});
