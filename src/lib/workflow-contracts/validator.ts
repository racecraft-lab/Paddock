import { workflowContractError } from './errors.ts'
import { computeTemplateHashes } from './hash.ts'
import { createWorkflowContractAjv } from './schema.ts'
import type { WorkflowContract, WorkflowContractError, WorkflowContractTemplate } from './types.ts'

export type WorkflowContractValidationResult =
  | { ok: true; errors: [] }
  | { ok: false; errors: WorkflowContractError[] }

const CONTRACT_KEYS = new Set(['family', 'version', 'workspace_id', 'allowed_variable_namespaces', 'templates', 'local_path', 'diagnostics_run_id'])
const TEMPLATE_KEYS = new Set([
  'slug', 'name', 'description', 'model', 'task_prompt', 'timeout_seconds', 'agent_role', 'tags',
  'tracker', 'capabilities', 'adapter_requirements', 'feature_flags', 'governance', 'concurrency',
  'retry', 'sandbox', 'prompt_version', 'routing_rules', 'output_schema', 'routing_rule_hash',
  'output_schema_hash', 'next_template_slug', 'produces_pr', 'external_terminal_event', 'allow_redacted_artifacts',
])

export function validateWorkflowContract(contract: WorkflowContract): WorkflowContractValidationResult {
  const errors: WorkflowContractError[] = []
  const record = contract as unknown as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!CONTRACT_KEYS.has(key)) {
      errors.push(workflowContractError('UNKNOWN_FIELD', `Unknown contract field ${key}`, { canonical_model_path: key }))
    }
  }
  if (record['family'] !== 'mission-control') errors.push(workflowContractError('INVALID_FAMILY', 'Contract family must be mission-control', { canonical_model_path: 'family' }))
  if (record['version'] !== 'workflow-contract-v1') errors.push(workflowContractError('INVALID_VERSION', 'Contract version must be workflow-contract-v1', { canonical_model_path: 'version' }))
  if (!Number.isInteger(record['workspace_id']) || Number(record['workspace_id']) <= 0) errors.push(workflowContractError('INVALID_WORKSPACE', 'workspace_id must be a positive integer', { canonical_model_path: 'workspace_id' }))
  if (!Array.isArray(record['allowed_variable_namespaces'])) errors.push(workflowContractError('INVALID_VARIABLE_NAMESPACES', 'allowed_variable_namespaces must be an array', { canonical_model_path: 'allowed_variable_namespaces' }))
  if (!Array.isArray(record['templates']) || record['templates'].length === 0) errors.push(workflowContractError('NO_TEMPLATES', 'Contract must contain at least one template', { canonical_model_path: 'templates' }))

  const allowedNamespaces = new Set(
    Array.isArray(record['allowed_variable_namespaces'])
      ? record['allowed_variable_namespaces'].filter((value): value is string => typeof value === 'string')
      : []
  )
  const slugs = new Set<string>()
  const templates = Array.isArray(record['templates']) ? record['templates'] as WorkflowContractTemplate[] : []
  for (const [index, template] of templates.entries()) {
    validateTemplate(template, index, allowedNamespaces, slugs, errors)
  }
  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors }
}

