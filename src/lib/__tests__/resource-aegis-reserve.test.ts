/**
 * SPEC-008 — Tests for `src/lib/resource-aegis-reserve.ts` (T133 RED, T127 GREEN).
 *
 * Verifies the FR-152..FR-160 emergency-reserve contract and the FR-361
 * fallback chain interactions:
 *
 *   AC-Aegis-1 — reserve depletion → next call returns
 *                code='reserve_depleted'.
 *   AC-Aegis-2 — blackout precedence over reserve (FR-162): even with
 *                reserve available, the evaluator's blackout signal blocks
 *                the dispatch path. (Verified through allocateFromReserve's
 *                explicit blackout-window check option.)
 *   AC-Aegis-3 — local-mode handoff: when reserve is depleted AND
 *                LM Studio is reachable, the chain advances to step 3.
 *   AC-Aegis-4 — `defer:deferred_no_fallback` is the terminal state when
 *                reserve is depleted AND LM Studio is absent.
 *   AC-Aegis-5 — `replenishReserve` resets balance to seeded amounts on
 *                policy window roll.
 *   AC-Aegis-6 — `depletionAlert` fires once per (workspace, hour) and
 *                no more, even on repeated calls.
 *
 * Test pattern follows `resource-evaluator.test.ts`: mkdtempSync fixture,
 * full migration suite, and explicit `closeAllConnections()` in afterEach
 * so vitest workers cannot share state.
 *
 * @see specs/008-resource-governance/spec.md FR-152, FR-153, FR-155,
 *      FR-157, FR-158, FR-160, FR-162, FR-361, FR-363
 * @see specs/008-resource-governance/tasks.md T127, T133
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;
const TEST_WORKSPACE_ID = 42;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-aegis-reserve-'));
  process.env['MISSION_CONTROL_DATA_DIR'] = tempDir;
  process.env['MISSION_CONTROL_DB_PATH'] = join(tempDir, 'mission-control.db');
  db = new Database(process.env['MISSION_CONTROL_DB_PATH']);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = 1');
  db.pragma('busy_timeout = 50');
  const { runMigrations } = await import('@/lib/migrations');
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
  // Seed a workspace reserve row so each test starts from a known
  // balance. The seed amounts match FR-152 default values referenced in
  // the test prompt; production loads from M68 templates / governance.json.
  db.prepare(
    `INSERT INTO aegis_emergency_reserves
       (workspace_id, usd_remaining, tokens_remaining, usd_seed, tokens_seed,
        last_replenished_at)
     VALUES (?, 5.00, 1000000, 5.00, 1000000, CURRENT_TIMESTAMP)`,
  ).run(TEST_WORKSPACE_ID);
});

afterEach(async () => {
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
  rmSync(tempDir, { recursive: true, force: true });
});

describe('resource-aegis-reserve', () => {
  describe('getEmergencyReserve', () => {
    it('returns the seeded balance for a freshly replenished reserve', async () => {
      const { getEmergencyReserve } = await import('@/lib/resource-aegis-reserve');
      const snap = getEmergencyReserve(TEST_WORKSPACE_ID, db);
      expect(snap.usd_remaining).toBe(5.0);
      expect(snap.tokens_remaining).toBe(1_000_000);
      expect(snap.depleted_at).toBeNull();
      expect(snap.last_replenished_at).not.toBeNull();
    });

    it('returns null balance when no reserve row exists', async () => {
      const { getEmergencyReserve } = await import('@/lib/resource-aegis-reserve');
      const snap = getEmergencyReserve(/* nonexistent */ 999, db);
      expect(snap.usd_remaining).toBe(0);
      expect(snap.tokens_remaining).toBe(0);
    });
  });

  describe('AC-Aegis-1 — reserve depletion', () => {
    it('next call returns code=reserve_depleted once balance hits 0', async () => {
      const { allocateFromReserve, getEmergencyReserve } = await import(
        '@/lib/resource-aegis-reserve'
      );
      // Fully drain in one allocation.
      const firstResult = allocateFromReserve(
        TEST_WORKSPACE_ID,
        { usd: 5.0, tokens: 1_000_000 },
        db,
      );
      expect(firstResult.ok).toBe(true);
      // Now the reserve is empty — the next allocation MUST decline.
      const secondResult = allocateFromReserve(
        TEST_WORKSPACE_ID,
        { usd: 0.01, tokens: 1 },
        db,
      );
      expect(secondResult.ok).toBe(false);
      if (!secondResult.ok) {
        expect(secondResult.code).toBe('reserve_depleted');
      }
      // Side-effect: the reserve row carries `depleted_at`.
      const snap = getEmergencyReserve(TEST_WORKSPACE_ID, db);
      expect(snap.depleted_at).not.toBeNull();
      expect(snap.usd_remaining).toBe(0);
    });

    it('partial allocation reduces balance but stays > 0', async () => {
      const { allocateFromReserve, getEmergencyReserve } = await import(
        '@/lib/resource-aegis-reserve'
      );
      const r = allocateFromReserve(
        TEST_WORKSPACE_ID,
        { usd: 1.0, tokens: 100 },
        db,
      );
      expect(r.ok).toBe(true);
      const snap = getEmergencyReserve(TEST_WORKSPACE_ID, db);
      expect(snap.usd_remaining).toBe(4.0);
      expect(snap.tokens_remaining).toBe(999_900);
      expect(snap.depleted_at).toBeNull();
    });
  });

  describe('AC-Aegis-2 — blackout precedence over reserve (FR-162)', () => {
    it('blackout context blocks reserve allocation even with balance available', async () => {
      const { allocateFromReserve } = await import('@/lib/resource-aegis-reserve');
      const r = allocateFromReserve(
        TEST_WORKSPACE_ID,
        { usd: 0.5, tokens: 100, blackout_active: true },
        db,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('reserve_blackout');
      }
    });
  });

  describe('AC-Aegis-5 — replenishment resets balance', () => {
    it('replenishReserve restores seeded usd + tokens and clears depleted_at', async () => {
      const { allocateFromReserve, replenishReserve, getEmergencyReserve } =
        await import('@/lib/resource-aegis-reserve');
      // Drain.
      allocateFromReserve(
        TEST_WORKSPACE_ID,
        { usd: 5.0, tokens: 1_000_000 },
        db,
      );
      const drained = getEmergencyReserve(TEST_WORKSPACE_ID, db);
      expect(drained.depleted_at).not.toBeNull();
      // Replenish on policy window roll.
      replenishReserve(TEST_WORKSPACE_ID, db);
      const after = getEmergencyReserve(TEST_WORKSPACE_ID, db);
      expect(after.usd_remaining).toBe(5.0);
      expect(after.tokens_remaining).toBe(1_000_000);
      expect(after.depleted_at).toBeNull();
    });
  });

  describe('AC-Aegis-6 — depletion alert de-dup per (workspace, hour)', () => {
    it('emits one activity row per hour bucket regardless of repeated calls', async () => {
      const { allocateFromReserve, depletionAlert } = await import(
        '@/lib/resource-aegis-reserve'
      );
      // Drain to set depleted_at.
      allocateFromReserve(
        TEST_WORKSPACE_ID,
        { usd: 5.0, tokens: 1_000_000 },
        db,
      );
      // Three calls in quick succession.
      const a = depletionAlert(TEST_WORKSPACE_ID, db);
      const b = depletionAlert(TEST_WORKSPACE_ID, db);
      const c = depletionAlert(TEST_WORKSPACE_ID, db);
      expect(a.emitted).toBe(true);
      expect(b.emitted).toBe(false);
      expect(c.emitted).toBe(false);
    });

    it('does not emit when reserve has not yet hit 0', async () => {
      const { depletionAlert } = await import('@/lib/resource-aegis-reserve');
      const r = depletionAlert(TEST_WORKSPACE_ID, db);
      expect(r.emitted).toBe(false);
    });
  });

  describe('AC-Aegis-3 / AC-Aegis-4 — chain handoff via fallback recorder', () => {
    // The full evaluator chain integration is exercised in
    // `resource-evaluator.test.ts` (T128 wiring); here we validate the
    // building-block contract that resource-aegis-fallback-activity emits
    // step rows that the evaluator chain consumes. This keeps T133 file-
    // scoped per the test-pattern convention while still asserting the
    // FR-361 step ordering invariants.
    it('records `emergency_reserve` step exactly once per (workspace, hour)', async () => {
      const { recordAegisFallback } = await import(
        '@/lib/resource-aegis-fallback-activity'
      );
      const r1 = recordAegisFallback(TEST_WORKSPACE_ID, 'emergency_reserve', db);
      const r2 = recordAegisFallback(TEST_WORKSPACE_ID, 'emergency_reserve', db);
      expect(r1.emitted).toBe(true);
      expect(r2.emitted).toBe(false);
    });

    it('records `local_mode` and `deferred_no_fallback` independently', async () => {
      const { recordAegisFallback } = await import(
        '@/lib/resource-aegis-fallback-activity'
      );
      const local = recordAegisFallback(TEST_WORKSPACE_ID, 'local_mode', db);
      const terminal = recordAegisFallback(
        TEST_WORKSPACE_ID,
        'deferred_no_fallback',
        db,
      );
      expect(local.emitted).toBe(true);
      expect(terminal.emitted).toBe(true);
    });
  });
});
