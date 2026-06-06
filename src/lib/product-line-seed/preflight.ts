import { loadWorkflowContractFromFile } from '../workflow-contracts/yaml-loader.ts'
import {
  PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION,
  type ProductLineResidue,
  type ProductLineSeedConfig,
  type ProductLineSeedDatabase,
  type ProductLineSeedResultEnvelope,
  type ProductLineSeedRunOptions,
} from './types.ts'

const RESERVED_FUTURE_FLAGS = new Set(['FEATURE_TASK_CONTROL_PLANE', 'FEATURE_AGENT_RUNNER_SANDBOXES'])
const RETAINED_INVENTORY_NAMES = new Set(['FocusEngine', 'OpenClaw'])

export function detectProductLineTargetResidue(
  db: ProductLineSeedDatabase,
  config: ProductLineSeedConfig,
): ProductLineResidue[] {
  const residue: ProductLineResidue[] = []
  if (tableExists(db, 'workspaces')) {
    const row = db.prepare('SELECT id, name FROM workspaces WHERE slug = ?').get(config.product_line.slug) as
      | { id: number; name: string }
      | undefined
    if (row && row.name !== config.product_line.display_name) {
      residue.push({
        kind: 'product_line_identity_conflict',
        count: 1,
        identifiers: { workspace_id: row.id, expected_slug: config.product_line.slug },
      })
    }
  }
  if (tableExists(db, 'projects')) {
    const targetRepoSyncOwners = targetWorkspaceRepoSyncOwners(db, config)
    if (targetRepoSyncOwners) residue.push(targetRepoSyncOwners)
    const projects = db.prepare(`
      SELECT github_repo, COUNT(*) as count, GROUP_CONCAT(id) as ids
      FROM projects
      WHERE github_repo IS NOT NULL AND github_repo <> ? AND COALESCE(github_sync_enabled, 0) = 1
      GROUP BY github_repo
    `).all(config.github.full_name) as { github_repo: string; count: number; ids: string }[]
    residue.push(...projects.map((row) => ({
      kind: 'project_github_sync',
      repo: row.github_repo,
      count: row.count,
      project_ids: row.ids.split(',').map(Number),
    })))
  }
  const assignmentConflict = findProductLineBAssignmentConflict(db, config)
  if (assignmentConflict) residue.push(assignmentConflict)
  if (tableExists(db, 'tasks')) {
    const tasks = db.prepare(`
      SELECT github_repo, COUNT(*) as count, GROUP_CONCAT(id) as ids
      FROM tasks
      WHERE github_repo IS NOT NULL AND github_repo <> ? AND github_issue_number IS NOT NULL
      GROUP BY github_repo
    `).all(config.github.full_name) as { github_repo: string; count: number; ids: string }[]
    residue.push(...tasks.map((row) => ({
      kind: 'task_github_sync',
      repo: row.github_repo,
      count: row.count,
      task_ids: row.ids.split(',').map(Number),
    })))
  }
  const reservedFutureFlag = findEnabledReservedFutureFlag(db, config)
  if (reservedFutureFlag) {
    residue.push(reservedFutureFlag.startsWith('INVALID_JSON:')
      ? {
          kind: 'feature_flags_invalid_json',
          count: 1,
          identifiers: { workspace_slug: reservedFutureFlag.slice('INVALID_JSON:'.length) },
        }
      : {
          kind: 'reserved_future_flag_enabled',
          count: 1,
          identifiers: { flag: reservedFutureFlag },
        })
  }
  const ownershipConflict = findWorkflowTemplateOwnershipConflict(db, config)
  if (ownershipConflict) {
    residue.push(ownershipConflict)
  }
  return residue
}

function targetWorkspaceRepoSyncOwners(
  db: ProductLineSeedDatabase,
  config: ProductLineSeedConfig,
): ProductLineResidue | null {
  if (config.product_line.disabled_by_default !== true) return null
  if (!tableExists(db, 'workspaces') || !tableExists(db, 'projects')) return null
  const workspace = db.prepare('SELECT id FROM workspaces WHERE slug = ?').get(config.product_line.slug) as { id: number } | undefined
  if (!workspace) return null
  const rows = db.prepare(`
    SELECT id
    FROM projects
    WHERE workspace_id = ?
      AND github_repo = ?
      AND (COALESCE(github_sync_enabled, 0) = 1 OR COALESCE(is_repo_sync_owner, 0) = 1)
    ORDER BY id ASC
  `).all(workspace.id, config.github.full_name) as { id: number }[]
  if (rows.length === 0) return null
  return {
    kind: 'repo_sync_owner_conflict',
    repo: config.github.full_name,
    count: rows.length,
    project_ids: rows.map((row) => row.id),
  }
}

