/**
 * SPEC-008 — Manual breaker reset endpoint (T161).
 *
 * Per FR-006 / FR-219d.
 *
 *   POST /api/governance/breaker/reset
 *   Auth: admin only (the FR-219d "SUPER-actor" maps to the project's
 *   admin role). Operators can READ the breaker state via T160 but only
 *   admin can FORCE close it; an over-eager operator could otherwise
 *   re-arm a system that the breaker is correctly protecting.
 *
 * Side effects:
 *   - state := 'closed'
 *   - consecutive_errors := 0
 *   - manually_reset_at := now (ISO8601)
 *   - manually_reset_by := admin username
 *   - reset_at := now
 *   - notes_json updated with manual_reset_reason (when supplied)
 *   - logGovernanceActivity row written for the audit trail
 *
 * Responses:
 *   - 200 — `{ok: true, before, after}`
 *   - 401 / 403 — auth failure
 *   - 422 — reason supplied but malformed
 *
 * @see specs/008-resource-governance/spec.md FR-006, FR-219d
 * @see specs/008-resource-governance/tasks.md T161 (orchestrator plan)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logGovernanceActivity,
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';

interface BreakerRow {
  id: number;
  state: string;
  consecutive_errors: number;
  opened_at: string | null;
  reset_at: string | null;
  notes_json: string | null;
  manually_reset_at: string | null;
  manually_reset_by: string | null;
}

interface RequestBody {
  reason?: unknown;
}

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

/**
 * Reject control characters and enforce length cap on the reset reason.
 * Mirrors the inline sanitizer used by reenable-grants (FR-219c).
 */
function isReasonClean(input: string): boolean {
  if (input.length > 2048) return false;
  if (Buffer.from(input, 'utf8').toString('utf8') !== input) return false;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0x09 || code === 0x0a) continue;
    if (code < 0x20) return false;
    if (code >= 0x7f && code <= 0x9f) return false;
  }
  return true;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'admin');
  if ('error' in auth) {
    return jsonError(
      auth.status,
      auth.status === 401 ? 'unauthorized' : 'forbidden',
      auth.error,
    );
  }

  const rate = mutationLimiter(request);
  if (rate !== null) return rate;

  // Body is optional — admin may reset without a reason. When supplied,
  // it MUST sanitize cleanly.
  let reason: string | null = null;
  try {
    const body = (await request.json()) as RequestBody;
    if (body.reason !== undefined) {
      if (typeof body.reason !== 'string') {
        return NextResponse.json(
          {
            code: 'validation_failed',
            detail: 'reason must be a string when supplied',
            issues: [
              {
                field_path: 'reason',
                message: 'reason must be a string',
                code: 'invalid_type',
              },
            ],
          },
          { status: 422 },
        );
      }
      if (!isReasonClean(body.reason)) {
        return NextResponse.json(
          {
            code: 'validation_failed',
            detail:
              'reason contains invalid control characters or is not valid UTF-8',
            issues: [
              {
                field_path: 'reason',
                message: 'reason must be sanitized UTF-8 (FR-219c)',
                code: 'invalid_string',
              },
            ],
          },
          { status: 422 },
        );
      }
      reason = body.reason;
    }
  } catch {
    // Empty body is fine — only reject malformed-non-empty.
    const ct = request.headers.get('content-type');
    if (ct?.includes('json') === true) {
      // Body declared as JSON but not parseable.
      return jsonError(400, 'invalid_json', 'request body is not valid JSON');
    }
  }

  try {
    const db = getForegroundDb();
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      const before = db
        .prepare(
          `SELECT id, state, consecutive_errors, opened_at, reset_at,
                  notes_json, manually_reset_at, manually_reset_by
             FROM resource_governance_breaker
            WHERE scope_kind = 'evaluator' AND scope_id IS NULL`,
        )
        .get() as BreakerRow | undefined;

      if (before === undefined) {
        // Insert default closed row in case the breaker has never run.
        db.prepare(
          `INSERT INTO resource_governance_breaker
             (scope_kind, state, consecutive_errors,
              manually_reset_at, manually_reset_by, reset_at,
              notes_json, updated_at)
           VALUES ('evaluator', 'closed', 0, ?, ?, ?, ?, ?)`,
        ).run(
          nowIso,
          auth.user.username,
          nowIso,
          JSON.stringify({ manual_reset_reason: reason }),
          nowIso,
        );
        return {
          before: null,
          after: {
            state: 'closed' as const,
            consecutive_errors: 0,
            manually_reset_at: nowIso,
            manually_reset_by: auth.user.username,
          },
        };
      }

      const notes: Record<string, unknown> = (() => {
        try {
          return before.notes_json !== null
            ? (JSON.parse(before.notes_json) as Record<string, unknown>)
            : {};
        } catch {
          return {};
        }
      })();
      const newNotes = {
        ...notes,
        manual_reset_reason: reason,
        manual_reset_at: nowIso,
      };

      db.prepare(
        `UPDATE resource_governance_breaker
            SET state = 'closed',
                consecutive_errors = 0,
                reset_at = ?,
                manually_reset_at = ?,
                manually_reset_by = ?,
                notes_json = ?,
                updated_at = ?
          WHERE id = ?`,
      ).run(
        nowIso,
        nowIso,
        auth.user.username,
        JSON.stringify(newNotes),
        nowIso,
        before.id,
      );

      logGovernanceActivity(db, {
        type: 'governance_breaker_manually_reset',
        entity_id: before.id,
        actor: auth.user.username,
        description: `Manual breaker reset by ${auth.user.username}`,
        data: {
          previous_state: before.state,
          previous_consecutive_errors: before.consecutive_errors,
          reset_at: nowIso,
          reason,
        },
        workspace_id: 0,
      });

      return {
        before: {
          state: before.state,
          consecutive_errors: before.consecutive_errors,
          opened_at: before.opened_at,
        },
        after: {
          state: 'closed' as const,
          consecutive_errors: 0,
          manually_reset_at: nowIso,
          manually_reset_by: auth.user.username,
        },
      };
    });

    const result = tx.immediate();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logRouteError('POST /api/governance/breaker/reset error', err);
    return jsonError(500, 'internal_error', 'failed to reset breaker');
  }
}
