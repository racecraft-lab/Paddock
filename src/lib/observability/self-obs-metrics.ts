/**
 * SPEC-008 — In-memory self-observability metrics registry.
 *
 * Per FR-016 / FR-024 (operator dashboards), FR-105 (self-obs surface
 * separate from agent-activity telemetry), FR-196a (precedence rank
 * counters), FR-276 / FR-277 (observability of the observability system),
 * FR-354 (FIXED histogram buckets for evaluator latency).
 *
 * Surface:
 *   - `incrementMetric(name, labels?)` — counter increments with optional
 *     label set. Identity is `(name, JSON.stringify(canonicalLabels))`.
 *   - `observeHistogram(name, value, labels?)` — histogram observation.
 *     Buckets are FIXED per FR-354 for evaluator-latency: [1, 5, 15, 30,
 *     60, 100, 250, 500, 1000] ms (le-thresholds). Other histogram names
 *     reuse the same fixed bucket schedule unless registered with a
 *     custom one (none today).
 *   - `getMetricsSnapshot()` — JSON-serializable snapshot of all
 *     counters and histograms, suitable for the eventual
 *     `/api/governance/metrics` endpoint.
 *   - `resetMetrics()` — test-only helper to clear the registry.
 *
 * Concurrency: this module is single-process, single-thread. No locking
 * is required — the Node event loop serializes increments. If we ever
 * move to a worker-thread model, swap in Atomics on a SharedArrayBuffer
 * (out of scope for T089).
 *
 * @see specs/008-resource-governance/spec.md FR-016, FR-024, FR-105,
 *      FR-196a, FR-276, FR-277, FR-354
 * @see specs/008-resource-governance/tasks.md T089
 * @see Constitution Convention J — strict-scope module
 */

/**
 * Fixed evaluator-latency bucket schedule per FR-354. Each value is a
 * "le" (less-than-or-equal) threshold in milliseconds. The unbounded
 * tail is implicit — observations >1000 ms accumulate in the
 * `Infinity` (-> '+Inf') bucket.
 */
export const EVALUATOR_LATENCY_BUCKETS_MS: readonly number[] = [
  1, 5, 15, 30, 60, 100, 250, 500, 1000,
] as const;

export interface CounterRow {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export interface HistogramRow {
  name: string;
  labels: Record<string, string>;
  /** Per-bucket cumulative counts, one per BUCKETS_MS entry plus the +Inf tail. */
  bucket_counts: number[];
  bucket_le_thresholds_ms: readonly (number | '+Inf')[];
  count: number;
  sum: number;
}

export interface MetricsSnapshot {
  counters: CounterRow[];
  histograms: HistogramRow[];
}

interface InternalCounter {
  name: string;
  labels: Record<string, string>;
  value: number;
}

interface InternalHistogram {
  name: string;
  labels: Record<string, string>;
  /** length = BUCKETS.length + 1 (last entry is +Inf overflow) */
  bucket_counts: number[];
  count: number;
  sum: number;
}

const counters = new Map<string, InternalCounter>();
const histograms = new Map<string, InternalHistogram>();

/**
 * Render `(name, labels)` to a stable identity key. Labels are sorted
 * alphabetically so {a:1,b:2} and {b:2,a:1} hash the same.
 */
function identity(name: string, labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  const pairs = keys.map((k) => `${k}=${labels[k] ?? ''}`).join(',');
  return `${name}{${pairs}}`;
}

/**
 * Coerce label values to string. Numeric/boolean labels collapse to
 * their string form so the identity keying stays consistent.
 */
function normalizeLabels(
  labels: Record<string, string | number | boolean> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (labels === undefined) return out;
  for (const k of Object.keys(labels)) {
    const v = labels[k];
    if (v === undefined) continue;
    out[k] = String(v);
  }
  return out;
}

/**
 * Increment a counter by 1 (default) or by an explicit non-negative
 * amount. Negative deltas are rejected — counters are monotonic per the
 * Prometheus convention.
 */
export function incrementMetric(
  name: string,
  labels?: Record<string, string | number | boolean>,
  amount = 1,
): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(
      `self-obs-metrics: incrementMetric amount must be a non-negative finite number, got ${String(amount)}`,
    );
  }
  const norm = normalizeLabels(labels);
  const key = identity(name, norm);
  const cur = counters.get(key);
  if (cur === undefined) {
    counters.set(key, { name, labels: norm, value: amount });
  } else {
    cur.value += amount;
  }
}

/**
 * Observe a histogram value. Allocates a histogram on first observation
 * with the FR-354 fixed bucket schedule. Subsequent observations
 * accumulate into the matching bucket and into every higher-le bucket
 * (cumulative-count semantics, identical to Prometheus).
 */
export function observeHistogram(
  name: string,
  value: number,
  labels?: Record<string, string | number | boolean>,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `self-obs-metrics: observeHistogram value must be finite, got ${String(value)}`,
    );
  }
  const norm = normalizeLabels(labels);
  const key = identity(name, norm);
  let h = histograms.get(key);
  if (h === undefined) {
    h = {
      name,
      labels: norm,
      bucket_counts: new Array<number>(EVALUATOR_LATENCY_BUCKETS_MS.length + 1).fill(0),
      count: 0,
      sum: 0,
    };
    histograms.set(key, h);
  }
  h.count += 1;
  h.sum += value;
  // Cumulative bucket semantics: increment every bucket whose le-threshold
  // is >= value, plus the +Inf overflow bucket.
  let placed = false;
  for (let i = 0; i < EVALUATOR_LATENCY_BUCKETS_MS.length; i++) {
    const le = EVALUATOR_LATENCY_BUCKETS_MS[i];
    if (le === undefined) continue;
    if (value <= le) {
      const cur = h.bucket_counts[i] ?? 0;
      h.bucket_counts[i] = cur + 1;
      placed = true;
    }
  }
  // +Inf bucket always gets every observation (cumulative tail).
  const tailIdx = EVALUATOR_LATENCY_BUCKETS_MS.length;
  const tail = h.bucket_counts[tailIdx] ?? 0;
  h.bucket_counts[tailIdx] = tail + 1;
  // Defensive: ensure the placed-flag isn't dropped — if value > all le
  // thresholds, only +Inf is incremented (correct).
  void placed;
}

/**
 * Snapshot the registry. Returns a JSON-serializable structure with
 * counters and histograms (both arrays sorted by name then labels for
 * deterministic test output).
 */
export function getMetricsSnapshot(): MetricsSnapshot {
  const counterRows: CounterRow[] = [];
  for (const c of counters.values()) {
    counterRows.push({ name: c.name, labels: { ...c.labels }, value: c.value });
  }
  counterRows.sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    const ak = identity(a.name, a.labels);
    const bk = identity(b.name, b.labels);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });

  const histogramRows: HistogramRow[] = [];
  for (const h of histograms.values()) {
    histogramRows.push({
      name: h.name,
      labels: { ...h.labels },
      bucket_counts: h.bucket_counts.slice(),
      bucket_le_thresholds_ms: [
        ...EVALUATOR_LATENCY_BUCKETS_MS,
        '+Inf' as const,
      ],
      count: h.count,
      sum: h.sum,
    });
  }
  histogramRows.sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    const ak = identity(a.name, a.labels);
    const bk = identity(b.name, b.labels);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });

  return { counters: counterRows, histograms: histogramRows };
}

/**
 * Test-only helper. Resets every counter and histogram. Production
 * callers SHOULD NOT call this — there is no recovery path for lost
 * observations.
 */
export function resetMetrics(): void {
  counters.clear();
  histograms.clear();
}
