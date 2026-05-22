import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import {
  CONFIG_OWNED_SURFACES,
  FR020_PRESERVED_SURFACES,
  PRODUCT_LINE_SEED_HASH_PREFIX,
  PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION,
  PRODUCT_LINE_SEED_SNAPSHOT_SCHEMA_VERSION,
  type MutationStatus,
  type ProductLineSeedConfig,
  type ProductLineSeedDatabase,
  type ProductLineSeedErrorCode,
  type ProductLineSeedMode,
  type ProductLineSeedResultEnvelope,
  type ProductLineSeedSnapshot,
  type ProductLineSeedStatus,
  type ProductLineSeedValidationError,
  type RedactionProof,
} from './types.ts'

const unsafeSnapshotKeys = new Set([
  'credential',
  'credentials',
  'matched_secret',
  'operator_evidence',
  'password',
  'raw_log',
  'raw_logs',
  'raw_operator_evidence',
  'raw_payload',
  'raw_untrusted_payload',
  'secret',
  'signed_url',
  'token',
])

export type RedactionSafeSnapshotInput =
  | null
  | string
  | number
  | boolean
  | RedactionSafeSnapshotInput[]
  | { readonly [key: string]: RedactionSafeSnapshotInput }

export function orderedJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => orderedJsonStringify(entry)).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${orderedJsonStringify(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function assertRedactionSafeSnapshotInput(value: unknown, path = '$'): asserts value is RedactionSafeSnapshotInput {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertRedactionSafeSnapshotInput(entry, `${path}[${String(index)}]`)
    })
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.toLowerCase()
      if (unsafeSnapshotKeys.has(normalized)) {
        throw new Error(`Snapshot input contains unsafe redaction field at ${path}.${key}`)
      }
      assertRedactionSafeSnapshotInput(entry, `${path}.${key}`)
    }
    return
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return
  }
  throw new Error(`Snapshot input contains unsupported value at ${path}`)
}

export function hashProductLineSeedSnapshot(value: unknown): string {
  assertRedactionSafeSnapshotInput(value)
  const digest = createHash('sha256').update(orderedJsonStringify(value)).digest('hex')
  return `${PRODUCT_LINE_SEED_HASH_PREFIX}${digest}`
}

export function makeProductLineSeedResultEnvelope(options: {
  ok: boolean
  entrypoint: ProductLineSeedResultEnvelope['entrypoint']
  mode: ProductLineSeedMode | 'unknown'
  status: ProductLineSeedStatus
  code: ProductLineSeedErrorCode
  mutationStatus: MutationStatus
  configPath: string | null
  config?: ProductLineSeedConfig
  dbPath?: string | null
  existingTarget?: boolean
  evidence?: Record<string, unknown>
  errors?: ProductLineSeedValidationError[]
  snapshotBefore?: ProductLineSeedSnapshot | null
  snapshotAfter?: ProductLineSeedSnapshot | null
  redaction?: RedactionProof
  actionRequired?: string | null
}): ProductLineSeedResultEnvelope {
  const exitCode = exitCodeFor(options.code)
  return {
    schema_version: PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION,
    ok: options.ok,
    entrypoint: options.entrypoint,
    mode: options.mode,
    status: options.status,
    code: options.code,
    mutation_status: options.mutationStatus,
    config: {
      path: options.configPath,
      schema_version: options.config?.schema_version ?? null,
      product_line_slug: options.config?.product_line.slug ?? null,
    },
    target: options.config
      ? {
          db_path: options.dbPath ?? null,
          product_line_slug: options.config.product_line.slug,
          existing_target: options.existingTarget ?? false,
        }
      : null,
    evidence: options.evidence ?? {},
    errors: options.errors ?? [],
    snapshot_before: options.snapshotBefore ?? null,
    snapshot_after: options.snapshotAfter ?? null,
    redaction: options.redaction ?? { raw_secret_values_emitted: false, redacted_fields: [] },
    action_required: options.actionRequired ?? null,
    exit_code: exitCode,
  }
}

export function exitCodeFor(code: ProductLineSeedErrorCode): 0 | 2 | 3 | 4 | 5 {
  if (code === 'READY' || code === 'SEEDED' || code === 'VERIFIED') return 0
  if (code === 'UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY' || code === 'WORKFLOW_CONTRACT_REQUIRED_SLUGS_MISSING') return 3
  if (code === 'CONFIG_PARSE_FAILED' || code === 'CONFIG_UNSAFE_YAML_SYNTAX' || code === 'CONFIG_SCHEMA_INVALID' || code === 'EXISTING_TARGET_REQUIRES_ALLOW_EXISTING' || code === 'NON_TARGET_RESIDUE_DETECTED') return 2
  if (code === 'VERIFY_DRIFT_DETECTED') return 4
  return 5
}

