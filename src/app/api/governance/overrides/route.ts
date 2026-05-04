/**
 * SPEC-008 — REST collection routes for /api/governance/overrides (T139).
 *
 * Per FR-201, FR-180, FR-182, FR-205, FR-208a, FR-211, FR-219g, FR-219l,
 * FR-203a, FR-209, FR-219a, FR-391:
 *
 *   GET  /api/governance/overrides
 *     - viewer+
 *     - filter by ?actor=, ?policy_id=, ?active=true|false
 *     - paginated via ?limit & ?cursor
 *     - returns ETag-per-row
 *
 *   POST /api/governance/overrides
 *     - operator+ (admin allowed via role hierarchy)
 *     - body: parsed via parseOverrideGrantRequest()
 *     - mutationLimiter (60/min general bucket) + override-grant bucket
 *       (10/min/actor) layered atop
 *     - Idempotency-Key header — 24h replay cache (T142)
 *     - 201 on create, with Location + ETag
 *     - 409 idempotency conflict
 *     - 422 body mismatch (FR-391) OR validation
 *     - 423 governance_grants_disabled (FR-219d)
 *     - 429 rate-limited (governance bucket OR override bucket)
 *
 * @see specs/008-resource-governance/spec.md FR-201, FR-180, FR-205,
 *      FR-208a, FR-211, FR-219g, FR-219l, FR-203a, FR-209, FR-219a,
 *      FR-219d, FR-391
 * @see specs/008-resource-governance/tasks.md T139
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  hashRequestBody,
  lookupIdempotency,
  recordIdempotency,
} from '@/lib/governance-idempotency-cache';
import {
  checkOverrideGrantRateLimit,
  recordRateLimitBreach,
} from '@/lib/governance-rate-limit';
import {
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';
import { computeETag } from '@/lib/resource-etag';
import {
  grantOverride,
  type OverrideGrantInput,
  type OverrideScopeKind,
  type OverrideUnit,
} from '@/lib/resource-override-grant';
import {
  parseOverrideGrantRequest,
  ValidationError,
} from '@/lib/resource-validation';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface OverrideRow {
  id: number;
  scope_kind: string;
  scope_id: number | null;
  policy_id: number | null;
  granted_amount: number | null;
  granted_unit: string | null;
  reservation_id: number | null;
  reason: string;
  actor: string;
  idempotency_key: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

const SELECT_COLUMNS = `id, scope_kind, scope_id, policy_id, granted_amount,
        granted_unit, reservation_id, reason, actor, idempotency_key,
        granted_at, expires_at, revoked_at, revoked_reason`;

/**
 * Per-row ETag uses the `id`+`granted_at`+`revoked_at` triple as the
 * version proxy, since `resource_overrides` (M65h) has no version
 * column. computeETag() canonicalizes the inputs so two identical row
 * snapshots produce byte-identical ETags.
 */
function overrideEtag(row: OverrideRow): string {
  return computeETag({
    id: row.id,
    granted_at: row.granted_at,
    revoked_at: row.revoked_at,
    version: 1,
  });
}

function jsonError(
  status: number,
  code: string,
  detail: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ code, detail, ...extra }, { status });
}

