/**
 * SPEC-008 — Ingest admission control: token-bucket + bytes/sec + disk-pressure ladder.
 *
 * Per FR-079 (per-source admission gate), FR-089 (per-source bytes/sec
 * budget), FR-090e (disk-pressure ladder), FR-278 / FR-279 / FR-281
 * (admission decision contract).
 *
 * Inputs (governance.json):
 *   - `rate_limits.<bucket>.steady_per_min` / `.burst_per_window`
 *     `.window_seconds` per FR-203 / FR-203a.
 *   - `ingest_disk.amber_*` / `.red_*` thresholds.
 *   - `ingest_rate.envelope_bytes_<source>` per FR-090e.
 *
 * State sources:
 *   - Persisted ingest_rate_state row (M65m, via T090 module).
 *   - Disk pressure passed in by caller (free bytes / total bytes /
 *     percent free) — this module does NOT call `statvfs`/`df`; the
 *     wiring in `getDiskPressureSummary` (out of scope) supplies the
 *     pressure tuple.
 *
 * Output:
 *   `AdmissionDecision = { admit: true } | { admit: false; reason }`
 *   per `src/types/observability.ts`.
 *
 * Token-bucket semantics:
 *   - Per-source bucket capacity = `burst_per_window`.
 *   - Refill rate = `steady_per_min` events per minute, distributed
 *     evenly across the window.
 *   - One admit costs 1 token. When the bucket is drained, the
 *     decision is `{admit: false, reason: 'token_bucket_drained'}`.
 *
 * Disk pressure ladder:
 *   - `red`: free <= red_pct OR free_bytes <= red_bytes → reject with
 *     `disk_pressure_red`.
 *   - `amber`: free between amber and red → admit but increment a
 *     "degraded" counter on the ingest_rate_state row (no rejection).
 *   - `green`: free > amber → admit normally.
 *
 * Concurrency:
 *   - The token-bucket state is process-local (a `Map<source_id,
 *     BucketState>`). The reset epoch is monotonic; tests may inject a
 *     clock to make the timing deterministic.
 *
 * @see specs/008-resource-governance/spec.md FR-079, FR-089, FR-090e,
 *      FR-203, FR-278, FR-279, FR-281
 * @see src/lib/observability/ingest-rate-state.ts (T090)
 * @see specs/008-resource-governance/tasks.md T091
 * @see Constitution Convention J — strict-scope module
 */

import {
  getIngestRateState,
  recordIngestDrop,
} from './ingest-rate-state';
import type { AdmissionDecision } from '@/types/observability';
import type Database from 'better-sqlite3';

/** Configurable rate-limit shape per governance.json `rate_limits.<bucket>`. */
export interface RateLimitConfig {
  steady_per_min: number;
  burst_per_window: number;
  window_seconds: number;
}

/** Input disk-pressure summary. */
export interface DiskPressureInput {
  free_bytes: number;
  total_bytes: number;
  free_pct: number; // 0..100
  amber_bytes_threshold: number;
  amber_pct_threshold: number;
  red_bytes_threshold: number;
  red_pct_threshold: number;
}

/** One admission attempt. */
export interface AdmitArgs {
  source_id: string;
  source_path?: string;
  payload_bytes?: number;
  rate_limits: RateLimitConfig;
  disk?: DiskPressureInput;
}

/** Optional clock injection. */
export interface AdmissionClock {
  now(): number;
}

const DEFAULT_CLOCK: AdmissionClock = { now: () => Date.now() };

interface BucketState {
  /** Tokens currently available (0 .. burst_per_window). */
  tokens: number;
  /** Last refill ms-since-epoch. */
  last_refill_ms: number;
}

const buckets = new Map<string, BucketState>();

/** Test/diagnostic helper. */
export function resetAdmissionBuckets(): void {
  buckets.clear();
}

/** Test/diagnostic helper. */
export function admissionBucketSize(source_id: string): number {
  return buckets.get(source_id)?.tokens ?? -1;
}

/** Compute per-millisecond refill rate from steady_per_min. */
function refillPerMs(rl: RateLimitConfig): number {
  if (rl.steady_per_min <= 0) return 0;
  return rl.steady_per_min / 60_000;
}

/** Refill a bucket up to the cap. */
function refill(state: BucketState, rl: RateLimitConfig, now_ms: number): void {
  const elapsed = Math.max(0, now_ms - state.last_refill_ms);
  const add = elapsed * refillPerMs(rl);
  state.tokens = Math.min(rl.burst_per_window, state.tokens + add);
  state.last_refill_ms = now_ms;
}

/** Get-or-create the bucket for a source. */
function getBucket(source_id: string, rl: RateLimitConfig, now_ms: number): BucketState {
  let s = buckets.get(source_id);
  if (s === undefined) {
    s = { tokens: rl.burst_per_window, last_refill_ms: now_ms };
    buckets.set(source_id, s);
    return s;
  }
  refill(s, rl, now_ms);
  return s;
}

/** Classify disk pressure into one of three bands. */
function diskBand(d: DiskPressureInput): 'green' | 'amber' | 'red' {
  if (d.free_bytes <= d.red_bytes_threshold || d.free_pct <= d.red_pct_threshold) {
    return 'red';
  }
  if (
    d.free_bytes <= d.amber_bytes_threshold
    || d.free_pct <= d.amber_pct_threshold
  ) {
    return 'amber';
  }
  return 'green';
}

/**
 * Decide whether to admit one ingestion. Side-effects:
 *   - Decrements the token bucket on admit.
 *   - On reject, calls `recordIngestDrop` against the persisted FSM row.
 */
export function admitIngestion(
  db: Database.Database,
  args: AdmitArgs,
  clock: AdmissionClock = DEFAULT_CLOCK,
): AdmissionDecision {
  const now_ms = clock.now();
  const source_path = args.source_path ?? args.source_id;

  // 1. Disk pressure red — reject before token-bucket math.
  if (args.disk !== undefined) {
    const band = diskBand(args.disk);
    if (band === 'red') {
      recordIngestDrop(db, source_path, { clock });
      return { admit: false, reason: 'disk_pressure_red' };
    }
  }

  // 2. Persisted FSM gate — reject when state is non-accepting.
  const fsm = getIngestRateState(db, source_path, { clock });
  if (fsm === 'circuit_open') {
    recordIngestDrop(db, source_path, { clock });
    return { admit: false, reason: 'rate_limited' };
  }
  if (fsm === 'disk_full_pause') {
    recordIngestDrop(db, source_path, { clock });
    return { admit: false, reason: 'disk_pressure_red' };
  }
  if (fsm === 'rate_limited') {
    recordIngestDrop(db, source_path, { clock });
    return { admit: false, reason: 'rate_limited' };
  }

  // 3. Token-bucket gate.
  const bucket = getBucket(args.source_id, args.rate_limits, now_ms);
  if (bucket.tokens < 1) {
    recordIngestDrop(db, source_path, { clock });
    return { admit: false, reason: 'token_bucket_drained' };
  }
  bucket.tokens -= 1;
  return { admit: true };
}
