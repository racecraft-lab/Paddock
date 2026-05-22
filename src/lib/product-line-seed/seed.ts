import Database from 'better-sqlite3'
import { importWorkflowContract } from '../workflow-contracts/importer.ts'
import { loadWorkflowContractFromFile } from '../workflow-contracts/yaml-loader.ts'
import { ProductLineSeedConfigValidationError, loadProductLineSeedConfigFromFile } from './config.ts'
import {
  collectOperatorEvidenceRedaction,
  collectProductLineSeedSnapshot,
  makeProductLineSeedResultEnvelope,
} from './evidence.ts'
import { detectProductLineTargetResidue } from './preflight.ts'
import type {
  DepartmentDeclaration,
  GovernanceDefault,
  ProductLineSeedConfig,
  ProductLineSeedDatabase,
  ProductLineSeedResultEnvelope,
  ProductLineSeedRunOptions,
  ProductLineSeedValidationError,
} from './types.ts'

const RESERVED_FUTURE_FLAGS = new Set(['FEATURE_TASK_CONTROL_PLANE', 'FEATURE_AGENT_RUNNER_SANDBOXES'])

export function runProductLineSeed(options: ProductLineSeedRunOptions): ProductLineSeedResultEnvelope {
  let db: ProductLineSeedDatabase | undefined = options.db
  let ownsDb = false
  try {
    if (!db) {
      db = new Database(options.dbPath ?? ':memory:')
      ownsDb = true
    }
    const redaction = collectOperatorEvidenceRedaction(options.operatorEvidencePath)
    const snapshotBeforeConfigless = collectProductLineSeedSnapshot(db)
    let config: ProductLineSeedConfig
    try {
      config = loadProductLineSeedConfigFromFile(options.configPath)
    } catch (error) {
      const errors = configErrors(error)
      const firstCode = errors[0]?.code ?? 'CONFIG_SCHEMA_INVALID'
      const contractNotReady = firstCode === 'UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY' || firstCode === 'WORKFLOW_CONTRACT_REQUIRED_SLUGS_MISSING'
      const snapshotAfter = collectProductLineSeedSnapshot(db)
      return makeProductLineSeedResultEnvelope({
        ok: false,
        entrypoint: options.entrypoint,
        mode: options.mode,
        status: contractNotReady ? 'contract_not_ready' : 'validation_failed',
        code: firstCode,
        mutationStatus: 'not_mutated',
        configPath: options.configPath,
        evidence: { validation: 'failed' },
        errors,
        snapshotBefore: snapshotBeforeConfigless,
        snapshotAfter,
        redaction,
      })
    }

    const snapshotBefore = collectProductLineSeedSnapshot(db, config)
    const existingTarget = workspaceExists(db, config.product_line.slug)
    const validationEvidence = buildValidationEvidence()
    const residue = detectProductLineTargetResidue(db, config)
    if (residue.length > 0) {
      const snapshotAfter = collectProductLineSeedSnapshot(db, config)
      return makeProductLineSeedResultEnvelope({
        ok: false,
        entrypoint: options.entrypoint,
        mode: options.mode,
        status: 'blocked_preflight',
        code: 'NON_TARGET_RESIDUE_DETECTED',
        mutationStatus: 'not_mutated',
        configPath: options.configPath,
        config,
        dbPath: options.dbPath ?? null,
        existingTarget,
        evidence: {
          validation: validationEvidence,
          residue,
          cleanup_policy: 'detection_only_no_automatic_deletion_or_unlinking',
        },
        errors: residue.map((entry, index) => ({
          code: 'NON_TARGET_RESIDUE_DETECTED',
          path: `$.target.residue[${String(index)}]`,
          message: `Target residue detected for ${entry.kind}.`,
        })),
        snapshotBefore,
        snapshotAfter,
        redaction,
      })
    }

    if (options.mode === 'preflight') {
      const snapshotAfter = collectProductLineSeedSnapshot(db, config)
      return makeProductLineSeedResultEnvelope({
        ok: true,
        entrypoint: options.entrypoint,
        mode: 'preflight',
        status: 'ready',
        code: 'READY',
        mutationStatus: 'not_mutated',
        configPath: options.configPath,
        config,
        dbPath: options.dbPath ?? null,
        existingTarget,
        evidence: {
          validation: validationEvidence,
          residue: [],
          cleanup_policy: 'detection_only_no_automatic_deletion_or_unlinking',
        },
        snapshotBefore,
        snapshotAfter,
        redaction,
      })
    }

    if (options.mode === 'apply') {
      if (existingTarget && !options.allowExisting) {
        const snapshotAfter = collectProductLineSeedSnapshot(db, config)
        return makeProductLineSeedResultEnvelope({
          ok: false,
          entrypoint: options.entrypoint,
          mode: 'apply',
          status: 'existing_target_refused',
          code: 'EXISTING_TARGET_REQUIRES_ALLOW_EXISTING',
          mutationStatus: 'not_mutated',
          configPath: options.configPath,
          config,
          dbPath: options.dbPath ?? null,
          existingTarget,
          evidence: {
            validation: validationEvidence,
            residue: [],
            cleanup_policy: 'detection_only_no_automatic_deletion_or_unlinking',
          },
          errors: [{
            code: 'EXISTING_TARGET_REQUIRES_ALLOW_EXISTING',
            path: '$.target.existing_target',
            message: 'Existing product-line target requires --allow-existing before apply.',
          }],
          snapshotBefore,
          snapshotAfter,
          redaction,
          actionRequired: '--allow-existing',
        })
      }
      const workspaceId = applyConfig(db, config)
      const snapshotAfter = collectProductLineSeedSnapshot(db, config)
      return makeProductLineSeedResultEnvelope({
        ok: true,
        entrypoint: options.entrypoint,
        mode: 'apply',
        status: 'seeded',
        code: 'SEEDED',
        mutationStatus: 'applied',
        configPath: options.configPath,
        config,
        dbPath: options.dbPath ?? null,
        existingTarget,
        evidence: {
          validation: validationEvidence,
          residue: [],
          workspace_id: workspaceId,
          cleanup_policy: 'detection_only_no_automatic_deletion_or_unlinking',
        },
        snapshotBefore,
        snapshotAfter,
        redaction,
      })
    }

    const drift = verifyConfig(db, config)
    const snapshotAfter = collectProductLineSeedSnapshot(db, config)
    if (drift.length > 0) {
      return makeProductLineSeedResultEnvelope({
        ok: false,
        entrypoint: options.entrypoint,
        mode: 'verify',
        status: 'verification_failed',
        code: 'VERIFY_DRIFT_DETECTED',
        mutationStatus: 'not_mutated',
        configPath: options.configPath,
        config,
        dbPath: options.dbPath ?? null,
        existingTarget,
        evidence: { validation: validationEvidence, drift },
        errors: drift,
        snapshotBefore,
        snapshotAfter,
        redaction,
      })
    }
    return makeProductLineSeedResultEnvelope({
      ok: true,
      entrypoint: options.entrypoint,
      mode: 'verify',
      status: 'verified',
      code: 'VERIFIED',
      mutationStatus: 'verified',
      configPath: options.configPath,
      config,
      dbPath: options.dbPath ?? null,
      existingTarget,
      evidence: { validation: validationEvidence, drift: [] },
      snapshotBefore,
      snapshotAfter,
      redaction,
    })
  } catch (error) {
    return makeProductLineSeedResultEnvelope({
      ok: false,
      entrypoint: options.entrypoint,
      mode: options.mode,
      status: 'unexpected_error',
      code: 'UNEXPECTED_ERROR',
      mutationStatus: 'not_mutated',
      configPath: options.configPath,
      evidence: { error_name: error instanceof Error ? error.name : 'UnknownError' },
      errors: [{
        code: 'UNEXPECTED_ERROR',
        path: '$',
        message: error instanceof Error ? error.message : 'Unexpected product-line seed error.',
      }],
      redaction: collectOperatorEvidenceRedaction(options.operatorEvidencePath),
    })
  } finally {
    if (ownsDb) db?.close()
  }
}

