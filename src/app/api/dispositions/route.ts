import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { resolveFlag } from '@/lib/feature-flags'
import { logger } from '@/lib/logger'
import {
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
} from '@/lib/task-artifacts'
import {
  resolveWorkspaceScopeFromRequest,
  workspaceScopeError,
  workspaceScopePredicate,
} from '@/lib/workspaces'

/**
 * SPEC-007 — GET /api/dispositions (US5, FR-080)
 *
 * Filters: workspace_id (required for non-Facility callers), disposition
 * (multi-select), since/until (ISO 8601 → unix epoch), triaged_by_agent_id,
 * task_id. Opaque base64url cursor pagination on (triaged_at DESC, id DESC).
 * Auth pattern mirrors `/api/activities`.
 *
 * Error precedence (FR-122):
 *   503 disposition_logging_disabled  (flag OFF)  ← BEFORE auth so the
 *                                                   off-switch wins
 *   401 (unauthenticated)
 *   403 (workspace forbidden)
 *   400 workspace_id_required / invalid_cursor / bad_request
 *
 * Response shape (FR-080, FR-051): { dispositions, next_cursor, has_more }.
 * Note: tasks.md T1001/T1005 reference `{rows, ...}` — the spec FR-080/FR-051
 * `dispositions` key is canonical and the orchestrator's prompt agrees.
 */

interface DispositionRow {
  id: number
  task_id: number
  disposition: string
  reason: string | null
  triaged_by_agent_id: number | null
  triaged_at: number
  workspace_id: number
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function parseIsoToEpoch(value: string | null): number | null {
  if (value === null || value === '') return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return Number.NaN
  return Math.floor(ms / 1000)
}

function parsePositiveInt(value: string | null): number | null {
  if (value === null || value === '') return null
  if (!/^\d+$/.test(value)) return Number.NaN
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n <= 0) return Number.NaN
  return n
}

function parseLimit(raw: string | null): number {
  if (raw === null || raw === '') return DEFAULT_LIMIT
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(Math.floor(n), MAX_LIMIT)
}