function decodeCursor(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function clampLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * GET — list overrides with filters.
 *
 * Filters:
 *   - actor=<username> (TEXT match against actor column)
 *   - policy_id=<int>
 *   - active=true|false
 *
 * "active" maps to `revoked_at IS NULL AND expires_at > now()`. Inactive
 * is the inverse (revoked OR expired). Both paths use index
 * `idx_resource_overrides_active` (partial on `revoked_at IS NULL`).
 */
export function GET(request: NextRequest): NextResponse {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) {
    return jsonError(
      auth.status,
      auth.status === 401 ? 'unauthorized' : 'forbidden',
      auth.error,
    );
  }
  try {
    const db = getForegroundDb();
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const actor = url.searchParams.get('actor');
    const policyIdRaw = url.searchParams.get('policy_id');
    const active = url.searchParams.get('active');

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (actor !== null && actor.length > 0) {
      clauses.push('actor = ?');
      params.push(actor);
    }
    if (policyIdRaw !== null) {
      const policyId = Number.parseInt(policyIdRaw, 10);
      if (!Number.isInteger(policyId) || policyId <= 0) {
        return jsonError(
          400,
          'invalid_filter',
          'policy_id must be a positive integer',
        );
      }
      clauses.push('policy_id = ?');
      params.push(policyId);
    }
    if (active === 'true') {
      const now = new Date().toISOString();
      clauses.push('revoked_at IS NULL AND expires_at > ?');
      params.push(now);
    } else if (active === 'false') {
      const now = new Date().toISOString();
      clauses.push('(revoked_at IS NOT NULL OR expires_at <= ?)');
      params.push(now);
    }
    if (cursor !== null) {
      clauses.push('id > ?');
      params.push(cursor);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const fetchSql = `SELECT ${SELECT_COLUMNS} FROM resource_overrides ${whereSql} ORDER BY id ASC LIMIT ?`;
    const rows = db.prepare(fetchSql).all(...params, limit + 1) as OverrideRow[];

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = hasMore ? slice[slice.length - 1] : null;
    const nextCursor = lastRow ? lastRow.id.toString() : null;

    const withEtags = slice.map((row) => ({
      ...row,
      etag: overrideEtag(row),
    }));

    return NextResponse.json({
      overrides: withEtags,
      next_cursor: nextCursor,
    });
  } catch (err) {
    logRouteError('GET /api/governance/overrides error', err);
    return jsonError(500, 'internal_error', 'failed to list overrides');
  }
}

/**
 * POST — create a new override grant.
 *
 * Required header:
 *   Idempotency-Key: <opaque token, ≤256 chars>
 *
 * The idempotency key:
 *   - Disambiguates retried POSTs so duplicate requests return the
 *     cached 2xx response byte-identically (FR-219a).
 *   - On body mismatch with the same key → 422 (FR-391).
 *
 * Per-bucket rate limits:
 *   - General mutation bucket via `mutationLimiter` (60/min).
 *   - Override-grant bucket (`checkOverrideGrantRateLimit`) — 10/min
 *     per actor with the path-family metric label.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) {
    return jsonError(
      auth.status,
      auth.status === 401 ? 'unauthorized' : 'forbidden',
      auth.error,
    );
  }

  // General mutation bucket.
  const generalLimit = mutationLimiter(request);
  if (generalLimit !== null) {
    recordRateLimitBreach('overrides');
    return generalLimit;
  }

  // Per-actor override-grant bucket.
  const actorKey = auth.user.username;
  const overrideLimit = checkOverrideGrantRateLimit(actorKey);
  if (!overrideLimit.ok) {
    return NextResponse.json(
      {
        code: 'rate_limited',
        detail: 'override-grant rate limit exceeded (10/min/actor)',
        retry_after_ms: overrideLimit.retry_after_ms,
      },
      {
        status: 429,
        headers: {
          'retry-after': Math.ceil(overrideLimit.retry_after_ms / 1000).toString(),
        },
      },
    );
  }

  // Idempotency-Key is REQUIRED for grant creation per FR-209.
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey === null || idempotencyKey.length === 0) {
    return jsonError(
      400,
      'missing_idempotency_key',
      'Idempotency-Key header is required for override-grant creation',
    );
  }

  // Read raw body once so we can hash it for replay detection.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError(400, 'invalid_body', 'failed to read request body');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return jsonError(400, 'invalid_json', 'request body is not valid JSON');
  }

  let parsed: ReturnType<typeof parseOverrideGrantRequest>;
  try {
    parsed = parseOverrideGrantRequest(payload);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { code: 'validation_failed', detail: err.message, issues: err.issues },
        { status: 422 },
      );
    }
    throw err;
  }

  // Canonicalize the parsed body so semantically-identical bodies
  // (key order, whitespace) don't trip the body-mismatch check.
  const canonicalBody = JSON.stringify(parsed, Object.keys(parsed).sort());
  const requestBodyHash = hashRequestBody(canonicalBody);

  // Idempotency replay path — return the cached response on a hit, 422 on
  // a body mismatch.
  const db = getForegroundDb();
  const cacheLookup = lookupIdempotency(
    {
      actor_id: auth.user.id,
      idempotency_key: idempotencyKey,
      request_body_hash: requestBodyHash,
    },
    db,
  );
  if (cacheLookup.kind === 'hit') {
    return new NextResponse(cacheLookup.response.body_json, {
      status: cacheLookup.response.status,
      headers: {
        ...cacheLookup.response.headers,
        'content-type': 'application/json',
      },
    });
  }
  if (cacheLookup.kind === 'body_mismatch') {
    return NextResponse.json(
      {
        code: 'idempotency_key_body_mismatch',
        detail:
          'idempotency_key was previously used with a different request body',
      },
      { status: 422 },
    );
  }

  // Build grant input. The route layer requires a stable actor string
  // (the username) so the grant module can correlate to users.id when
  // gating on `governance_grants_disabled_at`.
  const input: OverrideGrantInput = {
    scope_kind: parsed.scope_kind as OverrideScopeKind,
    scope_id: parsed.scope_id ?? null,
    policy_id: parsed.policy_id ?? null,
    granted_amount: parsed.granted_amount ?? null,
    granted_unit: (parsed.granted_unit ?? null) as OverrideUnit | null,
    reservation_id: parsed.reservation_id ?? null,
    reason: parsed.reason,
    ttl_ms: parsed.ttl_ms,
    idempotency_key: idempotencyKey,
    actor: auth.user.username,
  };

  try {
    const result = grantOverride(input, db);
    if (!result.ok) {
      switch (result.code) {
        case 'duplicate_idempotency_key':
          return jsonError(409, 'duplicate_idempotency_key', result.detail ?? 'duplicate idempotency_key');
        case 'invalid_ttl':
          return NextResponse.json(
            {
              code: 'validation_failed',
              detail: result.detail ?? 'invalid ttl_ms',
              issues: [
                {
                  field_path: 'ttl_ms',
                  message: result.detail ?? 'ttl_ms out of range',
                  code: 'invalid_ttl',
                },
              ],
            },
            { status: 422 },
          );
        case 'governance_grants_disabled':
          return jsonError(
            423,
            'governance_grants_disabled',
            result.detail ?? 'actor grant capability disabled',
          );
        case 'policy_not_found':
          return jsonError(404, 'policy_not_found', result.detail ?? 'policy not found');
        case 'rate_limited':
          return jsonError(429, 'rate_limited', result.detail ?? 'rate limited');
      }
    }

    // Successful grant — persist the response in the idempotency cache so
    // the next replay returns it byte-identically.
    const row = db
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM resource_overrides WHERE id = ?`,
      )
      .get(result.override_id) as OverrideRow;
    const etag = overrideEtag(row);
    const location = `/api/governance/overrides/${row.id.toString()}`;
    const responseBody = JSON.stringify({
      override: { ...row, etag },
      audit_row_hash: result.audit_row_hash,
    });
    recordIdempotency(
      {
        actor_id: auth.user.id,
        idempotency_key: idempotencyKey,
        request_body_hash: requestBodyHash,
        response: {
          status: 201,
          body_json: responseBody,
          headers: { location, etag },
        },
      },
      db,
    );

    return new NextResponse(responseBody, {
      status: 201,
      headers: {
        location,
        etag,
        'content-type': 'application/json',
      },
    });
  } catch (err) {
    logRouteError('POST /api/governance/overrides error', err);
    return jsonError(500, 'internal_error', 'failed to create override');
  }
}
