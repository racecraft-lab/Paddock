/**
 * SPEC-007 US9 -- POST /api/task-artifacts
 *
 * Creates a task artifact via `publishArtifact` and translates the typed
 * library errors into the API Error Code Matrix (FR-122 ordering).
 *
 * Auth: requires the `viewer` role at minimum (matching /api/activities).
 * Workspace scope: resolved via `resolveWorkspaceScopeFromRequest`. Facility
 * callers can publish into any workspace; non-Facility callers are limited
 * to their active workspace (the library enforces this against the producer
 * task's workspace_id; we surface 403 for `WorkspaceMismatch`).
 *
 * Request body (JSON):
 *   {
 *     task_id: number,
 *     artifact_type: string,
 *     storage_kind: 'inline_json'|'inline_markdown'|'file'|'external_uri',
 *     content?: string,                       // inline payloads, OR base64 file
 *     file?: { content_base64: string, original_filename?: string },
 *     mime: string,
 *     schema_version?: string,
 *     supersedes?: number,
 *   }
 *
 * Response:
 *   201 -> { id, sha256, storage_uri, byte_size, redaction_status, security_scan_status }
 *   400 -> external_uri_rejected | bad_request
 *   401 -> unauthenticated (handled by requireRole)
 *   403 -> workspace_mismatch | workspace_forbidden
 *   404 -> artifact_not_found | task_not_found | supersedes_not_found
 *   409 -> cannot_supersede_quarantined | supersede_target_already_superseded | supersedes_cross_task
 *   413 -> payload_too_large
 *   415 -> unsupported_media_type
 *   422 -> secret_detected | spec009c3_artifact_invalid
 *   500 -> internal_scan_error | internal_storage_error
 *   503 -> artifact_store_disabled (FEATURE_TASK_ARTIFACTS OFF)
 *
 * GET lists admin-visible artifacts for the artifact admin panel. PUT/DELETE/
 * PATCH on this collection route fall through to the Next.js App Router default
 * 405 per FR-123.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { resolveFlag } from '@/lib/feature-flags'
import {
  resolveWorkspaceScopeFromRequest,
  workspaceScopePredicate,
  workspaceScopeError,
} from '@/lib/workspaces'
import {
  CannotSupersedeQuarantined,
  EmptyPayload,
  ExternalUriRejected,
  InternalScanError,
  InternalStorageError,
  PayloadTooLarge,
  SecretDetectedError,
  Spec009C3ArtifactValidationError,
  SupersedeTargetAlreadySuperseded,
  SupersedeTargetNotFound,
  SupersedesCrossTask,
  TaskNotFound,
  UnsupportedMimeType,
  WorkspaceMismatch,
  publishArtifact,
  type StorageKind,
  type PublishArtifactInput,
} from '@/lib/task-artifacts'

interface PublishRequestBody {
  task_id?: unknown
  artifact_type?: unknown
  storage_kind?: unknown
  content?: unknown
  file?: { content_base64?: unknown; original_filename?: unknown }
  mime?: unknown
  schema_version?: unknown
  supersedes?: unknown
}

const VALID_STORAGE_KINDS: ReadonlySet<string> = new Set([
  'inline_json',
  'inline_markdown',
  'file',
  'external_uri',
])

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'unauthenticated' : 'forbidden_admin_required' },
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
    logger.error({ err }, 'GET /api/task-artifacts scope resolution failed')
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const flagWorkspaceId = scope.workspaceIds[0] ?? 0
  if (!isFeatureTaskArtifactsEnabled(flagWorkspaceId)) {
    return NextResponse.json({ error: 'artifact_store_disabled' }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const { sql: scopeSql, params: scopeParams } = workspaceScopePredicate(scope, 'workspace_id')
  const params: Array<string | number> = [...scopeParams]
  const whereParts = [scopeSql]

  const artifactType = searchParams.get('artifact_type')?.trim()
  if (artifactType) {
    whereParts.push('artifact_type LIKE ?')
    params.push(`%${artifactType}%`)
  }

  const redactionRaw = searchParams.get('redaction_status')
  if (redactionRaw) {
    const statuses = redactionRaw.split(',').map((s) => s.trim()).filter(Boolean)
    if (statuses.length > 0) {
      whereParts.push(`redaction_status IN (${statuses.map(() => '?').join(',')})`)
      params.push(...statuses)
    }
  }

  const scanRaw = searchParams.get('security_scan_status')
  if (scanRaw) {
    const statuses = scanRaw.split(',').map((s) => s.trim()).filter(Boolean)
    if (statuses.length > 0) {
      whereParts.push(`security_scan_status IN (${statuses.map(() => '?').join(',')})`)
      params.push(...statuses)
    }
  }

  const dateFrom = searchParams.get('date_from')
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    whereParts.push('created_at >= unixepoch(?)')
    params.push(`${dateFrom}T00:00:00Z`)
  }

  const dateTo = searchParams.get('date_to')
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    whereParts.push('created_at <= unixepoch(?)')
    params.push(`${dateTo}T23:59:59Z`)
  }

  const rows = db.prepare(`
    SELECT id, task_id, workspace_id, artifact_type, storage_kind, storage_uri,
           redaction_status, security_scan_status, sha256, byte_size,
           mime_type AS mime, preview_text, schema_version, workflow_template_slug,
           original_filename, producer_agent_id, supersedes_artifact_id, created_at
    FROM task_artifacts
    WHERE ${whereParts.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT 200
  `).all(...params)

  return NextResponse.json({ rows })
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

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: PublishRequestBody
  try {
    const parsed = await request.json()
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    }
    body = parsed as PublishRequestBody
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  // Required-field validation (cheap pre-checks).
  const taskId = body.task_id
  if (typeof taskId !== 'number' || !Number.isInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: 'bad_request', detail: 'task_id_required' }, { status: 400 })
  }
  const artifactType = body.artifact_type
  if (typeof artifactType !== 'string' || artifactType.length === 0) {
    return NextResponse.json({ error: 'bad_request', detail: 'artifact_type_required' }, { status: 400 })
  }
  const storageKindRaw = body.storage_kind
  if (typeof storageKindRaw !== 'string' || !VALID_STORAGE_KINDS.has(storageKindRaw)) {
    return NextResponse.json({ error: 'bad_request', detail: 'storage_kind_invalid' }, { status: 400 })
  }
  const mime = body.mime
  if (typeof mime !== 'string' || mime.length === 0) {
    return NextResponse.json({ error: 'bad_request', detail: 'mime_required' }, { status: 400 })
  }

  const db = getDatabase()

  // Workspace scope resolution (must run before flag check so we know which
  // workspace's flags to consult; non-Facility callers always resolve to a
  // single workspace).
  let scope
  try {
    scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
  } catch (err) {
    const scopeErr = workspaceScopeError(err)
    if (scopeErr) {
      return NextResponse.json({ error: scopeErr.error }, { status: scopeErr.status })
    }
    logger.error({ err }, 'POST /api/task-artifacts scope resolution failed')
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  // Determine the workspace whose feature flags drive this publish. We use
  // the producer task's workspace_id when available; otherwise the caller's
  // resolved scope.
  const taskRow = db
    .prepare('SELECT workspace_id FROM tasks WHERE id = ?')
    .get(taskId) as { workspace_id: number } | undefined
  const flagWorkspaceId = taskRow?.workspace_id ?? scope.workspaceIds[0] ?? 0

  if (!isFeatureTaskArtifactsEnabled(flagWorkspaceId)) {
    return NextResponse.json({ error: 'artifact_store_disabled' }, { status: 503 })
  }

  // Materialize file bytes from base64 if storage_kind === 'file'.
  let fileInput: PublishArtifactInput['file']
  if (storageKindRaw === 'file') {
    const fileObj = body.file
    if (!fileObj || typeof fileObj !== 'object' || typeof fileObj.content_base64 !== 'string') {
      return NextResponse.json({ error: 'bad_request', detail: 'file_content_base64_required' }, { status: 400 })
    }
    let bytes: Buffer
    try {
      bytes = Buffer.from(fileObj.content_base64, 'base64')
    } catch {
      return NextResponse.json({ error: 'bad_request', detail: 'file_content_base64_invalid' }, { status: 400 })
    }
    fileInput = {
      bytes,
      ...(typeof fileObj.original_filename === 'string'
        ? { original_filename: fileObj.original_filename }
        : {}),
    }
  }

  // Build publishArtifact input.
  const isFacility = scope.kind === 'facility'
  const activeWorkspaceId = scope.workspaceIds[0] ?? flagWorkspaceId

  const publishInput: PublishArtifactInput = {
    task_id: taskId,
    artifact_type: artifactType,
    storage_kind: storageKindRaw as StorageKind,
    mime,
    active_workspace_id: activeWorkspaceId,
    is_facility_caller: isFacility,
    db,
    ...(typeof body.content === 'string' ? { content: body.content } : {}),
    ...(fileInput !== undefined ? { file: fileInput } : {}),
    ...(typeof body.schema_version === 'string' ? { schema_version: body.schema_version } : {}),
    ...(typeof body.supersedes === 'number' ? { supersedes: body.supersedes } : {}),
  }

  // Invoke publishArtifact and translate typed errors per the Error Code Matrix.
  try {
    const result = publishArtifact(publishInput)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    recordPublishFailureIfNeeded(db, err, {
      taskId,
      workspaceId: taskRow?.workspace_id ?? flagWorkspaceId,
      artifactType,
      schemaVersion: typeof body.schema_version === 'string' ? body.schema_version : null,
    })
    return mapPublishError(err)
  }
}

function recordPublishFailureIfNeeded(
  db: ReturnType<typeof getDatabase>,
  err: unknown,
  context: {
    taskId: number
    workspaceId: number
    artifactType: string
    schemaVersion: string | null
  },
): void {
  if (!(err instanceof Spec009C3ArtifactValidationError)) return
  try {
    db.prepare(`
      INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
      VALUES ('artifact_publish_failed', 'task', ?, 'task-artifacts', 'SPEC-009C3 artifact publish failed', ?, ?)
    `).run(
      context.taskId,
      JSON.stringify({
        error_code: err.error_code,
        artifact_type: context.artifactType,
        schema_version: context.schemaVersion,
        reason: err.message.slice(0, 500),
      }),
      context.workspaceId,
    )
  } catch (activityErr) {
    logger.warn({ err: activityErr, taskId: context.taskId }, 'failed to record artifact publish failure activity')
  }
}

function mapPublishError(err: unknown): NextResponse {
  // Order matches FR-122 precedence: (auth/workspace handled earlier),
  // 400 -> 404 -> 409 -> 413 -> 415 -> 422 -> 500.
  if (err instanceof ExternalUriRejected) {
    return NextResponse.json({ error: 'external_uri_rejected' }, { status: 400 })
  }
  if (err instanceof EmptyPayload) {
    return NextResponse.json({ error: 'empty_payload' }, { status: 400 })
  }
  if (err instanceof WorkspaceMismatch) {
    return NextResponse.json({ error: 'workspace_mismatch' }, { status: 403 })
  }
  if (err instanceof TaskNotFound) {
    return NextResponse.json({ error: 'task_not_found' }, { status: 404 })
  }
  if (err instanceof SupersedeTargetNotFound) {
    return NextResponse.json({ error: 'artifact_not_found' }, { status: 404 })
  }
  if (err instanceof SupersedesCrossTask) {
    return NextResponse.json({ error: 'supersedes_cross_task' }, { status: 400 })
  }
  if (err instanceof CannotSupersedeQuarantined) {
    return NextResponse.json({ error: 'cannot_supersede_quarantined' }, { status: 409 })
  }
  if (err instanceof SupersedeTargetAlreadySuperseded) {
    return NextResponse.json(
      {
        error: 'supersede_target_already_superseded',
        supersedes_id: err.supersedes_id,
        current_status: err.current_status,
      },
      { status: 409 },
    )
  }
  if (err instanceof PayloadTooLarge) {
    return NextResponse.json(
      { error: 'payload_too_large', limit_bytes: err.limit_bytes },
      { status: 413 },
    )
  }
  if (err instanceof UnsupportedMimeType) {
    return NextResponse.json(
      { error: 'unsupported_media_type', mime: err.mime },
      { status: 415 },
    )
  }
  if (err instanceof SecretDetectedError) {
    return NextResponse.json(
      {
        error: 'secret_detected',
        redacted_preview: err.redacted_preview,
        findings: err.findings,
      },
      { status: 422 },
    )
  }
  if (err instanceof Spec009C3ArtifactValidationError) {
    return NextResponse.json(
      { error: err.error_code, detail: err.message },
      { status: err.status },
    )
  }
  if (err instanceof InternalScanError) {
    return NextResponse.json({ error: 'internal_scan_error' }, { status: 500 })
  }
  if (err instanceof InternalStorageError) {
    return NextResponse.json({ error: 'internal_storage_error' }, { status: 500 })
  }
  logger.error({ err }, 'POST /api/task-artifacts unexpected error')
  return NextResponse.json({ error: 'internal_error' }, { status: 500 })
}