function readQueryWorkspaceFlags(
  db: ReturnType<typeof getDatabase>,
  workspaceId: number | null,
): string | null {
  if (workspaceId === null) return null
  try {
    const row = db.prepare(
      'SELECT feature_flags FROM workspaces WHERE id = ? LIMIT 1',
    ).get(workspaceId) as { feature_flags: string | null } | undefined
    return row?.feature_flags ?? null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const db = getDatabase()
    const { searchParams } = new URL(request.url)

    // ── FR-122 step 1: 503 flag-OFF check BEFORE auth/scope/cursor. ───
    // If the caller passes a workspace_id, evaluate the flag against THAT
    // workspace's flags. Otherwise resolveFlag falls back to default-off.
    const queryWorkspaceIdRaw = searchParams.get('workspace_id')
    let queryWorkspaceId: number | null = null
    if (queryWorkspaceIdRaw !== null && /^\d+$/.test(queryWorkspaceIdRaw)) {
      const parsed = Number(queryWorkspaceIdRaw)
      if (Number.isSafeInteger(parsed) && parsed > 0) {
        queryWorkspaceId = parsed
      }
    }
    if (queryWorkspaceId !== null) {
      const workspaceFlags = readQueryWorkspaceFlags(db, queryWorkspaceId)
      const flagOn = resolveFlag('FEATURE_DISPOSITION_LOGGING', { workspaceFlags })
      if (!flagOn) {
        return NextResponse.json(
          { error: 'disposition_logging_disabled' },
          { status: 503 },
        )
      }
    }

    // ── FR-122 step 2: 401 (auth). ──────────────────────────────────
    const auth = requireRole(request, 'viewer')
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    // ── FR-122 step 3: 403/400 (workspace scope). ───────────────────
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)

    // ── Post-auth flag check (when caller did not pass workspace_id, fall
    //    back to the auth user's workspace for flag context). ─────────
    if (queryWorkspaceId === null) {
      const fallbackFlags = readQueryWorkspaceFlags(db, auth.user.workspace_id ?? null)
      const flagOn = resolveFlag('FEATURE_DISPOSITION_LOGGING', { workspaceFlags: fallbackFlags })
      if (!flagOn) {
        return NextResponse.json(
          { error: 'disposition_logging_disabled' },
          { status: 503 },
        )
      }
    }

    // Non-Facility callers MUST pass workspace_id explicitly. Facility callers
    // may omit it (kind === 'facility' covers fanned-out workspace ids).
    if (acceptedScope.kind !== 'facility' && queryWorkspaceIdRaw === null) {
      return NextResponse.json(
        { error: 'workspace_id_required' },
        { status: 400 },
      )
    }

    // ── FR-122 step 4: 400 invalid_cursor. ──────────────────────────
    const rawCursor = searchParams.get('cursor')
    let cursor: { triaged_at: number; id: number } | null = null
    if (rawCursor !== null && rawCursor !== '') {
      try {
        cursor = decodeCursor(rawCursor)
      } catch (err) {
        if (err instanceof InvalidCursorError) {
          return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 })
        }
        throw err
      }
    }

    // ── Parse filters. ──────────────────────────────────────────────
    const dispositionRaw = searchParams.get('disposition')
    const dispositionFilter = dispositionRaw
      ? dispositionRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : []

    const sinceEpoch = parseIsoToEpoch(searchParams.get('since'))
    const untilEpoch = parseIsoToEpoch(searchParams.get('until'))
    if (Number.isNaN(sinceEpoch) || Number.isNaN(untilEpoch)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    }

    const triagedByAgentId = parsePositiveInt(searchParams.get('triaged_by_agent_id'))
    const taskId = parsePositiveInt(searchParams.get('task_id'))
    if (Number.isNaN(triagedByAgentId) || Number.isNaN(taskId)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    }

    const limit = parseLimit(searchParams.get('limit'))

    // ── Build query. ────────────────────────────────────────────────
    const wsPred = workspaceScopePredicate(acceptedScope, 'workspace_id')
    const whereParts: string[] = [wsPred.sql]
    const params: Array<string | number> = [...wsPred.params]

    if (dispositionFilter.length === 1) {
      whereParts.push('disposition = ?')
      params.push(dispositionFilter[0]!)
    } else if (dispositionFilter.length > 1) {
      whereParts.push(`disposition IN (${dispositionFilter.map(() => '?').join(',')})`)
      params.push(...dispositionFilter)
    }

    if (sinceEpoch !== null) {
      whereParts.push('triaged_at >= ?')
      params.push(sinceEpoch)
    }
    if (untilEpoch !== null) {
      whereParts.push('triaged_at <= ?')
      params.push(untilEpoch)
    }
    if (triagedByAgentId !== null) {
      whereParts.push('triaged_by_agent_id = ?')
      params.push(triagedByAgentId)
    }
    if (taskId !== null) {
      whereParts.push('task_id = ?')
      params.push(taskId)
    }

    if (cursor !== null) {
      // Stable strict-less-than tuple compare in portable SQL form.
      whereParts.push('(triaged_at < ? OR (triaged_at = ? AND id < ?))')
      params.push(cursor.triaged_at, cursor.triaged_at, cursor.id)
    }

    // Fetch limit+1 to detect has_more without a separate COUNT.
    const sql = `
      SELECT id, task_id, disposition, reason, triaged_by_agent_id, triaged_at, workspace_id
      FROM task_dispositions
      WHERE ${whereParts.join(' AND ')}
      ORDER BY triaged_at DESC, id DESC
      LIMIT ?
    `
    const rows = db.prepare(sql).all(...params, limit + 1) as DispositionRow[]

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    let nextCursor: string | null = null
    if (hasMore) {
      const last = page[page.length - 1]
      if (last) {
        nextCursor = encodeCursor({ triaged_at: last.triaged_at, id: last.id })
      }
    }

    return NextResponse.json({
      dispositions: page,
      next_cursor: nextCursor,
      has_more: hasMore,
    })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) {
      return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    }
    logger.error({ err: error }, 'GET /api/dispositions error')
    return NextResponse.json({ error: 'Failed to fetch dispositions' }, { status: 500 })
  }
}
