import {
  PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION,
  type ProductLineResidue,
  type ProductLineSeedConfig,
  type ProductLineSeedDatabase,
  type ProductLineSeedResultEnvelope,
  type ProductLineSeedRunOptions,
} from './types.ts'

const RESERVED_FUTURE_FLAGS = new Set(['FEATURE_TASK_CONTROL_PLANE', 'FEATURE_AGENT_RUNNER_SANDBOXES'])

export function detectProductLineTargetResidue(
  db: ProductLineSeedDatabase,
  config: ProductLineSeedConfig,
): ProductLineResidue[] {
  const residue: ProductLineResidue[] = []
  if (tableExists(db, 'projects')) {
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
    residue.push({
      kind: 'reserved_future_flag_enabled',
      count: 1,
      identifiers: { flag: reservedFutureFlag },
    })
  }
  return residue
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
  const rows = db.prepare('SELECT feature_flags FROM workspaces WHERE slug IN (?, ?) ORDER BY slug ASC')
    .all('facility', config.product_line.slug) as { feature_flags: string | null }[]
  for (const row of rows) {
    const flags = parseFlags(row.feature_flags)
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
