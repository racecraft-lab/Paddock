import { stableStringify } from './hash.ts'
import type { RuntimeWorkflowTemplate, WorkflowContract, WorkflowContractDiff, WorkflowContractTemplate } from './types.ts'

export function diffWorkflowTemplates(contract: WorkflowContract, runtimeTemplates: RuntimeWorkflowTemplate[]): WorkflowContractDiff {
  const bySlug = new Map<string, RuntimeWorkflowTemplate>()
  const unrelated: RuntimeWorkflowTemplate[] = []
  for (const row of runtimeTemplates) {
    if (row.workspace_id !== contract.workspace_id || !row.slug) {
      unrelated.push(row)
    } else {
      bySlug.set(row.slug, row)
    }
  }

  const create: WorkflowContractTemplate[] = []
  const update: WorkflowContractTemplate[] = []
  const unchanged: WorkflowContractTemplate[] = []
  const seen = new Set<string>()

  for (const template of contract.templates) {
    seen.add(template.slug)
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
    .filter(([slug]) => !seen.has(slug))
    .map(([, row]) => row)

  return { create, update, disable, unchanged, unrelated }
}

function templateMatchesRuntime(template: WorkflowContractTemplate, row: RuntimeWorkflowTemplate): boolean {
  return template.name === row.name &&
    template.task_prompt === row.task_prompt &&
    template.model === (row.model ?? 'sonnet') &&
    stableStringify(template.routing_rules ?? []) === stableStringify(parseJson(row.routing_rules, [])) &&
    stableStringify(template.output_schema ?? null) === stableStringify(parseJson(row.output_schema, null))
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
