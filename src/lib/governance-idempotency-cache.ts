/**
 * SPEC-008 — Idempotency-Key cache (T142).
 *
 * Per FR-209, FR-219a, FR-391. The cache:
 *
 *   - Is keyed on (actor_id, idempotency_key) — table primary key from
 *     M69. A given key may be reused across actors.
 *   - Stores a SHA-256 hex of the canonical request body so we can
 *     detect body mismatches on replay (FR-391).
 *   - Caches the original 2xx response (status + body + selected
 *     headers) verbatim so replays are byte-identical.
 *   - Retains entries for 24h (FR-219a). The reaper sweeps expired
 *     rows via the `expires_at` index.
 *
 * Replay rules (FR-219a):
 *   - Same (actor, key) + same body hash → return the cached response
 *     unchanged. The route handler should serve the response without
 *     re-running the side effect.
 *   - Same (actor, key) + DIFFERENT body hash → return 422
 *     `idempotency_key_body_mismatch` (FR-391; takes precedence over
 *     the drafted FR-209a 409 per FR-391).
 *   - Key reuse after a non-2xx terminal response is treated as a new
 *     request (no replay protection). The cache only records 2xx
 *     responses.
 *
 * Body hash contract:
 *   - The route handler MUST hash the canonical (parsed-then-stringified
 *     by Zod) request body so trivial whitespace / key-order differences
 *     do not flip the hash. The cache itself is body-shape agnostic; it
 *     only compares hex strings.
 *
 * Constant-time compare:
 *   - The body-hash compare uses `safeEquals` from
 *     `governance-constant-time.ts` per FR-219z.
 *
 * @see specs/008-resource-governance/spec.md FR-209, FR-219a, FR-391,
 *      FR-219z
 * @see specs/008-resource-governance/tasks.md T142
 * @see Constitution Convention J (strict-scope)
 */

import { createHash } from 'node:crypto';
import { getForegroundDb } from '@/lib/db/connection-pool';
import { safeEquals } from '@/lib/governance-constant-time';
import type Database from 'better-sqlite3';

/** TTL for cache entries (FR-219a). */
export const IDEMPOTENCY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Shape stored on disk when a cached response is returned. */
export interface CachedResponse {
  /** HTTP status of the original 2xx response. */
  status: number;
  /** Already-stringified JSON body. */
  body_json: string;
  /** Optional response headers (Location, ETag) the original response set. */
  headers: Record<string, string>;
}

/** Result envelope returned by `lookupIdempotency`. */
export type IdempotencyLookupResult =
  | { kind: 'miss' }
  | { kind: 'hit'; response: CachedResponse }
  | { kind: 'body_mismatch' };

/** Persisted row shape from `governance_idempotency_keys` (M69). */
interface CacheRow {
  request_body_hash: string;
  response_body_json: string;
  response_status: number;
  response_headers_json: string | null;
  expires_at: string;
}

/** Compute the canonical hash of a request body. */
export function hashRequestBody(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Sweep expired rows. Called opportunistically by `lookupIdempotency`
 * before each lookup so the cache stays bounded without a separate
 * cron. The sweep is index-driven (idx_governance_idempotency_keys_expires_at).
 */
function sweepExpired(db: Database.Database): void {
  const now = new Date().toISOString();
  db.prepare(
    `DELETE FROM governance_idempotency_keys WHERE expires_at <= ?`,
  ).run(now);
}

/**
 * Look up an idempotency-key entry. Returns `'miss'` when no row exists
 * for the (actor_id, key) tuple, `'hit'` with the cached response when
 * the body hash matches, or `'body_mismatch'` when the same key was
 * used with a different body (FR-391).
 *
 * The `now` timestamp is read inside the function so a route handler
 * does not need to thread the clock; expired rows are swept first.
 */
export function lookupIdempotency(
  args: {
    actor_id: number;
    idempotency_key: string;
    request_body_hash: string;
  },
  dbArg?: Database.Database,
): IdempotencyLookupResult {
  const db = dbArg ?? getForegroundDb();
  sweepExpired(db);

  const row = db
    .prepare(
      `SELECT request_body_hash, response_body_json, response_status,
              response_headers_json, expires_at
         FROM governance_idempotency_keys
        WHERE actor_id = ? AND idempotency_key = ?`,
    )
    .get(args.actor_id, args.idempotency_key) as CacheRow | undefined;

  if (row === undefined) return { kind: 'miss' };

  // Defense in depth: if the row slipped past the sweep (e.g., clock
  // skew), still return miss.
  if (Date.parse(row.expires_at) <= Date.now()) return { kind: 'miss' };

  if (!safeEquals(row.request_body_hash, args.request_body_hash)) {
    return { kind: 'body_mismatch' };
  }

  let headers: Record<string, string> = {};
  if (row.response_headers_json !== null) {
    try {
      const parsed = JSON.parse(row.response_headers_json) as unknown;
      if (parsed !== null && typeof parsed === 'object') {
        headers = parsed as Record<string, string>;
      }
    } catch {
      headers = {};
    }
  }

  return {
    kind: 'hit',
    response: {
      status: row.response_status,
      body_json: row.response_body_json,
      headers,
    },
  };
}

/**
 * Persist a 2xx response so future replays return it byte-identically.
 * Only call this when the route handler has produced a 2xx response;
 * 4xx/5xx responses are NOT cached per FR-219a.
 *
 * Idempotent: INSERT OR REPLACE protects against a concurrent writer
 * winning the race; the second writer overwrites with the same content
 * (the body-hash matches) so the cache row is stable.
 */
export function recordIdempotency(
  args: {
    actor_id: number;
    idempotency_key: string;
    request_body_hash: string;
    response: CachedResponse;
  },
  dbArg?: Database.Database,
): void {
  const db = dbArg ?? getForegroundDb();
  const now = new Date();
  const expires_at = new Date(now.getTime() + IDEMPOTENCY_CACHE_TTL_MS).toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO governance_idempotency_keys
       (actor_id, idempotency_key, request_body_hash,
        response_body_json, response_status, response_headers_json,
        created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    args.actor_id,
    args.idempotency_key,
    args.request_body_hash,
    args.response.body_json,
    args.response.status,
    JSON.stringify(args.response.headers),
    now.toISOString(),
    expires_at,
  );
}
