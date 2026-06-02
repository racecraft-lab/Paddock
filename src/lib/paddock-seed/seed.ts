
import { importWorkflowContract } from '@/lib/workflow-contracts/importer'
import { loadWorkflowContractFromFile } from '@/lib/workflow-contracts/yaml-loader'
import { buildPaddockSeedEvidence } from './evidence'
import { assertWorkflowContractReady, runPaddockPreflight } from './preflight'
import {
  DEPARTMENTS,
  DISABLED_OR_ABSENT_FLAGS,
  ENABLED_PADDOCK_FLAGS,
  FACILITY_WORKSPACE_SLUG,
  GOVERNANCE_POLICIES,
  PADDOCK_REPO,
  PADDOCK_WORKSPACE_NAME,
  PADDOCK_WORKSPACE_SLUG,
  ROLE_ASSIGNMENTS,
  type ApplySeedResult,
  type PaddockSeedOptions,
  type SeedResult,
} from './types'
import type Database from 'better-sqlite3'

export { assertWorkflowContractReady }

export function applyPaddockSeed(
  db: Database.Database,
  options: PaddockSeedOptions,
): SeedResult {
  const preflight = runPaddockPreflight(db, options, 'apply')
  if (!preflight.ok) return preflight

  const workspaceId = db.transaction(() => {
    const tenantId = resolveSeedTenantId(db)
    ensureFacilityWorkspace(db, tenantId)
    const paddockWorkspaceId = upsertPaddockWorkspace(db, tenantId)
    const projectIds = upsertDepartments(db, paddockWorkspaceId)
    upsertRoleAssignments(db, projectIds)
    const qaProjectId = projectIds['qa']
    if (qaProjectId === undefined) throw new Error('Missing QA project after department seed')
    rehomePaddockIssueIntake(db, paddockWorkspaceId, qaProjectId)
    upsertFeatureFlags(db, paddockWorkspaceId)
    importWorkflows(db, paddockWorkspaceId, options.contractPath)
    upsertGovernancePolicies(db, paddockWorkspaceId)
    return paddockWorkspaceId
  })()

  return {
    ok: true,
    mode: 'apply',
    status: 'seeded',
    mutation_status: 'applied',
    workspace: { slug: PADDOCK_WORKSPACE_SLUG, id: workspaceId },
    ...buildPaddockSeedEvidence(db, options),
  } satisfies ApplySeedResult
}

function ensureFacilityWorkspace(db: Database.Database, tenantId: number): void {
  db.prepare(`
    INSERT OR IGNORE INTO workspaces (slug, name, tenant_id, created_at, updated_at)
    VALUES (?, 'Facility', ?, unixepoch(), unixepoch())
  `).run(FACILITY_WORKSPACE_SLUG, tenantId)
}

function upsertPaddockWorkspace(db: Database.Database, tenantId: number): number {
  const existing = db.prepare('SELECT id FROM workspaces WHERE slug = ?').get(PADDOCK_WORKSPACE_SLUG) as
    | { id: number }
    | undefined
  if (existing) {
    db.prepare('UPDATE workspaces SET name = ?, tenant_id = ?, updated_at = unixepoch() WHERE id = ?')
      .run(PADDOCK_WORKSPACE_NAME, tenantId, existing.id)
    return existing.id
  }
  const result = db.prepare(`
    INSERT INTO workspaces (slug, name, tenant_id, created_at, updated_at)
    VALUES (?, ?, ?, unixepoch(), unixepoch())
  `).run(PADDOCK_WORKSPACE_SLUG, PADDOCK_WORKSPACE_NAME, tenantId)
  return Number(result.lastInsertRowid)
}

function resolveSeedTenantId(db: Database.Database): number {
  const facility = db.prepare('SELECT tenant_id FROM workspaces WHERE slug = ?').get(FACILITY_WORKSPACE_SLUG) as
    | { tenant_id: number | null }
    | undefined
  if (typeof facility?.tenant_id === 'number') return facility.tenant_id

  if (tableExists(db, 'tenants')) {
    const tenant = db.prepare(`
      SELECT id
      FROM tenants
      ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC
      LIMIT 1
    `).get() as { id: number } | undefined
    if (typeof tenant?.id === 'number') return tenant.id
  }

  const workspace = db.prepare(`
    SELECT tenant_id
    FROM workspaces
    WHERE tenant_id IS NOT NULL
    ORDER BY CASE WHEN slug = 'default' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `).get() as { tenant_id: number | null } | undefined
  if (typeof workspace?.tenant_id === 'number') return workspace.tenant_id

  return 1
}

