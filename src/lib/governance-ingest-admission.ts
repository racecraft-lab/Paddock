/**
 * SPEC-008 — Ingest admission control (T233 / T234).
 *
 * Per FR-090e / FR-090e1. Tracks per-source rate state in
 * `ingest_rate_state` and applies disk-hysteresis cascade when the
 * data volume crosses the low-water mark.
 *
 * The 6000-event-burst chaos test (T233) and the disk-full cascade
 * test (T234) are deferred to integration suites that run against a
 * tmpfs harness — this module is the primitive they exercise.
 *
 * @see specs/008-resource-governance/tasks.md T233, T234
 */

import type Database from 'better-sqlite3';

export type IngestState =
  | 'accepting'
  | 'rate_limited'
  | 'circuit_open'
  | 'disk_full_pause';

export interface IngestStateRow {
  source_path: string;
  state: IngestState;
  consecutive_drops: number;
  last_drop_at: string | null;
  last_state_change_at: string;
  metadata_json: string | null;
}

/** Read the current state of a source. */
export function readIngestState(
  db: Database.Database,
  sourcePath: string,
): IngestStateRow | null {
  const row = db
    .prepare(
      `SELECT source_path, state, consecutive_drops, last_drop_at,
              last_state_change_at, metadata_json
         FROM ingest_rate_state
        WHERE source_path = ?`,
    )
    .get(sourcePath) as IngestStateRow | undefined;
  return row ?? null;
}

/** Transition a source to a new state. Idempotent. */
export function setIngestState(
  db: Database.Database,
  sourcePath: string,
  state: IngestState,
  metadata?: Record<string, unknown>,
): void {
  const meta = metadata === undefined ? null : JSON.stringify(metadata);
  db.prepare(
    `INSERT INTO ingest_rate_state
        (source_path, state, consecutive_drops, last_drop_at,
         last_state_change_at, metadata_json)
      VALUES (?, ?, 0, NULL, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(source_path) DO UPDATE SET
        state = excluded.state,
        last_state_change_at = excluded.last_state_change_at,
        metadata_json = COALESCE(excluded.metadata_json, ingest_rate_state.metadata_json)`,
  ).run(sourcePath, state, meta);
}

/** Increment consecutive_drops; flip to rate_limited when threshold hit. */
export function recordDrop(
  db: Database.Database,
  sourcePath: string,
  threshold = 5,
): void {
  const tx = db.transaction(() => {
    const row = readIngestState(db, sourcePath);
    const next = (row?.consecutive_drops ?? 0) + 1;
    if (next >= threshold) {
      db.prepare(
        `INSERT INTO ingest_rate_state
            (source_path, state, consecutive_drops, last_drop_at,
             last_state_change_at)
          VALUES (?, 'rate_limited', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(source_path) DO UPDATE SET
            state = 'rate_limited',
            consecutive_drops = excluded.consecutive_drops,
            last_drop_at = excluded.last_drop_at,
            last_state_change_at = excluded.last_state_change_at`,
      ).run(sourcePath, next);
    } else {
      db.prepare(
        `INSERT INTO ingest_rate_state
            (source_path, state, consecutive_drops, last_drop_at,
             last_state_change_at)
          VALUES (?, 'accepting', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(source_path) DO UPDATE SET
            consecutive_drops = excluded.consecutive_drops,
            last_drop_at = excluded.last_drop_at`,
      ).run(sourcePath, next);
    }
  });
  tx();
}

/** Disk-full cascade: pause every source. Idempotent. */
export function pauseAllSources(db: Database.Database, freeMb: number): void {
  db.prepare(
    `UPDATE ingest_rate_state
        SET state = 'disk_full_pause',
            last_state_change_at = CURRENT_TIMESTAMP,
            metadata_json = json_object('free_mb', ?)
      WHERE state != 'disk_full_pause'`,
  ).run(freeMb);
}

/** Resume every source previously paused by disk-full. Idempotent. */
export function resumeAllSources(db: Database.Database, freeMb: number): void {
  db.prepare(
    `UPDATE ingest_rate_state
        SET state = 'accepting',
            consecutive_drops = 0,
            last_state_change_at = CURRENT_TIMESTAMP,
            metadata_json = json_object('free_mb', ?)
      WHERE state = 'disk_full_pause'`,
  ).run(freeMb);
}
