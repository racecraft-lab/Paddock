import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { resolveFlag } from '@/lib/feature-flags'
import { initializeLabels } from '@/lib/github-sync-engine'
import {
  resolveWorkspaceScopeFromRequest,
  workspaceScopeError,
  workspaceScopePredicate,
} from '@/lib/workspaces'

// SPEC-006 / FR-034 — RFC 1123 / Kubernetes DNS label, max 32 chars
const AREA_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/

const AREA_ROUTING_FIELDS = [
  'area_slug',
  'is_triage_project',
  'is_repo_sync_owner',
  'transfer_owner',
] as const

type AreaRoutingField = (typeof AREA_ROUTING_FIELDS)[number]

function classifyError(err: unknown): string {
  if (!(err instanceof Error)) return 'UnknownError'
  const msg = err.message
  if (/UNIQUE/i.test(msg)) return 'SqliteUniqueViolation'
  if (/SQLITE_CONSTRAINT/i.test(msg)) return 'SqliteConstraintViolation'
  return err.name || 'UnknownError'
}

function normalizePrefix(input: string): string {
  const normalized = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalized.slice(0, 12)
}

function toProjectId(raw: string): number {
  const id = Number.parseInt(raw, 10)
  return Number.isFinite(id) ? id : NaN
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const scopeFilter = workspaceScopePredicate(acceptedScope, 'p.workspace_id')
    const { id } = await params
    const projectId = toProjectId(id)
    if (Number.isNaN(projectId)) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    const projectScope = db.prepare(`
      SELECT p.id, p.workspace_id
      FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.id = ? AND ${scopeFilter.sql} AND w.tenant_id = ?
      LIMIT 1
    `).get(projectId, ...scopeFilter.params, acceptedScope.tenantId) as { workspace_id: number } | undefined
    if (!projectScope) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const workspaceId = projectScope.workspace_id

    const row = db.prepare(`
      SELECT p.id, p.workspace_id, p.name, p.slug, p.description, p.ticket_prefix, p.ticket_counter, p.status,
             p.github_repo, p.deadline, p.color, p.github_sync_enabled, p.github_labels_initialized, p.github_default_branch, p.created_at, p.updated_at,
             (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
             (SELECT GROUP_CONCAT(paa.agent_name) FROM project_agent_assignments paa WHERE paa.project_id = p.id) as assigned_agents_csv
      FROM projects p
      WHERE p.id = ? AND p.workspace_id = ?
    `).get(projectId, workspaceId) as Record<string, unknown> | undefined
    if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const project = {
      ...row,
      assigned_agents: row.assigned_agents_csv ? String(row.assigned_agents_csv).split(',') : [],
      assigned_agents_csv: undefined,
    }

    return NextResponse.json({ project })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'GET /api/projects/[id] error')
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const db = getDatabase()
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const scopeFilter = workspaceScopePredicate(acceptedScope, 'p.workspace_id')
    const { id } = await params
    const projectId = toProjectId(id)
    if (Number.isNaN(projectId)) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    const projectScope = db.prepare(`
      SELECT p.id, p.workspace_id
      FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.id = ? AND ${scopeFilter.sql} AND w.tenant_id = ?
      LIMIT 1
    `).get(projectId, ...scopeFilter.params, acceptedScope.tenantId) as { workspace_id: number } | undefined
    if (!projectScope) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const workspaceId = projectScope.workspace_id

    const current = db.prepare(`SELECT * FROM projects WHERE id = ? AND workspace_id = ?`).get(projectId, workspaceId) as any
    if (!current) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (current.slug === 'general' && current.workspace_id === workspaceId && current.id === projectId) {
      const body = await request.json()
      if (body?.status === 'archived') {
        return NextResponse.json({ error: 'Default project cannot be archived' }, { status: 400 })
      }
    }

    const body = await request.json()
    const updates: string[] = []
    const paramsList: Array<string | number | null> = []

    if (typeof body?.name === 'string') {
      const name = body.name.trim()
      if (!name) return NextResponse.json({ error: 'Project name cannot be empty' }, { status: 400 })
      updates.push('name = ?')
      paramsList.push(name)
    }
    if (typeof body?.description === 'string') {
      updates.push('description = ?')
      paramsList.push(body.description.trim() || null)
    }
    if (typeof body?.ticket_prefix === 'string' || typeof body?.ticketPrefix === 'string') {
      const raw = String(body.ticket_prefix ?? body.ticketPrefix)
      const prefix = normalizePrefix(raw)
      if (!prefix) return NextResponse.json({ error: 'Invalid ticket prefix' }, { status: 400 })
      const conflict = db.prepare(`
        SELECT id FROM projects
        WHERE workspace_id = ? AND ticket_prefix = ? AND id != ?
      `).get(workspaceId, prefix, projectId)
      if (conflict) return NextResponse.json({ error: 'Ticket prefix already in use' }, { status: 409 })
      updates.push('ticket_prefix = ?')
      paramsList.push(prefix)
    }
    if (typeof body?.status === 'string') {
      const status = body.status === 'archived' ? 'archived' : 'active'
      updates.push('status = ?')
      paramsList.push(status)
    }
    if (body?.github_repo !== undefined) {
      updates.push('github_repo = ?')
      paramsList.push(typeof body.github_repo === 'string' ? body.github_repo.trim() || null : null)
    }
    if (body?.deadline !== undefined) {
      updates.push('deadline = ?')
      paramsList.push(typeof body.deadline === 'number' ? body.deadline : null)
    }
    if (body?.color !== undefined) {
      updates.push('color = ?')
      paramsList.push(typeof body.color === 'string' ? body.color.trim() || null : null)
    }
    if (body?.github_sync_enabled !== undefined) {
      updates.push('github_sync_enabled = ?')
      paramsList.push(body.github_sync_enabled ? 1 : 0)
    }
    if (body?.github_default_branch !== undefined) {
      updates.push('github_default_branch = ?')
      paramsList.push(typeof body.github_default_branch === 'string' ? body.github_default_branch.trim() || 'main' : 'main')
    }
    if (body?.github_labels_initialized !== undefined) {
      updates.push('github_labels_initialized = ?')
      paramsList.push(body.github_labels_initialized ? 1 : 0)
    }

    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

    updates.push('updated_at = unixepoch()')
    db.prepare(`
      UPDATE projects
      SET ${updates.join(', ')}
      WHERE id = ? AND workspace_id = ?
    `).run(...paramsList, projectId, workspaceId)

    const project = db.prepare(`
      SELECT id, workspace_id, name, slug, description, ticket_prefix, ticket_counter, status,
             github_repo, deadline, color, github_sync_enabled, github_labels_initialized, github_default_branch, created_at, updated_at
      FROM projects
      WHERE id = ? AND workspace_id = ?
    `).get(projectId, workspaceId)

    return NextResponse.json({ project })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'PATCH /api/projects/[id] error')
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

