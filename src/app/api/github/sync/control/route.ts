import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { evaluateFeatureFlagCore } from '@/lib/feature-flags'
import { getLifecycleStatusForScope, upsertLifecycleControl } from '@/lib/github-sync-lifecycle'
import {
  assertSafeLifecyclePayload,
  GITHUB_SYNC_AUTOMATION_FLAG,
  validateLifecycleControlPatch,
} from '@/lib/github-sync-lifecycle-api'
import { logger } from '@/lib/logger'
import { resolveWorkspaceScopeFromRequest, workspaceScopeError } from '@/lib/workspaces'
import type { LifecycleControlPatch, LifecycleScopeStatus } from '@/lib/github-sync-lifecycle-types'
import type Database from 'better-sqlite3'

interface ControlRow {
  enabled: number
  interval_seconds: number
  max_pages: number
  max_issues: number
  max_duration_seconds: number
  owner_project_id: number | null
  disabled_reason: string | null
}

interface ResolvedControlPatch extends Omit<LifecycleControlPatch, 'enabled' | 'disabled_reason' | 'reset_backoff'> {
  enabled: boolean
  disabled_reason: string | null
  reset_backoff: boolean
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key)
}

function readControl(
  db: Database.Database,
  workspaceId: number,
  githubRepo: string,
): ControlRow | undefined {
  return db.prepare(`
    SELECT enabled, interval_seconds, max_pages, max_issues, max_duration_seconds,
           owner_project_id, disabled_reason
    FROM github_sync_lifecycle_controls
    WHERE workspace_id = ? AND github_repo = ?
  `).get(workspaceId, githubRepo) as ControlRow | undefined
}

function readWorkspaceFlags(db: Database.Database, workspaceId: number): string | null {
  const row = db.prepare(`
    SELECT feature_flags
    FROM workspaces
    WHERE id = ?
    LIMIT 1
  `).get(workspaceId) as { feature_flags: string | null } | undefined
  return row?.feature_flags ?? null
}

function readOwnerProjectId(
  db: Database.Database,
  workspaceId: number,
  githubRepo: string,
): number | null {
  const row = db.prepare(`
    SELECT id
    FROM projects
    WHERE workspace_id = ?
      AND github_repo = ?
      AND github_sync_enabled = 1
      AND status = 'active'
    ORDER BY is_repo_sync_owner DESC, id ASC
    LIMIT 1
  `).get(workspaceId, githubRepo) as { id: number } | undefined
  return row?.id ?? null
}

function responseControl(status: LifecycleScopeStatus): Record<string, unknown> {
  return {
    workspace_id: status.scope.workspace_id,
    github_repo: status.scope.github_repo,
    owner_project_id: status.scope.owner_project_id ?? null,
    ...status.controls,
    backoff_seconds: status.backoff.seconds,
  }
}

function clearBackoff(
  db: Database.Database,
  input: { workspace_id: number; github_repo: string; now: number; emitActivity: boolean },
): void {
  db.prepare(`
    UPDATE github_sync_lifecycle_controls
    SET backoff_seconds = 0,
        next_retry_at = NULL,
        next_retry_reason = NULL,
        consecutive_failures = 0,
        updated_at = ?
    WHERE workspace_id = ? AND github_repo = ?
  `).run(input.now, input.workspace_id, input.github_repo)

  if (!input.emitActivity) return
  const data = {
    workspace_id: input.workspace_id,
    github_repo: input.github_repo,
    result: 'success',
  }
  assertSafeLifecyclePayload(data)
  db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
    VALUES ('github_sync_backoff_reset', 'github_sync_lifecycle', ?, 'github-sync-lifecycle',
      'github sync backoff reset', ?, ?, ?)
  `).run(input.workspace_id, JSON.stringify(data), input.workspace_id, input.now)
}

function patchWithExistingValues(
  patch: LifecycleControlPatch,
  body: Record<string, unknown>,
  existing: ControlRow | undefined,
): ResolvedControlPatch {
  const enabled = hasOwn(body, 'enabled')
    ? patch.enabled === true
    : existing?.enabled === 1
  return {
    workspace_id: patch.workspace_id,
    github_repo: patch.github_repo,
    enabled,
    interval_seconds: hasOwn(body, 'interval_seconds') ? patch.interval_seconds : (existing?.interval_seconds ?? patch.interval_seconds),
    max_pages: hasOwn(body, 'max_pages') ? patch.max_pages : (existing?.max_pages ?? patch.max_pages),
    max_issues: hasOwn(body, 'max_issues') ? patch.max_issues : (existing?.max_issues ?? patch.max_issues),
    max_duration_seconds: hasOwn(body, 'max_duration_seconds')
      ? patch.max_duration_seconds
      : (existing?.max_duration_seconds ?? patch.max_duration_seconds),
    disabled_reason: hasOwn(body, 'disabled_reason') ? (patch.disabled_reason ?? null) : (existing?.disabled_reason ?? null),
    reset_backoff: patch.reset_backoff === true,
  }
}

/**
 * PATCH /api/github/sync/control — mutate scoped automatic GitHub sync lifecycle controls.
 */
export async function PATCH(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 })

  try {
    const body = await request.json() as Record<string, unknown>
    const parsed = validateLifecycleControlPatch(body)
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error, code: parsed.code }, { status: parsed.status })
    }

    const db = getDatabase()
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user, {
      body,
      requireExplicitWhenEnabled: true,
    })
    if (scope.workspaceId !== parsed.value.workspace_id) {
      return NextResponse.json({ ok: false, error: 'workspace_id does not match resolved scope', code: 'workspace_scope_mismatch' }, { status: 400 })
    }

    const existing = readControl(db, parsed.value.workspace_id, parsed.value.github_repo)
    const patch = patchWithExistingValues(parsed.value, body, existing)
    const flag = evaluateFeatureFlagCore(GITHUB_SYNC_AUTOMATION_FLAG, {
      workspaceFlags: readWorkspaceFlags(db, patch.workspace_id),
    })
    if (patch.enabled && !flag.value) {
      return NextResponse.json({
        ok: false,
        error: 'FEATURE_GITHUB_SYNC_AUTOMATION is disabled',
        code: 'feature_flag_disabled',
      }, { status: 403 })
    }

    const now = Math.floor(Date.now() / 1000)
    upsertLifecycleControl(db, {
      workspace_id: patch.workspace_id,
      github_repo: patch.github_repo,
      enabled: patch.enabled,
      interval_seconds: patch.interval_seconds,
      max_pages: patch.max_pages,
      max_issues: patch.max_issues,
      max_duration_seconds: patch.max_duration_seconds,
      owner_project_id: existing?.owner_project_id ?? readOwnerProjectId(db, patch.workspace_id, patch.github_repo),
      disabled_reason: patch.disabled_reason,
      now,
    })

    if (patch.reset_backoff || !patch.enabled) {
      clearBackoff(db, {
        workspace_id: patch.workspace_id,
        github_repo: patch.github_repo,
        now,
        emitActivity: patch.reset_backoff,
      })
    }

    const status = getLifecycleStatusForScope(db, {
      workspace_id: patch.workspace_id,
      github_repo: patch.github_repo,
      now,
    })
    return NextResponse.json({
      ok: true,
      control: responseControl(status),
      ...(status.active_run ? { active_run: status.active_run } : {}),
    })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ ok: false, error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'PATCH /api/github/sync/control error')
    return NextResponse.json({ ok: false, error: 'Failed to update GitHub sync control' }, { status: 500 })
  }
}
