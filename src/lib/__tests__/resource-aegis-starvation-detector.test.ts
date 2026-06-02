/**
 * SPEC-008 — Tests for `src/lib/resource-aegis-starvation-detector.ts` (T132).
 *
 * Verifies the FR-161 starvation contract:
 *   - Counts tasks stuck in `status='quality_review'` whose
 *     `updated_at` has not progressed in the last 5 minutes.
 *   - Publishes the gauge metric `mc.governance.aegis_review_pipeline_starvation_count`.
 *   - Escalates to `governance_aegis_starvation_detected` activity
 *     when the per-workspace count exceeds the threshold (default 50).
 *   - De-dups alert emission per (workspace, hour) so repeated ticks
 *     within the same hour do not spam the alert path.
 *
 * @see specs/008-resource-governance/spec.md FR-161
 * @see specs/008-resource-governance/tasks.md T132
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;
let db: Database.Database;
const NOW_MS = 1_900_000_000_000; // Stable test clock.

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-aegis-starvation-'));
  process.env['PADDOCK_DATA_DIR'] = tempDir;
  process.env['PADDOCK_DB_PATH'] = join(tempDir, 'paddock.db');
  db = new Database(process.env['PADDOCK_DB_PATH']);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = 1');
  db.pragma('busy_timeout = 50');
  const { runMigrations } = await import('@/lib/migrations');
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
  // Reset the in-memory metrics registry so each test sees clean
  // counter state.
  const { resetMetrics } = await import('@/lib/observability/self-obs-metrics');
  resetMetrics();
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

/** Insert a task in `quality_review` status with controlled `updated_at`. */
function insertStuckTask(args: {
  workspace_id: number | null;
  updated_at_seconds: number;
}): void {
  db.prepare(
    `INSERT INTO tasks
       (title, status, priority, created_by, created_at, updated_at, workspace_id)
     VALUES ('stuck-aegis', 'quality_review', 'medium', 'system', ?, ?, ?)`,
  ).run(args.updated_at_seconds, args.updated_at_seconds, args.workspace_id);
}

describe('SPEC-008 resource-aegis-starvation-detector — FR-161', () => {
  it('returns zero count when no tasks are stuck', async () => {
    const { detectAegisStarvation } = await import(
      '@/lib/resource-aegis-starvation-detector'
    );
    const result = detectAegisStarvation({ db, now: new Date(NOW_MS) });
    expect(result.total_count).toBe(0);
    expect(result.alerts_emitted).toBe(0);
  });

  it('counts only tasks older than the 5-minute stale window', async () => {
    const cutoff = Math.floor(NOW_MS / 1000) - 5 * 60;
    insertStuckTask({ workspace_id: 1, updated_at_seconds: cutoff - 60 }); // stuck
    insertStuckTask({ workspace_id: 1, updated_at_seconds: cutoff - 60 }); // stuck
    insertStuckTask({ workspace_id: 1, updated_at_seconds: cutoff + 60 }); // fresh — within window
    const { detectAegisStarvation } = await import(
      '@/lib/resource-aegis-starvation-detector'
    );
    const result = detectAegisStarvation({ db, now: new Date(NOW_MS) });
    expect(result.total_count).toBe(2);
  });

  it('groups by workspace_id', async () => {
    const cutoff = Math.floor(NOW_MS / 1000) - 5 * 60;
    insertStuckTask({ workspace_id: 1, updated_at_seconds: cutoff - 60 });
    insertStuckTask({ workspace_id: 1, updated_at_seconds: cutoff - 60 });
    insertStuckTask({ workspace_id: 2, updated_at_seconds: cutoff - 60 });
    const { detectAegisStarvation } = await import(
      '@/lib/resource-aegis-starvation-detector'
    );
    const result = detectAegisStarvation({ db, now: new Date(NOW_MS) });
    expect(result.total_count).toBe(3);
    expect(result.per_workspace).toHaveLength(2);
  });

  it('escalates per-workspace when count > threshold', async () => {
    const cutoff = Math.floor(NOW_MS / 1000) - 5 * 60;
    // Use a very low threshold so we don't have to seed 50+ rows.
    for (let i = 0; i < 4; i++) {
      insertStuckTask({ workspace_id: 1, updated_at_seconds: cutoff - 60 });
    }
    const { detectAegisStarvation } = await import(
      '@/lib/resource-aegis-starvation-detector'
    );
    const result = detectAegisStarvation({
      db,
      now: new Date(NOW_MS),
      threshold: 3,
    });
    expect(result.total_count).toBe(4);
    expect(result.alerts_emitted).toBe(1);
  });

  it('de-dups alert emission per (workspace, hour)', async () => {
    const cutoff = Math.floor(NOW_MS / 1000) - 5 * 60;
    for (let i = 0; i < 4; i++) {
      insertStuckTask({ workspace_id: 1, updated_at_seconds: cutoff - 60 });
    }
    const { detectAegisStarvation } = await import(
      '@/lib/resource-aegis-starvation-detector'
    );
    const r1 = detectAegisStarvation({
      db,
      now: new Date(NOW_MS),
      threshold: 3,
    });
    const r2 = detectAegisStarvation({
      db,
      now: new Date(NOW_MS + 60_000), // 1 min later, same hour bucket
      threshold: 3,
    });
    expect(r1.alerts_emitted).toBe(1);
    expect(r2.alerts_emitted).toBe(0);
  });

  it('publishes the gauge metric', async () => {
    const cutoff = Math.floor(NOW_MS / 1000) - 5 * 60;
    insertStuckTask({ workspace_id: 1, updated_at_seconds: cutoff - 60 });
    insertStuckTask({ workspace_id: 1, updated_at_seconds: cutoff - 60 });
    const { detectAegisStarvation, AEGIS_STARVATION_METRIC } = await import(
      '@/lib/resource-aegis-starvation-detector'
    );
    detectAegisStarvation({ db, now: new Date(NOW_MS) });
    const { getMetricsSnapshot } = await import(
      '@/lib/observability/self-obs-metrics'
    );
    const snap = getMetricsSnapshot();
    const metric = snap.counters.find((c) => c.name === AEGIS_STARVATION_METRIC);
    expect(metric).toBeDefined();
  });
});
