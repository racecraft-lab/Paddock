import { createHash } from 'node:crypto'
import { WORKFLOW_CONTRACT_HASH_VERSION, type WorkflowContract, type WorkflowContractTemplate } from './types.ts'

const EXCLUDED_KEYS = new Set([
  'id',
  'row_id',
  'created_at',
  'updated_at',
  'diagnostics_run_id',
  'local_path',
  'absolute_path',
])

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stabilize(value))
}

export function computeContractHash(contract: WorkflowContract): string {
  return `${WORKFLOW_CONTRACT_HASH_VERSION}:sha256:${sha256(stableStringify(contract))}`
}

export function computeTemplateHashes(template: WorkflowContractTemplate): {
  routing_rule_hash: string
  output_schema_hash: string
} {
  return {
    routing_rule_hash: `sha256:${sha256(stableStringify(template.routing_rules ?? []))}`,
    output_schema_hash: `sha256:${sha256(stableStringify(template.output_schema ?? null))}`,
  }
}

function stabilize(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    const items = value.map(item => stabilize(item))
    if (parentKey === 'templates') {
      return [...items].sort((left, right) => {
        const leftSlug = readSlug(left)
        const rightSlug = readSlug(right)
        return leftSlug.localeCompare(rightSlug)
      })
    }
    return items
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (EXCLUDED_KEYS.has(key)) continue
      const child = (value as Record<string, unknown>)[key]
      if (key === 'task_prompt' && typeof child === 'string') {
        output[key] = child.replace(/\r\n?/g, '\n')
      } else {
        output[key] = stabilize(child, key)
      }
    }
    return output
  }
  return value
}

function readSlug(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const slug = (value as Record<string, unknown>)['slug']
  return typeof slug === 'string' ? slug : ''
}
