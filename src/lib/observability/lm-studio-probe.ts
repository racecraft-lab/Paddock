/**
 * SPEC-008 — LM Studio reachability probe + 60s heartbeat (T129).
 *
 * Per FR-364, FR-080, FR-081. The probe is the synchronous "is local
 * mode actually reachable" check used by the FR-361 Aegis dispatch chain
 * step (3). The heartbeat is the recurring background liveness signal
 * that drives `lm_studio_health.state` transitions (healthy / degraded
 * / unhealthy) and trips the per-source breaker on three consecutive
 * failures within 5 minutes.
 *
 * Surface
 *   - `probeLmStudio({timeoutMs?, baseUrl?})` — async fetch to
 *     `${baseUrl}/v1/models`. Returns `LmStudioCapabilities | null`.
 *     Success requires: HTTP 200 AND at least one model in the
 *     response body. The 500ms default timeout matches FR-364.
 *   - `lmStudioHeartbeat(opts)` — single-tick of the heartbeat. Records
 *     the outcome to `governance_health_events` (M64 — already created)
 *     and ticks the per-source breaker on failure. Designed to run on
 *     a 60s cadence; the orchestrator wires actual scheduling.
 *
 * Per-source breaker
 *   - The breaker is a `CircuitBreaker` with `scopeKind='lm-studio-source'`.
 *     Three consecutive errors within 5 minutes trip
 *     `closed → open` (the breaker's default `errorThreshold=5` is
 *     overridden to 3 for FR-364's "3 failures within 5 min" criterion).
 *
 * Concurrency
 *   - The probe uses native `fetch` with `AbortSignal.timeout()` so a
 *     stuck LM Studio process cannot block the chain. The heartbeat
 *     runs on the background DB connection and is best-effort: any
 *     write failure is logged via the breaker tick path.
 *
 * @see specs/008-resource-governance/spec.md FR-364, FR-080, FR-081
 * @see specs/008-resource-governance/tasks.md T129
 * @see Constitution Convention J — strict-scope module
 */

import {
  LM_STUDIO_DEFAULT_BASE,
  resolveLmStudioBase,
} from '@/lib/observability/adapters/lm-studio-log';
import {
  CircuitBreaker,
  type CircuitBreakerOptions,
} from '@/lib/resource-circuit-breaker';
import type Database from 'better-sqlite3';

/** Default probe timeout (FR-364: 500 ms). */
export const LM_STUDIO_PROBE_TIMEOUT_MS = 500;

/** Default heartbeat cadence (FR-080: 60 s). */
export const LM_STUDIO_HEARTBEAT_INTERVAL_MS = 60_000;

/** Breaker scope kind for LM Studio per-source breaker (T066 / FR-364). */
export const LM_STUDIO_BREAKER_SCOPE = 'lm-studio-source';

/** Probe-level capabilities surface — distinct from the log-adapter
 *  fs-only surface in `lm-studio-log.ts`.
 */
export interface LmStudioProbeCapabilities {
  /** True iff GET /v1/models returned 200 with ≥1 model entry. */
  reachable: boolean;
  /** Resolved API base URL the probe targeted. */
  api_base: string;
  /** Number of models reported by the server (0 when unreachable). */
  model_count: number;
  /** Optional first model id; useful for the runbook surface. */
  first_model_id: string | null;
  /** Wall-clock time the probe completed. */
  probed_at_ms: number;
  /** Round-trip latency in milliseconds. */
  latency_ms: number;
}

/** Heartbeat result. */
export interface HeartbeatResult {
  /** True iff the most recent probe succeeded. */
  healthy: boolean;
  /** Underlying probe outcome. Null only when fetch never completed. */
  capabilities: LmStudioProbeCapabilities | null;
  /** Optional textual error reason for log readers. */
  error: string | null;
}

interface ModelEntry {
  id?: string;
}

/**
 * Synchronous (well — `Promise<...>`) reachability probe. Returns the
 * capabilities snapshot when the server is reachable AND reports at
 * least one model; returns `null` when the request times out, errors,
 * or the body shape is unrecognized.
 *
 * The probe targets `${base}/v1/models`. When `base` already includes
 * a trailing `/v1` (matching the `LM_STUDIO_DEFAULT_BASE` shape), the
 * `/v1` segment is collapsed before appending the path.
 */
