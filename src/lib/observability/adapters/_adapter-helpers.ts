/**
 * SPEC-008 — Shared helpers for ingest adapters (T094-T105).
 *
 * Adapters share a small surface:
 *   - `ensureSourceRegistered(db, args)` — idempotent INSERT OR IGNORE into
 *     `source_emission_capability` (M65a). Required because every
 *     `raw_usage_events.source_id` has a FK to that table. Mirrors the
 *     pattern in `local-health-channel.ts`.
 *   - `partitionMonthFromMs(ms)` — `YYYY-MM` partition key for M65b.
 *   - `insertRawUsageEvent(db, row)` — single-row insert into
 *     `raw_usage_events`. Returns the persisted id.
 *
 * @see specs/008-resource-governance/spec.md FR-076, FR-085, FR-087, FR-091
 * @see src/lib/migrations.ts (M65a, M65b)
 * @see specs/008-resource-governance/tasks.md T094..T105
 * @see Constitution Convention J — strict-scope module
 */

import type {
  DedupeConfidence,
  EnforcementEligibility,
  ReconcileStatus,
} from '@/types/observability';
import type Database from 'better-sqlite3';

/** Args for source-registration. */
export interface RegisterSourceArgs {
  source_id: string;
  display_name: string;
  enforcement_eligibility: EnforcementEligibility;
  dedupe_confidence_default: DedupeConfidence;
  expected_envelope_bytes: number;
}

/**
 * Idempotent INSERT OR IGNORE — register a source in
 * `source_emission_capability` so subsequent `raw_usage_events` inserts
 * satisfy the FK. Safe to call before every emit.
 */
export function ensureSourceRegistered(
  db: Database.Database,
  args: RegisterSourceArgs,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO source_emission_capability
       (source_id, display_name, enforcement_eligibility,
        dedupe_confidence_default, expected_envelope_bytes)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    args.source_id,
    args.display_name,
    args.enforcement_eligibility,
    args.dedupe_confidence_default,
    args.expected_envelope_bytes,
  );
}

/**
 * Compute partition_month (YYYY-MM) from a millisecond timestamp.
 * Falls back to the current month when the timestamp is malformed.
 */
export function partitionMonthFromMs(ms: number): string {
  if (!Number.isFinite(ms)) return new Date().toISOString().slice(0, 7);
  return new Date(ms).toISOString().slice(0, 7);
}

/** Insert-shape for one `raw_usage_events` row. */
export interface RawUsageEventInsert {
  source_id: string;
  workspace_id: number | null;
  agent_id: number | null;
  task_id: number | null;
  provider: string | null;
  provider_request_id: string | null;
  provider_timestamp_ms: number | null;
  session_id: string | null;
  generation_id: number | null;
  raw_attributes_json: string;
  parser_version: string;
  schema_version_observed: string | null;
  reconcile_status: ReconcileStatus;
  dedupe_confidence: DedupeConfidence;
  enforcement_eligibility: EnforcementEligibility;
  partition_month: string;
}

/** Insert one raw event; returns the persisted id. */
export function insertRawUsageEvent(
  db: Database.Database,
  row: RawUsageEventInsert,
): number {
  const result = db
    .prepare(
      `INSERT INTO raw_usage_events
         (source_id, workspace_id, agent_id, task_id,
          provider, provider_request_id, provider_timestamp_ms,
          session_id, generation_id,
          raw_attributes_json, parser_version, schema_version_observed,
          reconcile_status, dedupe_confidence, enforcement_eligibility,
          partition_month)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.source_id,
      row.workspace_id,
      row.agent_id,
      row.task_id,
      row.provider,
      row.provider_request_id,
      row.provider_timestamp_ms,
      row.session_id,
      row.generation_id,
      row.raw_attributes_json,
      row.parser_version,
      row.schema_version_observed,
      row.reconcile_status,
      row.dedupe_confidence,
      row.enforcement_eligibility,
      row.partition_month,
    );
  return Number(result.lastInsertRowid);
}