// ── SPEC-006 / FR-033..FR-064 — PUT /api/projects/[id] ────────────
//
// Adds four optional area-routing request fields and three structured 409
// shapes. Validation precedence (FR-057) is canonical:
//   1) auth (401) → 2) role (403) → 3) scope (404) →
//   4) flag-OFF defense-in-depth (400 feature_flag_disabled) →
//   5) format (400 invalid_area_slug) →
//   6) idempotent short-circuit (FR-059) →
//   7) uniqueness pre-check chain (409 area_slug → triage → owner) →
//   8) atomic write inside `db.transaction`.
//
// `transfer_owner=true` paired with `is_repo_sync_owner=true` performs a
// clear-then-set atomic swap (FR-037). The clear-then-set order is required
// because SQLite UNIQUE constraints (including partial unique indexes) are
// IMMEDIATE — a set-first ordering raises a UNIQUE violation.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // (1) Auth + (2) role.
  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  let workspaceId = 0
  let projectId = NaN
  try {
    const db = getDatabase()
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const scopeFilter = workspaceScopePredicate(acceptedScope, 'p.workspace_id')
    const { id } = await params
    projectId = toProjectId(id)
    if (Number.isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    // (3) Project scope check (404).
    const projectScope = db.prepare(`
      SELECT p.id, p.workspace_id
      FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.id = ? AND ${scopeFilter.sql} AND w.tenant_id = ?
      LIMIT 1
    `).get(projectId, ...scopeFilter.params, acceptedScope.tenantId) as
      | { workspace_id: number }
      | undefined
    if (!projectScope) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    workspaceId = projectScope.workspace_id

    // Load workspace flags for resolveFlag.
    const flagsRow = db.prepare(
      `SELECT feature_flags FROM workspaces WHERE id = ?`,
    ).get(workspaceId) as { feature_flags: string | null } | undefined
    const areaRoutingOn = resolveFlag('FEATURE_AREA_LABEL_ROUTING', {
      workspaceFlags: flagsRow?.feature_flags ?? null,
    })

    const body = (await request.json()) as Record<string, unknown>

    // (4) Flag-OFF defense-in-depth (FR-040a, FR-057 step 4).
    // Any non-undefined value of the four new fields triggers 400 when flag is OFF.
    const presentFields: AreaRoutingField[] = AREA_ROUTING_FIELDS.filter(
      (f) => Object.prototype.hasOwnProperty.call(body, f) && body[f] !== undefined,
    )
    if (!areaRoutingOn && presentFields.length > 0) {
      logger.error(
        {
          event: 'project_put_validation_failed',
          workspace_id: workspaceId,
          error_class: 'FeatureFlagDisabled',
          error_message: 'flag OFF for area-routing fields',
        },
        'PUT /api/projects/[id] flag-disabled rejection',
      )
      return NextResponse.json(
        {
          error: 'feature_flag_disabled',
          message:
            'FEATURE_AREA_LABEL_ROUTING is not enabled for this workspace; area-routing fields cannot be set.',
          fields: presentFields,
        },
        { status: 400 },
      )
    }

    // Load current row for idempotent short-circuit + post-write diff.
    const current = db.prepare(`
      SELECT id, workspace_id, slug, area_slug, is_triage_project, is_repo_sync_owner, github_repo
      FROM projects
      WHERE id = ? AND workspace_id = ?
    `).get(projectId, workspaceId) as
      | {
          id: number
          workspace_id: number
          slug: string
          area_slug: string | null
          is_triage_project: number
          is_repo_sync_owner: number
          github_repo: string | null
        }
      | undefined
    if (!current) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // (5) Body type/format validation.
    let nextAreaSlug: string | null = current.area_slug
    let areaSlugProvided = false
    if (Object.prototype.hasOwnProperty.call(body, 'area_slug') && body.area_slug !== undefined) {
      areaSlugProvided = true
      const v = body.area_slug
      if (v === null) {
        nextAreaSlug = null
      } else if (typeof v === 'string') {
        if (!AREA_SLUG_REGEX.test(v)) {
          return NextResponse.json(
            {
              error: 'invalid_area_slug',
              message:
                'area_slug must match ^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$ (RFC 1123 / Kubernetes DNS label).',
              field: 'area_slug',
            },
            { status: 400 },
          )
        }
        nextAreaSlug = v
      } else {
        return NextResponse.json(
          {
            error: 'invalid_area_slug',
            message: 'area_slug must be a string or null.',
            field: 'area_slug',
          },
          { status: 400 },
        )
      }
    }

    let nextIsTriage: number = current.is_triage_project
    let isTriageProvided = false
    if (Object.prototype.hasOwnProperty.call(body, 'is_triage_project') && body.is_triage_project !== undefined) {
      if (typeof body.is_triage_project !== 'boolean') {
        return NextResponse.json(
          { error: 'invalid_is_triage_project', message: 'is_triage_project must be boolean.', field: 'is_triage_project' },
          { status: 400 },
        )
      }
      isTriageProvided = true
      nextIsTriage = body.is_triage_project ? 1 : 0
    }

    let nextIsOwner: number = current.is_repo_sync_owner
    let isOwnerProvided = false
    if (Object.prototype.hasOwnProperty.call(body, 'is_repo_sync_owner') && body.is_repo_sync_owner !== undefined) {
      if (typeof body.is_repo_sync_owner !== 'boolean') {
        return NextResponse.json(
          { error: 'invalid_is_repo_sync_owner', message: 'is_repo_sync_owner must be boolean.', field: 'is_repo_sync_owner' },
          { status: 400 },
        )
      }
      isOwnerProvided = true
      nextIsOwner = body.is_repo_sync_owner ? 1 : 0
    }

    let transferOwner = false
    if (Object.prototype.hasOwnProperty.call(body, 'transfer_owner') && body.transfer_owner !== undefined) {
      if (typeof body.transfer_owner !== 'boolean') {
        return NextResponse.json(
          { error: 'invalid_transfer_owner', message: 'transfer_owner must be boolean.', field: 'transfer_owner' },
          { status: 400 },
        )
      }
      transferOwner = body.transfer_owner
    }

    // (6/7) Idempotent short-circuit + uniqueness chain (FR-058 priority).
    // Skip uniqueness checks for fields that are unchanged or where the value
    // matches the current stored value (FR-059 short-circuit).
    const areaSlugChanged = areaSlugProvided && nextAreaSlug !== current.area_slug
    const isTriageChanged = isTriageProvided && nextIsTriage !== current.is_triage_project
    const isOwnerChanged = isOwnerProvided && nextIsOwner !== current.is_repo_sync_owner

    // 7a. area_slug_conflict (highest priority).
    if (areaSlugChanged && nextAreaSlug !== null) {
      const conflict = db.prepare(`
        SELECT id, slug FROM projects
        WHERE workspace_id = ? AND area_slug = ? AND id != ?
        LIMIT 1
      `).get(workspaceId, nextAreaSlug, projectId) as { id: number; slug: string } | undefined
      if (conflict) {
        logger.error(
          {
            event: 'project_put_validation_failed',
            workspace_id: workspaceId,
            error_class: 'AreaSlugConflict',
            error_message: `area_slug ${nextAreaSlug} already in use by project ${conflict.id}`,
          },
          'PUT /api/projects/[id] area_slug_conflict',
        )
        return NextResponse.json(
          {
            error: 'area_slug_conflict',
            message: `Another project in this workspace already uses area_slug '${nextAreaSlug}': '${conflict.slug}'.`,
            existing_area_slug_project_id: conflict.id,
            existing_area_slug_project_slug: conflict.slug,
          },
          { status: 409 },
        )
      }
    }

    // 7b. triage_conflict.
    if (isTriageChanged && nextIsTriage === 1) {
      const conflict = db.prepare(`
        SELECT id, slug FROM projects
        WHERE workspace_id = ? AND is_triage_project = 1 AND id != ?
        LIMIT 1
      `).get(workspaceId, projectId) as { id: number; slug: string } | undefined
      if (conflict) {
        logger.error(
          {
            event: 'project_put_validation_failed',
            workspace_id: workspaceId,
            error_class: 'TriageConflict',
            error_message: `triage already held by project ${conflict.id}`,
          },
          'PUT /api/projects/[id] triage_conflict',
        )
        return NextResponse.json(
          {
            error: 'triage_conflict',
            message: `This workspace already has a triage project: '${conflict.slug}'.`,
            existing_triage_project_id: conflict.id,
            existing_triage_project_slug: conflict.slug,
          },
          { status: 409 },
        )
      }
    }

    // 7c. owner_conflict — only when becoming owner AND no transfer flag.
    let existingOwner:
      | { id: number; slug: string }
      | undefined
    if (isOwnerChanged && nextIsOwner === 1 && current.github_repo) {
      existingOwner = db.prepare(`
        SELECT id, slug FROM projects
        WHERE workspace_id = ?
          AND github_repo = ?
          AND is_repo_sync_owner = 1
          AND id != ?
        LIMIT 1
      `).get(workspaceId, current.github_repo, projectId) as
        | { id: number; slug: string }
        | undefined
      if (existingOwner && !transferOwner) {
        logger.error(
          {
            event: 'project_put_validation_failed',
            workspace_id: workspaceId,
            github_repo: current.github_repo,
            error_class: 'OwnerConflict',
            error_message: `owner already held by project ${existingOwner.id}`,
          },
          'PUT /api/projects/[id] owner_conflict',
        )
        return NextResponse.json(
          {
            error: 'owner_conflict',
            message: `Repo '${current.github_repo}' already has a sync owner: '${existingOwner.slug}'. Set transfer_owner=true to swap ownership.`,
            existing_owner_project_id: existingOwner.id,
            existing_owner_project_slug: existingOwner.slug,
            hint: 'Set transfer_owner=true to swap ownership in one transaction',
          },
          { status: 409 },
        )
      }
    }

    // (8) Atomic write.
    // Only run mutations if at least one field actually changed.
    const willTransfer =
      isOwnerChanged && nextIsOwner === 1 && existingOwner && transferOwner
    const anyChange = areaSlugChanged || isTriageChanged || isOwnerChanged

    if (anyChange) {
      try {
        const tx = db.transaction(() => {
          if (willTransfer && existingOwner) {
            // FR-037 / R-001: clear-then-set ordering is REQUIRED.
            db.prepare(`
              UPDATE projects
              SET is_repo_sync_owner = 0, updated_at = unixepoch()
              WHERE workspace_id = ?
                AND github_repo = ?
                AND is_repo_sync_owner = 1
                AND id != ?
            `).run(workspaceId, current.github_repo, projectId)
          }

          // Build the UPDATE for the target project.
          const sets: string[] = []
          const vals: Array<string | number | null> = []
          if (areaSlugChanged) {
            sets.push('area_slug = ?')
            vals.push(nextAreaSlug)
          }
          if (isTriageChanged) {
            sets.push('is_triage_project = ?')
            vals.push(nextIsTriage)
          }
          if (isOwnerChanged) {
            sets.push('is_repo_sync_owner = ?')
            vals.push(nextIsOwner)
          }
          sets.push('updated_at = unixepoch()')
          db.prepare(`
            UPDATE projects SET ${sets.join(', ')} WHERE id = ? AND workspace_id = ?
          `).run(...vals, projectId, workspaceId)

          // Activity row for owner transfers.
          if (willTransfer && existingOwner) {
            try {
              db.prepare(`
                INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
                VALUES (?, 'project', ?, ?, ?, ?, ?)
              `).run(
                'sync_owner_transferred',
                projectId,
                String(auth.user.id ?? auth.user.username ?? 'unknown'),
                `Sync ownership of ${current.github_repo} transferred to project ${projectId}`,
                JSON.stringify({
                  previous_owner_project_id: existingOwner.id,
                  new_owner_project_id: projectId,
                  github_repo: current.github_repo,
                  workspace_id: workspaceId,
                  actor_user_id: auth.user.id ?? null,
                }),
                workspaceId,
              )
            } catch (activityErr) {
              // FR-027b structured log — emit BEFORE re-throwing so the audit
              // trail is preserved even when the surrounding transaction
              // rolls back.
              logger.error(
                {
                  event: 'sync_owner_transfer_activity_failed',
                  workspace_id: workspaceId,
                  github_repo: current.github_repo,
                  error_message:
                    activityErr instanceof Error ? activityErr.message : String(activityErr),
                  error_class: classifyError(activityErr),
                },
                'sync_owner_transferred activity insert failed',
              )
              throw activityErr
            }
          }
        })
        tx()
      } catch (txErr) {
        // SQLite UNIQUE-violation race translates back to 409 owner_conflict
        // (never leak as 500) per FR-055 / FR-037.
        if (txErr instanceof Error && /UNIQUE/i.test(txErr.message)) {
          // Re-resolve the winning owner for the response payload.
          const winner = db.prepare(`
            SELECT id, slug FROM projects
            WHERE workspace_id = ? AND github_repo = ? AND is_repo_sync_owner = 1
            LIMIT 1
          `).get(workspaceId, current.github_repo) as { id: number; slug: string } | undefined
          if (winner && winner.id !== projectId) {
            return NextResponse.json(
              {
                error: 'owner_conflict',
                message: `Repo '${current.github_repo}' already has a sync owner: '${winner.slug}'. Set transfer_owner=true to swap ownership.`,
                existing_owner_project_id: winner.id,
                existing_owner_project_slug: winner.slug,
                hint: 'Set transfer_owner=true to swap ownership in one transaction',
              },
              { status: 409 },
            )
          }
        }
        logger.error({ err: txErr, projectId, workspaceId }, 'PUT /api/projects/[id] transaction failed')
        return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
      }

      // ── FR-038 / FR-060 — Post-commit label provisioning trigger ────
      //
      // After the transaction commits successfully, fire `initializeLabels`
      // once per owner-held repo in this workspace IFF the committed change
      // mutated `area_slug` or `is_triage_project`. Owner-only transitions
      // (including transfer_owner) MUST NOT trigger; idempotent writes
      // already short-circuit upstream via the `anyChange` gate.
      //
      // Best-effort: any failure inside `initializeLabels` is swallowed so
      // the PUT response is not aborted (FR-027 isolation).
      if (areaSlugChanged || isTriageChanged) {
        try {
          const ownerRepos = db
            .prepare(
              `SELECT DISTINCT github_repo FROM projects
               WHERE workspace_id = ?
                 AND is_repo_sync_owner = 1
                 AND github_repo IS NOT NULL`,
            )
            .all(workspaceId) as Array<{ github_repo: string }>
          for (const row of ownerRepos) {
            try {
              await initializeLabels(row.github_repo, workspaceId, {
                trigger: 'area_slug_change',
              })
            } catch (labelErr) {
              logger.error(
                {
                  event: 'label_provisioning_failed',
                  workspace_id: workspaceId,
                  github_repo: row.github_repo,
                  error_message:
                    labelErr instanceof Error ? labelErr.message : String(labelErr),
                  error_class: classifyError(labelErr),
                  trigger: 'area_slug_change',
                },
                'PUT /api/projects/[id] post-commit initializeLabels failed (best-effort)',
              )
            }
          }
        } catch (selectErr) {
          // Owner-repo SELECT failure must not abort the PUT response.
          logger.error(
            {
              err: selectErr,
              workspace_id: workspaceId,
              event: 'post_put_owner_repo_lookup_failed',
            },
            'PUT /api/projects/[id] post-commit owner-repo lookup failed',
          )
        }
      }
    }

    // 200 response shape (FR-061): always present new persisted fields,
    // never include `transfer_owner`.
    const updated = db.prepare(`
      SELECT id, workspace_id, name, slug, description, ticket_prefix, ticket_counter, status,
             github_repo, deadline, color, github_sync_enabled, github_labels_initialized, github_default_branch,
             area_slug, is_triage_project, is_repo_sync_owner, created_at, updated_at
      FROM projects
      WHERE id = ? AND workspace_id = ?
    `).get(projectId, workspaceId) as Record<string, unknown> | undefined
    if (!updated) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const project = {
      ...updated,
      is_triage_project: Boolean(updated.is_triage_project),
      is_repo_sync_owner: Boolean(updated.is_repo_sync_owner),
    }
    return NextResponse.json({ project })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error, projectId, workspaceId }, 'PUT /api/projects/[id] error')
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const db = getDatabase()
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const scopeFilter = workspaceScopePredicate(acceptedScope, 'p.workspace_id')
    const { id } = await params
    const projectId = toProjectId(id)
    if (Number.isNaN(projectId)) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    const projectScope = db.prepare(`
      SELECT p.id, p.workspace_id
      FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.id = ? AND ${scopeFilter.sql} AND w.tenant_id = ?
      LIMIT 1
    `).get(projectId, ...scopeFilter.params, acceptedScope.tenantId) as { workspace_id: number } | undefined
    if (!projectScope) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const workspaceId = projectScope.workspace_id

    const current = db.prepare(`SELECT * FROM projects WHERE id = ? AND workspace_id = ?`).get(projectId, workspaceId) as any
    if (!current) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (current.slug === 'general') {
      return NextResponse.json({ error: 'Default project cannot be deleted' }, { status: 400 })
    }

    const mode = new URL(request.url).searchParams.get('mode') || 'archive'
    if (mode !== 'delete') {
      db.prepare(`UPDATE projects SET status = 'archived', updated_at = unixepoch() WHERE id = ? AND workspace_id = ?`).run(projectId, workspaceId)
      return NextResponse.json({ success: true, mode: 'archive' })
    }

    const fallback = db.prepare(`
      SELECT id FROM projects
      WHERE workspace_id = ? AND slug = 'general'
      LIMIT 1
    `).get(workspaceId) as { id: number } | undefined
    if (!fallback) return NextResponse.json({ error: 'Default project missing' }, { status: 500 })

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE tasks
        SET project_id = ?
        WHERE workspace_id = ? AND project_id = ?
      `).run(fallback.id, workspaceId, projectId)

      db.prepare(`DELETE FROM projects WHERE id = ? AND workspace_id = ?`).run(projectId, workspaceId)
    })
    tx()

    return NextResponse.json({ success: true, mode: 'delete' })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'DELETE /api/projects/[id] error')
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