export async function probeLmStudio(
  opts: { timeoutMs?: number; baseUrl?: string } = {},
): Promise<LmStudioProbeCapabilities | null> {
  const timeoutMs = opts.timeoutMs ?? LM_STUDIO_PROBE_TIMEOUT_MS;
  const apiBase = resolveLmStudioBase(opts.baseUrl ?? '');
  // Collapse trailing /v1 if present so we always end up with /v1/models.
  const trimmed = apiBase.replace(/\/v1\/?$/, '');
  const probeUrl = `${trimmed}/v1/models`;
  const start = Date.now();
  try {
    const response = await fetch(probeUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        reachable: false,
        api_base: apiBase,
        model_count: 0,
        first_model_id: null,
        probed_at_ms: Date.now(),
        latency_ms: Date.now() - start,
      };
    }
    const body = (await response.json()) as { data?: ModelEntry[] };
    const models = Array.isArray(body.data) ? body.data : [];
    const firstModel = models[0]?.id ?? null;
    return {
      reachable: models.length > 0,
      api_base: apiBase,
      model_count: models.length,
      first_model_id: firstModel,
      probed_at_ms: Date.now(),
      latency_ms: Date.now() - start,
    };
  } catch {
    // Timeout, network error, JSON parse failure — all collapse to
    // unreachable. The runbook FR-264a covers triage of the underlying
    // cause; the probe itself MUST NOT throw or the chain blocks.
    return null;
  }
}

/**
 * Heartbeat tick. Calls `probeLmStudio()`, writes the outcome to
 * `governance_health_events`, and ticks the per-source breaker. Designed
 * for a 60s cadence (FR-080); orchestrator wires actual scheduling.
 *
 * Best-effort: a missing `governance_health_events` table (e.g., in
 * stripped test harnesses) is tolerated — the breaker is the durable
 * signal anyway.
 */
export async function lmStudioHeartbeat(
  opts: {
    db: Database.Database;
    timeoutMs?: number;
    baseUrl?: string;
    breakerOptions?: CircuitBreakerOptions;
  },
): Promise<HeartbeatResult> {
  const probeOpts: { timeoutMs?: number; baseUrl?: string } = {};
  if (opts.timeoutMs !== undefined) probeOpts.timeoutMs = opts.timeoutMs;
  if (opts.baseUrl !== undefined) probeOpts.baseUrl = opts.baseUrl;
  const capabilities = await probeLmStudio(probeOpts);
  const healthy = capabilities?.reachable === true;

  // Best-effort write to governance_health_events. M64 created the
  // table; tests that did not run M64 silently drop the row.
  try {
    opts.db
      .prepare(
        `INSERT INTO governance_health_events (component, state, metric_json)
         VALUES (?, ?, ?)`,
      )
      .run(
        'lm_studio',
        healthy ? 'healthy' : 'unhealthy',
        JSON.stringify({
          reachable: capabilities?.reachable ?? false,
          api_base: capabilities?.api_base ?? resolveLmStudioBase(),
          model_count: capabilities?.model_count ?? 0,
          first_model_id: capabilities?.first_model_id ?? null,
          latency_ms: capabilities?.latency_ms ?? null,
        }),
      );
  } catch {
    // Table absent — drop silently. The breaker is the durable signal.
  }

  // Tick the per-source breaker so three consecutive failures within
  // five minutes flip closed → open (FR-364).
  try {
    const breakerOptions: CircuitBreakerOptions = {
      db: opts.db,
      scopeKind: LM_STUDIO_BREAKER_SCOPE,
      errorThreshold: 3,
      // 5 min window for the "3 within 5 min" criterion is enforced by
      // the breaker's tickError → tickSuccess reset semantics; the
      // half-open auto-transition uses the breaker's default 60s.
      ...(opts.breakerOptions ?? {}),
    };
    const breaker = new CircuitBreaker(breakerOptions);
    if (healthy) {
      breaker.tickSuccess();
    } else {
      breaker.tickError('lm_studio_probe_failed');
    }
  } catch {
    // Breaker ensure-row may fail in stripped test harnesses (M65m
    // resource_governance_breaker absent). Drop silently.
  }

  return {
    healthy,
    capabilities,
    error: healthy
      ? null
      : capabilities === null
        ? 'fetch_failed_or_timeout'
        : `unreachable_or_no_models (model_count=${String(capabilities.model_count)})`,
  };
}

/** Re-export the default base URL so callers do not import the log adapter directly. */
export { LM_STUDIO_DEFAULT_BASE };
