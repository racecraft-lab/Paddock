import type Database from 'better-sqlite3'

export const PRODUCT_LINE_SEED_SCHEMA_VERSION = 'product-line-seed-v1'
export const PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION = 'product-line-seed-result-v1'
export const PRODUCT_LINE_SEED_SNAPSHOT_SCHEMA_VERSION = 'product-line-seed-snapshot-v1'
export const PRODUCT_LINE_SEED_HASH_PREFIX = `${PRODUCT_LINE_SEED_SNAPSHOT_SCHEMA_VERSION}:sha256:`

export const PRODUCT_LINE_SEED_MODES = ['preflight', 'apply', 'verify'] as const
export const MUTATION_STATUSES = ['not_mutated', 'applied', 'verified'] as const

export const CONFIG_OWNED_SURFACES = [
  'workspace_identity',
  'department_projects',
  'agent_assignments',
  'workflow_contract_templates',
  'feature_flags',
  'governance_defaults',
] as const

export const FR020_PRESERVED_SURFACES = [
  'tasks',
  'task_evidence_read_model_state',
  'issues',
  'activities',
  'histories',
  'comments',
  'notifications',
  'dispositions',
  'artifacts',
  'quality_reviews',
  'github_sync_state',
  'governance_audit_rows',
  'manual_workflow_templates',
  'row_ids',
  'creation_timestamps',
  'task_status',
  'task_github_linkage',
  'task_lineage',
  'project_ticket_counters',
  'assignment_timestamps',
  'workflow_use_counters',
  'non_owned_feature_flags',
] as const

export const BLOCKED_SIDE_EFFECTS = [
  'product_line_b',
  'github_mutation',
  'task_creation',
  'dispatch',
  'claim',
  'runner',
  'sandbox',
  'harness_adapter',
  'auto_merge',
  'speckit_setup_or_autopilot',
] as const

export const MISSION_CONTROL_REQUIRED_WORKFLOW_SLUGS = [
  'mission-control_issue_triage',
  'mission-control_specialist_route',
  'mission-control_close_issue',
  'mission-control_needs_spec_route',
  'mission-control_remediation_plan',
  'mission-control_dev_implementation',
  'mission-control_review',
  'mission-control_owner_review',
  'mission-control_aegis',
] as const

export const MISSION_CONTROL_ENABLED_FLAGS = [
  'FEATURE_WORKSPACE_SWITCHER',
  'FEATURE_GLOBAL_AEGIS',
  'FEATURE_TASK_PIPELINES',
  'FEATURE_TWO_STEP_TERMINAL',
  'FEATURE_AREA_LABEL_ROUTING',
  'FEATURE_DISPOSITION_LOGGING',
  'FEATURE_TASK_ARTIFACTS',
  'FEATURE_RESOURCE_GOVERNANCE',
  'FEATURE_OPENCLAW_HEALTH_COSTS',
  'PILOT_MISSION_CONTROL_E2E',
] as const

export const MISSION_CONTROL_DISABLED_OR_ABSENT_FLAGS = [
  'PILOT_PRODUCT_LINE_A_E2E',
  'FEATURE_TASK_CONTROL_PLANE',
  'FEATURE_AGENT_RUNNER_SANDBOXES',
] as const

export const MISSION_CONTROL_DEPARTMENTS = [
  { slug: 'qa', name: 'QA', ticketPrefix: 'QA', areaSlug: 'qa', triage: true, repoSyncOwner: true, githubRepo: 'racecraft-lab/mission-control' },
  { slug: 'development', name: 'Development', ticketPrefix: 'DEV', areaSlug: 'dev', triage: false, repoSyncOwner: false, githubRepo: null },
  { slug: 'devsecops', name: 'DevSecOps', ticketPrefix: 'SEC', areaSlug: 'devsecops', triage: false, repoSyncOwner: false, githubRepo: null },
  { slug: 'marketing', name: 'Marketing', ticketPrefix: 'MKT', areaSlug: 'marketing', triage: false, repoSyncOwner: false, githubRepo: null },
  { slug: 'customer-service', name: 'Customer Service', ticketPrefix: 'CS', areaSlug: 'customer-service', triage: false, repoSyncOwner: false, githubRepo: null },
  { slug: 'finance', name: 'Finance', ticketPrefix: 'FIN', areaSlug: 'finance', triage: false, repoSyncOwner: false, githubRepo: null },
] as const