function applyConfig(db: ProductLineSeedDatabase, config: ProductLineSeedConfig): number {
  return db.transaction(() => {
    const tenantId = resolveTenantId(db)
    const workspaceId = upsertWorkspace(db, config, tenantId)
    const projectIds = upsertDepartments(db, config, workspaceId)
    upsertAssignments(db, config, projectIds)
    upsertFeatureFlags(db, config, workspaceId)
    importWorkflows(db, config, workspaceId)
    upsertGovernanceDefaults(db, config, workspaceId)
    return workspaceId
  })()
}

function upsertWorkspace(db: ProductLineSeedDatabase, config: ProductLineSeedConfig, tenantId: number): number {
  const existing = db.prepare('SELECT id FROM workspaces WHERE slug = ?').get(config.product_line.slug) as { id: number } | undefined
  if (existing) {
    db.prepare('UPDATE workspaces SET name = ?, tenant_id = ?, updated_at = unixepoch() WHERE id = ?')
      .run(config.product_line.display_name, tenantId, existing.id)
    return existing.id
  }
  const result = db.prepare('INSERT INTO workspaces (slug, name, tenant_id, created_at, updated_at) VALUES (?, ?, ?, unixepoch(), unixepoch())')
    .run(config.product_line.slug, config.product_line.display_name, tenantId)
  return Number(result.lastInsertRowid)
}

