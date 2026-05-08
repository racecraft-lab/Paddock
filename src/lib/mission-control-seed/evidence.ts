import { createHash } from 'node:crypto'
import {
  DISABLED_OR_ABSENT_FLAGS,
  ENABLED_MISSION_CONTROL_FLAGS,
  FACILITY_WORKSPACE_SLUG,
  GOVERNANCE_POLICIES,
  MISSION_CONTROL_REPO,
  MISSION_CONTROL_WORKSPACE_SLUG,
  REQUIRED_WORKFLOW_SLUGS,
  ROLE_ASSIGNMENTS,
  type MissionControlSeedEvidence,
  type MissionControlSeedOptions,
  type VerifyFailureResult,
  type VerifySeedResult,
} from './types'
import type Database from 'better-sqlite3'


export function buildMissionControlSeedEvidence(
  db: Database.Database,
  options: MissionControlSeedOptions,
): MissionControlSeedEvidence {
  const workspace = missionControlWorkspace(db)
  const counts = {
    mission_control_product_lines: count(db, `SELECT COUNT(*) FROM workspaces WHERE slug = ?`, MISSION_CONTROL_WORKSPACE_SLUG),
    facility_workspaces: count(db, `SELECT COUNT(*) FROM workspaces WHERE slug = ?`, FACILITY_WORKSPACE_SLUG),
    department_projects: workspace ? count(db, `SELECT COUNT(*) FROM projects WHERE workspace_id = ?`, workspace.id) : 0,
    required_role_assignments: workspace ? countRequiredRoleAssignments(db, workspace.id) : 0,
    workflow_templates: workspace ? count(db, `
      SELECT COUNT(*) FROM workflow_templates
      WHERE workspace_id = ? AND created_by = 'workflow-contract' AND enabled = 1
    `, workspace.id) : 0,
    governance_policies: workspace ? count(db, `
      SELECT COUNT(*) FROM resource_policies
      WHERE workspace_id = ? AND notes LIKE 'SPEC-009B:mission-control:%'
    `, workspace.id) : 0,
    preserved_issue_intake: workspace ? count(db, `
      SELECT COUNT(*) FROM tasks
      WHERE workspace_id = ? AND github_repo = ? AND github_issue_number IS NOT NULL
    `, workspace.id, MISSION_CONTROL_REPO) : 0,
    new_pilot_tasks: countNewPilotTasks(db),
    new_successor_records: count(db, `
      SELECT COUNT(*) FROM tasks
      WHERE created_by = 'SPEC-009B' AND parent_task_id IS NOT NULL
    `),
    new_per_agent_seed_tasks: count(db, `
      SELECT COUNT(*) FROM tasks
      WHERE created_by = 'SPEC-009B'
        AND (title LIKE '%SPEC-009B seed%' OR title LIKE '%per-agent seed%')
    `),
  }
  const flags = workspace ? parseFlags(workspace.feature_flags) : {}
  const enabled = ENABLED_MISSION_CONTROL_FLAGS.filter((key) => flags[key] === true)
  const disabled_or_absent = DISABLED_OR_ABSENT_FLAGS.filter((key) => flags[key] !== true)
  const latestRun = workspace ? db.prepare(`
    SELECT id, contract_hash
    FROM workflow_contract_runs
    WHERE workspace_id = ? AND family = 'mission-control'
    ORDER BY id DESC
    LIMIT 1
  `).get(workspace.id) as { id: number; contract_hash: string | null } | undefined : undefined
  const governanceIdentities = workspace ? db.prepare(`
    SELECT notes
    FROM resource_policies
    WHERE workspace_id = ? AND notes LIKE 'SPEC-009B:mission-control:%'
    ORDER BY notes ASC
  `).all(workspace.id).map((row) => (row as { notes: string }).notes) : []
  const nonDispatch = {
    new_pilot_tasks: counts.new_pilot_tasks,
    new_successor_records: counts.new_successor_records,
    new_per_agent_seed_tasks: counts.new_per_agent_seed_tasks,
    claims: tableSpecCreatedCountIfExists(db, 'task_claims'),
    dispatched_tasks: count(db, `
      SELECT COUNT(*) FROM tasks
      WHERE created_by = 'SPEC-009B'
        AND (
          status IN ('assigned', 'in_progress')
          OR assigned_to IS NOT NULL
          OR dispatch_attempts > 0
        )
    `),
    runner_rows: tableSpecCreatedCountIfExists(db, 'runner_state') + tableSpecCreatedCountIfExists(db, 'agent_runs'),
    sandbox_rows: tableSpecCreatedCountIfExists(db, 'sandboxes') + tableSpecCreatedCountIfExists(db, 'sandbox_lifecycle'),
    auto_merge_markers: count(db, `
      SELECT COUNT(*) FROM tasks
      WHERE created_by = 'SPEC-009B'
        AND (metadata LIKE '%auto_merge%' OR metadata LIKE '%automerge%')
    `),
  }
  const identityPayload = {
    counts,
    enabled,
    disabled_or_absent,
    governanceIdentities,
    requiredSlugs: requiredSlugsPresent(db, workspace?.id ?? -1),
    nonDispatch,
  }
  return {
    counts,
    workflow_contract: {
      source_path: options.contractPath,
      run_id: latestRun?.id ?? null,
      contract_hash: latestRun?.contract_hash ?? null,
      required_slugs_present: workspace ? requiredSlugsPresent(db, workspace.id) : false,
    },
    flags: { enabled, disabled_or_absent },
    governance: {
      identities: governanceIdentities,
      normal_intake_decision: 'allow',
    },
    non_dispatch: nonDispatch,
    identity_hash: stableHash(identityPayload),
  }
}

