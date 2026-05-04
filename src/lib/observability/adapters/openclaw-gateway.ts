/**
 * SPEC-008 — OpenClaw gateway health/cost adapter (T103).
 *
 * Per FR-075 (gateway health/cost ingest), FR-084 (cost adapter is
 * fork-only / opt-in), FR-088 (cross-source dedup with the gateway's
 * OTLP emit).
 *
 * Behavior:
 *   1. If `~/.openclaw/health/` does not exist → no-op, no flag check.
 *      This is the default for upstream installs that aren't running
 *      the OpenClaw gateway. No throws.
 *   2. If the directory exists, gate the read on
 *      `resolveFlag('FEATURE_OPENCLAW_HEALTH_COSTS', ctx)`. The flag
 *      is fork-only (`activationScope: 'forkOnlyAdapter'`); upstream
 *      callers will get `false` even when the directory is present.
 *   3. When the flag resolves true, read three artifacts:
 *      - `readings.jsonl` — sampled health readings (CPU/GPU/RAM).
 *      - `current-rate.json` — the active electricity rate.
 *      - `cost.json` — the resolved per-second cost basis.
 *
 * The adapter writes one `raw_usage_events` row per readings entry
 * with `provider='openclaw-gateway'`. The cost basis from
 * `cost.json` is folded into `raw_attributes_json.cost_usd` — the
 * canonicalizer (T080, out of scope) is the authoritative cost
 * resolver.
 *
 * Source registration:
 *   - `source_id='openclaw_gateway'`,
 *     `enforcement_eligibility='advisory'` (cost basis is operator
 *     guidance, not authoritative billing).
 *
 * @see specs/008-resource-governance/spec.md FR-075, FR-084, FR-088
 * @see specs/008-resource-governance/tasks.md T103
 * @see Constitution Convention J — strict-scope module
 */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { resolveFlag } from '@/lib/feature-flags';
import {
  ensureSourceRegistered,
  insertRawUsageEvent,
  partitionMonthFromMs,
} from './_adapter-helpers';
import type Database from 'better-sqlite3';

/** Source id for OpenClaw gateway ingest. */
export const OPENCLAW_GATEWAY_SOURCE_ID = 'openclaw_gateway';

/** Parser-version tag stamped on every gateway-derived raw row. */
export const OPENCLAW_GATEWAY_PARSER_VERSION = 'openclaw-gateway-v1';

/** Adapter options. */
export interface ReadOptions {
  /** Override health dir. Defaults to `~/.openclaw/health/`. */
  healthDir?: string;
  workspaceId?: number | null;
  agentId?: number | null;
  taskId?: number | null;
  maxRows?: number;
}

/** Adapter result. */
export type ReadResult =
  | { ok: true; processed: number; skipped: number; reason?: 'no_directory' | 'flag_off' }
  | { ok: false; reason: string };

/** Reading entry shape. */
interface ReadingEntry {
  timestamp_ms: number;
  cpu_pct?: number;
  gpu_pct?: number;
  ram_gb?: number;
  power_watts?: number;
}

interface CurrentRate {
  rate_per_kwh: number;
  currency: string;
}

interface CostBasis {
  /** Per-second cost basis in USD; multiply by reading interval. */
  cost_usd_per_second: number;
}

function defaultHealthDir(): string {
  return path.join(homedir(), '.openclaw', 'health');
}

/** Register the openclaw_gateway source. Idempotent. */
export function registerOpenclawGatewaySource(db: Database.Database): void {
  ensureSourceRegistered(db, {
    source_id: OPENCLAW_GATEWAY_SOURCE_ID,
    display_name: 'OpenClaw Gateway Health/Cost',
    enforcement_eligibility: 'advisory',
    dedupe_confidence_default: 'medium',
    expected_envelope_bytes: 1024,
  });
}

/** Read+parse cost.json. Missing file → fallback constant 0. */
async function readCostBasis(dir: string): Promise<CostBasis> {
  try {
    const text = await fs.readFile(path.join(dir, 'cost.json'), 'utf8');
    const obj = JSON.parse(text) as Record<string, unknown>;
    const v = obj['cost_usd_per_second'];
    if (typeof v === 'number') return { cost_usd_per_second: v };
    return { cost_usd_per_second: 0 };
  } catch {
    return { cost_usd_per_second: 0 };
  }
}

/** Read+parse current-rate.json. Missing file → fallback {0, 'USD'}. */
async function readCurrentRate(dir: string): Promise<CurrentRate> {
  try {
    const text = await fs.readFile(path.join(dir, 'current-rate.json'), 'utf8');
    const obj = JSON.parse(text) as Record<string, unknown>;
    const rate = typeof obj['rate_per_kwh'] === 'number' ? (obj['rate_per_kwh']) : 0;
    const currency = typeof obj['currency'] === 'string' ? (obj['currency']) : 'USD';
    return { rate_per_kwh: rate, currency };
  } catch {
    return { rate_per_kwh: 0, currency: 'USD' };
  }
}