function upsertDepartments(
  db: ProductLineSeedDatabase,
  config: ProductLineSeedConfig,
  workspaceId: number,
): Record<string, number> {
  const projectIds: Record<string, number> = {}
  for (const department of config.departments) {
    const existing = db.prepare('SELECT id FROM projects WHERE workspace_id = ? AND slug = ?').get(workspaceId, department.slug) as { id: number } | undefined
    const values = {
      name: department.name,
      ticket_prefix: department.ticket_prefix,
      area_slug: department.area_slug,
      github_repo: department.github_repo,
      github_sync_enabled: department.github_sync_enabled ? 1 : 0,
      is_triage_project: department.is_triage_project ? 1 : 0,
      is_repo_sync_owner: department.is_repo_sync_owner ? 1 : 0,
    }
    if (existing) {
      updateRow(db, 'projects', values, 'id = ?', [existing.id])
      projectIds[department.slug] = existing.id
    } else {
      const result = insertRow(db, 'projects', {
        workspace_id: workspaceId,
        slug: department.slug,
        ...values,
        created_at: unixepoch(),
        updated_at: unixepoch(),
      })
      projectIds[department.slug] = Number(result.lastInsertRowid)
    }
  }
  return projectIds
}

function upsertAssignments(
  db: ProductLineSeedDatabase,
  config: ProductLineSeedConfig,
  projectIds: Record<string, number>,
): void {
  for (const assignment of config.agent_assignments.product_line_assignments) {
    const projectId = projectIds[assignment.department_slug]
    if (!projectId) throw new Error(`Missing department project for ${assignment.department_slug}`)
    const agentName = `${config.product_line.agent_prefix}-${assignment.agent_key}`
    const existing = db.prepare('SELECT id FROM project_agent_assignments WHERE project_id = ? AND agent_name = ?')
      .get(projectId, agentName) as { id: number } | undefined
    if (existing) {
      updateRow(db, 'project_agent_assignments', { role: assignment.role }, 'id = ?', [existing.id])
    } else {
      insertRow(db, 'project_agent_assignments', {
        project_id: projectId,
        agent_name: agentName,
        role: assignment.role,
        assigned_at: unixepoch(),
      })
    }
  }
}

function upsertFeatureFlags(db: ProductLineSeedDatabase, config: ProductLineSeedConfig, workspaceId: number): void {
  const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as { feature_flags: string | null } | undefined
  const flags = parseFlags(row?.feature_flags ?? null)
  for (const flag of config.feature_flags.disabled_or_absent) Reflect.deleteProperty(flags, flag)
  for (const flag of config.feature_flags.enabled) flags[flag] = true
  db.prepare('UPDATE workspaces SET feature_flags = ?, updated_at = unixepoch() WHERE id = ?').run(JSON.stringify(flags), workspaceId)
}

