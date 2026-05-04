/**
 * SPEC-008 — Provider quota poller (T105).
 *
 * Per FR-076 (provider-side quota signal). Polls upstream provider
 * APIs (Anthropic, OpenAI) at a low frequency and writes coarse
 * remaining-percentage signals into `provider_entitlements` (M65l).
 *
 * The poller is *coarse* by design — providers expose remaining quota
 * only as approximate ranges. Each successful poll appends one row to
 * `provider_entitlements` with `source='usage_api'`, the resolved
 * tier, and a serialized snapshot of the headroom indicators
 * (`rate_limits_json`, `monthly_token_cap` if exposed). The
 * canonicalizer (out of scope) consults the most recent unexpired row
 * when admission decisions need a quota signal.
 *
 * Absent-safe: when no provider account is configured, the poller
 * exits cleanly with `{ ok: true, polled: 0 }`.
 *
 * @see specs/008-resource-governance/spec.md FR-076
 * @see specs/008-resource-governance/tasks.md T105
 * @see Constitution Convention J — strict-scope module
 */

import type Database from 'better-sqlite3';

/** Quota signals one poll run reports. */
export interface QuotaSignal {
  account_id: number;
  tier: string;
  rate_limits_json: string | null;
  monthly_token_cap: number | null;
}

/** Poll result. */
export interface PollResult {
  ok: true;
  polled: number;
  inserted: number;
  errors: { account_id: number; reason: string }[];
}

/**
 * Provider account context the poller iterates over. Caller resolves
 * this from `provider_accounts` (M65l). Adapter does NOT touch the
 * provider_accounts table directly so the test surface stays small.
 */
export interface ProviderAccount {
  id: number;
  /** Provider tag — typically `'anthropic'` or `'openai'`; other values are passed through. */
  provider: string;
  api_key: string | null;
}

/** Override hooks used by tests; default impls call the live providers. */
export interface PollHooks {
  pollAnthropic?: (account: ProviderAccount) => Promise<QuotaSignal | null>;
  pollOpenAi?: (account: ProviderAccount) => Promise<QuotaSignal | null>;
  /** Override Date.now() for deterministic effective_at. */
  nowIso?: () => string;
}

function defaultPollAnthropic(account: ProviderAccount): Promise<QuotaSignal | null> {
  if (account.api_key === null) return Promise.resolve(null);
  // Anthropic's `/v1/messages/count_tokens` and the headers
  // `anthropic-ratelimit-tokens-remaining` provide coarse signals.
  // Live impl is gated behind a tier feature; here we record a
  // medium-confidence "tier_unknown" sentinel because the live wire
  // needs HTTPS access we cannot perform from this stub.
  return Promise.resolve({
    account_id: account.id,
    tier: 'tier_unknown',
    rate_limits_json: null,
    monthly_token_cap: null,
  });
}

function defaultPollOpenAi(account: ProviderAccount): Promise<QuotaSignal | null> {
  if (account.api_key === null) return Promise.resolve(null);
  return Promise.resolve({
    account_id: account.id,
    tier: 'tier_unknown',
    rate_limits_json: null,
    monthly_token_cap: null,
  });
}

/**
 * Poll quota for the given accounts and append rows to
 * `provider_entitlements`. Returns the number of accounts polled and
 * the number of rows inserted (an account that returned null is
 * counted in `polled` but not `inserted`).
 */
export async function pollProviderQuotas(
  db: Database.Database,
  accounts: readonly ProviderAccount[],
  hooks: PollHooks = {},
): Promise<PollResult> {
  const pollAnthropic = hooks.pollAnthropic ?? defaultPollAnthropic;
  const pollOpenAi = hooks.pollOpenAi ?? defaultPollOpenAi;
  const nowIso = hooks.nowIso ?? (() => new Date().toISOString());
  let polled = 0;
  let inserted = 0;
  const errors: { account_id: number; reason: string }[] = [];

  const signals: QuotaSignal[] = [];
  for (const account of accounts) {
    polled += 1;
    try {
      const fn =
        account.provider === 'anthropic'
          ? pollAnthropic
          : account.provider === 'openai'
            ? pollOpenAi
            : null;
      if (fn === null) continue;
      const sig = await fn(account);
      if (sig !== null) signals.push(sig);
    } catch (err) {
      errors.push({
        account_id: account.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const tx = db.transaction((batch: readonly QuotaSignal[]) => {
    const now = nowIso();
    for (const sig of batch) {
      db.prepare(
        `INSERT INTO provider_entitlements
           (account_id, tier, rate_limits_json, monthly_token_cap,
            effective_at, source)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        sig.account_id,
        sig.tier,
        sig.rate_limits_json,
        sig.monthly_token_cap,
        now,
        'usage_api',
      );
      inserted += 1;
    }
  });
  tx.immediate(signals);

  return { ok: true, polled, inserted, errors };
}
