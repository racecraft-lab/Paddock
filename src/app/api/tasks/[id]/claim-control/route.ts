import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'
import { mutationLimiter } from '@/lib/rate-limit'
import {
  applyTaskClaimControl,
  inputFromValidatedRequest,
  type ClaimControlResponseEnvelope,
} from '@/lib/task-claim-control'
import {
  hashClaimControlIdempotencyKey,
  hashClaimControlRequestBody,
  lookupClaimControlIdempotency,
  pruneExpiredClaimControlIdempotency,
  recordClaimControlIdempotency,
} from '@/lib/task-claim-control-idempotency'
import { validateClaimControlRequestBody, type ClaimControlSanitizedErrorCategory } from '@/lib/task-claim-control-types'
import { resolveWorkspaceScopeFromRequest, workspaceScopeError, workspaceScopePredicate } from '@/lib/workspaces'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface VisibleTaskRow {
  id: number
  workspace_id: number
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    const status = auth.status ?? 403
    return errorResponse(
      status,
      'unauthorized',
      status === 401 ? 'unauthenticated' : 'forbidden_role',
      auth.error ?? 'Authentication required',
      status === 401 ? 'unauthenticated' : 'forbidden_role',
    )
  }

  const rateCheck = mutationLimiter(request)
  if (rateCheck) {
    return errorResponse(429, 'validation_error', 'rate_limited', 'Mutation rate limit exceeded', 'rate_limited')
  }

  const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? ''
  if (idempotencyKey.length === 0) {
    return errorResponse(400, 'validation_error', 'missing_idempotency_key', 'Idempotency-Key header is required', 'missing_idempotency_key')
  }
  if (idempotencyKey.length > 256) {
    return errorResponse(422, 'validation_error', 'invalid_idempotency_key', 'Idempotency-Key is too long', 'validation_failed')
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse(400, 'validation_error', 'invalid_json', 'Request body must be valid JSON', 'invalid_json')
  }

  const validated = validateClaimControlRequestBody(rawBody)
  if (!validated.ok) {
    return errorResponse(validated.status, 'validation_error', validated.code, validated.error, 'validation_failed')
  }

  try {
    const db = getDatabase()
    const { id } = await params
    const taskId = Number(id)
    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      return errorResponse(404, 'validation_error', 'task_not_found', 'Task not found', 'task_not_found')
    }

    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user, { body: rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Record<string, unknown> : null })
    const workspaceFilter = workspaceScopePredicate(scope, 't.workspace_id')
    const task = db.prepare(`
      SELECT t.id, t.workspace_id
      FROM tasks t
      WHERE t.id = ? AND ${workspaceFilter.sql}
      LIMIT 1
    `).get(taskId, ...workspaceFilter.params) as VisibleTaskRow | undefined
    if (!task) {
      return errorResponse(404, 'validation_error', 'task_not_found', 'Task not found', 'task_not_found')
    }

    const now = new Date()
    const nowIso = now.toISOString()
    const expiresAt = new Date(now.getTime() + IDEMPOTENCY_TTL_MS).toISOString()
    pruneExpiredClaimControlIdempotency(db, nowIso)
    const idempotencyKeyHash = hashClaimControlIdempotencyKey(idempotencyKey)
    const requestBodyHash = hashClaimControlRequestBody(validated.value)
    const replay = lookupClaimControlIdempotency(db, {
      actorUserId: auth.user.id,
      workspaceId: task.workspace_id,
      taskId: task.id,
      stageKey: validated.value.stage_key,
      idempotencyKeyHash,
      requestBodyHash,
      now: nowIso,
    })
    if (replay.state === 'body_mismatch') {
      return errorResponse(
        422,
        'validation_error',
        'idempotency_key_body_mismatch',
        'Idempotency-Key was already used with a different request body',
        'idempotency_key_body_mismatch',
      )
    }
    if (replay.state === 'hit') {
      return NextResponse.json(markReplay(replay.responseBody), { status: replay.responseStatus })
    }

    const actor = {
      userId: auth.user.id,
      username: auth.user.username,
      role: auth.user.role === 'admin' ? 'admin' as const : 'operator' as const,
    }
    try {
      const controlResponse = db.transaction(() => {
        const control = applyTaskClaimControl(db, inputFromValidatedRequest(task.id, task.workspace_id, validated.value, actor))
        const responseBody = withIdempotency(control.body, {
          idempotency_key_hash: idempotencyKeyHash,
          request_body_hash: requestBodyHash,
          replayed: false,
          expires_at: expiresAt,
        })
        if (control.status < 200 || control.status > 299) {
          return { status: control.status, body: responseBody }
        }
        recordClaimControlIdempotency(db, {
          actorUserId: auth.user.id,
          workspaceId: task.workspace_id,
          taskId: task.id,
          stageKey: validated.value.stage_key,
          idempotencyKeyHash,
          action: validated.value.action,
          requestBodyHash,
          responseBody,
          responseStatus: control.status,
          responseHeaders: null,
          activityId: control.activityId,
          createdAt: nowIso,
          expiresAt,
        })
        return { status: control.status, body: responseBody }
      })()
      return NextResponse.json(controlResponse.body, { status: controlResponse.status })
    } catch {
      const cached = lookupClaimControlIdempotency(db, {
        actorUserId: auth.user.id,
        workspaceId: task.workspace_id,
        taskId: task.id,
        stageKey: validated.value.stage_key,
        idempotencyKeyHash,
        requestBodyHash,
        now: nowIso,
      })
      if (cached.state === 'hit') {
        return NextResponse.json(markReplay(cached.responseBody), { status: cached.responseStatus })
      }
      return errorResponse(500, 'validation_error', 'idempotency_storage_unavailable', 'Failed to record idempotency response', 'idempotency_storage_unavailable')
    }
  } catch (error) {
    const scoped = workspaceScopeError(error)
    if (scoped) {
      return errorResponse(
        scoped.status,
        'validation_error',
        scoped.status === 400 ? 'invalid_workspace_scope' : 'forbidden_workspace_scope',
        scoped.status === 400 ? 'Invalid workspace scope' : 'Forbidden workspace scope',
        scoped.status === 400 ? 'validation_failed' : 'forbidden_role',
      )
    }
    logger.error({ err: error }, 'POST /api/tasks/[id]/claim-control error')
    return errorResponse(500, 'validation_error', 'internal_error', 'Task claim control failed', 'internal_error')
  }
}

function withIdempotency(
  body: ClaimControlResponseEnvelope,
  idempotency: {
    readonly idempotency_key_hash: string
    readonly request_body_hash: string
    readonly replayed: boolean
    readonly expires_at: string
  },
): ClaimControlResponseEnvelope {
  return { ...body, idempotency }
}

function markReplay(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const body = value as Record<string, unknown>
  const idempotency = body.idempotency && typeof body.idempotency === 'object' && !Array.isArray(body.idempotency)
    ? { ...(body.idempotency as Record<string, unknown>), replayed: true }
    : { replayed: true }
  return { ...body, idempotency }
}

function errorResponse(
  status: number,
  outcome: 'unauthorized' | 'validation_error',
  code: string,
  message: string,
  category: ClaimControlSanitizedErrorCategory,
): NextResponse {
  return NextResponse.json({
    schema_version: 'task_claim_control_error.v1',
    outcome,
    error: { code, message },
    diagnostics: {
      sanitized_error_category: category,
      redaction_applied: false,
    },
  }, { status })
}
