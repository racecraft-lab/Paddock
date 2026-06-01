/**
 * SPEC-008 — OTel-independent local health channel.
 *
 * Per FR-080 (local-health alternate ingest path), FR-116 (system health
 * surface even when OTel is down), FR-122 / FR-126 (per-source health
 * reporting), FR-283 (last-resort fallback when the OTel collector is
 * unreachable).
 *
 * The collector and gateway emit OTel via the standard pipeline
 * (raw_usage_events with `source_id ∈ {native_otel, gateway_otel,
 * cli_stdout_json, ...}`). When the collector is offline, Paddock
 * still needs a record of agent activity for triage and freshness
 * computation. `emitLocalHealth()` writes to the same `raw_usage_events`
 * table but with `source_id='local-health'` and
 * `parser_version='local-health-v1'`. Downstream consumers (reconciler,
 * freshness tracker, dashboards) treat it as a real source — but it is
 * tagged `enforcement_eligibility='reconciliation_only'` so it cannot
 * drive synchronous block decisions.
 *
 * The caller MAY pass `db` from any of the three connection-pool slots;
 * production wiring uses `getForegroundDb()` because the local-health
 * pings are sent on the request hot path.
 *
 * @see specs/008-resource-governance/spec.md FR-080, FR-116, FR-122,
 *      FR-126, FR-283
 * @see src/lib/migrations.ts (065b_raw_usage_events,
 *      065a_source_emission_capability)
 * @see specs/008-resource-governance/tasks.md T086
 * @see Constitution Convention J — strict-scope module
 */

import type Database from 'better-sqlite3';

/**
 * Local-health source id. Matches the row seeded in
 * `source_emission_capability` (see ensureLocalHealthRegistered below).
 */
export const LOCAL_HEALTH_SOURCE_ID = 'local-health';

/** Parser-version tag attached to every local-health raw row. */
export const LOCAL_HEALTH_PARSER_VERSION = 'local-health-v1';

/**
 * One local-health event payload. Mirrors the documented FR-080 shape:
 * a small structured ping carrying agent identification and a freeform
 * payload-id (`event` / `subtype`). All fields except `event` are
 * optional — the channel is intentionally permissive because it is the
 * fallback path.
 */
export interface LocalHealthEvent {
  /** Required. Discrete event tag, e.g., `agent_started`, `tool_invoked`. */
  event: string;
  workspace_id?: number | null;
  agent_id?: number | null;
  task_id?: number | null;
  session_id?: string | null;
  /** Free-form structured payload — JSON-serialized into raw_attributes_json. */
  payload?: Record<string, unknown>;
  /** Provider-stamped time. Defaults to Date.now() when absent. */
  provider_timestamp_ms?: number;
}

/** Result of one emit call — the persisted raw_usage_events.id. */
export interface EmitResult {
  raw_event_id: number;
}

/**
 * Ensure `local-health` is registered in `source_emission_capability`.
 * Idempotent — uses INSERT OR IGNORE. The migration M65a does not seed
 * this row; it is registered lazily by the first emit so deployments
 * that never use the fallback don't carry the registry row.
 */
function ensureLocalHealthRegistered(db: Database.Database): void {
  db.prepare(
    `INSERT OR IGNORE INTO source_emission_capability
       (source_id, display_name, enforcement_eligibility,
        dedupe_confidence_default, expected_envelope_bytes)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(LOCAL_HEALTH_SOURCE_ID, 'Local Health Channel', 'reconciliation_only', 'low', 2048);
}

/**
 * Compute partition_month (YYYY-MM) from `provider_timestamp_ms`.
 * Falls back to the current month when the timestamp is malformed.
 */
function partitionMonthFromMs(ms: number): string {
  if (!Number.isFinite(ms)) return new Date().toISOString().slice(0, 7);
  return new Date(ms).toISOString().slice(0, 7);
}

/**
 * Emit one local-health event. Returns the persisted raw_usage_events.id.
 *
 * Validation:
 *   - `event` MUST be a non-empty string.
 *   - `payload`, when present, MUST be JSON-serializable. The function
 *     does NOT catch JSON.stringify failures — caller is responsible for
 *     payload sanitization.
 */
export function emitLocalHealth(
  db: Database.Database,
  ev: LocalHealthEvent,
): EmitResult {
  if (typeof ev.event !== 'string' || ev.event === '') {
    throw new Error('local-health-channel: event must be a non-empty string');
  }
  ensureLocalHealthRegistered(db);

  const provider_timestamp_ms = ev.provider_timestamp_ms ?? Date.now();
  const partition_month = partitionMonthFromMs(provider_timestamp_ms);
  const raw_attributes_json = JSON.stringify({
    event: ev.event,
    payload: ev.payload ?? {},
  });

  const result = db
    .prepare(
      `INSERT INTO raw_usage_events
         (source_id, workspace_id, agent_id, task_id,
          provider, provider_request_id, provider_timestamp_ms,
          session_id, generation_id,
          raw_attributes_json, parser_version, schema_version_observed,
          reconcile_status, dedupe_confidence, enforcement_eligibility,
          partition_month)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', 'low',
               'reconciliation_only', ?)`,
    )
    .run(
      LOCAL_HEALTH_SOURCE_ID,
      ev.workspace_id ?? null,
      ev.agent_id ?? null,
      ev.task_id ?? null,
      null, // provider — local-health has no upstream provider id
      null, // provider_request_id — synthetic events lack one
      provider_timestamp_ms,
      ev.session_id ?? null,
      null, // generation_id — synthetic events do not carry one
      raw_attributes_json,
      LOCAL_HEALTH_PARSER_VERSION,
      null, // schema_version_observed — channel is internal
      partition_month,
    );

  return { raw_event_id: Number(result.lastInsertRowid) };
}