export function verifyMissionControlSeed(
  db: Database.Database,
  options: MissionControlSeedOptions,
): VerifySeedResult | VerifyFailureResult {
  const evidence = buildMissionControlSeedEvidence(db, options)
  const errors: string[] = []
  if (evidence.counts.mission_control_product_lines !== 1) errors.push('mission-control workspace count is not 1')
  if (evidence.counts.facility_workspaces !== 1) errors.push('facility workspace count is not 1')
  if (evidence.counts.department_projects !== 6) errors.push('department project count is not 6')
  if (evidence.counts.required_role_assignments !== ROLE_ASSIGNMENTS.length) errors.push('required role assignment count mismatch')
  if (evidence.counts.workflow_templates !== REQUIRED_WORKFLOW_SLUGS.length) errors.push('workflow template count mismatch')
  if (evidence.counts.governance_policies !== GOVERNANCE_POLICIES.length) errors.push('governance policy count mismatch')
  for (const flag of ENABLED_MISSION_CONTROL_FLAGS) {
    if (!evidence.flags.enabled.includes(flag)) errors.push(`required feature flag is not enabled: ${flag}`)
  }
  for (const flag of DISABLED_OR_ABSENT_FLAGS) {
    if (!evidence.flags.disabled_or_absent.includes(flag)) errors.push(`disallowed feature flag is enabled: ${flag}`)
  }
  for (const [key, value] of Object.entries(evidence.non_dispatch)) {
    if (value !== 0) errors.push(`non-dispatch invariant failed: ${key}=${String(value)}`)
  }
  if (errors.length > 0) {
    return {
      ok: false,
      mode: 'verify',
      status: 'verification_failed',
      mutation_status: 'not_mutated',
      exit_code: 4,
      errors,
    }
  }
  return {
    ok: true,
    mode: 'verify',
    status: 'verified',
    mutation_status: 'verified',
    exit_code: 0,
    ...evidence,
  }
}

export function makeResidueSnapshotHash(db: Database.Database): string {
  const payload = {
    projects: db.prepare(`
      SELECT id, workspace_id, slug, github_repo, github_sync_enabled
      FROM projects
      WHERE github_repo IS NOT NULL AND github_repo <> ?
      ORDER BY id ASC
    `).all(MISSION_CONTROL_REPO),
    tasks: db.prepare(`
      SELECT id, workspace_id, project_id, github_repo, github_issue_number, github_synced_at
      FROM tasks
      WHERE github_repo IS NOT NULL AND github_repo <> ?
      ORDER BY id ASC
    `).all(MISSION_CONTROL_REPO),
  }
  return stableHash(payload)
}

function missionControlWorkspace(db: Database.Database): { id: number; feature_flags: string | null } | undefined {
  return db.prepare('SELECT id, feature_flags FROM workspaces WHERE slug = ?').get(MISSION_CONTROL_WORKSPACE_SLUG) as
    | { id: number; feature_flags: string | null }
    | undefined
}

function count(db: Database.Database, sql: string, ...params: unknown[]): number {
  const row = db.prepare(sql).get(...params) as { 'COUNT(*)': number } | undefined
  return row?.['COUNT(*)'] ?? 0
}

function countRequiredRoleAssignments(db: Database.Database, workspaceId: number): number {
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM project_agent_assignments paa
    JOIN projects p ON p.id = paa.project_id
    WHERE p.workspace_id = ?
      AND (${ROLE_ASSIGNMENTS.map(() => '(paa.role = ? AND paa.agent_name = ?)').join(' OR ')})
  `).get(
    workspaceId,
    ...ROLE_ASSIGNMENTS.flatMap((assignment) => [assignment.role, assignment.agentName]),
  ) as { count: number } | undefined
  return row?.count ?? 0
}

function countNewPilotTasks(db: Database.Database): number {
  return count(db, `
    SELECT COUNT(*) FROM tasks
    WHERE created_by = 'SPEC-009B'
      AND (title LIKE '%pilot%' OR title LIKE '%per-agent seed%' OR github_issue_number IS NOT NULL)
  `)
}

function tableSpecCreatedCountIfExists(db: Database.Database, table: string): number {
  if (!tableExists(db, table)) return 0
  const columns = tableColumns(db, table)
  if (columns.includes('created_by')) {
    return count(db, `SELECT COUNT(*) FROM ${table} WHERE created_by = 'SPEC-009B'`)
  }
  if (columns.includes('task_id')) {
    return count(db, `
      SELECT COUNT(*)
      FROM ${table} side_effects
      JOIN tasks t ON t.id = side_effects.task_id
      WHERE t.created_by = 'SPEC-009B'
    `)
  }
  if (columns.includes('metadata')) {
    return count(db, `SELECT COUNT(*) FROM ${table} WHERE metadata LIKE '%SPEC-009B%'`)
  }
  return 0
}

function tableExists(db: Database.Database, table: string): boolean {
  const exists = db.prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) as
    | { ok: number }
    | undefined
  return Boolean(exists)
}

function tableColumns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name)
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

function requiredSlugsPresent(db: Database.Database, workspaceId: number): boolean {
  const slugs = new Set(db.prepare(`
    SELECT slug FROM workflow_templates
    WHERE workspace_id = ? AND enabled = 1 AND created_by = 'workflow-contract'
  `).all(workspaceId).map((row) => (row as { slug: string }).slug))
  return REQUIRED_WORKFLOW_SLUGS.every((slug) => slugs.has(slug))
}

function stableHash(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
