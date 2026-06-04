import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { buildRuntimeInventoryFromDatabase, validateRuntimeInventoryFilter, type RuntimeInventoryFilters } from '@/lib/harness-adapters/runtime-inventory'
import {
  HARNESS_ADAPTER_STATES,
  RUNTIME_INVENTORY_ERROR_SCHEMA_VERSION,
  type HarnessAdapterReasonCode,
} from '@/lib/harness-adapters/types'
import { logger } from '@/lib/logger'
import { resolveWorkspaceScopeFromRequest, workspaceScopeError, workspaceScopePredicate } from '@/lib/workspaces'

const ALLOWED_QUERY_KEYS = new Set([
  'workspace_id',
  'workspace_scope',
  'task_id',
  'project_id',
  'role',
  'requested_capability',
  'state',
  'manifest_id',
])

function errorResponse(
  status: 401 | 400 | 403 | 422 | 500,
  error: string,
  options: {
    readonly message?: string
    readonly reasonCode?: HarnessAdapterReasonCode
    readonly details?: Record<string, unknown>
  } = {},
) {
  return NextResponse.json({
    schema_version: RUNTIME_INVENTORY_ERROR_SCHEMA_VERSION,
    error,
    ...(options.message ? { message: options.message } : {}),
    ...(options.reasonCode ? { reason_code: options.reasonCode } : {}),
    ...(options.details ? { details: options.details } : {}),
  }, { status })
}

function parsePositiveInteger(raw: string | null, field: string): { ok: true; value: number | undefined } | { ok: false; response: NextResponse } {
  if (raw === null || raw === '') return { ok: true, value: undefined }
  if (!/^\d+$/.test(raw)) {
    return {
      ok: false,
      response: errorResponse(422, 'invalid_filter', {
        details: { field_path: field, code: 'malformed_id', reason_code: 'authorization_denied' },
        reasonCode: 'authorization_denied',
      }),
    }
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    return {
      ok: false,
      response: errorResponse(422, 'invalid_filter', {
        details: { field_path: field, code: 'malformed_id', reason_code: 'authorization_denied' },
        reasonCode: 'authorization_denied',
      }),
    }
  }
  return { ok: true, value }
}

function parseFilters(request: NextRequest): { ok: true; filters: RuntimeInventoryFilters } | { ok: false; response: NextResponse } {
  const params = request.nextUrl.searchParams
  for (const key of params.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      return {
        ok: false,
        response: errorResponse(422, 'invalid_filter', {
          details: { field_path: key, code: 'unknown_query_key' },
        }),
      }
    }
  }

  const taskId = parsePositiveInteger(params.get('task_id'), 'task_id')
  if (!taskId.ok) return taskId
  const projectId = parsePositiveInteger(params.get('project_id'), 'project_id')
  if (!projectId.ok) return projectId

  const role = params.get('role') ?? undefined
  if (role !== undefined && !/^[a-z][a-z0-9_-]{0,63}$/.test(role)) {
    return {
      ok: false,
      response: errorResponse(422, 'invalid_filter', {
        details: { field_path: 'role', code: 'malformed_role' },
      }),
    }
  }

  const state = params.get('state') ?? undefined
  if (state !== undefined && !(HARNESS_ADAPTER_STATES as readonly string[]).includes(state)) {
    return {
      ok: false,
      response: errorResponse(422, 'invalid_filter', {
        details: { field_path: 'state', code: 'unknown_state' },
      }),
    }
  }

  const requestedCapabilityRaw = params.get('requested_capability')
  const manifestIdRaw = params.get('manifest_id')
  const closedFilter = validateRuntimeInventoryFilter({
    ...(manifestIdRaw !== null ? { manifestId: manifestIdRaw } : {}),
    ...(requestedCapabilityRaw !== null ? { requestedCapability: requestedCapabilityRaw } : {}),
  })
  if (!closedFilter.ok) {
    return {
      ok: false,
      response: errorResponse(422, 'invalid_filter', {
        reasonCode: closedFilter.reason,
        details: {
          field_path: closedFilter.field,
          code: closedFilter.code,
          reason_code: closedFilter.reason,
        },
      }),
    }
  }

  return {
    ok: true,
    filters: {
      ...(closedFilter.manifestId ? { manifestId: closedFilter.manifestId } : {}),
      ...(state ? { state: state as RuntimeInventoryFilters['state'] } : {}),
      ...(closedFilter.requestedCapability ? { requestedCapability: closedFilter.requestedCapability } : {}),
      ...(role ? { role } : {}),
      ...(projectId.value !== undefined ? { projectId: projectId.value } : {}),
      ...(taskId.value !== undefined ? { taskId: taskId.value } : {}),
    },
  }
}

