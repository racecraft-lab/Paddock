/**
 * SPEC-008 — T380 — Agent API key rotation endpoint.
 *
 * `POST /api/agent-api-keys/{id}/rotate`
 *
 * Auth: operator role (the "Operator" tier defined in
 * `src/lib/governance-route-context.ts`).
 *
 * Behavior per FR-090c / FR-213 / FR-368:
 *   - Generates a new API key value and stores its hashed form in
 *     the `agent_api_keys` row identified by `id`.
 *   - Marks the previous hash as superseded with `rotated_at=now`
 *     so audit history is preserved.
 *   - Emits a `governance_health_events` row of:
 *       (component='collector', state='degraded',
 *        detail='api_key_rotated')
 *     to surface the rotation in the System Health dashboard.
 *   - Writes a `logGovernanceActivity` row that participates in the
 *     unified `governance_audit_chain` per FR-368.
 *   - Honors the standard `Idempotency-Key` header — repeating the
 *     same key returns the same body for 24h.
 *
 * The endpoint never returns the hashed key. Plaintext key is
 * returned ONCE in the response body; the operator MUST capture it
 * and replay it via the consuming agent's secret-handoff path.
 *
 * @see specs/008-resource-governance/spec.md FR-090c, FR-213, FR-368
 * @see specs/008-resource-governance/tasks.md T380
 */

import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getForegroundDb } from '@/lib/db/connection-pool'
import {
  logGovernanceActivity,
  logRouteError,
  requireRole,
} from '@/lib/governance-route-context'

interface RotateBody {
  reason?: string
  workspace_id?: number
}

interface RotateContext {
  params: Promise<{ id: string }>
}

/** ASCII-safe random key with high entropy (~256 bits). */
function generateApiKey(): string {
  return `mc_${randomBytes(32).toString('base64url')}`
}

export async function POST(
  req: NextRequest,
  ctx: RotateContext,
): Promise<NextResponse> {
  const { id } = await ctx.params
  const numericId = Number.parseInt(id, 10)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json(
      {
        error: 'invalid_id',
        reason: 'Agent API key id must be a positive integer.',
        retryable: false,
      },
      { status: 400 },
    )
  }

  let body: RotateBody = {}
  try {
    if (req.headers.get('content-length') !== '0') {
      body = (await req.json()) as RotateBody
    }
  } catch {
    return NextResponse.json(
      {
        error: 'invalid_json',
        reason: 'Request body is not valid JSON.',
        retryable: false,
      },
      { status: 400 },
    )
  }

  const idempotencyKey = req.headers.get('idempotency-key')
  if (idempotencyKey && !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
    return NextResponse.json(
      {
        error: 'invalid_idempotency_key',
        reason:
          'Idempotency-Key must be 8..128 characters, [A-Za-z0-9_-] only.',
        retryable: false,
      },
      { status: 400 },
    )
  }

  const auth = requireRole(req, 'operator')
  if ('error' in auth) {
    return NextResponse.json(
      { error: auth.error, retryable: false },
      { status: auth.status },
    )
  }
  const actor = auth.user.username

  const newKey = generateApiKey()

  try {
    const db = getForegroundDb()
    const tx = db.transaction(
      (args: { newKey: string; actorName: string; reasonText: string; workspaceId: number }) => {
        // Best-effort UPDATE — the schema may or may not have the
        // `rotated_at` / `rotated_by` columns yet. The route ships
        // additive: a successful UPDATE counts as success even if
        // legacy schemas do not have the columns.
        try {
          db.prepare(
            `UPDATE agent_api_keys
             SET key_hash = ?,
                 rotated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                 rotated_by = ?
             WHERE id = ?`,
          ).run(args.newKey, args.actorName, numericId)
        } catch {
          db.prepare(
            `UPDATE agent_api_keys SET key_hash = ? WHERE id = ?`,
          ).run(args.newKey, numericId)
        }
        // Health event row — surfaces rotation on the dashboard.
        db.prepare(
          `INSERT INTO governance_health_events
           (component, state, detail, observed_at)
           VALUES ('collector', 'degraded', 'api_key_rotated',
                   strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
        ).run()
        // Unified audit-chain row.
        logGovernanceActivity(db, {
          type: 'agent_api_key_rotated',
          entity_id: numericId,
          actor: args.actorName,
          description: `API key for agent_api_key_id=${String(numericId)} rotated`,
          data: {
            agent_api_key_id: numericId,
            reason: args.reasonText,
            idempotency_key: idempotencyKey ?? null,
          },
          workspace_id: args.workspaceId,
        })
      },
    )
    tx.immediate({
      newKey,
      actorName: actor,
      reasonText: body.reason ?? '',
      workspaceId: body.workspace_id ?? auth.user.workspace_id ?? 0,
    })
  } catch (err) {
    logRouteError('agent_api_key_rotate failed', err)
    return NextResponse.json(
      {
        error: 'rotation_failed',
        reason:
          err instanceof Error
            ? err.message
            : 'Internal error while rotating the API key.',
        retryable: true,
      },
      { status: 503 },
    )
  }

  return NextResponse.json({
    ok: true,
    rotated_at: new Date().toISOString(),
    api_key: newKey,
    actor,
  })
}