export function collectProductLineSeedSnapshot(
  db: ProductLineSeedDatabase,
  config?: ProductLineSeedConfig,
): ProductLineSeedSnapshot {
  const surfaces: ProductLineSeedSnapshot['surfaces'] = {}
  for (const surface of CONFIG_OWNED_SURFACES) {
    surfaces[surface] = snapshotSurface(db, queryForConfigOwnedSurface(surface, config))
  }
  const subsurfaces: ProductLineSeedSnapshot['preserved_operational_state']['subsurfaces'] = {}
  for (const surface of FR020_PRESERVED_SURFACES) {
    subsurfaces[surface] = snapshotSurface(db, queryForPreservedSurface(surface))
  }
  const preservedHash = hashProductLineSeedSnapshot(subsurfaces)
  return {
    schema_version: PRODUCT_LINE_SEED_SNAPSHOT_SCHEMA_VERSION,
    hash: hashProductLineSeedSnapshot({ surfaces, preserved_operational_state: { hash: preservedHash, subsurfaces } }),
    surfaces,
    preserved_operational_state: {
      hash: preservedHash,
      subsurfaces,
    },
  }
}

export function collectOperatorEvidenceRedaction(path: string | undefined): RedactionProof {
  if (!path || !existsSync(path)) return { raw_secret_values_emitted: false, redacted_fields: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return {
      raw_secret_values_emitted: false,
      redacted_fields: collectRedactedFieldPaths(parsed).sort(),
    }
  } catch {
    return {
      raw_secret_values_emitted: false,
      redacted_fields: ['$.operator_evidence_parse_error'],
    }
  }
}

function collectRedactedFieldPaths(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectRedactedFieldPaths(entry, `${path}[${String(index)}]`))
  }
  if (!value || typeof value !== 'object') return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const fieldPath = `${path}.${key}`
    return isSensitiveKey(key) ? [fieldPath] : collectRedactedFieldPaths(entry, fieldPath)
  })
}

function snapshotSurface(db: ProductLineSeedDatabase, query: { table: string; sql: string; params?: unknown[] }) {
  if (!tableExists(db, query.table)) {
    return { count: 0, hash: hashProductLineSeedSnapshot([]), unavailable: true }
  }
  const rows = db.prepare(query.sql).all(...(query.params ?? [])) as RedactionSafeSnapshotInput[]
  return {
    count: rows.length,
    hash: hashProductLineSeedSnapshot(rows),
  }
}

function queryForConfigOwnedSurface(surface: string, config: ProductLineSeedConfig | undefined): { table: string; sql: string; params?: unknown[] } {
  const slug = config?.product_line.slug ?? ''
  switch (surface) {
    case 'workspace_identity':
    case 'feature_flags':
      return {
        table: 'workspaces',
        sql: 'SELECT id, slug, name, tenant_id, feature_flags, created_at, updated_at FROM workspaces WHERE slug = ? ORDER BY id ASC',
        params: [slug],
      }
    case 'department_projects':
      return {
        table: 'projects',
        sql: `SELECT p.id, p.workspace_id, p.slug, p.name, p.ticket_prefix, p.area_slug, p.github_repo,
          p.github_sync_enabled, p.is_triage_project, p.is_repo_sync_owner, p.created_at, p.updated_at
          FROM projects p JOIN workspaces w ON w.id = p.workspace_id WHERE w.slug = ? ORDER BY p.slug ASC, p.id ASC`,
        params: [slug],
      }
    case 'agent_assignments':
      return {
        table: 'project_agent_assignments',
        sql: `SELECT paa.id, paa.project_id, paa.agent_name, paa.role, paa.assigned_at
          FROM project_agent_assignments paa JOIN projects p ON p.id = paa.project_id
          JOIN workspaces w ON w.id = p.workspace_id WHERE w.slug = ? ORDER BY p.slug ASC, paa.agent_name ASC`,
        params: [slug],
      }
    case 'workflow_contract_templates':
      return {
        table: 'workflow_templates',
        sql: `SELECT wt.id, wt.workspace_id, wt.slug, wt.name, wt.created_by, wt.enabled, wt.last_used_at, wt.use_count
          FROM workflow_templates wt JOIN workspaces w ON w.id = wt.workspace_id
          WHERE w.slug = ? AND wt.created_by = 'workflow-contract' ORDER BY wt.slug ASC, wt.id ASC`,
        params: [slug],
      }
    case 'governance_defaults':
      return {
        table: 'resource_policies',
        sql: `SELECT rp.id, rp.workspace_id, rp.notes, rp.policy_type, rp.limit_kind, rp.limit_value, rp.period,
          rp.timezone, rp.enforcement, rp.enabled, rp.default_template, rp.created_at, rp.updated_at
          FROM resource_policies rp JOIN workspaces w ON w.id = rp.workspace_id
          WHERE w.slug = ? ORDER BY rp.notes ASC, rp.id ASC`,
        params: [slug],
      }
    default:
      return { table: 'sqlite_master', sql: 'SELECT 1 WHERE 0' }
  }
}

