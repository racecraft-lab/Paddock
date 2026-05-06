import { createWorkflowContractRun } from './diagnostics.ts'
import { upsertTemplate } from './importer.ts'
import type { RuntimeWorkflowTemplate, WorkflowContractTemplate } from './types.ts'
import type Database from 'better-sqlite3'

export function recoverLastKnownGood(
  db: Database.Database,
  options: { family: string; workspaceId: number; mode: 'dry-run' | 'apply' }
): { ok: boolean; code?: string; run_id?: number; mutation_status: 'dry_run' | 'applied' | 'not_mutated' } {
  const snapshot = db.prepare(`
    SELECT * FROM workflow_contract_snapshots
    WHERE family = ? AND workspace_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(options.family, options.workspaceId) as {
    id: number
    contract_hash: string
    canonical_json: string
    runtime_templates_json: string
    recovery_command: string
  } | undefined

  if (!snapshot) {
    const runId = createWorkflowContractRun(db, {
      family: options.family,
      workspaceId: options.workspaceId,
      mode: options.mode === 'apply' ? 'recover_apply' : 'recover_dry_run',
      status: 'not_found',
      mutationStatus: 'not_mutated',
      errorCount: 1,
    })
    return { ok: false, code: 'NO_LAST_KNOWN_GOOD', run_id: runId, mutation_status: 'not_mutated' }
  }

  if (options.mode === 'dry-run') {
    const runId = createWorkflowContractRun(db, {
      family: options.family,
      workspaceId: options.workspaceId,
      mode: 'recover_dry_run',
      status: 'success',
      mutationStatus: 'dry_run',
      contractHash: snapshot.contract_hash,
      lkgSnapshotId: snapshot.id,
      recoveryCommand: snapshot.recovery_command,
    })
    return { ok: true, run_id: runId, mutation_status: 'dry_run' }
  }

  const canonicalSlugs = parseCanonicalTemplateSlugs(snapshot.canonical_json)
  const rows = (JSON.parse(snapshot.runtime_templates_json) as RuntimeWorkflowTemplate[])
    .filter(row => row.slug && (canonicalSlugs.has(row.slug) || row.created_by === 'workflow-contract'))
  const tx = db.transaction(() => {
    for (const row of rows) {
      if (!row.slug) continue
      upsertTemplate(db, options.workspaceId, runtimeToTemplate(row))
    }
    return createWorkflowContractRun(db, {
      family: options.family,
      workspaceId: options.workspaceId,
      mode: 'recover_apply',
      status: 'success',
      mutationStatus: 'applied',
      contractHash: snapshot.contract_hash,
      lkgSnapshotId: snapshot.id,
      recoveryCommand: snapshot.recovery_command,
    })
  })
  return { ok: true, run_id: tx(), mutation_status: 'applied' }
}

function parseCanonicalTemplateSlugs(canonicalJson: string): Set<string> {
  try {
    const parsed = JSON.parse(canonicalJson) as { templates?: { slug?: unknown }[] }
    return new Set((parsed.templates ?? []).map(template => template.slug).filter((slug): slug is string => typeof slug === 'string'))
  } catch {
    return new Set()
  }
}

function runtimeToTemplate(row: RuntimeWorkflowTemplate): WorkflowContractTemplate {
  return {
    slug: row.slug ?? '',
    name: row.name,
    description: row.description ?? null,
    model: row.model ?? 'sonnet',
    task_prompt: row.task_prompt,
    timeout_seconds: row.timeout_seconds ?? 300,
    agent_role: row.agent_role ?? null,
    tags: parseJson(row.tags, []),
    routing_rules: parseJson(row.routing_rules, []),
    output_schema: parseJson(row.output_schema, null),
    next_template_slug: row.next_template_slug ?? null,
    produces_pr: Boolean(row.produces_pr),
    external_terminal_event: row.external_terminal_event ?? null,
    allow_redacted_artifacts: Boolean(row.allow_redacted_artifacts),
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
