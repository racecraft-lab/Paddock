/**
 * SPEC-008 — `governance_health_events` writer (T232).
 *
 * Per FR-090c, FR-090f, FR-090k, FR-090e1. Single shared primitive
 * the collector / API-key rotator / backup script / disk-hysteresis
 * monitor all call. Each event is a JSON-serialized payload appended
 * to the `governance_health_events` table (rerun-safe via append-only
 * semantics).
 *
 * @see specs/008-resource-governance/tasks.md T232
 */

import type Database from 'better-sqlite3';

export type GovernanceHealthEventKind =
  | 'collector_unavailable'
  | 'collector_recovered'
  | 'otelcol_key_rotated'
  | 'backup_started'
  | 'backup_completed'
  | 'backup_failed'
  | 'disk_full_pause'
  | 'disk_full_resume'
  | 'reconciler_health_degraded'
  | 'reconciler_health_recovered';

export interface HealthEventInput {
  kind: GovernanceHealthEventKind;
  source: string;
  payload: Record<string, unknown>;
}

/**
 * Append one health event row. The caller is expected to have
 * prepared the table (M65m / M70 lineage) — this writer does NOT
 * create the table.
 */
export function writeHealthEvent(
  db: Database.Database,
  input: HealthEventInput,
): void {
  db.prepare(
    `INSERT INTO governance_health_events
        (kind, source, payload_json, captured_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
  ).run(input.kind, input.source, JSON.stringify(input.payload));
}
