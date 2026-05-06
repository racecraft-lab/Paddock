export const WORKFLOW_CONTRACT_HASH_VERSION = 'workflow-contract-hash-v1'
export const DEFAULT_WORKFLOW_CONTRACT_FAMILY = 'mission-control'
export const DEFAULT_WORKFLOW_CONTRACT_EXPORT_PATH = 'docs/ai/workflows/mission-control/exports/workflow-contract.md'

export type WorkflowContractMode = 'dry-run' | 'apply'
export type WorkflowContractRunMode = 'import_dry_run' | 'import_apply' | 'export' | 'recover_dry_run' | 'recover_apply'
export type WorkflowContractRunStatus = 'success' | 'validation_failed' | 'storage_failed' | 'not_found'
export type WorkflowContractMutationStatus = 'dry_run' | 'applied' | 'not_mutated' | 'rolled_back'

export interface WorkflowContract {
  family: string
  version: 'workflow-contract-v1'
  workspace_id: number
  allowed_variable_namespaces: string[]
  templates: WorkflowContractTemplate[]
  local_path?: string
  diagnostics_run_id?: number
}

export interface WorkflowContractTemplate {
  slug: string
  name: string
  description?: string | null
  model: string
  task_prompt: string
  timeout_seconds: number
  agent_role?: string | null
  tags?: string[]
  tracker?: WorkflowContractTracker
  capabilities?: string[]
  adapter_requirements?: string[]
  feature_flags?: string[]
  governance?: Record<string, unknown>
  concurrency?: { max_parallel?: number } & Record<string, unknown>
  retry?: { max_attempts?: number } & Record<string, unknown>
  sandbox?: { mode?: string } & Record<string, unknown>
  prompt_version?: string
  routing_rules?: unknown[]
  output_schema?: Record<string, unknown> | null
  routing_rule_hash?: string
  output_schema_hash?: string
  next_template_slug?: string | null
  produces_pr?: boolean
  external_terminal_event?: string | null
  allow_redacted_artifacts?: boolean
}

export interface WorkflowContractTracker {
  type: 'github'
  identity_version: 'v1'
  repo: string
  labels?: string[]
}

export interface RuntimeWorkflowTemplate {
  id?: number
  workspace_id: number
  slug: string | null
  name: string
  description?: string | null
  model?: string
  task_prompt: string
  timeout_seconds?: number
  agent_role?: string | null
  tags?: string | string[] | null
  output_schema?: string | Record<string, unknown> | null
  routing_rules?: string | unknown[] | null
  next_template_slug?: string | null
  produces_pr?: number | boolean
  external_terminal_event?: string | null
  allow_redacted_artifacts?: number | boolean
  created_by?: string | null
  enabled?: number | boolean
}

export interface WorkflowContractError {
  code: string
  manifest_path?: string | undefined
  canonical_model_path?: string | undefined
  template_slug?: string | undefined
  message: string
  remediation_hint: string
  details?: string | undefined
}

export interface WorkflowContractDiff {
  create: WorkflowContractTemplate[]
  update: WorkflowContractTemplate[]
  disable: RuntimeWorkflowTemplate[]
  unchanged: WorkflowContractTemplate[]
  unrelated: RuntimeWorkflowTemplate[]
  conflicts: RuntimeWorkflowTemplate[]
}

export interface WorkflowContractImportOptions {
  mode: WorkflowContractMode
  sourcePath?: string
}

export interface WorkflowContractImportResult {
  ok: boolean
  mode: WorkflowContractRunMode
  status: WorkflowContractRunStatus
  mutation_status: WorkflowContractMutationStatus
  run_id: number
  contract_hash?: string
  diff?: WorkflowContractDiff
  errors?: WorkflowContractError[]
}