function upsertDepartments(db: Database.Database, workspaceId: number): Record<string, number> {
  const projectIds: Record<string, number> = {}
  for (const department of DEPARTMENTS) {
    const existing = db.prepare('SELECT id FROM projects WHERE workspace_id = ? AND slug = ?')
      .get(workspaceId, department.slug) as { id: number } | undefined
    const params = [
      department.name,
      department.ticketPrefix,
      department.areaSlug,
      department.githubRepo,
      department.githubRepo === PADDOCK_REPO ? 1 : 0,
      department.triage ? 1 : 0,
      department.repoSyncOwner ? 1 : 0,
      JSON.stringify({ spec: 'SPEC-009B', product_line: PADDOCK_WORKSPACE_SLUG }),
    ]
    if (existing) {
      db.prepare(`
        UPDATE projects
        SET name = ?, ticket_prefix = ?, area_slug = ?, github_repo = ?, github_sync_enabled = ?,
          is_triage_project = ?, is_repo_sync_owner = ?, metadata = ?, status = 'active', updated_at = unixepoch()
        WHERE id = ?
      `).run(...params, existing.id)
      projectIds[department.slug] = existing.id
    } else {
      const result = db.prepare(`
        INSERT INTO projects (
          workspace_id, name, slug, ticket_prefix, area_slug, github_repo, github_sync_enabled,
          is_triage_project, is_repo_sync_owner, metadata, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', unixepoch(), unixepoch())
      `).run(
        workspaceId,
        department.name,
        department.slug,
        department.ticketPrefix,
        department.areaSlug,
        department.githubRepo,
        department.githubRepo === PADDOCK_REPO ? 1 : 0,
        department.triage ? 1 : 0,
        department.repoSyncOwner ? 1 : 0,
        JSON.stringify({ spec: 'SPEC-009B', product_line: PADDOCK_WORKSPACE_SLUG }),
      )
      projectIds[department.slug] = Number(result.lastInsertRowid)
    }
  }
  return projectIds
}

function upsertRoleAssignments(db: Database.Database, projectIds: Record<string, number>): void {
  for (const assignment of ROLE_ASSIGNMENTS) {
    const projectId = projectIds[assignment.departmentSlug]
    if (!projectId) throw new Error(`Missing department project for role ${assignment.role}`)
    const existing = db.prepare('SELECT id FROM project_agent_assignments WHERE project_id = ? AND agent_name = ?')
      .get(projectId, assignment.agentName) as { id: number } | undefined
    if (existing) {
      db.prepare('UPDATE project_agent_assignments SET role = ?, assigned_at = unixepoch() WHERE id = ?')
        .run(assignment.role, existing.id)
    } else {
      db.prepare('INSERT INTO project_agent_assignments (project_id, agent_name, role, assigned_at) VALUES (?, ?, ?, unixepoch())')
        .run(projectId, assignment.agentName, assignment.role)
    }
  }
}

function rehomePaddockIssueIntake(db: Database.Database, workspaceId: number, qaProjectId: number): void {
  db.prepare(`
    UPDATE tasks
    SET workspace_id = ?, project_id = ?, status = 'inbox', assigned_to = NULL,
      workflow_template_id = NULL, workflow_template_slug = NULL,
      parent_task_id = NULL, root_task_id = NULL, chain_id = NULL,
      chain_stage = NULL, dispatch_attempts = 0, updated_at = unixepoch()
    WHERE github_repo = ? AND github_issue_number IS NOT NULL
  `).run(workspaceId, qaProjectId, PADDOCK_REPO)
}

function upsertFeatureFlags(db: Database.Database, workspaceId: number): void {
  const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as { feature_flags: string | null }
  const disabledOrAbsent = new Set<string>(DISABLED_OR_ABSENT_FLAGS)
  const flags: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(parseFlags(row.feature_flags))) {
    if (!disabledOrAbsent.has(key)) flags[key] = value
  }
  for (const key of ENABLED_PADDOCK_FLAGS) flags[key] = true
  db.prepare('UPDATE workspaces SET feature_flags = ?, updated_at = unixepoch() WHERE id = ?')
    .run(JSON.stringify(flags), workspaceId)
}

function importWorkflows(db: Database.Database, workspaceId: number, contractPath: string): void {
  const contract = loadWorkflowContractFromFile(contractPath)
  const result = importWorkflowContract(
    db,
    { ...contract, workspace_id: workspaceId },
    { mode: 'apply', sourcePath: contractPath },
  )
  if (!result.ok) throw new Error(`Workflow contract import failed: ${result.errors?.map((error) => error.code).join(', ') ?? result.status}`)
}

function upsertGovernancePolicies(db: Database.Database, workspaceId: number): void {
  for (const policy of GOVERNANCE_POLICIES) {
    const existing = db.prepare('SELECT id FROM resource_policies WHERE workspace_id = ? AND notes = ?')
      .get(workspaceId, policy.notes) as { id: number } | undefined
    const params = [
      workspaceId,
      policy.policy_type,
      policy.limit_kind,
      policy.limit_value,
      policy.period,
      policy.timezone,
      policy.enforcement,
      policy.enabled,
      policy.default_template,
      policy.notes,
      'SPEC-009B',
    ]
    if (existing) {
      db.prepare(`
        UPDATE resource_policies
        SET policy_type = ?, limit_kind = ?, limit_value = ?, period = ?, timezone = ?,
          enforcement = ?, enabled = ?, default_template = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        policy.policy_type,
        policy.limit_kind,
        policy.limit_value,
        policy.period,
        policy.timezone,
        policy.enforcement,
        policy.enabled,
        policy.default_template,
        'SPEC-009B',
        existing.id,
      )
    } else {
      db.prepare(`
        INSERT INTO resource_policies (
          workspace_id, policy_type, limit_kind, limit_value, period, timezone,
          enforcement, enabled, default_template, notes, updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...params)
    }
  }
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as
    | { ok: number }
    | undefined
  return Boolean(row?.ok)
}

function parseFlags(featureFlags: string | null): Record<string, boolean> {
  if (!featureFlags) return {}
  try {
    const parsed = JSON.parse(featureFlags) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, boolean>
      : {}
  } catch {
    return {}
  }
}
