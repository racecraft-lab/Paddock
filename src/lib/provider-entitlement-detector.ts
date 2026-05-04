/**
 * SPEC-008 — Provider entitlement detector (three-cadence pipeline).
 *
 * Per FR-134a, FR-135 and tasks.md T119. Resolves the live tier and
 * cap snapshot for each `provider_accounts` row by polling four
 * detection signals in priority order:
 *
 *   1. response-header parse from the most recent completed call
 *   2. provider entitlements API (when reachable)
 *   3. provider-tier inference (subscription metadata, plan label)
 *   4. manual operator-supplied entry
 *
 * Cadences (FR-135):
 *
 *   - daily 00:15 UTC — full refresh of every active account; this is
 *     the canonical "fresh-snapshot" cadence and the source of the
 *     `provider_entitlements` history rows the audit trail consumes.
 *   - 6-hour near-expiry refresh — when the most recent entitlement
 *     row's `expires_at - now < 24h`, an extra detect-and-write cycle
 *     fires every 6 h to track the renewal.
 *   - on-admission inline — capped at 50 ms; the evaluator hot-path
 *     calls `detectInline(account_id)` and, if the cap trips, returns
 *     the last-known entitlement and increments
 *     `entitlement_detect_slow{account_id}`. The detector NEVER
 *     blocks the evaluator past the cap.
 *
 * Scheduling: this module exposes the three entry points
 * (`runDailyRefresh`, `runNearExpiryRefresh`, `detectInline`). Wiring
 * them into the cron / scheduler infrastructure is out of scope for
 * SPEC-008 strict-scope (the cron module sits outside `src/lib/
 * provider-*` and `src/lib/resource-*`); the wiring task is documented
 * in the SPEC-008 follow-up tracker.
 *
 * Detector telemetry: every detection writes ONE row to
 * `provider_entitlements` (M65l). The evaluator reads the most-recent
 * row per account via `getCurrentEntitlement(account_id)`. The
 * `entitlement_detect_*` self-obs metrics record latency and slow-cap
 * trips so the operator can audit the on-admission budget.
 *
 * @see specs/008-resource-governance/spec.md FR-134a, FR-135
 * @see specs/008-resource-governance/tasks.md T119
 * @see Constitution Convention J — `src/lib/provider-entitlement*.ts`
 *      is in `tsconfig.spec-strict.json` and the strict-scope ESLint
 *      override.
 */

import { incrementMetric, observeHistogram } from '@/lib/observability/self-obs-metrics';
import {
  listProviderAccounts,
  type ProviderAccountRow,
} from '@/lib/provider-accounts';
import type Database from 'better-sqlite3';

/**
 * Detector source priority — FR-134a's four signals, in matching order.
 * The detector returns the FIRST source that yields a non-null tier;
 * lower-priority sources are NOT consulted once a higher source wins.
 */
export type EntitlementSource =
  | 'response_header'
  | 'provider_api'
  | 'tier_inference'
  | 'manual';

/**
 * Snapshot returned by the detector functions and persisted to the
 * `provider_entitlements` history table (M65l).
 */
export interface EntitlementSnapshot {
  account_id: number;
  tier: string;
  rate_limits_json: string | null;
  monthly_token_cap: number | null;
  effective_at: string;
  expires_at: string | null;
  source: EntitlementSource;
}

/**
 * On-admission inline detection cap (FR-135). Blocks past this budget
 * MUST fall back to the last-known entitlement and emit
 * `entitlement_detect_slow_total`.
 */
export const INLINE_DETECT_CAP_MS = 50;

/**
 * Near-expiry threshold (FR-135). When the active entitlement's
 * `expires_at - now < 24 h`, the 6-hour refresh kicks in.
 */
