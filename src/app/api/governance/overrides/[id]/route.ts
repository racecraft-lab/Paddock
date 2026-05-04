/**
 * SPEC-008 — REST per-id routes for /api/governance/overrides/[id] (T139, T153).
 *
 * GET    — viewer+; returns the override row + ETag.
 * DELETE — operator+; revokes the override (sets revoked_at + revoked_reason),
 *          calls releaseReservation when the override is reservation-tied,
 *          appends an audit row. Idempotent: 409 when already revoked,
 *          204 on success. (T153)
 *
 * Per FR-201, FR-180, FR-182, FR-294, FR-208a, FR-219g, FR-219l.
 *
 * @see specs/008-resource-governance/spec.md FR-201, FR-180, FR-182, FR-294
 * @see specs/008-resource-governance/tasks.md T139, T153
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import { appendChainEntry } from '@/lib/governance-audit-chain';
import {
  logRouteError,
  mutationLimiter,
  requireRole,
} from '@/lib/governance-route-context';
import { computeETag } from '@/lib/resource-etag';
import { releaseReservation } from '@/lib/resource-reservation-release';
import type Database from 'better-sqlite3';

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

interface RouteParams {
  params: Promise<{ id: string }>;
}

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
): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

async function readId(ctx: RouteParams): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number.parseInt(id, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function loadRow(
  db: Database.Database,
  id: number,
): OverrideRow | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM resource_overrides WHERE id = ?`)
    .get(id) as OverrideRow | undefined;
  return row ?? null;
}

/** GET /api/governance/overrides/[id] */
export async function GET(
  request: NextRequest,
  ctx: RouteParams,
): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) {
    return jsonError(
      auth.status,
      auth.status === 401 ? 'unauthorized' : 'forbidden',
      auth.error,
    );
  }
  const id = await readId(ctx);
  if (id === null) {
    return jsonError(400, 'invalid_id', 'id must be a positive integer');
  }
  try {
    const db = getForegroundDb();
    const row = loadRow(db, id);
    if (row === null) {
      return jsonError(404, 'not_found', 'override not found');
    }
    return NextResponse.json(
      { override: { ...row, etag: overrideEtag(row) } },
      { headers: { etag: overrideEtag(row) } },
    );
  } catch (err) {
    logRouteError('GET /api/governance/overrides/[id] error', err);
    return jsonError(500, 'internal_error', 'failed to read override');
  }
}

/**
 * DELETE /api/governance/overrides/[id] — revoke an active override.
 *
 * Sets `revoked_at = now()` and `revoked_reason = 'override_revoked'`.
 * When the override carries `reservation_id`, calls
 * `releaseReservation(db, id, 'operator_revoke')` so the underlying
 * reservation transitions to `state='released'`. The release primitive
 * is idempotent — if a different writer already terminated the
 * reservation, the call is a no-op (per FR-294 single-writer guarantee).
 *
 * Audit row appended via `appendChainEntry('recovery_action', ...)` so
 * the override-revocation joins the JCS chain established by the grant.
 *
 * Status codes:
 *   - 204 — revoked
 *   - 404 — override not found
 *   - 409 — already revoked
 */
export async function DELETE(
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
  const rate = mutationLimiter(request);
  if (rate !== null) return rate;

  const id = await readId(ctx);
  if (id === null) {
    return jsonError(400, 'invalid_id', 'id must be a positive integer');
  }

  try {
    const db = getForegroundDb();
    const tx = db.transaction((args: { id: number; actor: string }) => {
      const before = loadRow(db, args.id);
      if (before === null) {
        return { kind: 'not_found' as const };
      }
      if (before.revoked_at !== null) {
        return { kind: 'already_revoked' as const, row: before };
      }

      const now = new Date().toISOString();
      const update = db
        .prepare(
          `UPDATE resource_overrides
              SET revoked_at = ?,
                  revoked_reason = 'override_revoked'
              WHERE id = ? AND revoked_at IS NULL`,
        )
        .run(now, args.id);
      if (update.changes !== 1) {
        // Lost a race against a concurrent revoke. Re-read and
        // surface the already-revoked path.
        const observed = loadRow(db, args.id);
        if (observed === null) return { kind: 'not_found' as const };
        return { kind: 'already_revoked' as const, row: observed };
      }

      // FR-294: reservation release. The primitive's own CAS protects
      // against double-release; pre-existing terminal reservations are
      // surfaced as `already_released:true` (NOT an error).
      if (before.reservation_id !== null) {
        releaseReservation(db, before.reservation_id, 'operator_revoke');
      }

      // Audit row — `recovery_action` JCS chain via T148 primitive.
      const auditContent = {
        kind: 'override_revoke',
        override_id: args.id,
        actor: args.actor,
        revoked_at: now,
        reservation_id: before.reservation_id,
        scope_kind: before.scope_kind,
        scope_id: before.scope_id,
        policy_id: before.policy_id,
      };
      const { prev_hash, row_hash } = appendChainEntry(
        'recovery_action',
        auditContent,
        db,
      );
      db.prepare(
        `INSERT INTO recovery_action
           (kind, actor, scope_kind, scope_id, payload_json,
            prev_hash, row_hash, taken_at)
         VALUES ('override_revoke', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        args.actor,
        before.scope_kind,
        before.scope_id,
        JSON.stringify(auditContent),
        prev_hash,
        row_hash,
        now,
      );

      return { kind: 'revoked' as const };
    });
    const outcome = tx.immediate({ id, actor: auth.user.username });
    switch (outcome.kind) {
      case 'not_found':
        return jsonError(404, 'not_found', 'override not found');
      case 'already_revoked':
        return jsonError(
          409,
          'already_revoked',
          'override has already been revoked',
        );
      case 'revoked':
        return new NextResponse(null, { status: 204 });
    }
  } catch (err) {
    logRouteError('DELETE /api/governance/overrides/[id] error', err);
    return jsonError(500, 'internal_error', 'failed to revoke override');
  }
}
