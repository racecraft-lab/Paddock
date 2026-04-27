import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase, logAuditEvent } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import {
  assertFeatureFlagKey,
  getFeatureFlagAdminStates,
  getFeatureFlagPreflight,
  updateWorkspaceFeatureFlag,
} from '@/lib/feature-flag-service'
import { getFeatureFlagDefinition } from '@/lib/feature-flags'
import { ensureTenantWorkspaceAccess, ForbiddenError } from '@/lib/workspaces'

function isHumanAdmin(user: { id: number; username: string; agent_name?: string | null }): boolean {
  return user.id > 0 && user.username !== 'api' && !user.username.startsWith('agent:') && !user.agent_name
}

function parseWorkspaceId(raw: unknown): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null
  const text = String(raw)
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function requestIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ key: string }> }
) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isHumanAdmin(auth.user)) {
    return NextResponse.json({ error: 'Feature flag changes require an authenticated human admin session' }, { status: 403 })
  }

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  const { key: rawKey } = await context.params
  const key = assertFeatureFlagKey(rawKey)
  if (!key) return NextResponse.json({ error: 'Unknown feature flag' }, { status: 404 })
  const definition = getFeatureFlagDefinition(key)

  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return NextResponse.json({ error: 'Request body required' }, { status: 400 })
  }

  const workspaceId = parseWorkspaceId(body.workspace_id)
  if (!workspaceId) return NextResponse.json({ error: 'workspace_id is required' }, { status: 400 })
  if (typeof body.value !== 'boolean') return NextResponse.json({ error: 'value must be boolean' }, { status: 400 })
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (definition.requiresReason && !reason) {
    return NextResponse.json({ error: 'reason is required for this feature flag' }, { status: 400 })
  }

  const db = getDatabase()
  const tenantId = auth.user.tenant_id ?? 1
  const authWorkspaceId = auth.user.workspace_id ?? 1

  try {
    ensureTenantWorkspaceAccess(db, tenantId, workspaceId, {
      actor: auth.user.username,
      actorId: auth.user.id,
      route: `/api/feature-flags/${key}`,
      ipAddress: requestIp(request),
      userAgent: request.headers.get('user-agent') || null,
    })

    const before = getFeatureFlagAdminStates(db, tenantId, workspaceId, authWorkspaceId)
      .flags.find((flag) => flag.definition.key === key)
    if (!before) return NextResponse.json({ error: 'Unknown feature flag' }, { status: 404 })

    if (body.value === true) {
      const preflight = getFeatureFlagPreflight(db, tenantId, workspaceId, key)
      if (!preflight.can_enable) {
        return NextResponse.json({
          error: 'Feature flag cannot be enabled',
          blockers: preflight.blockers,
          checks: preflight.checks,
        }, { status: 409 })
      }
    } else if (before.env_locked) {
      return NextResponse.json({ error: 'Deployment configuration already forces this flag OFF' }, { status: 409 })
    } else if (!definition.adminManageable || definition.implementationStatus === 'not_implemented') {
      return NextResponse.json({ error: 'Feature flag is not admin-manageable' }, { status: 409 })
    }

    const updated = db.transaction(() => updateWorkspaceFeatureFlag(db, workspaceId, key, Boolean(body.value)))()
    const after = getFeatureFlagAdminStates(db, tenantId, workspaceId, authWorkspaceId)
      .flags.find((flag) => flag.definition.key === key)

    logAuditEvent({
      action: 'feature_flag_update',
      actor: auth.user.username,
      actor_id: auth.user.id,
      target_type: 'workspace',
      target_id: workspaceId,
      detail: {
        flag_key: key,
        old_stored_value: updated.oldValue,
        new_stored_value: updated.newValue,
        evaluated_value: after?.evaluated_value ?? null,
        env_locked: after?.env_locked ?? false,
        actor_kind: 'human_admin_session',
        tenant_id: tenantId,
        workspace_id: workspaceId,
        reason: reason || null,
        source: 'settings_feature_flags',
      },
      ip_address: requestIp(request),
      user_agent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({ updated: key, workspace_id: workspaceId, flag: after })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to update feature flag' }, { status: 500 })
  }
}
