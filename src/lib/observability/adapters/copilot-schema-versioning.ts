/**
 * SPEC-008 — GitHub Copilot CLI schema-versioning map (T100).
 *
 * Per FR-090d (schema-version capabilities) and FR-090d1 (LATEST_KNOWN
 * fallback bounded by an age threshold).
 *
 * Background: GitHub Copilot CLI changed its event schema across recent
 * releases:
 *   - ≥ 0.1.0 — "AI Credits" tier (T1) — full field set: provider,
 *     model, tokens_in, tokens_out, cost_usd, request_id, latency_ms.
 *   - ≥ 0.0.422 — "premium request" tier (T2) — partial fields:
 *     provider, model, tokens_in, tokens_out, premium_request_id.
 *     No `cost_usd`.
 *   - < 0.0.422 — legacy tier (T3) — minimal: provider, model,
 *     prompt_tokens, completion_tokens. No request id; no cost.
 *
 * The adapter caches the result of `copilot --version` once per process
 * and resolves observed schema events to a tier id. Unknown versions
 * fall back to LATEST_KNOWN_VERSION; events older than
 * `FR_090D1_AGE_THRESHOLD_MS` (default 30 days) are demoted to T3 even
 * when LATEST_KNOWN matches.
 *
 * @see specs/008-resource-governance/spec.md FR-090d, FR-090d1
 * @see specs/008-resource-governance/tasks.md T100
 * @see Constitution Convention J — strict-scope module
 */

/** Copilot schema tier ids. */
export type CopilotSchemaTier = 'T1' | 'T2' | 'T3';

/** Per-tier capability set. */
export interface CopilotSchema {
  /** Discrete tier label. */
  tier: CopilotSchemaTier;
  /** Lowest CLI version where this tier first appeared. */
  introduced_in: string;
  /** Whether the tier carries a request id usable for dedup. */
  has_request_id: boolean;
  /** Whether the tier reports `cost_usd` directly. */
  has_cost_usd: boolean;
  /** Field name for the input-token count (renamed across tiers). */
  input_tokens_field: string;
  /** Field name for the output-token count. */
  output_tokens_field: string;
}

/**
 * Static map keyed on the *minimum* CLI version that introduces the
 * tier. The lookup walks descending and picks the highest entry whose
 * version is `<=` the observed CLI version.
 */
export const COPILOT_SCHEMAS: readonly CopilotSchema[] = [
  {
    tier: 'T1',
    introduced_in: '0.1.0',
    has_request_id: true,
    has_cost_usd: true,
    input_tokens_field: 'tokens_in',
    output_tokens_field: 'tokens_out',
  },
  {
    tier: 'T2',
    introduced_in: '0.0.422',
    has_request_id: true,
    has_cost_usd: false,
    input_tokens_field: 'tokens_in',
    output_tokens_field: 'tokens_out',
  },
  {
    tier: 'T3',
    introduced_in: '0.0.0',
    has_request_id: false,
    has_cost_usd: false,
    input_tokens_field: 'prompt_tokens',
    output_tokens_field: 'completion_tokens',
  },
] as const;

/** Latest tier the adapter knows about. */
export const LATEST_KNOWN_VERSION = '0.1.0';

/** FR-090d1 fallback-age threshold (ms). Default 30 days. */
export const FR_090D1_AGE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Compare two semver-like dotted versions; returns negative when a<b,
 * 0 when equal, positive when a>b. Pre-release suffixes are ignored
 * after the first `-`.
 */
export function compareVersions(a: string, b: string): number {
  const [aHead = a] = a.split('-');
  const [bHead = b] = b.split('-');
  const aParts = aHead.split('.').map((s) => Number.parseInt(s, 10) || 0);
  const bParts = bHead.split('.').map((s) => Number.parseInt(s, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ap = aParts[i] ?? 0;
    const bp = bParts[i] ?? 0;
    if (ap !== bp) return ap - bp;
  }
  return 0;
}

/**
 * Resolve the tier for a given Copilot CLI version string. Walks
 * `COPILOT_SCHEMAS` highest-tier-first and returns the first whose
 * `introduced_in` version is `<=` the observed CLI version.
 *
 * Unknown / unparseable versions return T3 (most-permissive parse).
 */
export function resolveSchemaTierForVersion(version: string | null): CopilotSchema {
  if (version === null || version === '') {
    const fallback = COPILOT_SCHEMAS[COPILOT_SCHEMAS.length - 1];
    if (fallback === undefined) {
      // unreachable — COPILOT_SCHEMAS is non-empty
      throw new Error('copilot-schema-versioning: no schema tiers registered');
    }
    return fallback;
  }
  for (const schema of COPILOT_SCHEMAS) {
    if (compareVersions(version, schema.introduced_in) >= 0) {
      return schema;
    }
  }
  const last = COPILOT_SCHEMAS[COPILOT_SCHEMAS.length - 1];
  if (last === undefined) {
    throw new Error('copilot-schema-versioning: no schema tiers registered');
  }
  return last;
}

/**
 * Apply FR-090d1: when `version` is unknown (after LATEST_KNOWN) AND
 * the event is older than the age threshold, demote to T3. Returns the
 * effective tier the parser should use.
 */
export function applyFr090d1Fallback(args: {
  observed_schema_version: string | null;
  observed_event_timestamp_ms: number;
  now_ms?: number;
}): CopilotSchema {
  const now = args.now_ms ?? Date.now();
  const ageMs = now - args.observed_event_timestamp_ms;

  // If we recognize the version, trust it.
  if (args.observed_schema_version !== null) {
    if (compareVersions(args.observed_schema_version, LATEST_KNOWN_VERSION) <= 0) {
      return resolveSchemaTierForVersion(args.observed_schema_version);
    }
    // Version newer than LATEST_KNOWN — treat as LATEST_KNOWN unless
    // the event is also old enough to be untrustworthy.
    if (ageMs > FR_090D1_AGE_THRESHOLD_MS) {
      const t3 = COPILOT_SCHEMAS[COPILOT_SCHEMAS.length - 1];
      if (t3 === undefined) {
        throw new Error('copilot-schema-versioning: no schema tiers registered');
      }
      return t3;
    }
    return resolveSchemaTierForVersion(LATEST_KNOWN_VERSION);
  }

  // Null version: use LATEST_KNOWN unless the event is too old.
  if (ageMs > FR_090D1_AGE_THRESHOLD_MS) {
    const t3 = COPILOT_SCHEMAS[COPILOT_SCHEMAS.length - 1];
    if (t3 === undefined) {
      throw new Error('copilot-schema-versioning: no schema tiers registered');
    }
    return t3;
  }
  return resolveSchemaTierForVersion(LATEST_KNOWN_VERSION);
}
