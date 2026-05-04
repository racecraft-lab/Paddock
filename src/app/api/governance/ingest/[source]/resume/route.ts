/**
 * SPEC-008 — Per-source ingest breaker reset (T113).
 *
 * Per FR-090e1 (manual amber-resume / breaker reset).
 *
 * Operator workflow:
 *   1) The ingest-rate state machine transitioned the source into
 *      `circuit_open` (or `rate_limited`) and held it.
 *   2) Operator triages, fixes the upstream issue.
 *   3) `POST /api/governance/ingest/<source>/resume` clears the breaker:
 *      - resets the consecutive-drop counter (`resetIngestDrops`)
 *      - transitions state back to `accepting`
 *      - appends an audit row to `governance_health_events` with
 *        component=`ingest_breaker`, state=`manual_resume`.
 *
 * Auth: requireRole admin|operator. Mutation rate-limited.
 *
 * Path param: `<source>` — the `source_path` registered in the
 * `ingest_rate_state` table (e.g., `native_otel`, `claude_transcript`).
 *
 * 200 response:
 *   { ok: true, source, transitioned, from, to, health_event_id }
 *
 * 4xx contract:
 *   400 invalid_source     — empty / non-string source path
 *   401 unauthorized       — missing/invalid auth
 *   403 forbidden          — wrong role
 *   404 not_found          — no row in ingest_rate_state for source
 *   409 not_resumable      — current state is already `accepting`
 *   429 rate_limited       — mutationLimiter cap
 *   500 internal_error
 *
 * @see specs/008-resource-governance/spec.md FR-090e1
 * @see specs/008-resource-governance/tasks.md T113
 * @see Constitution Convention J — strict-scope module
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';
import {
  getIngestRateState,
  resetIngestDrops,
  transitionIngestRateState,
  type PersistedIngestState,
} from '@/lib/observability/ingest-rate-state';

interface RouteParams {
  params: Promise<{ source: string }>;
}

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

export async function POST(
  request: NextRequest,
  ctx: RouteParams,
): Promise<NextResponse> {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }

  const rateCheck = mutationLimiter(request);
  if (rateCheck !== null) return rateCheck;

  const { source } = await ctx.params;
  if (typeof source !== 'string' || source === '') {
    return jsonError(400, 'invalid_source', '`source` path param must be a non-empty string');
  }

  try {
    const db = getForegroundDb();

    // Look up current state — `getIngestRateState` lazy-creates a row.
    // To preserve "not_found" semantics, we probe the row first.
    const existing = db
      .prepare(`SELECT state FROM ingest_rate_state WHERE source_path = ?`)
      .get(source) as { state: PersistedIngestState } | undefined;
    if (existing === undefined) {
      return jsonError(404, 'not_found', `no ingest_rate_state row for source=${source}`);
    }
    if (existing.state === 'accepting') {
      return jsonError(409, 'not_resumable', `source=${source} is already in state=accepting`);
    }

    // Reset drops + transition back to accepting.
    let healthEventId = 0;
    let transitioned = false;
    let fromState: PersistedIngestState = existing.state;
    const tx = db.transaction(() => {
      resetIngestDrops(db, source);
      // Probe the row again (in case state changed under us).
      const cur = getIngestRateState(db, source);
      fromState = cur;
      const result = transitionIngestRateState(
        db,
        source,
        cur,
        'accepting',
        'manual_amber_resume',
        // No dwell-window enforcement on manual resume — operator override.
        { dwell_ms: 0 },
      );
      transitioned = result.transitioned;
      const auditResult = db
        .prepare(
          `INSERT INTO governance_health_events (component, state, metric_json)
           VALUES (?, ?, ?)`,
        )
        .run(
          'ingest_breaker',
          'manual_resume',
          JSON.stringify({
            source,
            actor: auth.user.username,
            from_state: fromState,
            to_state: 'accepting',
            transitioned: result.transitioned,
            transition_reason: result.transitioned ? null : (result.reason),
          }),
        );
      healthEventId = Number(auditResult.lastInsertRowid);
    });
    tx.immediate();

    return NextResponse.json(
      {
        ok: true,
        source,
        transitioned,
        from: fromState,
        to: 'accepting',
        health_event_id: healthEventId,
      },
      { status: 200 },
    );
  } catch (err) {
    logRouteError('POST /api/governance/ingest/[source]/resume error', err);
    return jsonError(500, 'internal_error', 'failed to resume ingest source');
  }
}
