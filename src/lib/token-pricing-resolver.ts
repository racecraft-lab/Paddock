/**
 * SPEC-008 — Token-pricing resolver.
 *
 * Per FR-260a, Q17, and tasks.md T126. Resolves the `(input_per_mtok,
 * output_per_mtok)` USD-per-million-tokens rate for a given
 * `(provider, model, scope_kind, scope_id)` tuple at a specific point
 * in time. Cost calculations on `canonical_usage_events` consume this
 * resolver to convert raw token counts to USD; SPEC-008 evaluator uses
 * the same path so policy decisions and ledger debits agree byte-wise.
 *
 * Lookup precedence (FR-260a):
 *   1. workspace-specific:  scope_kind='workspace', scope_id=<id>
 *   2. facility-default:    scope_kind='facility',  scope_id IS NULL
 *   3. fallback:            static `STATIC_MODEL_PRICING` table inlined
 *                           below, kept in lockstep with
 *                           `src/lib/token-pricing.ts` MODEL_PRICING
 *                           (STATIC_DEFAULT_PRICING when the model is
 *                           also unknown there). Inlined to keep this
 *                           strict-scope module from importing the
 *                           non-strict `token-pricing.ts` module.
 *
 * Time-effective ordering: the most-recent
 *   `effective_at <= requested_timestamp
 *   AND (expires_at IS NULL OR expires_at > requested_timestamp)`
 * row wins inside each scope. Tie on equal `effective_at` is broken by
 * `id DESC` so the latest-inserted override prevails.
 *
 * Cache: 60s in-memory TTL keyed on
 *   `${provider}|${model}|${scope_kind}|${scope_id ?? ''}|${hour-truncated effective_at}`.
 * Hour-truncation is intentional — the cache key MUST be coarse enough
 * to amortise lookups across an event-ingest burst (canonical events
 * arrive in tight clusters at the same minute) AND fine enough that a
 * within-hour pricing change still surfaces within one TTL window.
 *
 * Result `source` enum (per the prompt):
 *   - `workspace_override` — DB row at scope_kind='workspace'.
 *   - `facility_default`   — DB row at scope_kind='facility'.
 *   - `fallback`           — no DB row matched; static MODEL_PRICING.
 *
 * Column-name normalisation: M66 stores `input_per_mtok_usd` /
 * `output_per_mtok_usd`; the resolver returns `input_per_mtok` /
 * `output_per_mtok` (no `_usd` suffix) per the SPEC-008 wire-shape
 * convention. The boundary mapping is local to this module.
 *
 * @see specs/008-resource-governance/spec.md FR-260a, Q17
 * @see specs/008-resource-governance/tasks.md T126
 * @see src/lib/migrations.ts M66 — `token_pricing` schema + index
 * @see src/lib/token-pricing.ts MODEL_PRICING — kept in lockstep with
 *      the `STATIC_MODEL_PRICING` table inlined below.
 * @see Constitution Convention J — `src/lib/token-pricing-resolver.ts`
 *      is in `tsconfig.spec-strict.json` and the strict-scope ESLint
 *      override.
 */

import type Database from 'better-sqlite3';

// =============================================================================
// Static fallback pricing — kept in lockstep with `src/lib/token-pricing.ts`
// MODEL_PRICING. Inlined here (instead of imported) so this strict-scope
// module avoids a transitive dependency on `provider-subscriptions.ts`,
// which is outside SPEC-008's spec-strict-scope and currently emits
// pre-existing strict errors. M66 seeds these same rates as
// `scope_kind='facility'` rows on first migration; the fallback table
// is the documented contract for what the resolver returns when neither
// a workspace override nor a facility row matches at the requested time.
// =============================================================================

interface StaticPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

const STATIC_DEFAULT_PRICING: StaticPricing = {
  inputPerMTok: 3.0,
  outputPerMTok: 15.0,
};