export const NEAR_EXPIRY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Pluggable signal probe. Real implementations (Anthropic header
 * parser, OpenAI rate-limit query, Copilot subscription introspect)
 * live in adapter modules; the detector itself is signal-agnostic.
 *
 * A probe MUST resolve to `null` quickly when its source has nothing
 * to say (so the next-priority probe runs). Probes MUST NOT throw —
 * any internal failure surfaces as a `null` resolution + a
 * `provider-entitlement-probe-error` metric increment so an outage in
 * one signal cannot poison the detector pipeline.
 */
export interface EntitlementProbe {
  source: EntitlementSource;
  detect(account: ProviderAccountRow): Promise<EntitlementSnapshot | null>;
}

/**
 * Default probe set — empty by default. The cron wiring + adapter
 * modules push concrete probes onto this registry at startup; tests
 * inject their own probes via the `probes` argument to the detector
 * entry points.
 *
 * The detector ALWAYS evaluates probes in priority order regardless
 * of registration order:
 *   response_header > provider_api > tier_inference > manual.
 */
export const DEFAULT_PROBES: EntitlementProbe[] = [];

const PROBE_PRIORITY: Record<EntitlementSource, number> = {
  response_header: 0,
  provider_api: 1,
  tier_inference: 2,
  manual: 3,
};

function sortProbesByPriority(probes: EntitlementProbe[]): EntitlementProbe[] {
  return [...probes].sort(
    (a, b) => PROBE_PRIORITY[a.source] - PROBE_PRIORITY[b.source],
  );
}

/**
 * Read the most-recent entitlement snapshot for an account, or null
 * if the account has never been detected.
 */
export function getCurrentEntitlement(
  db: Database.Database,
  accountId: number,
): EntitlementSnapshot | null {
  const row = db
    .prepare(
      `SELECT account_id, tier, rate_limits_json, monthly_token_cap,
              effective_at, expires_at, source
         FROM provider_entitlements
         WHERE account_id = ?
         ORDER BY effective_at DESC, id DESC
         LIMIT 1`,
    )
    .get(accountId) as
    | {
        account_id: number;
        tier: string;
        rate_limits_json: string | null;
        monthly_token_cap: number | null;
        effective_at: string;
        expires_at: string | null;
        source: string;
      }
    | undefined;
  if (row === undefined) return null;
  return {
    account_id: row.account_id,
    tier: row.tier,
    rate_limits_json: row.rate_limits_json,
    monthly_token_cap: row.monthly_token_cap,
    effective_at: row.effective_at,
    expires_at: row.expires_at,
    source: row.source as EntitlementSource,
  };
}

