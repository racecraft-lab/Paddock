/**
 * SPEC-008 - REST route POST /api/governance/policies/[id]/promote (T075).
 *
 * Per FR-201 (CRUD surface), FR-040 (policy promotion auditable: operator,
 * before, after, etag_pre, etag_post, ts).
 *
 * Behavior:
 *   - operator+ (admin allowed via role hierarchy)
 *   - 404 if policy id not found
 *   - 409 `{code:'already_enabled'}` if `enabled_at IS NOT NULL`
 *   - else: set `enabled_at = now-iso`, bump `version`, write a
 *     `policy_promoted` activity row (FR-040 audit shape: before, after,
 *     etag_pre, etag_post)
 *   - 200 with new ETag header
 *
 * Note: the prompt referenced `appendDecision()` from
 * `@/lib/resource-decision-writer`, but that module exports `writeDecision`
 * for the evaluator hash-chain. FR-040 wants a *policy audit row* (operator,
 * before, after, etag_pre, etag_post, ts) — which is an activity row, not
 * an evaluator chain entry. The strict-clean adapter exposes
 * `logGovernanceActivity` for exactly this case, mirroring the pattern used
 * by T074's `policy_created` / `policy_edited` rows.
 *
 * @see specs/008-resource-governance/spec.md FR-201, FR-040
 * @see specs/008-resource-governance/tasks.md T075
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logGovernanceActivity,
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';
import { computeETag } from '@/lib/resource-etag';

interface PolicyRow {
  id: number;
  workspace_id: number | null;
  project_id: number | null;
  agent_id: number | null;
  policy_type: string;
  limit_kind: string;
  limit_value: number | null;
  enforcement: string;
  enforce_mode: string | null;
  window_spec_json: string | null;
  enabled: number;
  enabled_at: string | null;
  disabled_at: string | null;
  version: number;
}

const SELECT_COLUMNS = `id, workspace_id, project_id, agent_id,
        policy_type, limit_kind, limit_value, enforcement,
        enforce_mode, window_spec_json, enabled, enabled_at,
        disabled_at, version`;

interface RouteParams {
  params: Promise<{ id: string }>;
}

function policyEtag(row: PolicyRow): string {
  return computeETag(row as unknown as { version: number; [k: string]: unknown });
}

function jsonError(status: number, code: string, detail: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ code, detail, ...extra }, { status });
}

async function readId(ctx: RouteParams): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number.parseInt(id, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function loadRow(db: ReturnType<typeof getForegroundDb>, id: number): PolicyRow | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM resource_policies WHERE id = ?`)
    .get(id) as PolicyRow | undefined;
  return row ?? null;
}

/**
 * POST /api/governance/policies/[id]/promote
 */
export async function POST(request: NextRequest, ctx: RouteParams): Promise<NextResponse> {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) {
    return jsonError(auth.status, auth.status === 401 ? 'unauthorized' : 'forbidden', auth.error);
  }
  const rateCheck = mutationLimiter(request);
  if (rateCheck !== null) return rateCheck;

  const id = await readId(ctx);
  if (id === null) return jsonError(400, 'invalid_id', 'id must be a positive integer');

  try {
    const db = getForegroundDb();
    const before = loadRow(db, id);
    if (before === null) return jsonError(404, 'not_found', 'policy not found');
    if (before.enabled_at !== null) {
      return jsonError(409, 'already_enabled', 'policy is already enabled', {
        enabled_at: before.enabled_at,
      });
    }

    const etagPre = policyEtag(before);
    const now = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE resource_policies
         SET enabled_at = ?, version = version + 1,
             updated_at = ?, updated_by = ?
         WHERE id = ?`,
      ).run(now, now, auth.user.username, id);
    });
    tx.immediate();

    const after = loadRow(db, id);
    if (after === null) {
      return jsonError(500, 'internal_error', 'policy disappeared after promote');
    }
    const etagPost = policyEtag(after);

    // FR-040 audit: operator, before, after, etag_pre, etag_post, ts.
    logGovernanceActivity(db, {
      type: 'policy_promoted',
      entity_id: id,
      actor: auth.user.username,
      description: `Promoted policy ${id.toString()} (enabled_at=${now})`,
      data: {
        before: {
          version: before.version,
          enabled_at: before.enabled_at,
          disabled_at: before.disabled_at,
        },
        after: {
          version: after.version,
          enabled_at: after.enabled_at,
          disabled_at: after.disabled_at,
        },
        etag_pre: etagPre,
        etag_post: etagPost,
        ts: now,
      },
      workspace_id: before.workspace_id ?? 0,
    });

    return NextResponse.json({ policy: after }, { headers: { etag: etagPost } });
  } catch (err) {
    logRouteError('POST /api/governance/policies/[id]/promote error', err);
    return jsonError(500, 'internal_error', 'failed to promote policy');
  }
}
