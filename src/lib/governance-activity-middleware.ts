/**
 * SPEC-008 — `withGovernanceActivity` middleware (T152).
 *
 * Per FR-217 / FR-217a: every governance mutation (POST / PUT / DELETE on
 * `/api/governance/**`) emits a single `governance_api_request` activity
 * row. Captures method, URL pathname, actor info, status code, latency,
 * and request_id (when supplied via `X-Request-Id`). GET handlers are NOT
 * wrapped at the route level — they would generate too much noise on a
 * dashboard / Storybook polling loop. The wrapper itself is method-
 * agnostic; the route author decides where to apply it.
 *
 * Design:
 *   - Strict-clean: writes the activity inline via the same INSERT that
 *     `logGovernanceActivity` uses, keeping the import graph narrow.
 *   - Failure-safe: even when the wrapped handler throws, the activity
 *     row is still written (with `status_code: 500`) before the error
 *     propagates. This matches FR-217a's expectation that the mutation
 *     audit covers attempted requests, not just successful ones.
 *   - DB injection: tests pass `db` directly; production routes will
 *     resolve `getForegroundDb()` once at the route level and pass it in
 *     (the wrapper does NOT call `getForegroundDb` to keep the strict-
 *     scope test surface clean).
 *
 * @see specs/008-resource-governance/spec.md FR-217, FR-217a
 * @see specs/008-resource-governance/tasks.md T152
 */

import type Database from 'better-sqlite3';

/** Logical actor categories for the activity payload. */
export type ActorKind = 'user' | 'agent' | 'system';

/** Caller-supplied actor identification. */
export interface ActivityActor {
  kind: ActorKind;
  id: string;
}

/** Wrapper options. */
export interface WithGovernanceActivityOptions {
  /** Better-sqlite3 connection. */
  db: Database.Database;
  /** Actor descriptor; resolved by the caller (post-`requireRole`). */
  actor: ActivityActor;
  /**
   * Override the URL-derived path family. Useful when the URL pattern
   * doesn't match the canonical `/api/governance/<family>/...` shape
   * (e.g. nested adminstration endpoints).
   */
  pathFamily?: string;
}

/** Closed set of recognized governance path families. */
export const KNOWN_PATH_FAMILIES = new Set([
  'policies',
  'budgets',
  'overrides',
  'quarantine',
  'breaker',
  'operators',
  'collector',
  'ingest',
  'backfill',
]);

/**
 * Extract the path family from a URL pathname:
 *   /api/governance/policies          -> 'policies'
 *   /api/governance/policies/42       -> 'policies'
 *   /api/governance/budgets           -> 'budgets'
 *   /api/governance/breaker/state     -> 'breaker'
 *   /api/health                       -> 'unknown'
 *
 * The function returns 'unknown' for any path that does not start with
 * `/api/governance/` or whose family segment is not in
 * `KNOWN_PATH_FAMILIES`.
 */
export function pathFamilyFromUrl(pathname: string): string {
  // Match `/api/governance/<family>` where <family> is a single segment.
  const match = /^\/api\/governance\/([^/]+)/.exec(pathname);
  const family = match?.[1];
  if (family === undefined) return 'unknown';
  return KNOWN_PATH_FAMILIES.has(family) ? family : 'unknown';
}

/**
 * Public inline writer — used by route handlers that resolve `db` /
 * `actor` post-`requireRole`. The handler computes `start = Date.now()`
 * at entry and calls this once before returning the response. Unit
 * tests for routes can verify the activity row by querying `activities`
 * directly. This is the strict-clean alternative to the function-wrap
 * shape, which doesn't compose cleanly with Next's route-level
 * `requireRole` + `getForegroundDb` resolution.
 */
export function recordGovernanceMutationActivity(
  db: Database.Database,
  args: {
    method: string;
    pathname: string;
    pathFamily?: string;
    actor: ActivityActor;
    statusCode: number;
    latencyMs: number;
    requestId?: string | null;
  },
): void {
  const pathFamily =
    args.pathFamily ?? pathFamilyFromUrl(args.pathname);
  try {
    writeActivityRow(db, {
      method: args.method,
      pathname: args.pathname,
      pathFamily,
      actor: args.actor,
      statusCode: args.statusCode,
      latencyMs: args.latencyMs,
      requestId: args.requestId ?? null,
    });
  } catch {
    // Activity row failure must not poison the response.
  }
}

/** Inline activity-row writer (mirrors logGovernanceActivity). */
function writeActivityRow(
  db: Database.Database,
  args: {
    method: string;
    pathname: string;
    pathFamily: string;
    actor: ActivityActor;
    statusCode: number;
    latencyMs: number;
    requestId: string | null;
  },
): void {
  const payload = {
    method: args.method,
    path_family: args.pathFamily,
    pathname: args.pathname,
    actor_kind: args.actor.kind,
    actor_id: args.actor.id,
    status_code: args.statusCode,
    latency_ms: args.latencyMs,
    request_id: args.requestId,
  };
  const description = `${args.method} ${args.pathname} -> ${args.statusCode.toString()}`;
  db.prepare(
    'INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    'governance_api_request',
    'governance_request',
    0,
    args.actor.id,
    description,
    JSON.stringify(payload),
    0,
  );
}

/**
 * Wrap a Next.js (or any `Request -> Response`) handler so it records a
 * single `governance_api_request` activity row per invocation. The
 * wrapper preserves the handler's return type (sync or async); errors
 * propagate after the activity row is written.
 *
 * Usage:
 *   ```ts
 *   export const POST = withGovernanceActivity(handler, {
 *     db, actor: { kind: 'user', id: user.username }, pathFamily: 'policies',
 *   });
 *   ```
 */
export function withGovernanceActivity<
  Req extends Request,
  Res extends Response,
>(
  handler: (request: Req) => Res | Promise<Res>,
  options: WithGovernanceActivityOptions,
): (request: Req) => Promise<Res> {
  return async (request: Req): Promise<Res> => {
    const start = Date.now();
    const url = new URL(request.url);
    const pathname = url.pathname;
    const pathFamily =
      options.pathFamily ?? pathFamilyFromUrl(pathname);
    const requestId =
      request.headers.get('x-request-id') ??
      request.headers.get('X-Request-Id');

    let response: Res;
    let captured: { error: unknown } | null = null;
    try {
      response = await handler(request);
    } catch (err) {
      captured = { error: err };
      response = new Response(null, { status: 500 }) as unknown as Res;
    }

    const latencyMs = Date.now() - start;
    const statusCode = captured === null ? response.status : 500;
    try {
      writeActivityRow(options.db, {
        method: request.method,
        pathname,
        pathFamily,
        actor: options.actor,
        statusCode,
        latencyMs,
        requestId,
      });
    } catch {
      // Activity row failure must not poison the response. Swallow the
      // write error; FR-217a accepts best-effort capture for mutations.
    }

    if (captured !== null) {
      // Preserve the original throw shape.
      throw captured.error;
    }
    return response;
  };
}