/** Parse one readings.jsonl line. */
function parseReadingLine(line: string): ReadingEntry | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  const ts =
    typeof obj['timestamp_ms'] === 'number'
      ? (obj['timestamp_ms'])
      : typeof obj['time'] === 'string'
        ? Date.parse(obj['time'])
        : Date.now();
  if (!Number.isFinite(ts)) return null;
  const out: ReadingEntry = { timestamp_ms: ts };
  if (typeof obj['cpu_pct'] === 'number') out.cpu_pct = obj['cpu_pct'];
  if (typeof obj['gpu_pct'] === 'number') out.gpu_pct = obj['gpu_pct'];
  if (typeof obj['ram_gb'] === 'number') out.ram_gb = obj['ram_gb'];
  if (typeof obj['power_watts'] === 'number') out.power_watts = obj['power_watts'];
  return out;
}

/**
 * Workspace flag context for the gate. Read from a tiny lookup so
 * we don't have to thread the workspace id through every adapter
 * call site. Caller supplies `workspaceFlags` (the stringified
 * `workspaces.feature_flags` JSON column) when flag context is
 * available.
 */
export interface FlagCtx {
  workspaceFlags?: string | Record<string, unknown> | null;
  env?: Record<string, string | undefined>;
}

/**
 * Read the health directory and emit raw rows. Multi-stage gate:
 *   1) `~/.openclaw/health/` missing → return early, no flag check.
 *   2) `FEATURE_OPENCLAW_HEALTH_COSTS=false` → return early.
 *   3) Otherwise read readings.jsonl + cost.json + current-rate.json.
 */
export async function readOpenclawGatewayHealth(
  db: Database.Database,
  flagCtx: FlagCtx = {},
  opts: ReadOptions = {},
): Promise<ReadResult> {
  const dir = opts.healthDir ?? defaultHealthDir();
  if (!existsSync(dir)) {
    return { ok: true, processed: 0, skipped: 0, reason: 'no_directory' };
  }

  const flagOn = resolveFlag('FEATURE_OPENCLAW_HEALTH_COSTS', flagCtx);
  if (!flagOn) {
    return { ok: true, processed: 0, skipped: 0, reason: 'flag_off' };
  }

  const maxRows = opts.maxRows ?? 10_000;
  registerOpenclawGatewaySource(db);

  const [readingsContent, currentRate, costBasis] = await Promise.all([
    fs.readFile(path.join(dir, 'readings.jsonl'), 'utf8').catch(() => ''),
    readCurrentRate(dir),
    readCostBasis(dir),
  ]);

  const events: ReadingEntry[] = [];
  let skipped = 0;
  for (const line of readingsContent.split('\n')) {
    if (events.length >= maxRows) break;
    const ev = parseReadingLine(line);
    if (ev === null) {
      if (line.trim() !== '') skipped += 1;
      continue;
    }
    events.push(ev);
  }

  let processed = 0;
  const workspace_id = opts.workspaceId ?? null;
  const agent_id = opts.agentId ?? null;
  const task_id = opts.taskId ?? null;

  const tx = db.transaction((batch: readonly ReadingEntry[]) => {
    for (const ev of batch) {
      const partition_month = partitionMonthFromMs(ev.timestamp_ms);
      const cost_usd = costBasis.cost_usd_per_second;
      const raw_attributes_json = JSON.stringify({
        cpu_pct: ev.cpu_pct ?? null,
        gpu_pct: ev.gpu_pct ?? null,
        ram_gb: ev.ram_gb ?? null,
        power_watts: ev.power_watts ?? null,
        rate_per_kwh: currentRate.rate_per_kwh,
        currency: currentRate.currency,
        cost_usd,
      });
      insertRawUsageEvent(db, {
        source_id: OPENCLAW_GATEWAY_SOURCE_ID,
        workspace_id,
        agent_id,
        task_id,
        provider: 'openclaw-gateway',
        provider_request_id: null,
        provider_timestamp_ms: ev.timestamp_ms,
        session_id: null,
        generation_id: null,
        raw_attributes_json,
        parser_version: OPENCLAW_GATEWAY_PARSER_VERSION,
        schema_version_observed: 'openclaw-gateway-1',
        reconcile_status: 'ok',
        dedupe_confidence: 'medium',
        enforcement_eligibility: 'advisory',
        partition_month,
      });
      processed += 1;
    }
  });
  tx.immediate(events);

  return { ok: true, processed, skipped };
}
