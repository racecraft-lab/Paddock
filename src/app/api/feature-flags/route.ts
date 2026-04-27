import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import {
  getFeatureFlagAdminStates,
  listFeatureFlagWorkspaces,
} from '@/lib/feature-flag-service'
import { ForbiddenError } from '@/lib/workspaces'

function parseWorkspaceId(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  if (!/^\d+$/.test(raw)) throw new Error('Invalid workspace_id')
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid workspace_id')
  return value
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const tenantId = auth.user.tenant_id ?? 1
    const authWorkspaceId = auth.user.workspace_id ?? 1
    const url = new URL(request.url)
    const workspaceId = parseWorkspaceId(url.searchParams.get('workspace_id'), authWorkspaceId)
    const { workspace, flags } = getFeatureFlagAdminStates(db, tenantId, workspaceId, authWorkspaceId)

    return NextResponse.json({
      workspace,
      workspaces: listFeatureFlagWorkspaces(db, tenantId, authWorkspaceId),
      flags,
      policy: {
        writes: 'human-admin-session-only',
        bulk_enable_supported: false,
        openfeature: 'server-only',
      },
    })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch feature flags'
    const status = message === 'Invalid workspace_id' ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
