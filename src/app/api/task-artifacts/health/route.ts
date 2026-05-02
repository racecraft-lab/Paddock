/**
 * SPEC-007 US10 -- GET /api/task-artifacts/health
 *
 * Returns a health snapshot for the caller's active workspace (FR-064 /
 * FR-138). Admin role required. Flag-OFF returns 503.
 *
 * Response shape:
 *   {
 *     workspace_id, counts: { total, by_redaction_status, by_security_scan_status },
 *     total_bytes, failed_publishes_24h, failed_scans_24h, failed_reads_24h,
 *     failed_disposition_inserts_24h, orphan_count, free_space_bytes,
 *     p95: { publish_p95_ms, read_p95_ms } | 'insufficient_data'
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { resolveFlag } from '@/lib/feature-flags'
import {
  resolveWorkspaceScopeFromRequest,
  workspaceScopeError,
} from '@/lib/workspaces'
import { getHealthSnapshot } from '@/lib/task-artifacts'

function isFeatureTaskArtifactsEnabled(workspaceId: number): boolean {
  const db = getDatabase()
  const row = db
    .prepare('SELECT feature_flags FROM workspaces WHERE id = ?')
    .get(workspaceId) as { feature_flags: string | null } | undefined
  return resolveFlag('FEATURE_TASK_ARTIFACTS', {
    workspaceFlags: row?.feature_flags ?? null,
  })
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json(
      {
        error:
          auth.status === 401 ? 'unauthenticated' : 'forbidden_admin_required',
      },
      { status: auth.status },
    )
  }

  const db = getDatabase()
  let scope
  try {
    scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
  } catch (err) {
    const scopeErr = workspaceScopeError(err)
    if (scopeErr) {
      return NextResponse.json({ error: scopeErr.error }, { status: scopeErr.status })
    }
    logger.error({ err }, 'GET /api/task-artifacts/health scope resolution failed')
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const workspaceId = scope.workspaceIds[0] ?? 0
  if (workspaceId === 0) {
    return NextResponse.json({ error: 'workspace_id_required' }, { status: 400 })
  }

  if (!isFeatureTaskArtifactsEnabled(workspaceId)) {
    return NextResponse.json({ error: 'artifact_store_disabled' }, { status: 503 })
  }

  try {
    const snapshot = getHealthSnapshot(db, workspaceId)
    return NextResponse.json(snapshot, { status: 200 })
  } catch (err) {
    logger.error({ err }, 'GET /api/task-artifacts/health failed')
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
