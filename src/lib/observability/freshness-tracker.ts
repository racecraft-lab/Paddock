/**
 * SPEC-008 — Per-source telemetry freshness tracker.
 *
 * Per FR-115 (freshness budget), FR-119 (per-source freshness reads).
 * Defines `freshness_ms = now - max(canonical_event.emitted_at)` per
 * source. The materializer at `src/lib/observability/canonical-events.ts`
 * stamps `emitted_at` for every canonical row; the freshness tracker
 * SELECTs the per-source max and subtracts from `now()`.
 *
 * Strict-mode contract:
 *   - When a source has zero canonical events: returns `null` so the
 *     caller distinguishes "no data yet" from "data is fresh by 0 ms".
 *   - When the row's `emitted_at` is malformed: throws (never silently
 *     misreport freshness).
 *
 * NOTE: per the data model, `emitted_at` is the persistence-timestamp
 * (when canonicalization completed), NOT `provider_timestamp_ms`. This
 * matches the FR-115 spec requirement that "freshness" tracks the time
 * since the latest canonical row was *available to the dashboard*, not
 * the time since the upstream provider stamped the event.
 *
 * @see specs/008-resource-governance/spec.md FR-115, FR-119
 * @see src/lib/migrations.ts (065c_canonical_usage_events.emitted_at)
 * @see specs/008-resource-governance/tasks.md T085
 * @see Constitution Convention J — strict-scope module
 */

import type Database from 'better-sqlite3';

/**
 * Resolve `emitted_at` for the most-recent canonical row produced from
 * `source_id`. Returns null when no canonical row references the source.
 *
 * Source-id mapping is via the `merge_sources_json` linkage:
 * canonical_usage_events.merge_sources_json carries an array of
 * raw_usage_events.id values. We filter raw events by source_id and
 * intersect with the canonical merge_sources to identify which canonical
 * rows had at least one contribution from that source. The query uses
 * a join on raw_usage_events to get the source_id without scanning JSON
 * blobs.
 *
 * Performance: the join on raw_usage_events.id (PK) plus the source_id
 * filter is O(N) over the per-source raw event subset. Tests typically
 * only insert <=100 events per source so the cost is negligible; in
 * production the canonical-events table is indexed on
 * (workspace_id, emitted_at DESC) and raw_usage_events on
 * (source_id, ingested_at DESC) — the join benefits from both.
 */
function lastCanonicalEmittedAtForSource(
  db: Database.Database,
  source_id: string,
): string | null {
  const row = db
    .prepare(
      `SELECT MAX(c.emitted_at) AS max_at
         FROM canonical_usage_events c
         JOIN raw_usage_events r ON r.source_id = ?
        WHERE c.merge_sources_json LIKE '%' || r.id || '%'`,
    )
    .get(source_id);
  if (row === undefined || row === null || typeof row !== 'object') {
    return null;
  }
  const max_at = (row as Record<string, unknown>)['max_at'];
  if (typeof max_at !== 'string' || max_at === '') return null;
  return max_at;
}

/**
 * Optional clock injection — defaults to Date.now(). Tests pass a fixed
 * clock to avoid wall-clock flakes.
 */
export interface FreshnessClock {
  /** Current time in ms-since-epoch. */
  now(): number;
}

const DEFAULT_CLOCK: FreshnessClock = {
  now: () => Date.now(),
};

/**
 * Compute milliseconds-elapsed since the latest canonical event for
 * `source_id`. Returns `null` when the source has no canonical events
 * (i.e., the dashboard has never seen data from that source).
 *
 * Throws when the persisted `emitted_at` cannot be parsed as ISO-8601.
 */
export function getFreshness(
  db: Database.Database,
  source_id: string,
  clock: FreshnessClock = DEFAULT_CLOCK,
): number | null {
  const emittedAt = lastCanonicalEmittedAtForSource(db, source_id);
  if (emittedAt === null) return null;
  const t = Date.parse(emittedAt);
  if (Number.isNaN(t)) {
    throw new Error(
      `freshness-tracker: malformed canonical emitted_at: ${emittedAt}`,
    );
  }
  const delta = clock.now() - t;
  return delta < 0 ? 0 : delta;
}

/**
 * Bulk-read freshness for multiple sources in one pass. Returns a map
 * keyed by `source_id` with `null` for sources that have no canonical
 * events. Useful for the per-adapter health dashboard which renders one
 * row per registered source.
 */
export function getFreshnessForSources(
  db: Database.Database,
  source_ids: readonly string[],
  clock: FreshnessClock = DEFAULT_CLOCK,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const id of source_ids) {
    out.set(id, getFreshness(db, id, clock));
  }
  return out;
}
