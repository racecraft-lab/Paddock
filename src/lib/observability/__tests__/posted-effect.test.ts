/**
 * SPEC-008 — Tests for `src/lib/observability/posted-effect.ts` (T082).
 *
 * Acceptance: FR-093, FR-104. The lifecycle is derived from M65d
 * (posted_at, reverted_at, reverted_reason) plus the existence of
 * correction_ledger sibling rows.
 *
 * @see specs/008-resource-governance/tasks.md T082
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getPostedEffectState,
  isAllowedPostedEffectTransition,
  transitionPostedEffect,
} from '../posted-effect';

function setupSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE canonical_budget_effects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_event_id INTEGER NOT NULL,
      policy_id INTEGER NOT NULL,
      counter_id INTEGER NOT NULL,
      window_start TEXT NOT NULL,
      amount REAL NOT NULL,
      unit TEXT NOT NULL,
      posted_at TEXT,
      reverted_at TEXT,
      reverted_reason TEXT,
      UNIQUE(canonical_event_id, policy_id, counter_id, window_start)
    );
    CREATE TABLE correction_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_event_id INTEGER NOT NULL,
      prior_amount REAL NOT NULL,
      corrected_amount REAL NOT NULL,
      delta REAL NOT NULL,
      reason TEXT NOT NULL,
      ledger_entry_id INTEGER,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_by TEXT NOT NULL,
      notes_json TEXT
    );
  `);
}

function insertEffect(
  db: Database.Database,
  canonical_event_id: number,
  state: 'pending' | 'posted',
): void {
  db.prepare(
    `INSERT INTO canonical_budget_effects
       (canonical_event_id, policy_id, counter_id, window_start,
        amount, unit, posted_at, reverted_at, reverted_reason)
     VALUES (?, 1, 1, '2026-05', 1.5, 'usd', ?, NULL, NULL)`,
  ).run(canonical_event_id, state === 'posted' ? '2026-05-01T12:00:00Z' : null);
}

function insertCorrection(db: Database.Database, canonical_event_id: number): void {
  db.prepare(
    `INSERT INTO correction_ledger
       (canonical_event_id, prior_amount, corrected_amount, delta, reason, applied_by)
     VALUES (?, 1.5, 1.6, 0.1, 'manual', 'operator:fred')`,
  ).run(canonical_event_id);
}

describe('observability/posted-effect', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    setupSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('isAllowedPostedEffectTransition', () => {
    it('permits the documented transitions only', () => {
      expect(isAllowedPostedEffectTransition('pending', 'posted')).toBe(true);
      expect(isAllowedPostedEffectTransition('pending', 'voided')).toBe(true);
      expect(isAllowedPostedEffectTransition('posted', 'corrected')).toBe(true);
      expect(isAllowedPostedEffectTransition('posted', 'voided')).toBe(true);
      expect(isAllowedPostedEffectTransition('corrected', 'corrected')).toBe(true);
      expect(isAllowedPostedEffectTransition('corrected', 'voided')).toBe(true);

      // Disallowed
      expect(isAllowedPostedEffectTransition('voided', 'posted')).toBe(false);
      expect(isAllowedPostedEffectTransition('voided', 'corrected')).toBe(false);
      expect(isAllowedPostedEffectTransition('pending', 'corrected')).toBe(false);
      expect(isAllowedPostedEffectTransition('posted', 'pending')).toBe(false);
      expect(isAllowedPostedEffectTransition('corrected', 'posted')).toBe(false);
    });
  });

  describe('getPostedEffectState (derived view)', () => {
    it('returns "pending" when posted_at IS NULL', () => {
      insertEffect(db, 1, 'pending');
      expect(getPostedEffectState(db, 1)).toBe('pending');
    });

    it('returns "posted" when posted_at IS NOT NULL and no correction row exists', () => {
      insertEffect(db, 1, 'posted');
      expect(getPostedEffectState(db, 1)).toBe('posted');
    });

    it('returns "corrected" when a correction_ledger row exists for the canonical id', () => {
      insertEffect(db, 1, 'posted');
      insertCorrection(db, 1);
      expect(getPostedEffectState(db, 1)).toBe('corrected');
    });

    it('returns "voided" when reverted_at IS NOT NULL (overrides everything else)', () => {
      insertEffect(db, 1, 'posted');
      insertCorrection(db, 1);
      db.prepare(
        `UPDATE canonical_budget_effects SET reverted_at = '2026-05-02T00:00:00Z',
                                                reverted_reason = 'manual_revert'
          WHERE canonical_event_id = ?`,
      ).run(1);
      expect(getPostedEffectState(db, 1)).toBe('voided');
    });

    it('throws when no row exists for the canonical id', () => {
      expect(() => getPostedEffectState(db, 99)).toThrow(/not found/);
    });
  });

  describe('transitionPostedEffect', () => {
    it('pending -> posted sets posted_at', () => {
      insertEffect(db, 1, 'pending');
      transitionPostedEffect(db, 1, 'pending', 'posted');
      expect(getPostedEffectState(db, 1)).toBe('posted');
      const row = db
        .prepare('SELECT posted_at FROM canonical_budget_effects WHERE canonical_event_id = ?')
        .get(1) as { posted_at: string };
      expect(row.posted_at).not.toBeNull();
    });

    it('pending -> voided sets reverted_at with reason=voided_pre_post', () => {
      insertEffect(db, 1, 'pending');
      transitionPostedEffect(db, 1, 'pending', 'voided');
      expect(getPostedEffectState(db, 1)).toBe('voided');
      const row = db
        .prepare(
          'SELECT reverted_reason FROM canonical_budget_effects WHERE canonical_event_id = ?',
        )
        .get(1) as { reverted_reason: string };
      expect(row.reverted_reason).toBe('voided_pre_post');
    });

    it('posted -> corrected requires a correction_ledger row to exist', () => {
      insertEffect(db, 1, 'posted');
      // No correction row yet -- transition would derive current='posted'
      // and the implementation should refuse the to=corrected transition
      // because the sibling correction_ledger row is missing.
      expect(() => { transitionPostedEffect(db, 1, 'posted', 'corrected'); }).toThrow(
        /correction_ledger/,
      );
    });

    it('corrected -> corrected after a correction_ledger row exists is idempotent', () => {
      insertEffect(db, 1, 'posted');
      // Caller (T081) appends a correction_ledger row inside the same tx
      // before invoking transitionPostedEffect. Once the row exists the
      // derived state is already 'corrected', so the lifecycle module
      // re-asserts via the corrected -> corrected idempotent transition.
      insertCorrection(db, 1);
      transitionPostedEffect(db, 1, 'corrected', 'corrected');
      expect(getPostedEffectState(db, 1)).toBe('corrected');
    });

    it('posted -> voided sets reverted_at with caller-supplied reason', () => {
      insertEffect(db, 1, 'posted');
      transitionPostedEffect(db, 1, 'posted', 'voided', 'late_cancellation');
      const row = db
        .prepare(
          'SELECT reverted_reason FROM canonical_budget_effects WHERE canonical_event_id = ?',
        )
        .get(1) as { reverted_reason: string };
      expect(row.reverted_reason).toBe('late_cancellation');
    });

    it('rejects transitions not in the allowed set', () => {
      insertEffect(db, 1, 'posted');
      expect(() => { transitionPostedEffect(db, 1, 'posted', 'pending'); }).toThrow(/not allowed/);
    });

    it('rejects optimistic-lock mismatch (current state differs from fromState)', () => {
      insertEffect(db, 1, 'posted');
      // Actual state is 'posted'; caller incorrectly passes 'pending'.
      expect(() => { transitionPostedEffect(db, 1, 'pending', 'voided'); }).toThrow(
        /optimistic lock/,
      );
    });

  });
});
