import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { assertFeatureFlagKey, getFeatureFlagPreflight } from '@/lib/feature-flag-service'
import { ForbiddenError } from '@/lib/workspaces'

function parseWorkspaceId(raw: unknown): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null
  const text = String(raw)
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ key: string }> }
) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { key: rawKey } = await context.params
  const key = assertFeatureFlagKey(rawKey)
  if (!key) return NextResponse.json({ error: 'Unknown feature flag' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    body = {}
  }

  const workspaceId = parseWorkspaceId(body.workspace_id) ?? (auth.user.workspace_id ?? 1)

  try {
    const result = getFeatureFlagPreflight(getDatabase(), auth.user.tenant_id ?? 1, workspaceId, key)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to run feature flag preflight' }, { status: 500 })
  }
}
