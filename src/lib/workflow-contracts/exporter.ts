import { createWorkflowContractRun } from './diagnostics.ts'
import { isRuntimeTemplateEnabled, isWorkflowContractOwned } from './diff.ts'
import { redactDetails } from './errors.ts'
import { computeContractHash, computeTemplateHashes } from './hash.ts'
import { selectOwnedRuntimeTemplates, selectRuntimeTemplates } from './importer.ts'
import type { RuntimeWorkflowTemplate, WorkflowContract, WorkflowContractTemplate } from './types.ts'
import type Database from 'better-sqlite3'

export function exportWorkflowContractMarkdown(
  db: Database.Database,
  options: { family: string; workspaceId: number; exportPath?: string }
): { markdown: string; contract: WorkflowContract; contract_hash: string; diagnostics_run_id: number } {
  const runtimeTemplates = selectRuntimeTemplates(db, options.workspaceId)
  const contract = buildExportContract(db, runtimeTemplates, options)
  const contractHash = computeContractHash(contract)
  const lines = [
    '# Workflow Contract Export',
    '',
    `Family: ${contract.family}`,
    `Workspace: ${String(contract.workspace_id)}`,
    `Validation Status: latest successful canonical snapshot`,
    `Template Count: ${String(contract.templates.length)}`,
    `Contract Hash: ${contractHash}`,
    '',
    '## Templates',
    '',
  ]
  for (const template of contract.templates) {
    const hashes = computeTemplateHashes(template)
    lines.push(`### ${template.name}`, '')
    lines.push(`- Slug: \`${template.slug}\``)
    lines.push(`- Model: \`${template.model}\``)
    lines.push(`- Prompt Version: \`${template.prompt_version ?? 'unspecified'}\``)
    lines.push(`- Routing Rule Hash: \`${hashes.routing_rule_hash}\``)
    lines.push(`- Output Schema Hash: \`${hashes.output_schema_hash}\``)
    lines.push('')
    lines.push('```text')
    lines.push(redactDetails(template.task_prompt, 2000).trimEnd())
    lines.push('```')
    lines.push('')
  }
  const runId = createWorkflowContractRun(db, {
    family: options.family,
    workspaceId: options.workspaceId,
    mode: 'export',
    status: 'success',
    mutationStatus: 'not_mutated',
    ...(options.exportPath === undefined ? {} : { exportPath: options.exportPath }),
    contractHash,
  })
  return { markdown: lines.join('\n'), contract, contract_hash: contractHash, diagnostics_run_id: runId }
}

function buildExportContract(
  db: Database.Database,
  runtimeTemplates: RuntimeWorkflowTemplate[],
  options: { family: string; workspaceId: number }
): WorkflowContract {
  const snapshot = readLatestSnapshot(db, options)
  if (!snapshot) {
    return {
      family: options.family,
      version: 'workflow-contract-v1',
      workspace_id: options.workspaceId,
      allowed_variable_namespaces: ['workspace', 'task', 'operator', 'github'],
      templates: selectOwnedRuntimeTemplates(db, options.workspaceId).map(runtimeToTemplate).sort(compareTemplates),
    }
  }

  const bySlug = new Map<string, RuntimeWorkflowTemplate>()
  for (const row of runtimeTemplates) {
    if (row.workspace_id === options.workspaceId && row.slug && isWorkflowContractOwned(row) && isRuntimeTemplateEnabled(row)) bySlug.set(row.slug, row)
  }
  const seen = new Set<string>()
  const fromSnapshot: WorkflowContractTemplate[] = []
  for (const template of snapshot.templates) {
    const row = bySlug.get(template.slug)
    if (!row) continue
    seen.add(template.slug)
    fromSnapshot.push(overlayRuntimeFields(template, row))
  }
  const runtimeOnly = runtimeTemplates
    .filter(row => row.slug && isWorkflowContractOwned(row) && isRuntimeTemplateEnabled(row) && !seen.has(row.slug))
    .map(runtimeToTemplate)
  return {
    ...snapshot,
    family: options.family,
    workspace_id: options.workspaceId,
    templates: [...fromSnapshot, ...runtimeOnly].sort(compareTemplates),
  }
}

function readLatestSnapshot(db: Database.Database, options: { family: string; workspaceId: number }): WorkflowContract | null {
  const row = db.prepare(`
    SELECT canonical_json
    FROM workflow_contract_snapshots
    WHERE family = ? AND workspace_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(options.family, options.workspaceId) as { canonical_json: string } | undefined
  if (!row) return null
  try {
    const parsed = JSON.parse(row.canonical_json) as WorkflowContract
    return Array.isArray(parsed.templates) ? parsed : null
  } catch {
    return null
  }
}

function overlayRuntimeFields(template: WorkflowContractTemplate, row: RuntimeWorkflowTemplate): WorkflowContractTemplate {
  const output: WorkflowContractTemplate = {
    ...template,
    slug: row.slug ?? template.slug,
    name: row.name,
    model: row.model ?? template.model,
    task_prompt: row.task_prompt,
    timeout_seconds: row.timeout_seconds ?? template.timeout_seconds,
  }
  if ('description' in template || row.description != null) output.description = row.description ?? null
  if ('agent_role' in template || row.agent_role != null) output.agent_role = row.agent_role ?? null

  const tags = parseJson(row.tags, [])
  if ('tags' in template || tags.length > 0) output.tags = tags

  const routingRules = parseJson(row.routing_rules, [])
  if ('routing_rules' in template || routingRules.length > 0) output.routing_rules = routingRules

  const outputSchema = parseJson<Record<string, unknown> | null>(row.output_schema, null)
  if ('output_schema' in template || outputSchema != null) output.output_schema = outputSchema

  if ('next_template_slug' in template || row.next_template_slug != null) output.next_template_slug = row.next_template_slug ?? null
  if ('produces_pr' in template || Boolean(row.produces_pr)) output.produces_pr = Boolean(row.produces_pr)
  if ('external_terminal_event' in template || row.external_terminal_event != null) output.external_terminal_event = row.external_terminal_event ?? null
  if ('allow_redacted_artifacts' in template || Boolean(row.allow_redacted_artifacts)) output.allow_redacted_artifacts = Boolean(row.allow_redacted_artifacts)
  return output
}

function runtimeToTemplate(row: RuntimeWorkflowTemplate): WorkflowContractTemplate {
  return {
    slug: row.slug ?? `template-${String(row.id ?? 'unknown')}`,
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

function compareTemplates(left: WorkflowContractTemplate, right: WorkflowContractTemplate): number {
  return left.slug.localeCompare(right.slug)
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