function tableExists(db: ReturnType<typeof getDatabase>, table: string): boolean {
  const row = db.prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) as { ok?: number } | undefined
  return row?.ok === 1
}

function visibleProjectExists(db: ReturnType<typeof getDatabase>, workspaceIds: readonly number[], projectId: number): boolean {
  if (!tableExists(db, 'projects')) return false
  const where = workspaceScopePredicate({ workspaceIds: [...workspaceIds] }, 'workspace_id')
  const row = db.prepare(`
    SELECT id
    FROM projects
    WHERE id = ? AND ${where.sql}
    LIMIT 1
  `).get(projectId, ...where.params) as { id?: number } | undefined
  return row?.id === projectId
}

function visibleTaskExists(db: ReturnType<typeof getDatabase>, workspaceIds: readonly number[], taskId: number): boolean {
  if (!tableExists(db, 'tasks')) return false
  const where = workspaceScopePredicate({ workspaceIds: [...workspaceIds] }, 'workspace_id')
  const row = db.prepare(`
    SELECT id
    FROM tasks
    WHERE id = ? AND ${where.sql}
    LIMIT 1
  `).get(taskId, ...where.params) as { id?: number } | undefined
  return row?.id === taskId
}

function roleExists(db: ReturnType<typeof getDatabase>, workspaceIds: readonly number[], role: string): boolean {
  if (!tableExists(db, 'project_agent_assignments') || !tableExists(db, 'projects')) return false
  const where = workspaceScopePredicate({ workspaceIds: [...workspaceIds] }, 'p.workspace_id')
  const row = db.prepare(`
    SELECT paa.role
    FROM project_agent_assignments paa
    JOIN projects p ON p.id = paa.project_id
    WHERE ${where.sql} AND paa.role = ?
    LIMIT 1
  `).get(...where.params, role) as { role?: string } | undefined
  return row?.role === role
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    const status = auth.status ?? 401
    return errorResponse(status, status === 401 ? 'authentication_required' : 'authorization_denied', {
      message: status === 401 ? 'Authentication required.' : 'Requires viewer role or higher.',
      ...(status === 403 ? { reasonCode: 'authorization_denied' } : {}),
    })
  }

  try {
    const params = request.nextUrl.searchParams
    if (params.has('workspace_id') && params.has('workspace_scope')) {
      return errorResponse(400, 'invalid_scope', {
        message: 'Specify either workspace_id or workspace_scope, not both.',
        details: { fields: ['workspace_id', 'workspace_scope'] },
      })
    }

    const db = getDatabase()
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const parsed = parseFilters(request)
    if (!parsed.ok) return parsed.response

    if (parsed.filters.projectId !== undefined && !visibleProjectExists(db, scope.workspaceIds, parsed.filters.projectId)) {
      return errorResponse(403, 'authorization_denied', {
        reasonCode: 'authorization_denied',
        details: { scope: 'project' },
      })
    }

    if (parsed.filters.taskId !== undefined && !visibleTaskExists(db, scope.workspaceIds, parsed.filters.taskId)) {
      return errorResponse(403, 'authorization_denied', {
        reasonCode: 'authorization_denied',
        details: { scope: 'task' },
      })
    }

    if (parsed.filters.role !== undefined && !roleExists(db, scope.workspaceIds, parsed.filters.role)) {
      return errorResponse(422, 'invalid_filter', {
        details: { field_path: 'role', code: 'unknown_role' },
      })
    }

    return NextResponse.json(buildRuntimeInventoryFromDatabase(db, {
      scope: {
        kind: scope.kind,
        workspaceId: scope.workspaceId,
        workspaceIds: scope.workspaceIds,
      },
      filters: parsed.filters,
    }))
  } catch (error) {
    const scoped = workspaceScopeError(error)
    if (scoped) {
      if (scoped.status === 400) {
        return errorResponse(400, 'invalid_scope', {
          message: scoped.error,
          details: { fields: ['workspace_id', 'workspace_scope'] },
        })
      }
      return errorResponse(403, 'authorization_denied', {
        reasonCode: 'authorization_denied',
        details: { scope: 'workspace' },
      })
    }
    logger.error({ err: error }, 'GET /api/agents/runtime-inventory error')
    return errorResponse(500, 'runtime_inventory_unavailable', {
      message: 'Runtime inventory is unavailable.',
    })
  }
}
