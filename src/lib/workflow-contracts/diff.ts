import { stableStringify } from './hash.ts'
import type { RuntimeWorkflowTemplate, WorkflowContract, WorkflowContractDiff, WorkflowContractTemplate } from './types.ts'

export function diffWorkflowTemplates(contract: WorkflowContract, runtimeTemplates: RuntimeWorkflowTemplate[]): WorkflowContractDiff {
  const bySlug = new Map<string, RuntimeWorkflowTemplate>()
  const nonContractBySlug = new Map<string, RuntimeWorkflowTemplate>()
  const unrelated: RuntimeWorkflowTemplate[] = []
  for (const row of runtimeTemplates) {
    if (row.workspace_id !== contract.workspace_id || !row.slug) {
      unrelated.push(row)
    } else if (isWorkflowContractOwned(row)) {
      bySlug.set(row.slug, row)
    } else {
      nonContractBySlug.set(row.slug, row)
      unrelated.push(row)
    }
  }

  const create: WorkflowContractTemplate[] = []
  const update: WorkflowContractTemplate[] = []
  const unchanged: WorkflowContractTemplate[] = []
  const conflicts: RuntimeWorkflowTemplate[] = []
  const seen = new Set<string>()

  for (const template of contract.templates) {
    seen.add(template.slug)
    const nonContract = nonContractBySlug.get(template.slug)
    if (nonContract) {
      conflicts.push(nonContract)
      continue
    }
    const existing = bySlug.get(template.slug)
    if (!existing) {
      create.push(template)
    } else if (templateMatchesRuntime(template, existing)) {
      unchanged.push(template)
    } else {
      update.push(template)
    }
  }

  const disable = [...bySlug.entries()]
    .filter(([slug, row]) => !seen.has(slug) && isWorkflowContractOwned(row) && isRuntimeTemplateEnabled(row))
    .map(([, row]) => row)
  for (const [slug, row] of bySlug.entries()) {
    if (!seen.has(slug) && !isWorkflowContractOwned(row)) unrelated.push(row)
  }

  return { create, update, disable, unchanged, unrelated, conflicts }
}

export function isWorkflowContractOwned(row: RuntimeWorkflowTemplate): boolean {
  return row.created_by === 'workflow-contract'
}

export function isRuntimeTemplateEnabled(row: RuntimeWorkflowTemplate): boolean {
  return row.enabled !== 0 && row.enabled !== false
}

function templateMatchesRuntime(template: WorkflowContractTemplate, row: RuntimeWorkflowTemplate): boolean {
  return template.name === row.name &&
    (template.description ?? null) === (row.description ?? null) &&
    template.task_prompt === row.task_prompt &&
    template.model === (row.model ?? 'sonnet') &&
    template.timeout_seconds === (row.timeout_seconds ?? 300) &&
    (template.agent_role ?? null) === (row.agent_role ?? null) &&
    stableStringify(template.tags ?? []) === stableStringify(parseJson(row.tags, [])) &&
    stableStringify(template.routing_rules ?? []) === stableStringify(parseJson(row.routing_rules, [])) &&
    stableStringify(template.output_schema ?? null) === stableStringify(parseJson(row.output_schema, null)) &&
    (template.next_template_slug ?? null) === (row.next_template_slug ?? null) &&
    Boolean(template.produces_pr) === Boolean(row.produces_pr) &&
    (template.external_terminal_event ?? null) === (row.external_terminal_event ?? null) &&
    Boolean(template.allow_redacted_artifacts) === Boolean(row.allow_redacted_artifacts)
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