function findProductLineBAssignmentConflict(
  db: ProductLineSeedDatabase,
  config: ProductLineSeedConfig,
): ProductLineResidue | null {
  if (config.product_line.disabled_by_default !== true) return null
  if (!tableExists(db, 'workspaces') || !tableExists(db, 'projects') || !tableExists(db, 'project_agent_assignments')) return null
  const prefix = `${config.product_line.agent_prefix}-`
  const rows = db.prepare(`
    SELECT paa.id, paa.agent_name
    FROM project_agent_assignments paa
    JOIN projects p ON p.id = paa.project_id
    JOIN workspaces w ON w.id = p.workspace_id
    WHERE paa.agent_name LIKE ?
      AND w.slug <> ?
    ORDER BY paa.agent_name ASC, paa.id ASC
  `).all(`${prefix}%`, config.product_line.slug) as { id: number; agent_name: string }[]
  if (rows.length === 0) return null
  return {
    kind: 'plb_platform_assignment_conflict',
    count: rows.length,
    identifiers: {
      agent_names: rows.map((row) => row.agent_name),
    },
  }
}

export function collectRetainedProductLineInventory(
  db: ProductLineSeedDatabase,
): {
  identity: string
  source: string
  classification: 'retained_inventory'
  status?: string
  count: number
  blocking: false
}[] {
  if (!tableExists(db, 'agents')) return []
  const rows = db.prepare(`
    SELECT name, COALESCE(source, 'agent_rows') as source, status, COUNT(*) as count
    FROM agents
    WHERE name IN (${[...RETAINED_INVENTORY_NAMES].map(() => '?').join(', ')})
    GROUP BY name, source, status
    ORDER BY name ASC, source ASC
  `).all(...RETAINED_INVENTORY_NAMES) as { name: string; source: string; status: string | null; count: number }[]
  return rows.map((row) => ({
    identity: row.name,
    source: row.source,
    classification: 'retained_inventory',
    ...(row.status ? { status: row.status } : {}),
    count: row.count,
    blocking: false,
  }))
}

function findWorkflowTemplateOwnershipConflict(
  db: ProductLineSeedDatabase,
  config: ProductLineSeedConfig,
): ProductLineResidue | null {
  if (!tableExists(db, 'workflow_templates') || !tableExists(db, 'workspaces')) return null
  const workspace = db.prepare('SELECT id FROM workspaces WHERE slug = ?').get(config.product_line.slug) as { id: number } | undefined
  if (!workspace) return null
  const contract = loadWorkflowContractFromFile(config.workflow_contract.path)
  const slugs = contract.templates.map((template) => template.slug)
  if (slugs.length === 0) return null
  const placeholders = slugs.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT id, slug, created_by
    FROM workflow_templates
    WHERE workspace_id = ?
      AND slug IN (${placeholders})
      AND created_by <> 'workflow-contract'
    ORDER BY slug ASC, id ASC
  `).all(workspace.id, ...slugs) as { id: number; slug: string; created_by: string | null }[]
  if (rows.length === 0) return null
  return {
    kind: 'workflow_template_ownership_conflict',
    count: rows.length,
    identifiers: {
      template_ids: rows.map((row) => row.id),
      template_slugs: rows.map((row) => row.slug),
      owners: rows.map((row) => row.created_by ?? 'unknown'),
    },
  }
}

export function buildPendingProductLineSeedResult(
  options: Pick<ProductLineSeedRunOptions, 'configPath' | 'entrypoint' | 'mode'>,
): ProductLineSeedResultEnvelope {
  return {
    schema_version: PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION,
    ok: false,
    entrypoint: options.entrypoint,
    mode: options.mode,
    status: 'cli_error',
    code: 'IMPLEMENTATION_PENDING',
    mutation_status: 'not_mutated',
    config: {
      path: options.configPath,
      schema_version: null,
      product_line_slug: null,
    },
    target: null,
    evidence: {},
    errors: [{
      code: 'IMPLEMENTATION_PENDING',
      path: '$',
      message: 'Product-line seed execution is pending later SPEC-010A tasks.',
    }],
    snapshot_before: null,
    snapshot_after: null,
    redaction: {
      raw_secret_values_emitted: false,
      redacted_fields: [],
    },
    action_required: null,
    exit_code: 5,
  }
}

function findEnabledReservedFutureFlag(db: ProductLineSeedDatabase, config: ProductLineSeedConfig): string | null {
  if (!tableExists(db, 'workspaces')) return null
  const rows = db.prepare('SELECT slug, feature_flags FROM workspaces WHERE slug IN (?, ?) ORDER BY slug ASC')
    .all('facility', config.product_line.slug) as { slug: string; feature_flags: string | null }[]
  for (const row of rows) {
    const parsed = parseFlags(row.feature_flags)
    if (!parsed.ok) return `INVALID_JSON:${row.slug}`
    const flags = parsed.flags
    for (const flag of RESERVED_FUTURE_FLAGS) {
      if (flags[flag] === true) return flag
    }
  }
  return null
}

function tableExists(db: ProductLineSeedDatabase, table: string): boolean {
  const row = db.prepare("SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { ok: number } | undefined
  return Boolean(row?.ok)
}

function parseFlags(featureFlags: string | null): { ok: true; flags: Record<string, boolean> } | { ok: false; flags: Record<string, boolean> } {
  if (!featureFlags) return { ok: true, flags: {} }
  try {
    const parsed = JSON.parse(featureFlags) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ok: true, flags: parsed as Record<string, boolean> }
      : { ok: false, flags: {} }
  } catch {
    return { ok: false, flags: {} }
  }
}