function validateTemplate(
  template: WorkflowContractTemplate,
  index: number,
  allowedNamespaces: Set<string>,
  slugs: Set<string>,
  errors: WorkflowContractError[]
): void {
  const basePath = `templates[${String(index)}]`
  for (const key of Object.keys(template as unknown as Record<string, unknown>)) {
    if (!TEMPLATE_KEYS.has(key)) {
      errors.push(workflowContractError('UNKNOWN_FIELD', `Unknown template field ${key}`, { canonical_model_path: `${basePath}.${key}`, template_slug: template.slug }))
    }
  }
  if (!template.slug || !/^[a-z0-9][a-z0-9-]*$/.test(template.slug)) errors.push(workflowContractError('INVALID_TEMPLATE_SLUG', 'Template slug is invalid', { canonical_model_path: `${basePath}.slug`, template_slug: template.slug }))
  if (slugs.has(template.slug)) errors.push(workflowContractError('DUPLICATE_TEMPLATE_SLUG', 'Template slug is duplicated', { canonical_model_path: `${basePath}.slug`, template_slug: template.slug }))
  slugs.add(template.slug)
  if (!template.name) errors.push(workflowContractError('INVALID_TEMPLATE_NAME', 'Template name is required', { canonical_model_path: `${basePath}.name`, template_slug: template.slug }))
  if (!template.model) errors.push(workflowContractError('INVALID_MODEL', 'Template model is required', { canonical_model_path: `${basePath}.model`, template_slug: template.slug }))
  if (typeof template.task_prompt !== 'string' || template.task_prompt.length === 0) errors.push(workflowContractError('INVALID_PROMPT', 'Template prompt is required', { canonical_model_path: `${basePath}.task_prompt`, template_slug: template.slug }))
  validateVariables(template, allowedNamespaces, basePath, errors)
  validateTracker(template, basePath, errors)
  validateStringArray(template.capabilities, 'INVALID_CAPABILITY', `${basePath}.capabilities`, template.slug, errors)
  validateStringArray(template.adapter_requirements, 'INVALID_ADAPTER_REQUIREMENT', `${basePath}.adapter_requirements`, template.slug, errors)
  if (template.feature_flags?.some(flag => !/^FEATURE_[A-Z0-9_]+$/.test(flag))) {
    errors.push(workflowContractError('INVALID_FEATURE_FLAG_DEPENDENCY', 'Feature flags must use FEATURE_* names', { canonical_model_path: `${basePath}.feature_flags`, template_slug: template.slug }))
  }
  if (template.governance != null && (!isPlainObject(template.governance))) errors.push(workflowContractError('INVALID_GOVERNANCE_DECLARATION', 'Governance declaration must be an object', { canonical_model_path: `${basePath}.governance`, template_slug: template.slug }))
  if (template.concurrency?.max_parallel != null && template.concurrency.max_parallel < 1) errors.push(workflowContractError('INVALID_CONCURRENCY_DECLARATION', 'max_parallel must be at least 1', { canonical_model_path: `${basePath}.concurrency.max_parallel`, template_slug: template.slug }))
  if (template.retry?.max_attempts != null && template.retry.max_attempts < 0) errors.push(workflowContractError('INVALID_RETRY_DECLARATION', 'max_attempts must be non-negative', { canonical_model_path: `${basePath}.retry.max_attempts`, template_slug: template.slug }))
  if (template.sandbox?.mode != null && !['read-only', 'workspace-write'].includes(template.sandbox.mode)) errors.push(workflowContractError('INVALID_SANDBOX_DECLARATION', 'Sandbox mode is unsupported', { canonical_model_path: `${basePath}.sandbox.mode`, template_slug: template.slug }))
  validateOutputSchema(template, basePath, errors)
  const hashes = computeTemplateHashes(template)
  if (template.routing_rule_hash && template.routing_rule_hash !== hashes.routing_rule_hash) errors.push(workflowContractError('ROUTING_RULE_HASH_MISMATCH', 'Routing-rule hash does not match canonical routing rules', { canonical_model_path: `${basePath}.routing_rule_hash`, template_slug: template.slug }))
  if (template.output_schema_hash && template.output_schema_hash !== hashes.output_schema_hash) errors.push(workflowContractError('OUTPUT_SCHEMA_HASH_MISMATCH', 'Output-schema hash does not match canonical output schema', { canonical_model_path: `${basePath}.output_schema_hash`, template_slug: template.slug }))
}

function validateVariables(template: WorkflowContractTemplate, allowedNamespaces: Set<string>, basePath: string, errors: WorkflowContractError[]): void {
  const matches = template.task_prompt.matchAll(/\{\{\s*([A-Za-z0-9_]+)\.[^}]+}}/g)
  for (const match of matches) {
    const namespace = match[1]
    if (namespace && !allowedNamespaces.has(namespace)) {
      errors.push(workflowContractError('UNKNOWN_TEMPLATE_VARIABLE', `Template variable namespace ${namespace} is not allowed`, {
        canonical_model_path: `${basePath}.task_prompt`,
        template_slug: template.slug,
        details: `Disallowed namespace ${namespace}`,
        remediation_hint: 'Use an allowed template variable namespace or update allowed_variable_namespaces.',
      }))
    }
  }
}

function validateTracker(template: WorkflowContractTemplate, basePath: string, errors: WorkflowContractError[]): void {
  const tracker = template.tracker as { type?: unknown; identity_version?: unknown; repo?: unknown } | undefined
  if (!tracker) return
  if (tracker.type !== 'github' || tracker.identity_version !== 'v1' || !tracker.repo) {
    errors.push(workflowContractError('INVALID_TRACKER_IDENTITY', 'GitHub tracker identity v1 is invalid', { canonical_model_path: `${basePath}.tracker`, template_slug: template.slug }))
  }
}

function validateStringArray(value: string[] | undefined, code: string, path: string, slug: string, errors: WorkflowContractError[]): void {
  if (value == null) return
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    errors.push(workflowContractError(code, `${path} must contain non-empty strings`, { canonical_model_path: path, template_slug: slug }))
  }
}

function validateOutputSchema(template: WorkflowContractTemplate, basePath: string, errors: WorkflowContractError[]): void {
  if (!template.output_schema) return
  try {
    createWorkflowContractAjv().compile(template.output_schema)
  } catch (error) {
    errors.push(workflowContractError('INVALID_OUTPUT_SCHEMA', 'Output schema is invalid or unsupported', {
      canonical_model_path: `${basePath}.output_schema`,
      template_slug: template.slug,
      details: error instanceof Error ? error.message : String(error),
    }))
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
