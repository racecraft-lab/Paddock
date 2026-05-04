/**
 * SPEC-008 — REST POST /api/governance/backfill/windows/[window_id]/retry (T093).
 *
 * Per FR-114a (operator-initiated retry of a failed reconciliation
 * window), FR-114b (manual-retry endpoint), FR-203 (mutation rate
 * limiter applies).
 *
 * Schema reality (M65i `reconciliation_batches`):
 *   The `state` CHECK constraint allows only:
 *     pending | running | completed | failed | failed_timeout |
 *     failed_permanent
 *   The task prompt mentioned `'retrying'` and `'cursor_stuck'` —
 *   neither is permitted by the CHECK. We map:
 *     re-queue        -> state='pending' (clears error_message;
 *                        increments attempts)
 *     "cursor_stuck"  -> derived as state='failed' AND
 *                        last_row_cursor IS NOT NULL (so the row is
 *                        already retry-eligible).
 *   Terminal `failed_permanent` and active `running` are 409.
 *
 * Behavior:
 *   - operator+ via `requireRole`.
 *   - 404 when window_id missing.
 *   - 409 when state in ('pending','running','completed',
 *     'failed_permanent') — only `failed` and `failed_timeout` are
 *     retry-eligible.
 *   - 200 with the updated row on successful re-queue.
 *
 * Uses the strict-clean adapter `@/lib/governance-route-context` for
 * `requireRole`, `mutationLimiter`, and `logRouteError`. Does NOT
 * import from `@/lib/auth` / `@/lib/workspaces` directly.
 *
 * @see specs/008-resource-governance/spec.md FR-114a, FR-114b, FR-203
 * @see src/lib/migrations.ts (065i_reconciliation_batches)
 * @see specs/008-resource-governance/tasks.md T093
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logGovernanceActivity,
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';

interface BatchRow {
  id: number;
  source_id: string;
  window_start: string;
  window_end: string;
  state: string;
  rows_processed: number;
  last_row_cursor: string | null;
  attempts: number;
  max_attempts: number;
  max_duration_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface RouteParams {
  params: Promise<{ window_id: string }>;
}

const SELECT_COLUMNS = `id, source_id, window_start, window_end, state,
        rows_processed, last_row_cursor, attempts, max_attempts,
        max_duration_seconds, started_at, completed_at, error_message,
        created_at`;

function jsonError(
  status: number,
  code: string,
  detail: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ code, detail, ...extra }, { status });
}

async function readWindowId(ctx: RouteParams): Promise<number | null> {
  const { window_id } = await ctx.params;
  const n = Number.parseInt(window_id, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function loadRow(
  db: ReturnType<typeof getForegroundDb>,
  id: number,
): BatchRow | null {
  const row = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM reconciliation_batches WHERE id = ?`,
    )
    .get(id) as BatchRow | undefined;
  return row ?? null;
}

/**
 * POST /api/governance/backfill/windows/[window_id]/retry
 */
export async function POST(
  request: NextRequest,
  ctx: RouteParams,
): Promise<NextResponse> {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) {
    return jsonError(
      auth.status,
      auth.status === 401 ? 'unauthorized' : 'forbidden',
      auth.error,
    );
  }
  const rateCheck = mutationLimiter(request);
  if (rateCheck !== null) return rateCheck;

  const id = await readWindowId(ctx);
  if (id === null) {
    return jsonError(400, 'invalid_window_id', 'window_id must be a positive integer');
  }

  try {
    const db = getForegroundDb();
    const before = loadRow(db, id);
    if (before === null) {
      return jsonError(404, 'not_found', 'reconciliation window not found');
    }

    if (
      before.state !== 'failed'
      && before.state !== 'failed_timeout'
    ) {
      return jsonError(
        409,
        'not_retry_eligible',
        `state=${before.state} is not retry-eligible`,
        { state: before.state },
      );
    }

    const tx = db.transaction((batch_id: number) => {
      db.prepare(
        `UPDATE reconciliation_batches
            SET state = 'pending',
                error_message = NULL,
                attempts = attempts + 1,
                started_at = NULL,
                completed_at = NULL
          WHERE id = ?
            AND state IN ('failed', 'failed_timeout')`,
      ).run(batch_id);
    });
    tx.immediate(id);

    const after = loadRow(db, id);
    if (after === null) {
      return jsonError(500, 'internal_error', 'window disappeared after retry');
    }

    logGovernanceActivity(db, {
      type: 'backfill_window_retry',
      entity_id: id,
      actor: auth.user.username,
      description: `Re-queued reconciliation window ${id.toString()} (was ${before.state}, attempts=${after.attempts.toString()})`,
      data: {
        before: {
          state: before.state,
          attempts: before.attempts,
          error_message: before.error_message,
          last_row_cursor: before.last_row_cursor,
        },
        after: {
          state: after.state,
          attempts: after.attempts,
        },
        ts: new Date().toISOString(),
      },
      workspace_id: 0,
    });

    return NextResponse.json({ window: after });
  } catch (err) {
    logRouteError('POST /api/governance/backfill/windows/[window_id]/retry error', err);
    return jsonError(500, 'internal_error', 'failed to re-queue window');
  }
}