const STATIC_MODEL_PRICING: Record<string, StaticPricing> = {
  'anthropic/claude-3-5-haiku-latest': { inputPerMTok: 0.8, outputPerMTok: 4.0 },
  'claude-3-5-haiku': { inputPerMTok: 0.8, outputPerMTok: 4.0 },
  'anthropic/claude-haiku-4-5': { inputPerMTok: 0.8, outputPerMTok: 4.0 },
  'claude-haiku-4-5': { inputPerMTok: 0.8, outputPerMTok: 4.0 },

  'anthropic/claude-sonnet-4-20250514': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-sonnet-4': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'anthropic/claude-sonnet-4-5': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-sonnet-4-5': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'anthropic/claude-sonnet-4-6': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-sonnet-4-6': { inputPerMTok: 3.0, outputPerMTok: 15.0 },

  'anthropic/claude-opus-4-5': { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  'claude-opus-4-5': { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  'anthropic/claude-opus-4-6': { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  'claude-opus-4-6': { inputPerMTok: 15.0, outputPerMTok: 75.0 },

  'groq/llama-3.1-8b-instant': { inputPerMTok: 0.05, outputPerMTok: 0.05 },
  'groq/llama-3.3-70b-versatile': { inputPerMTok: 0.59, outputPerMTok: 0.59 },
  'moonshot/kimi-k2.5': { inputPerMTok: 1.0, outputPerMTok: 1.0 },
  'venice/llama-3.3-70b': { inputPerMTok: 0.7, outputPerMTok: 2.8 },
  'minimax/minimax-m2.1': { inputPerMTok: 0.3, outputPerMTok: 0.3 },
  'ollama/deepseek-r1:14b': { inputPerMTok: 0.0, outputPerMTok: 0.0 },
  'ollama/qwen2.5-coder:7b': { inputPerMTok: 0.0, outputPerMTok: 0.0 },
  'ollama/qwen2.5-coder:14b': { inputPerMTok: 0.0, outputPerMTok: 0.0 },
};

function staticFallbackPricing(modelName: string): StaticPricing {
  const normalized = modelName.trim().toLowerCase();
  const exact = STATIC_MODEL_PRICING[normalized];
  if (exact !== undefined) return exact;
  for (const [model, pricing] of Object.entries(STATIC_MODEL_PRICING)) {
    const slash = model.lastIndexOf('/');
    const shortName = slash >= 0 ? model.slice(slash + 1) : model;
    if (normalized.includes(shortName)) return pricing;
  }
  return STATIC_DEFAULT_PRICING;
}

/**
 * Scope discriminator. Mirrors the `token_pricing.scope_kind` CHECK
 * constraint declared in M66. Only these two values are valid for
 * pricing; the broader scope vocabulary on other SPEC-008 tables
 * (`agent`, `project`, etc.) does not apply to pricing rows.
 */
export type PricingScopeKind = 'workspace' | 'facility';

/** Result `source` enum. */
export type PricingSource = 'workspace_override' | 'facility_default' | 'fallback';

/**
 * Resolver input. `scope_id` is required when `scope_kind='workspace'`
 * and ignored when `scope_kind='facility'`. `effective_at` is an ISO
 * 8601 timestamp; the caller is responsible for picking the right
 * point-in-time (typically the canonical event's `provider_timestamp_ms`
 * formatted as ISO).
 */
export interface PricingLookupInput {
  provider: string;
  model: string;
  scope_kind: PricingScopeKind;
  /** Required when scope_kind='workspace'; ignored otherwise. */
  scope_id?: number | null;
  /** ISO 8601 timestamp at which the price should be resolved. */
  effective_at: string;
}

/** Resolver result. Numeric values are USD per million tokens. */
export interface PricingLookupResult {
  provider: string;
  model: string;
  input_per_mtok: number;
  output_per_mtok: number;
  source: PricingSource;
}

/** Optional dependency-injection seam (deterministic tests). */
export interface ResolverOptions {
  /**
   * Override `Date.now()` so cache TTL can be exercised without
   * `vi.useFakeTimers()` (which conflicts with better-sqlite3's
   * synchronous prepared statements).
   */
  now?: () => number;
  /** Override the cache TTL in ms (defaults to 60_000). */
  ttlMs?: number;
}

interface CacheEntry {
  result: PricingLookupResult;
  expires_at_ms: number;
}

const DEFAULT_TTL_MS = 60_000;

/**
 * Hour-truncate an ISO timestamp to a stable cache-key fragment. We do
 * NOT use the raw timestamp because canonical events arrive in tight
 * clusters at the same minute — hour-bucketing keeps the cache hit
 * rate high without obscuring within-day pricing changes.
 */
function hourBucket(iso: string): string {
  // Defensive: if the input isn't ISO-shaped, fall back to a literal
  // 'invalid' bucket so the cache still behaves but never collides
  // with a real bucket.
  const idx = iso.indexOf(':');
  if (idx < 0) return 'invalid';
  // ISO format is "YYYY-MM-DDTHH:..." — slicing through the first colon
  // (exclusive) yields "YYYY-MM-DDTHH".
  return iso.slice(0, idx);
}

function cacheKey(input: PricingLookupInput): string {
  const scopeId = input.scope_id === undefined || input.scope_id === null ? '' : String(input.scope_id);
  return `${input.provider}|${input.model}|${input.scope_kind}|${scopeId}|${hourBucket(input.effective_at)}`;
}

/** Row shape returned by the lookup query. */
interface PricingRow {
  provider: string;
  model: string;
  input_per_mtok_usd: number;
  output_per_mtok_usd: number;
}

/**
 * Returns the most-recent matching row at `scope_kind` for the given
 * (provider, model, effective_at). Returns `null` when no row matches.
 *
 * Workspace rows require `scope_id` to match exactly. Facility rows
 * REQUIRE `scope_id IS NULL` (the M66 seeder writes NULL for facility
 * defaults).
 */
function lookupAtScope(
  db: Database.Database,
  provider: string,
  model: string,
  scope_kind: PricingScopeKind,
  scope_id: number | null | undefined,
  effective_at: string,
): PricingRow | null {
  if (scope_kind === 'workspace') {
    if (scope_id === undefined || scope_id === null) {
      // workspace lookup with no id is meaningless — bail to allow the
      // caller's facility fallback to take over.
      return null;
    }
    const row = db
      .prepare(
        `SELECT provider, model, input_per_mtok_usd, output_per_mtok_usd
         FROM token_pricing
         WHERE provider = ? AND model = ?
           AND scope_kind = 'workspace' AND scope_id = ?
           AND effective_at <= ?
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY effective_at DESC, id DESC
         LIMIT 1`,
      )
      .get(provider, model, scope_id, effective_at, effective_at) as PricingRow | undefined;
    return row ?? null;
  }
  // facility
  const row = db
    .prepare(
      `SELECT provider, model, input_per_mtok_usd, output_per_mtok_usd
       FROM token_pricing
       WHERE provider = ? AND model = ?
         AND scope_kind = 'facility' AND scope_id IS NULL
         AND effective_at <= ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY effective_at DESC, id DESC
       LIMIT 1`,
    )
    .get(provider, model, effective_at, effective_at) as PricingRow | undefined;
  return row ?? null;
}

/**
 * Token-pricing resolver. Constructed with a DB handle and optional
 * test seams. Stateless across constructions — the in-memory cache is
 * per-instance, so production callers should construct ONE resolver and
 * reuse it. Tests construct a fresh resolver per case to isolate the
 * cache.
 */
export class TokenPricingResolver {
  private readonly db: Database.Database;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(db: Database.Database, options: ResolverOptions = {}) {
    this.db = db;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Resolve pricing for a single (provider, model, scope, time) tuple.
   * Cache hits are O(1); misses execute at most TWO prepared statements
   * (workspace then facility) and one MODEL_PRICING lookup.
   */
  resolve(input: PricingLookupInput): PricingLookupResult {
    const key = cacheKey(input);
    const cached = this.cache.get(key);
    if (cached !== undefined && cached.expires_at_ms > this.now()) {
      return cached.result;
    }
    if (cached !== undefined) {
      // expired — drop it so subsequent set() doesn't double-grow Map
      this.cache.delete(key);
    }

    let result: PricingLookupResult | null = null;

    // 1) workspace-specific (only when caller explicitly asks for it)
    if (input.scope_kind === 'workspace') {
      const row = lookupAtScope(
        this.db,
        input.provider,
        input.model,
        'workspace',
        input.scope_id ?? null,
        input.effective_at,
      );
      if (row !== null) {
        result = {
          provider: row.provider,
          model: row.model,
          input_per_mtok: row.input_per_mtok_usd,
          output_per_mtok: row.output_per_mtok_usd,
          source: 'workspace_override',
        };
      }
    }

    // 2) facility-default (always tried as fallback when workspace miss
    // OR when the caller explicitly asked for facility)
    if (result === null) {
      const row = lookupAtScope(
        this.db,
        input.provider,
        input.model,
        'facility',
        null,
        input.effective_at,
      );
      if (row !== null) {
        result = {
          provider: row.provider,
          model: row.model,
          input_per_mtok: row.input_per_mtok_usd,
          output_per_mtok: row.output_per_mtok_usd,
          source: 'facility_default',
        };
      }
    }

    // 3) static MODEL_PRICING fallback. staticFallbackPricing() returns
    // STATIC_DEFAULT_PRICING when the model isn't keyed; the resolver
    // surfaces both as `source='fallback'` so the caller can branch on
    // whether the cost figure is operator-priced or static.
    if (result === null) {
      const fallback = staticFallbackPricing(input.model);
      result = {
        provider: input.provider,
        model: input.model,
        input_per_mtok: fallback.inputPerMTok,
        output_per_mtok: fallback.outputPerMTok,
        source: 'fallback',
      };
    }

    this.cache.set(key, {
      result,
      expires_at_ms: this.now() + this.ttlMs,
    });
    return result;
  }

  /** Drop all cached entries. Test-only helper. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Cache entry count. Test-only inspection. */
  cacheSize(): number {
    return this.cache.size;
  }
}

/**
 * Module-level convenience: construct a resolver + delegate. Callers
 * that need cache reuse should construct `TokenPricingResolver` once
 * and call `.resolve()` repeatedly. This helper exists for one-shot
 * lookups (admin tools, unit tests, debugging).
 */
export function resolveTokenPricing(
  db: Database.Database,
  input: PricingLookupInput,
  options?: ResolverOptions,
): PricingLookupResult {
  return new TokenPricingResolver(db, options).resolve(input);
}
