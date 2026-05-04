/**
 * SPEC-008 — T375 — Per-adapter counter tuple wiring (FR-090, FR-280).
 *
 * The five-counter tuple emitted by every observability adapter:
 *
 *   - `events_in`          — raw events received from the source.
 *   - `events_dropped`     — events the adapter rejected (schema,
 *                             rate-limit, disk-pressure, etc.).
 *   - `events_admitted`    — events the adapter accepted into the
 *                             raw_usage_events table.
 *   - `parse_errors`       — events that failed parser/decoder.
 *   - `dedupe_collisions`  — events that hit the canonical UNIQUE
 *                             INDEX during reconciliation.
 *
 * These five tuples drive the System Health dashboard cards. The
 * counters are kept in-process (a Map keyed by `(source, kind)`) and
 * exposed both:
 *
 *   1. Programmatically via `getAdapterCounter()` for the System
 *      Health REST surface (`GET /api/governance/system-health`),
 *   2. As a Prometheus-style line via `formatAdapterCountersAsProm()`
 *      for the local self-observability scrape.
 *
 * No external metric libraries are imported — the spec mandates a
 * dependency-free in-process counter (see Constitution Principle X
 * Minimum Dependency).
 *
 * Closes Analyze C3 (HIGH).
 *
 * @see specs/008-resource-governance/spec.md FR-090, FR-280
 * @see specs/008-resource-governance/tasks.md T375
 */

export type AdapterSource =
  | 'native_otel'
  | 'cli_stdout_json'
  | 'transcript_replay'
  | 'gateway_otel'
  | 'manual_post'
  | 'provider_quota'
  | 'openclaw_health'

export type AdapterCounterKind =
  | 'events_in'
  | 'events_dropped'
  | 'events_admitted'
  | 'parse_errors'
  | 'dedupe_collisions'

const ADAPTER_KINDS: readonly AdapterCounterKind[] = [
  'events_in',
  'events_dropped',
  'events_admitted',
  'parse_errors',
  'dedupe_collisions',
]

interface CounterKey {
  source: AdapterSource
  kind: AdapterCounterKind
}

/** In-process counter store. Resets on process restart (acceptable per
 * FR-280 — restart-recovery rebuilds from raw_usage_events row counts). */
const COUNTERS = new Map<string, number>()

function key({ source, kind }: CounterKey): string {
  return `${source}:${kind}`
}

/**
 * Increment the (source, kind) counter by `delta`. Negative deltas
 * are accepted (used by the retry-and-retract path); the floor is 0
 * so a counter can never go negative.
 *
 * Idempotent in the sense that a 0-delta call is a no-op.
 */
export function recordAdapterCounter(
  source: AdapterSource,
  kind: AdapterCounterKind,
  delta: number,
): void {
  const k = key({ source, kind })
  const current = COUNTERS.get(k) ?? 0
  const next = Math.max(0, current + delta)
  COUNTERS.set(k, next)
}

/**
 * Read the current value for a (source, kind) tuple. Returns 0 if the
 * counter has never been recorded.
 */
export function getAdapterCounter(
  source: AdapterSource,
  kind: AdapterCounterKind,
): number {
  return COUNTERS.get(key({ source, kind })) ?? 0
}

/**
 * Snapshot every counter as a plain object. Stable key ordering
 * (sorted by source, then by kind) so test assertions don't fight
 * insertion order.
 */
export function snapshotAdapterCounters(): Record<string, number> {
  const out: Record<string, number> = {}
  const entries = Array.from(COUNTERS.entries()).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )
  for (const [k, v] of entries) out[k] = v
  return out
}

/**
 * Reset every counter. ONLY for use in tests.
 */
export function resetAdapterCountersForTest(): void {
  COUNTERS.clear()
}

/**
 * Format every counter as a Prometheus-style metric line:
 *
 *   governance_adapter{source="claude_code",kind="events_admitted"} 12345
 *
 * Used by the local self-observability scrape. Sources that have
 * never recorded a counter are NOT emitted (avoids zero-pollution in
 * the metric series). The kinds order is fixed by `ADAPTER_KINDS`.
 */
export function formatAdapterCountersAsProm(): string {
  const lines: string[] = []
  const sources = new Set<AdapterSource>()
  for (const k of COUNTERS.keys()) {
    const [source] = k.split(':') as [AdapterSource]
    sources.add(source)
  }
  const sortedSources = Array.from(sources).sort()
  for (const source of sortedSources) {
    for (const kind of ADAPTER_KINDS) {
      const v = getAdapterCounter(source, kind)
      lines.push(
        `governance_adapter{source="${source}",kind="${kind}"} ${String(v)}`,
      )
    }
  }
  return lines.join('\n')
}