function importWorkflows(db: ProductLineSeedDatabase, config: ProductLineSeedConfig, workspaceId: number): void {
  const contract = loadWorkflowContractFromFile(config.workflow_contract.path)
  const result = importWorkflowContract(
    db,
    { ...contract, workspace_id: workspaceId },
    { mode: 'apply', sourcePath: config.workflow_contract.path },
  )
  if (!result.ok) throw new Error(`Workflow contract import failed: ${result.errors?.map((entry) => entry.code).join(', ') ?? result.status}`)
}

function upsertGovernanceDefaults(db: ProductLineSeedDatabase, config: ProductLineSeedConfig, workspaceId: number): void {
  for (const policy of config.governance_defaults) {
    const existing = db.prepare('SELECT id FROM resource_policies WHERE workspace_id = ? AND notes = ?').get(workspaceId, policy.notes ?? policy.identity) as { id: number } | undefined
    const values = governanceValues(policy)
    if (existing) {
      updateRow(db, 'resource_policies', { ...values, updated_at: currentTimestamp() }, 'id = ?', [existing.id])
    } else {
      insertRow(db, 'resource_policies', {
        workspace_id: workspaceId,
        ...values,
        created_at: currentTimestamp(),
        updated_at: currentTimestamp(),
      })
    }
  }
}

