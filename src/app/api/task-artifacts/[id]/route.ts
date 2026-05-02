/**
 * SPEC-007 US9 -- GET /api/task-artifacts/[id]
 *
 * Returns full content + metadata for a non-quarantined artifact, or a
 * metadata stub (FR-125) for quarantined ones. Admin override (FR-065/126)
 * via `?include_quarantined=1` returns 200 + full body AND writes an
 * UNTHROTTLED `artifact_quarantined_read_overridden` activity row.
 *
 * Auth: requires `viewer` role at minimum (admin role re-checked for the
 * quarantine override branch only).
 *
 * Cross-workspace masking (FR-131.3 / CHK086 / OWASP IDOR): non-Facility
 * callers reading an id in another workspace receive 404 (NOT 403).
 *
 * Error precedence (FR-122): 503 -> 401 -> 403 -> 404 -> 423 -> 200.
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
import {
  getInlineContent,
  recordReadLatency,
} from '@/lib/task-artifacts'

interface ArtifactRowFull {
  id: number
  task_id: number
  workspace_id: number
  artifact_type: string
  storage_kind: string
  storage_uri: string | null
  redaction_status: string
  security_scan_status: string
  sha256: string | null
  byte_size: number | null
  content_json: string | null
  content_markdown: string | null
  mime_type: string | null
  preview_text: string | null
  supersedes_artifact_id: number | null
  workflow_template_slug: string | null
  schema_version: string | null
  original_filename: string | null
  producer_agent_id: number | null
  created_at: number | string
}

function isFeatureTaskArtifactsEnabled(workspaceId: number): boolean {
  const db = getDatabase()
  const row = db
    .prepare('SELECT feature_flags FROM workspaces WHERE id = ?')
    .get(workspaceId) as { feature_flags: string | null } | undefined
  return resolveFlag('FEATURE_TASK_ARTIFACTS', {
    workspaceFlags: row?.feature_flags ?? null,
  })
}

function parseIncludeQuarantined(value: string | null): boolean {
  // FR-126: only the literal '1' or 'true' (case-insensitive) means truthy.
  // Malformed values MUST be treated as false.
  if (value === null) return false
  const lower = value.toLowerCase()
  return lower === '1' || lower === 'true'
}

function lookupQuarantinedAt(db: ReturnType<typeof getDatabase>, artifactId: number): number | null {
  // No `task_artifacts.quarantined_at` column exists yet (US10 will add it).
  // For US9 we source the timestamp from the most recent quarantine activity
  // row (best-effort), falling back to null when no activity is found.
  try {
    const row = db
      .prepare(
        "SELECT created_at FROM activities WHERE entity_type = 'task_artifact' AND entity_id = ? AND type LIKE 'artifact_quarantine%' ORDER BY created_at DESC LIMIT 1",
      )
      .get(artifactId) as { created_at: number | string } | undefined
    if (row === undefined) return null
    const t = row.created_at
    if (typeof t === 'number') return t
    const parsed = Date.parse(String(t))
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
  } catch {
    return null
  }
}

function writeOverrideActivity(
  db: ReturnType<typeof getDatabase>,
  artifactId: number,
  workspaceId: number,
  userId: number | string | null,
): void {
  // FR-065: UNTHROTTLED -- one row per successful override read.
  try {
    db.prepare(
      "INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES ('artifact_quarantined_read_overridden', 'task_artifact', ?, 'task-artifacts', 'Quarantined artifact read with admin override', ?, ?)",
    ).run(
      artifactId,
      JSON.stringify({
        artifact_id: artifactId,
        actor_session_id: null,
        actor_user_id: userId,
        requested_at: Math.floor(Date.now() / 1000),
      }),
      workspaceId,
    )
  } catch (err) {
    logger.warn({
      event: 'artifact_quarantined_override_activity_write_failed',
      artifact_id: artifactId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function buildSuccessBody(row: ArtifactRowFull): Record<string, unknown> {
  const inlineContent = getInlineContent(row)
  return {
    id: row.id,
    task_id: row.task_id,
    workspace_id: row.workspace_id,
    artifact_type: row.artifact_type,
    storage_kind: row.storage_kind,
    storage_uri: row.storage_uri, // Note: FR-112 -- external_uri rows are returned but route does NOT proxy.
    redaction_status: row.redaction_status,
    security_scan_status: row.security_scan_status,
    sha256: row.sha256,
    byte_size: row.byte_size,
    mime: row.mime_type,
    preview_text: row.preview_text,
    schema_version: row.schema_version,
    workflow_template_slug: row.workflow_template_slug,
    original_filename: row.original_filename,
    producer_agent_id: row.producer_agent_id,
    supersedes_artifact_id: row.supersedes_artifact_id,
    content: inlineContent,
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const start = Date.now()
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const resolvedParams = await context.params
  const idNum = Number.parseInt(resolvedParams.id, 10)
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const db = getDatabase()

  // Workspace scope first (so we can compute Facility-vs-PL and select flag context).
  let scope
  try {
    scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
  } catch (err) {
    const scopeErr = workspaceScopeError(err)
    if (scopeErr) {
      return NextResponse.json({ error: scopeErr.error }, { status: scopeErr.status })
    }
    logger.error({ err }, 'GET /api/task-artifacts/[id] scope resolution failed')
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const isFacility = scope.kind === 'facility'
  const callerWorkspaceIds = new Set(scope.workspaceIds)

  // Look up the row WITHOUT a workspace filter so we can distinguish 404
  // (id missing) from cross-workspace (id present but caller can't see it).
  // FR-131.3 / CHK086: cross-workspace for non-Facility -> mask as 404.
  const row = db
    .prepare(
      `SELECT id, task_id, workspace_id, artifact_type, storage_kind, storage_uri,
              redaction_status, security_scan_status, sha256, byte_size,
              content_json, content_markdown, mime_type, preview_text,
              supersedes_artifact_id, workflow_template_slug, schema_version,
              original_filename, producer_agent_id, created_at
         FROM task_artifacts WHERE id = ?`,
    )
    .get(idNum) as ArtifactRowFull | undefined

  // Resolve flag for the requested artifact's workspace (when found) or
  // caller's primary workspace (when row is null) -- the 503 takes precedence
  // over 404 per FR-122.
  const flagWorkspaceId = row?.workspace_id ?? scope.workspaceIds[0] ?? 0
  if (!isFeatureTaskArtifactsEnabled(flagWorkspaceId)) {
    return NextResponse.json({ error: 'artifact_store_disabled' }, { status: 503 })
  }

  if (row === undefined) {
    return NextResponse.json({ error: 'artifact_not_found' }, { status: 404 })
  }

  // Cross-workspace masking. Non-Facility callers MUST receive 404, not 403,
  // matching tasks/[id]/route.ts:117-123 codebase precedent.
  if (!isFacility && !callerWorkspaceIds.has(row.workspace_id)) {
    return NextResponse.json({ error: 'artifact_not_found' }, { status: 404 })
  }

  // Quarantine handling (FR-125 / FR-126).
  if (row.redaction_status === 'quarantined') {
    const includeQuarantined = parseIncludeQuarantined(
      new URL(request.url).searchParams.get('include_quarantined'),
    )
    const isAdmin = auth.user.role === 'admin'
    if (includeQuarantined && isAdmin) {
      // Override granted: 200 + full body + UNTHROTTLED activity row.
      writeOverrideActivity(db, row.id, row.workspace_id, auth.user.id ?? null)
      recordReadLatency(row.workspace_id, Date.now() - start)
      return NextResponse.json(buildSuccessBody(row), { status: 200 })
    }
    // FR-125: 423 metadata-stub body. NEVER includes content / preview_text /
    // storage_uri / actor identity.
    return NextResponse.json(
      {
        error: 'artifact_locked',
        artifact_id: row.id,
        redaction_status: 'quarantined',
        quarantined_at: lookupQuarantinedAt(db, row.id),
        byte_size: row.byte_size,
        sha256: row.sha256,
        mime: row.mime_type,
      },
      { status: 423 },
    )
  }

  // Success path.
  recordReadLatency(row.workspace_id, Date.now() - start)
  return NextResponse.json(buildSuccessBody(row), { status: 200 })
}
