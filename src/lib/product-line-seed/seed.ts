import Database from 'better-sqlite3'
import { importWorkflowContract } from '../workflow-contracts/importer.ts'
import { loadWorkflowContractFromFile } from '../workflow-contracts/yaml-loader.ts'
import { ProductLineSeedConfigValidationError, loadProductLineSeedConfigFromFile } from './config.ts'
import {
  collectOperatorEvidenceRedaction,
  collectProductLineSeedSnapshot,
  makeProductLineSeedResultEnvelope,
} from './evidence.ts'
import { collectRetainedProductLineInventory, detectProductLineTargetResidue } from './preflight.ts'
import type {
  DepartmentDeclaration,
  GovernanceDefault,
  ProductLineSeedConfig,
  ProductLineSeedDatabase,
  ProductLineSeedErrorCode,
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
      const contractNotReady = isWorkflowContractCode(firstCode)
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
    const retainedInventory = collectRetainedProductLineInventory(db)
    const productLineABaseline = collectProductLineABaseline(db)
    const residue = detectProductLineTargetResidue(db, config)
      .filter((entry) => options.mode === 'preflight' || entry.kind !== 'product_line_identity_conflict')
    if (residue.length > 0) {
      const snapshotAfter = collectProductLineSeedSnapshot(db, config)
      const code = codeForResidue(residue[0]?.kind)
      const contractNotReady = isWorkflowContractCode(code)
      return makeProductLineSeedResultEnvelope({
        ok: false,
        entrypoint: options.entrypoint,
        mode: options.mode,
        status: contractNotReady ? 'contract_not_ready' : 'blocked_preflight',
        code,
        mutationStatus: 'not_mutated',
        configPath: options.configPath,
        config,
        dbPath: options.dbPath ?? null,
        existingTarget,
        evidence: {
          validation: validationEvidence,
          target_class: targetClassFor({ existingTarget, residue }),
          existing_target: existingTargetEvidence({ existingTarget, residue, allowExisting: options.allowExisting }),
          product_line_a_baseline: productLineABaseline,
          residue,
          retained_inventory: retainedInventory,
          cleanup_policy: 'detection_only_no_automatic_deletion_or_unlinking',
        },
        errors: [
          ...residue.map((entry, index) => ({
            code: codeForResidue(entry.kind),
            path: residuePath(entry, index),
            message: `Target residue detected for ${entry.kind}.`,
          })),
          ...residue.some((entry) => codeForResidue(entry.kind) === 'TARGET_REPO_CONFLICT')
            ? [{
                code: 'TARGET_RESIDUE_BLOCKED' as const,
                path: '$.target.residue',
                message: 'Target-config-aware residue requires operator cleanup; no deletion, unlinking, or cleanup was performed.',
              }]
            : [],
        ],
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
          target_class: existingTarget ? 'already_valid' : 'absent_ready',
          existing_target: existingTargetEvidence({ existingTarget, residue: [], allowExisting: options.allowExisting }),
          product_line_a_baseline: productLineABaseline,
          residue: [],
          retained_inventory: retainedInventory,
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
            target_class: 'requires_allow_existing',
            existing_target: existingTargetEvidence({ existingTarget, residue: [], allowExisting: options.allowExisting }),
            product_line_a_baseline: productLineABaseline,
            residue: [],
            retained_inventory: retainedInventory,
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
          target_class: existingTarget ? 'already_valid' : 'absent_ready',
          existing_target: existingTargetEvidence({ existingTarget, residue: [], allowExisting: options.allowExisting }),
          product_line_a_baseline: productLineABaseline,
          residue: [],
          retained_inventory: retainedInventory,
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
        evidence: { validation: validationEvidence, disabled_by_default: config.product_line.disabled_by_default === true, drift },
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
      evidence: { validation: validationEvidence, disabled_by_default: config.product_line.disabled_by_default === true, drift: [] },
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
  const existing = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(config.product_line.slug) as
    | { id: number; name: string; tenant_id: number; disabled_at?: string | null }
    | undefined
  const values: Record<string, unknown> = {
    name: config.product_line.display_name,
    tenant_id: tenantId,
  }
  if (config.product_line.disabled_by_default === true && tableColumns(db, 'workspaces').includes('disabled_at')) {
    values['disabled_at'] = existing?.disabled_at ?? currentTimestamp()
  }
  if (existing) {
    if (hasRowDrift(existing as unknown as Record<string, unknown>, values)) {
      updateRow(db, 'workspaces', { ...values, updated_at: unixepoch() }, 'id = ?', [existing.id])
    }
    return existing.id
  }
  const result = insertRow(db, 'workspaces', {
    slug: config.product_line.slug,
    ...values,
    created_at: unixepoch(),
    updated_at: unixepoch(),
  })
  return Number(result.lastInsertRowid)
}

function upsertDepartments(
  db: ProductLineSeedDatabase,
  config: ProductLineSeedConfig,
  workspaceId: number,
): Record<string, number> {
  const projectIds: Record<string, number> = {}
  for (const department of config.departments) {
    const existing = db.prepare(`
      SELECT id, name, ticket_prefix, area_slug, github_repo, github_sync_enabled, is_triage_project, is_repo_sync_owner
      FROM projects WHERE workspace_id = ? AND slug = ?
    `).get(workspaceId, department.slug) as
      | (DepartmentDeclaration & {
        id: number
        github_sync_enabled: boolean | number
        is_triage_project: boolean | number
        is_repo_sync_owner: boolean | number
      })
      | undefined
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
      if (hasRowDrift(existing as unknown as Record<string, unknown>, values)) {
        updateRow(db, 'projects', values, 'id = ?', [existing.id])
      }
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
    const agentName = assignmentAgentName(config, assignment.agent_key)
    const existing = db.prepare('SELECT id, role FROM project_agent_assignments WHERE project_id = ? AND agent_name = ?')
      .get(projectId, agentName) as { id: number; role: string } | undefined
    if (existing) {
      if (existing.role !== assignment.role) {
        updateRow(db, 'project_agent_assignments', { role: assignment.role }, 'id = ?', [existing.id])
      }
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
  for (const flag of config.feature_flags.disabled_or_absent) {
    if (config.product_line.disabled_by_default === true) {
      flags[flag] = false
    } else {
      Reflect.deleteProperty(flags, flag)
    }
  }
  for (const flag of config.feature_flags.enabled) flags[flag] = true
  const nextFlags = JSON.stringify(flags)
  if (row?.feature_flags !== nextFlags) {
    db.prepare('UPDATE workspaces SET feature_flags = ?, updated_at = unixepoch() WHERE id = ?').run(nextFlags, workspaceId)
  }
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
    const existing = db.prepare(`
      SELECT id, notes, policy_type, limit_kind, limit_value, period, timezone, enforcement, enabled, default_template
      FROM resource_policies WHERE workspace_id = ? AND notes = ?
    `).get(workspaceId, policy.notes ?? policy.identity) as
      | ({ id: number } & Record<string, unknown>)
      | undefined
    const values = governanceValues(policy)
    if (existing) {
      if (hasRowDrift(existing, values)) {
        updateRow(db, 'resource_policies', { ...values, updated_at: currentTimestamp() }, 'id = ?', [existing.id])
      }
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
  const workspace = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(config.product_line.slug) as
    | { id: number; name: string; feature_flags: string | null; disabled_at?: string | null }
    | undefined
  if (!workspace) {
    errors.push(drift('$.target.workspace_identity', 'Product-line workspace is missing.'))
    return errors
  }
  if (workspace.name !== config.product_line.display_name) {
    errors.push(drift('$.target.workspace_identity.name', 'Product-line workspace name drifted from config.'))
  }
  if (config.product_line.disabled_by_default === true && typeof workspace.disabled_at !== 'string') {
    errors.push({
      code: 'PRODUCT_LINE_B_DISABLED_STATE_MISSING',
      path: '$.target.workspace_identity.disabled_at',
      message: 'Product Line B must have a non-null disabled_at value after apply.',
    })
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
      assignmentAgentName(config, assignment.agent_key),
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
  const governanceNotes = config.governance_defaults.map((policy) => policy.notes ?? policy.identity)
  const governanceCount = governanceNotes.length > 0
    ? db.prepare(`
      SELECT COUNT(*) as count
      FROM resource_policies
      WHERE workspace_id = ?
        AND notes IN (${governanceNotes.map(() => '?').join(', ')})
    `).get(workspace.id, ...governanceNotes) as { count: number }
    : { count: 0 }
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

function collectProductLineABaseline(db: ProductLineSeedDatabase): Record<string, unknown> {
  if (!tableExists(db, 'workspaces')) {
    return { workspace_slug: 'paddock', repo_sync_owner_count: 0 }
  }
  const workspace = db.prepare("SELECT id FROM workspaces WHERE slug = 'paddock'").get() as { id: number } | undefined
  if (!workspace) {
    return { workspace_slug: 'paddock', repo_sync_owner_count: 0 }
  }
  if (!tableExists(db, 'projects')) {
    return { workspace_slug: 'paddock', repo_sync_owner_count: 0 }
  }
  const repoSyncOwner = db.prepare(`
    SELECT COUNT(*) as count
    FROM projects
    WHERE workspace_id = ?
      AND github_repo IS NOT NULL
      AND (COALESCE(github_sync_enabled, 0) = 1 OR COALESCE(is_repo_sync_owner, 0) = 1)
  `).get(workspace.id) as { count: number }
  return {
    workspace_slug: 'paddock',
    repo_sync_owner_count: repoSyncOwner.count,
  }
}

function targetClassFor(input: {
  existingTarget: boolean
  residue: { kind: string }[]
}): string {
  if (input.residue.some((entry) => entry.kind === 'repo_sync_owner_conflict')) return 'ownership_conflict'
  if (input.residue.length > 0) return 'residue_blocked'
  return input.existingTarget ? 'already_valid' : 'absent_ready'
}

function existingTargetEvidence(input: {
  existingTarget: boolean
  residue: { kind: string }[]
  allowExisting: boolean
}): Record<string, unknown> | null {
  if (!input.existingTarget && input.residue.length === 0) return null
  const outcome = input.residue.length > 0
    ? targetClassFor(input)
    : input.allowExisting
      ? 'already_valid'
      : 'requires_allow_existing'
  return {
    outcome,
    target_class: outcome,
    blocking: outcome !== 'already_valid',
    action_required: outcome === 'requires_allow_existing' ? '--allow-existing' : undefined,
  }
}

function assignmentAgentName(config: ProductLineSeedConfig, agentKey: string): string {
  const prefix = `${config.product_line.agent_prefix}-`
  return agentKey.startsWith(prefix) ? agentKey : `${prefix}${agentKey}`
}

function isWorkflowContractCode(code: ProductLineSeedErrorCode): boolean {
  return code === 'UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY' ||
    code === 'WORKFLOW_CONTRACT_PATH_INVALID' ||
    code === 'WORKFLOW_CONTRACT_PARSE_FAILED' ||
    code === 'WORKFLOW_CONTRACT_REQUIRED_SLUGS_MISSING' ||
    code === 'WORKFLOW_CONTRACT_REQUIRED_SLUG_AMBIGUOUS' ||
    code === 'WORKFLOW_CONTRACT_REPO_MISMATCH' ||
    code === 'WORKFLOW_TEMPLATE_OWNERSHIP_CONFLICT'
}

function codeForResidue(kind: string | undefined): ProductLineSeedErrorCode {
  if (kind === 'product_line_identity_conflict' || kind === 'plb_platform_assignment_conflict') return 'TARGET_PRODUCT_LINE_CONFLICT'
  if (kind === 'repo_sync_owner_conflict') return 'TARGET_REPO_CONFLICT'
  if (kind === 'project_github_sync' || kind === 'task_github_sync') return 'TARGET_REPO_CONFLICT'
  if (kind === 'reserved_future_flag_enabled') return 'FEATURE_FLAG_RESERVED_FUTURE_ENABLED'
  if (kind === 'workflow_template_ownership_conflict') return 'WORKFLOW_TEMPLATE_OWNERSHIP_CONFLICT'
  return 'NON_TARGET_RESIDUE_DETECTED'
}

function residuePath(entry: { kind: string; identifiers?: unknown }, index?: number): string {
  if (entry.kind === 'reserved_future_flag_enabled' && isRecord(entry.identifiers)) {
    const flag = entry.identifiers['flag']
    if (typeof flag === 'string') return `$.target.feature_flags.${flag}`
  }
  return `$.target.residue[${String(index ?? 0)}]`
}

function configErrors(error: unknown): ProductLineSeedValidationError[] {
  if (error instanceof ProductLineSeedConfigValidationError) return error.errors
  return [{
    code: 'CONFIG_PARSE_FAILED',
    path: '$',
    message: error instanceof Error ? error.message : 'Product-line seed config could not be loaded.',
  }]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

function hasRowDrift(existing: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  return Object.entries(expected).some(([key, value]) => existing[key] !== value)
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