function persistSnapshot(
  db: Database.Database,
  snapshot: EntitlementSnapshot,
): void {
  db.transaction((tx: { snap: EntitlementSnapshot }) => {
    db.prepare(
      `INSERT INTO provider_entitlements
         (account_id, tier, rate_limits_json, monthly_token_cap,
          effective_at, expires_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      tx.snap.account_id,
      tx.snap.tier,
      tx.snap.rate_limits_json,
      tx.snap.monthly_token_cap,
      tx.snap.effective_at,
      tx.snap.expires_at,
      tx.snap.source,
    );
  }).immediate({ snap: snapshot });
}

/**
 * Run all priority-ordered probes against an account and return the
 * first non-null detection. Probe failures are swallowed as `null`
 * results so the pipeline tolerates per-source outages.
 */
async function runProbeChain(
  account: ProviderAccountRow,
  probes: EntitlementProbe[],
): Promise<EntitlementSnapshot | null> {
  for (const probe of sortProbesByPriority(probes)) {
    let result: EntitlementSnapshot | null = null;
    try {
      result = await probe.detect(account);
    } catch {
      incrementMetric('entitlement_probe_error_total', {
        source: probe.source,
        provider: account.provider,
      });
      result = null;
    }
    if (result !== null) return result;
  }
  return null;
}

/**
 * Daily 00:15 UTC full refresh (FR-135). Walks every active
 * `provider_accounts` row, runs the probe chain, and persists the
 * resulting snapshot to `provider_entitlements`. Skipping accounts
 * with no probe match is intentional — the detector does not
 * fabricate snapshots; absence is a real signal.
 *
 * Returns the count of (detected, skipped) so the scheduler can log a
 * one-line summary.
 */
export async function runDailyRefresh(
  db: Database.Database,
  probes: EntitlementProbe[] = DEFAULT_PROBES,
): Promise<{ detected: number; skipped: number }> {
  const accounts = listProviderAccounts(db);
  let detected = 0;
  let skipped = 0;
  for (const account of accounts) {
    const start = Date.now();
    const snap = await runProbeChain(account, probes);
    observeHistogram('entitlement_detect_duration_ms', Date.now() - start, {
      cadence: 'daily',
      provider: account.provider,
    });
    if (snap === null) {
      skipped += 1;
      continue;
    }
    persistSnapshot(db, snap);
    detected += 1;
  }
  return { detected, skipped };
}

/**
 * 6-hour near-expiry refresh (FR-135). Examines each active account's
 * most-recent entitlement; if `expires_at` exists and falls inside the
 * 24h window from now, runs the probe chain to capture renewal data.
 *
 * Accounts without an `expires_at` (e.g., perpetual subscription
 * tiers) are skipped — there is nothing to renew.
 */
export async function runNearExpiryRefresh(
  db: Database.Database,
  probes: EntitlementProbe[] = DEFAULT_PROBES,
  nowMs: number = Date.now(),
): Promise<{ refreshed: number; skipped: number }> {
  const accounts = listProviderAccounts(db);
  let refreshed = 0;
  let skipped = 0;
  for (const account of accounts) {
    const current = getCurrentEntitlement(db, account.id);
    if (current?.expires_at == null) {
      skipped += 1;
      continue;
    }
    const expiresMs = Date.parse(current.expires_at);
    if (Number.isNaN(expiresMs) || expiresMs - nowMs >= NEAR_EXPIRY_WINDOW_MS) {
      skipped += 1;
      continue;
    }
    const start = Date.now();
    const snap = await runProbeChain(account, probes);
    observeHistogram('entitlement_detect_duration_ms', Date.now() - start, {
      cadence: 'near_expiry',
      provider: account.provider,
    });
    if (snap === null) {
      skipped += 1;
      continue;
    }
    persistSnapshot(db, snap);
    refreshed += 1;
  }
  return { refreshed, skipped };
}

/**
 * On-admission inline detection (FR-135). Runs the probe chain with
 * a hard 50 ms cap. If the cap trips before any probe yields, returns
 * the last-known entitlement (which may be null for never-detected
 * accounts) and emits `entitlement_detect_slow_total{provider}`.
 *
 * The evaluator hot-path calls this; it MUST be cheap on the
 * fast-path. Results are persisted only when a probe completes inside
 * the cap — otherwise we never write a synthesized "slow" row.
 */
export async function detectInline(
  db: Database.Database,
  account: ProviderAccountRow,
  probes: EntitlementProbe[] = DEFAULT_PROBES,
  capMs: number = INLINE_DETECT_CAP_MS,
): Promise<EntitlementSnapshot | null> {
  const start = Date.now();
  const racePromise = runProbeChain(account, probes);
  const timer = new Promise<'timeout'>((resolve) => {
    setTimeout(() => {
      resolve('timeout');
    }, capMs);
  });
  const winner = await Promise.race([racePromise, timer]);
  const elapsed = Date.now() - start;
  observeHistogram('entitlement_detect_duration_ms', elapsed, {
    cadence: 'inline',
    provider: account.provider,
  });
  if (winner === 'timeout') {
    incrementMetric('entitlement_detect_slow_total', {
      provider: account.provider,
      account_id: String(account.id),
    });
    return getCurrentEntitlement(db, account.id);
  }
  // racePromise resolved first
  const snap = winner;
  if (snap === null) return getCurrentEntitlement(db, account.id);
  persistSnapshot(db, snap);
  return snap;
}