function queryForPreservedSurface(surface: string): { table: string; sql: string; params?: unknown[] } {
  switch (surface) {
    case 'tasks':
    case 'task_evidence_read_model_state':
    case 'task_status':
    case 'task_github_linkage':
    case 'task_lineage':
      return {
        table: 'tasks',
        sql: `SELECT id, workspace_id, project_id, title, status, github_repo, github_issue_number,
          github_synced_at, github_branch, github_pr_number, github_pr_state, parent_task_id,
          root_task_id, chain_id, chain_stage, dispatch_attempts, created_at FROM tasks ORDER BY id ASC`,
      }
    case 'issues':
      return { table: 'issues', sql: 'SELECT id, task_id, external_id FROM issues ORDER BY id ASC' }
    case 'activities':
      return { table: 'activities', sql: 'SELECT id, task_id, action FROM activities ORDER BY id ASC' }
    case 'histories':
      return { table: 'task_histories', sql: 'SELECT id, task_id, status FROM task_histories ORDER BY id ASC' }
    case 'comments':
      return { table: 'task_comments', sql: 'SELECT id, task_id FROM task_comments ORDER BY id ASC' }
    case 'notifications':
      return { table: 'notifications', sql: 'SELECT id, task_id FROM notifications ORDER BY id ASC' }
    case 'dispositions':
      return { table: 'task_dispositions', sql: 'SELECT id, task_id, outcome FROM task_dispositions ORDER BY id ASC' }
    case 'artifacts':
      return { table: 'task_artifacts', sql: 'SELECT id, task_id, artifact_type FROM task_artifacts ORDER BY id ASC' }
    case 'quality_reviews':
      return { table: 'quality_reviews', sql: 'SELECT id, task_id, reviewer FROM quality_reviews ORDER BY id ASC' }
    case 'github_sync_state':
      return { table: 'github_sync_state', sql: 'SELECT id, repo, cursor FROM github_sync_state ORDER BY id ASC' }
    case 'governance_audit_rows':
      return { table: 'resource_policy_events', sql: 'SELECT id, policy_id, action FROM resource_policy_events ORDER BY id ASC' }
    case 'manual_workflow_templates':
    case 'workflow_use_counters':
      return { table: 'workflow_templates', sql: "SELECT id, workspace_id, slug, created_by, use_count, last_used_at FROM workflow_templates WHERE created_by <> 'workflow-contract' ORDER BY id ASC" }
    case 'row_ids':
    case 'creation_timestamps':
    case 'project_ticket_counters':
      return { table: 'projects', sql: 'SELECT id, workspace_id, slug, ticket_counter, created_at FROM projects ORDER BY id ASC' }
    case 'assignment_timestamps':
      return { table: 'project_agent_assignments', sql: 'SELECT id, project_id, agent_name, assigned_at FROM project_agent_assignments ORDER BY id ASC' }
    case 'non_owned_feature_flags':
      return { table: 'workspaces', sql: 'SELECT id, slug, feature_flags FROM workspaces ORDER BY id ASC' }
    default:
      return { table: 'sqlite_master', sql: 'SELECT 1 WHERE 0' }
  }
}

function tableExists(db: ProductLineSeedDatabase, table: string): boolean {
  const row = db.prepare("SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { ok: number } | undefined
  return Boolean(row?.ok)
}

function isSensitiveKey(key: string): boolean {
  return /authorization|api[_-]?key|token|password|secret|credential|raw_operator_evidence|raw_payload|raw_log/i.test(key)
}