export const MISSION_CONTROL_ROLE_ASSIGNMENTS = [
  { role: 'researcher', agentKey: 'research', agentName: 'mission-control-platform-research', departmentSlug: 'qa' },
  { role: 'planner', agentKey: 'planner', agentName: 'mission-control-platform-planner', departmentSlug: 'qa' },
  { role: 'dev', agentKey: 'dev', agentName: 'mission-control-platform-dev', departmentSlug: 'development' },
  { role: 'ui', agentKey: 'ui', agentName: 'mission-control-platform-ui', departmentSlug: 'development' },
  { role: 'devsecops', agentKey: 'devsecops', agentName: 'mission-control-platform-devsecops', departmentSlug: 'devsecops' },
  { role: 'qa', agentKey: 'qa', agentName: 'mission-control-platform-qa', departmentSlug: 'qa' },
] as const

export const MISSION_CONTROL_GOVERNANCE_DEFAULTS = [
  {
    identity: 'daily-token-budget',
    notes: 'SPEC-009B:mission-control:daily-token-budget',
    policy_type: 'budget',
    limit_kind: 'token',
    limit_value: 1_000_000,
    period: 'day',
    timezone: 'America/Chicago',
    enforcement: 'alert',
    enabled: true,
    default_template: false,
  },
  {
    identity: 'daily-usd-budget',
    notes: 'SPEC-009B:mission-control:daily-usd-budget',
    policy_type: 'budget',
    limit_kind: 'usd',
    limit_value: 10,
    period: 'day',
    timezone: 'America/Chicago',
    enforcement: 'alert',
    enabled: true,
    default_template: false,
  },
  {
    identity: 'wip-visibility-template',
    notes: 'SPEC-009B:mission-control:wip-visibility-template',
    policy_type: 'wip_limit',
    limit_kind: 'concurrent_tasks',
    limit_value: 2,
    period: null,
    timezone: 'America/Chicago',
    enforcement: 'alert',
    enabled: false,
    default_template: true,
  },
] as const

export const MISSION_CONTROL_SEED_DEFAULTS = {
  productLineSlug: 'mission-control',
  displayName: 'Mission Control',
  agentPrefix: 'mission-control-platform',
  githubOwner: 'racecraft-lab',
  githubRepo: 'mission-control',
  githubFullName: 'racecraft-lab/mission-control',
  workflowFamily: 'mission-control',
  configPath: 'docs/ai/product-lines/mission-control.yaml',
  workflowContractPath: 'docs/ai/workflows/mission-control/workflow-contract.yaml',
  requiredWorkflowSlugs: MISSION_CONTROL_REQUIRED_WORKFLOW_SLUGS,
  enabledFlags: MISSION_CONTROL_ENABLED_FLAGS,
  disabledOrAbsentFlags: MISSION_CONTROL_DISABLED_OR_ABSENT_FLAGS,
  departments: MISSION_CONTROL_DEPARTMENTS,
  roleAssignments: MISSION_CONTROL_ROLE_ASSIGNMENTS,
  governanceDefaults: MISSION_CONTROL_GOVERNANCE_DEFAULTS,
  configOwnedSurfaces: CONFIG_OWNED_SURFACES,
  preservedSurfaces: FR020_PRESERVED_SURFACES,
  blockedSideEffects: BLOCKED_SIDE_EFFECTS,
} as const

export type ProductLineSeedMode = typeof PRODUCT_LINE_SEED_MODES[number]
export type MutationStatus = typeof MUTATION_STATUSES[number]
export type ConfigOwnedSurface = typeof CONFIG_OWNED_SURFACES[number]
export type Fr020PreservedSurface = typeof FR020_PRESERVED_SURFACES[number]
export type BlockedSideEffect = typeof BLOCKED_SIDE_EFFECTS[number]

export type ProductLineSeedStatus =
  | 'ready'
  | 'seeded'
  | 'verified'
  | 'verification_failed'
  | 'existing_target_refused'
  | 'blocked_preflight'
  | 'validation_failed'
  | 'contract_not_ready'
  | 'cli_error'
  | 'unexpected_error'

export type ProductLineSeedErrorCode =
  | 'READY'
  | 'SEEDED'
  | 'VERIFIED'
  | 'VERIFY_DRIFT_DETECTED'
  | 'EXISTING_TARGET_REQUIRES_ALLOW_EXISTING'
  | 'NON_TARGET_RESIDUE_DETECTED'
  | 'CONFIG_PARSE_FAILED'
  | 'CONFIG_UNSAFE_YAML_SYNTAX'
  | 'CONFIG_SCHEMA_INVALID'
  | 'UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY'
  | 'WORKFLOW_CONTRACT_REQUIRED_SLUGS_MISSING'
  | 'CLI_USAGE_ERROR'
  | 'UNEXPECTED_ERROR'
  | 'IMPLEMENTATION_PENDING'

