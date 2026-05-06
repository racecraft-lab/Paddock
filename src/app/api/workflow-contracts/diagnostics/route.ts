import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'
import { getWorkflowContractDiagnostics } from '@/lib/workflow-contracts/diagnostics'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const family = request.nextUrl.searchParams.get('family') || 'mission-control'
    const workspaceId = parseWorkspaceId(request.nextUrl.searchParams.get('workspace_id'))
    const diagnostics = getWorkflowContractDiagnostics(db, { family, workspaceId })
    return NextResponse.json(diagnostics)
  } catch (error) {
    logger.error({ err: error }, 'GET /api/workflow-contracts/diagnostics error')
    return NextResponse.json({ error: 'Failed to fetch workflow contract diagnostics' }, { status: 500 })
  }
}

function parseWorkspaceId(value: string | null): number {
  const workspaceId = Number(value ?? 1)
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) return 1
  return workspaceId
}