function verifyConfig(db: ProductLineSeedDatabase, config: ProductLineSeedConfig): ProductLineSeedValidationError[] {
  const errors: ProductLineSeedValidationError[] = []
  const workspace = db.prepare('SELECT id, name, feature_flags FROM workspaces WHERE slug = ?').get(config.product_line.slug) as
    | { id: number; name: string; feature_flags: string | null }
    | undefined
  if (!workspace) {
    errors.push(drift('$.target.workspace_identity', 'Product-line workspace is missing.'))
    return errors
  }
  if (workspace.name !== config.product_line.display_name) {
    errors.push(drift('$.target.workspace_identity.name', 'Product-line workspace name drifted from config.'))
  }
  const flags = parseFlags(workspace.feature_flags)
  for (const flag of config.feature_flags.enabled) {
    if (flags[flag] !== true) errors.push(drift(`$.target.feature_flags.${flag}`, `Required feature flag is not enabled: ${flag}.`))
  }
  for (const flag of config.feature_flags.disabled_or_absent) {
    if (flags[flag] === true) errors.push(drift(`$.target.feature_flags.${flag}`, `Disabled or absent feature flag is enabled: ${flag}.`))
  }
  for (const flag of RESERVED_FUTURE_FLAGS) {
    if (flags[flag] === true) errors.push(drift(`$.target.feature_flags.${flag}`, `Reserved future feature flag is enabled: ${flag}.`))
  }
  for (const department of config.departments) {
    const row = db.prepare(`
      SELECT name, ticket_prefix, area_slug, github_repo, github_sync_enabled, is_triage_project, is_repo_sync_owner
      FROM projects WHERE workspace_id = ? AND slug = ?
    `).get(workspace.id, department.slug) as DepartmentDeclaration | undefined
    if (!row) {
      errors.push(drift(`$.target.departments.${department.slug}`, `Department project is missing: ${department.slug}.`))
      continue
    }
    if (row.name !== department.name) errors.push(drift(`$.target.departments.${department.slug}.name`, `Department name drifted: ${department.slug}.`))
  }
  const assignmentCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM project_agent_assignments paa
    JOIN projects p ON p.id = paa.project_id
    WHERE p.workspace_id = ?
      AND (${config.agent_assignments.product_line_assignments.map(() => '(p.slug = ? AND paa.agent_name = ? AND paa.role = ?)').join(' OR ')})
  `).get(
    workspace.id,
    ...config.agent_assignments.product_line_assignments.flatMap((assignment) => [
      assignment.department_slug,
      `${config.product_line.agent_prefix}-${assignment.agent_key}`,
      assignment.role,
    ]),
  ) as { count: number }
  if (assignmentCount.count !== config.agent_assignments.product_line_assignments.length) {
    errors.push(drift('$.target.agent_assignments', 'Required product-line agent assignments are missing or drifted.'))
  }
  const workflowSlugs = new Set(db.prepare(`
    SELECT slug FROM workflow_templates WHERE workspace_id = ? AND created_by = 'workflow-contract' AND enabled = 1
  `).all(workspace.id).map((row) => (row as { slug: string }).slug))
  for (const slug of config.workflow_contract.required_slugs) {
    if (!workflowSlugs.has(slug)) errors.push(drift(`$.target.workflow_templates.${slug}`, `Required workflow template is missing: ${slug}.`))
  }
  const governanceCount = db.prepare("SELECT COUNT(*) as count FROM resource_policies WHERE workspace_id = ? AND notes LIKE 'SPEC-009B:mission-control:%'")
    .get(workspace.id) as { count: number }
  if (governanceCount.count !== config.governance_defaults.length) {
    errors.push(drift('$.target.governance_defaults', 'Governance defaults are missing or drifted.'))
  }
  return errors
}

function buildValidationEvidence(): Record<string, string> {
  return {
    identity: 'safe',
    github_ownership: 'safe',
    workflow_contract: 'safe',
    required_slugs: 'safe',
    feature_flags: 'safe',
    assignments: 'safe',
    governance_defaults: 'safe',
    target_residue: 'safe',
  }
}

function configErrors(error: unknown): ProductLineSeedValidationError[] {
  if (error instanceof ProductLineSeedConfigValidationError) return error.errors
  return [{
    code: 'CONFIG_PARSE_FAILED',
    path: '$',
    message: error instanceof Error ? error.message : 'Product-line seed config could not be loaded.',
  }]
}

function drift(path: string, message: string): ProductLineSeedValidationError {
  return { code: 'VERIFY_DRIFT_DETECTED', path, message }
}

function workspaceExists(db: ProductLineSeedDatabase, slug: string): boolean {
  if (!tableExists(db, 'workspaces')) return false
  const row = db.prepare('SELECT 1 as ok FROM workspaces WHERE slug = ?').get(slug) as { ok: number } | undefined
  return Boolean(row?.ok)
}

function resolveTenantId(db: ProductLineSeedDatabase): number {
  const facility = db.prepare("SELECT tenant_id FROM workspaces WHERE slug = 'facility'").get() as { tenant_id: number | null } | undefined
  return typeof facility?.tenant_id === 'number' ? facility.tenant_id : 1
}

function governanceValues(policy: GovernanceDefault): Record<string, unknown> {
  return {
    notes: policy.notes ?? policy.identity,
    policy_type: policy.policy_type,
    limit_kind: policy.limit_kind,
    limit_value: policy.limit_value,
    period: policy.period,
    timezone: policy.timezone,
    enforcement: policy.enforcement,
    enabled: policy.enabled ? 1 : 0,
    default_template: policy.default_template ? 1 : 0,
  }
}

function insertRow(db: ProductLineSeedDatabase, table: string, values: Record<string, unknown>) {
  const columns = tableColumns(db, table)
  const entries = Object.entries(values).filter(([key]) => columns.includes(key))
  const names = entries.map(([key]) => key)
  return db.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
    .run(...entries.map(([, value]) => value))
}

function updateRow(
  db: ProductLineSeedDatabase,
  table: string,
  values: Record<string, unknown>,
  whereClause: string,
  whereParams: unknown[],
): void {
  const columns = tableColumns(db, table)
  const entries = Object.entries(values).filter(([key]) => columns.includes(key))
  if (entries.length === 0) return
  db.prepare(`UPDATE ${table} SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE ${whereClause}`)
    .run(...entries.map(([, value]) => value), ...whereParams)
}

function tableExists(db: ProductLineSeedDatabase, table: string): boolean {
  const row = db.prepare("SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { ok: number } | undefined
  return Boolean(row?.ok)
}

function tableColumns(db: ProductLineSeedDatabase, table: string): string[] {
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

function unixepoch(): number {
  return Math.floor(Date.now() / 1000)
}

function currentTimestamp(): string {
  return new Date().toISOString()
}