export interface ProductLineSeedConfig {
  schema_version: typeof PRODUCT_LINE_SEED_SCHEMA_VERSION
  product_line: ProductLineIdentity
  github: GitHubOwnership
  workflow_contract: WorkflowContractDeclaration
  departments: DepartmentDeclaration[]
  agent_assignments: AgentAssignmentPolicy
  feature_flags: FeatureFlagPolicy
  governance_defaults: GovernanceDefault[]
  safety_policy: SafetyPolicy
}

export interface ProductLineIdentity {
  slug: string
  display_name: string
  agent_prefix: string
}

export interface GitHubOwnership {
  owner: string
  repo: string
  full_name: string
}

export interface WorkflowContractDeclaration {
  family: string
  path: string
  required_slugs: string[]
}

export interface DepartmentDeclaration {
  slug: string
  name: string
  ticket_prefix: string
  area_slug: string
  github_repo: string | null
  github_sync_enabled: boolean
  is_triage_project: boolean
  is_repo_sync_owner: boolean
}

export interface AgentAssignmentPolicy {
  product_line_assignments: ProductLineAgentAssignment[]
  shared_support?: SharedSupportAssignment[]
}

export interface ProductLineAgentAssignment {
  agent_key: string
  role: string
  department_slug: string
}

export interface SharedSupportAssignment {
  scope: 'facility_global'
  shared_support_role: string
  agent_name: string
}

export interface FeatureFlagPolicy {
  enabled: string[]
  disabled_or_absent: string[]
  owned_keys?: string[]
}

export interface GovernanceDefault {
  identity: string
  notes?: string
  policy_type: 'wip_limit' | 'budget' | 'blackout' | 'degraded_window'
  limit_kind: string
  limit_value: number | null
  period: string | null
  timezone: string
  enforcement: 'alert' | 'defer' | 'pause_new_work' | 'block_dispatch' | 'require_override'
  enabled: boolean
  default_template: boolean
  first_intake_blocking_reason?: string
}

export interface SafetyPolicy {
  existing_target: 'refuse_unless_allow_existing'
  allow_first_intake_blocking_governance: boolean
  config_owned_surfaces: ConfigOwnedSurface[]
  preserved_surfaces: Fr020PreservedSurface[]
  blocked_side_effects: BlockedSideEffect[]
}

export interface ProductLineSeedTarget {
  db_path: string | null
  product_line_slug: string
  existing_target: boolean
}

export interface ProductLineSeedValidationError {
  code: ProductLineSeedErrorCode
  path: string
  message: string
  remediation?: string
}

export interface ProductLineResidue {
  kind: string
  repo?: string
  count: number
  project_ids?: number[]
  task_ids?: number[]
  identifiers?: unknown
}

export interface RedactionProof {
  raw_secret_values_emitted: false
  redacted_fields: string[]
}

export interface ProductLineSnapshotSurface {
  count: number
  hash: string
  unavailable?: boolean
}

export interface ProductLineSeedSnapshot {
  schema_version: typeof PRODUCT_LINE_SEED_SNAPSHOT_SCHEMA_VERSION
  hash: string
  surfaces: Record<string, ProductLineSnapshotSurface>
  preserved_operational_state: {
    hash: string
    subsurfaces: Record<string, ProductLineSnapshotSurface>
  }
}

export interface ProductLineSeedResultEnvelope {
  schema_version: typeof PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION
  ok: boolean
  entrypoint: 'seed:product-line' | 'seed:mission-control'
  mode: ProductLineSeedMode | 'unknown'
  status: ProductLineSeedStatus
  code: ProductLineSeedErrorCode
  mutation_status: MutationStatus
  config: {
    path: string | null
    schema_version: string | null
    product_line_slug: string | null
  }
  target: ProductLineSeedTarget | null
  evidence: Record<string, unknown>
  errors: ProductLineSeedValidationError[]
  snapshot_before: ProductLineSeedSnapshot | null
  snapshot_after: ProductLineSeedSnapshot | null
  redaction: RedactionProof
  action_required: string | null
  exit_code: 0 | 2 | 3 | 4 | 5
}

export interface ProductLineSeedRunOptions {
  entrypoint: 'seed:product-line' | 'seed:mission-control'
  configPath: string
  dbPath?: string
  mode: ProductLineSeedMode
  json: boolean
  allowExisting: boolean
  operatorEvidencePath?: string
}

export type ProductLineSeedDatabase = Database.Database
