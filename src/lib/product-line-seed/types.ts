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

export const PRODUCT_LINE_B_BLOCKED_SIDE_EFFECTS = [
  'product_line_a_takeover',
  'github_mutation',
  'task_creation',
  'dispatch',
  'claim',
  'runner',
  'sandbox',
  'harness_adapter',
  'auto_merge',
  'speckit_setup_or_autopilot',
  'focusengine_takeover',
  'openclaw_takeover',
] as const

export const PRODUCT_LINE_B_FOCUSED_ERROR_CODES = [
  'PRODUCT_LINE_B_DISABLED_STATE_MISSING',
  'PRODUCT_LINE_B_REPO_SYNC_OWNER_PRESENT',
  'PRODUCT_LINE_B_SMOKE_FLAG_STILL_ENABLED',
  'PRODUCT_LINE_B_SMOKE_ELIGIBILITY_REMAINING',
] as const

export const PRODUCT_LINE_EXISTING_TARGET_OUTCOMES = [
  'already_valid',
  'requires_allow_existing',
  'residue_blocked',
  'ownership_conflict',
] as const

export const PRODUCT_LINE_SEED_TARGET_CLASSES = [
  'absent_ready',
  ...PRODUCT_LINE_EXISTING_TARGET_OUTCOMES,
] as const

export const PRODUCT_LINE_RETAINED_INVENTORY_IDENTITIES = [
  'FocusEngine',
  'OpenClaw',
] as const

export const PRODUCT_LINE_RETAINED_INVENTORY_SOURCES = [
  'agent_rows',
  'openclaw_config',
  'runtime_inventory',
  'operator_evidence',
] as const

export const PRODUCT_LINE_RETAINED_INVENTORY_CLASSIFICATIONS = [
  'retained_inventory',
] as const

export const PRODUCT_LINE_RESIDUE_KINDS = [
  'product_line_identity_conflict',
  'plb_platform_assignment_conflict',
  'repo_sync_owner_conflict',
  'retained_inventory',
  'workflow_template_ownership_conflict',
  'project_github_sync',
  'task_github_sync',
  'reserved_future_flag_enabled',
  'feature_flags_invalid_json',
] as const

export const PADDOCK_REQUIRED_WORKFLOW_SLUGS = [
  'paddock_issue_triage',
  'paddock_specialist_route',
  'paddock_close_issue',
  'paddock_needs_spec_route',
  'paddock_remediation_plan',
  'paddock_dev_implementation',
  'paddock_review',
  'paddock_owner_review',
  'paddock_aegis',
] as const

export const PADDOCK_ENABLED_FLAGS = [
  'FEATURE_WORKSPACE_SWITCHER',
  'FEATURE_GLOBAL_AEGIS',
  'FEATURE_TASK_PIPELINES',
  'FEATURE_TWO_STEP_TERMINAL',
  'FEATURE_AREA_LABEL_ROUTING',
  'FEATURE_DISPOSITION_LOGGING',
  'FEATURE_TASK_ARTIFACTS',
  'FEATURE_RESOURCE_GOVERNANCE',
  'FEATURE_OPENCLAW_HEALTH_COSTS',
  'PILOT_PADDOCK_E2E',
] as const

export const PADDOCK_DISABLED_OR_ABSENT_FLAGS = [
  'PILOT_PRODUCT_LINE_A_E2E',
  'FEATURE_TASK_CONTROL_PLANE',
  'FEATURE_AGENT_RUNNER_SANDBOXES',
] as const

export const PRODUCT_LINE_B_SMOKE_OWNED_FLAGS = [
  'FEATURE_WORKSPACE_SWITCHER',
  'FEATURE_GLOBAL_AEGIS',
  'FEATURE_TASK_PIPELINES',
  'FEATURE_TWO_STEP_TERMINAL',
  'FEATURE_AREA_LABEL_ROUTING',
  'FEATURE_DISPOSITION_LOGGING',
  'FEATURE_TASK_ARTIFACTS',
  'FEATURE_RESOURCE_GOVERNANCE',
  'FEATURE_OPENCLAW_HEALTH_COSTS',
  'PILOT_PADDOCK_E2E',
] as const

export const PRODUCT_LINE_B_PAUSED_OR_FORBIDDEN_FLAGS = [
  'FEATURE_GITHUB_SYNC_AUTOMATION',
  'FEATURE_TASK_CONTROL_PLANE',
  'FEATURE_AGENT_RUNNER_SANDBOXES',
  'PILOT_PRODUCT_LINE_A_E2E',
  'FEATURE_PRODUCT_LINE_B_DISPATCH',
  'PILOT_PRODUCT_LINE_B_SMOKE',
] as const

export const PADDOCK_DEPARTMENTS = [
  { slug: 'qa', name: 'QA', ticket_prefix: 'QA', area_slug: 'qa', github_repo: 'racecraft-lab/Paddock', github_sync_enabled: true, is_triage_project: true, is_repo_sync_owner: true },
  { slug: 'development', name: 'Development', ticket_prefix: 'DEV', area_slug: 'dev', github_repo: null, github_sync_enabled: false, is_triage_project: false, is_repo_sync_owner: false },
  { slug: 'devsecops', name: 'DevSecOps', ticket_prefix: 'SEC', area_slug: 'devsecops', github_repo: null, github_sync_enabled: false, is_triage_project: false, is_repo_sync_owner: false },
  { slug: 'marketing', name: 'Marketing', ticket_prefix: 'MKT', area_slug: 'marketing', github_repo: null, github_sync_enabled: false, is_triage_project: false, is_repo_sync_owner: false },
  { slug: 'customer-service', name: 'Customer Service', ticket_prefix: 'CS', area_slug: 'customer-service', github_repo: null, github_sync_enabled: false, is_triage_project: false, is_repo_sync_owner: false },
  { slug: 'finance', name: 'Finance', ticket_prefix: 'FIN', area_slug: 'finance', github_repo: null, github_sync_enabled: false, is_triage_project: false, is_repo_sync_owner: false },
] as const

export const PADDOCK_ROLE_ASSIGNMENTS = [
  { agent_key: 'research', role: 'researcher', department_slug: 'qa' },
  { agent_key: 'planner', role: 'planner', department_slug: 'qa' },
  { agent_key: 'dev', role: 'dev', department_slug: 'development' },
  { agent_key: 'ui', role: 'ui', department_slug: 'development' },
  { agent_key: 'devsecops', role: 'devsecops', department_slug: 'devsecops' },
  { agent_key: 'qa', role: 'qa', department_slug: 'qa' },
] as const

export const PADDOCK_GOVERNANCE_DEFAULTS = [
  {
    identity: 'daily-token-budget',
    notes: 'SPEC-009B:paddock:daily-token-budget',
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
    notes: 'SPEC-009B:paddock:daily-usd-budget',
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
    notes: 'SPEC-009B:paddock:wip-visibility-template',
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

export const PADDOCK_SEED_DEFAULTS = {
  productLineSlug: 'paddock',
  displayName: 'Paddock',
  agentPrefix: 'paddock-platform',
  githubOwner: 'racecraft-lab',
  githubRepo: 'paddock',
  githubFullName: 'racecraft-lab/Paddock',
  workflowFamily: 'paddock',
  configPath: 'docs/ai/product-lines/paddock.yaml',
  workflowContractPath: 'docs/ai/workflows/paddock/workflow-contract.yaml',
  requiredWorkflowSlugs: PADDOCK_REQUIRED_WORKFLOW_SLUGS,
  enabledFlags: PADDOCK_ENABLED_FLAGS,
  disabledOrAbsentFlags: PADDOCK_DISABLED_OR_ABSENT_FLAGS,
  departments: PADDOCK_DEPARTMENTS,
  roleAssignments: PADDOCK_ROLE_ASSIGNMENTS,
  governanceDefaults: PADDOCK_GOVERNANCE_DEFAULTS,
  configOwnedSurfaces: CONFIG_OWNED_SURFACES,
  preservedSurfaces: FR020_PRESERVED_SURFACES,
  blockedSideEffects: BLOCKED_SIDE_EFFECTS,
} as const

export type ProductLineSeedMode = typeof PRODUCT_LINE_SEED_MODES[number]
export type MutationStatus = typeof MUTATION_STATUSES[number]
export type ConfigOwnedSurface = typeof CONFIG_OWNED_SURFACES[number]
export type Fr020PreservedSurface = typeof FR020_PRESERVED_SURFACES[number]
export type BlockedSideEffect =
  | typeof BLOCKED_SIDE_EFFECTS[number]
  | typeof PRODUCT_LINE_B_BLOCKED_SIDE_EFFECTS[number]
export type ProductLineBFocusedErrorCode = typeof PRODUCT_LINE_B_FOCUSED_ERROR_CODES[number]
export type ProductLineExistingTargetOutcome = typeof PRODUCT_LINE_EXISTING_TARGET_OUTCOMES[number]
export type ProductLineSeedTargetClass = typeof PRODUCT_LINE_SEED_TARGET_CLASSES[number]
export type ProductLineRetainedInventoryIdentity = typeof PRODUCT_LINE_RETAINED_INVENTORY_IDENTITIES[number]
export type ProductLineRetainedInventorySource = typeof PRODUCT_LINE_RETAINED_INVENTORY_SOURCES[number]
export type ProductLineRetainedInventoryClassification = typeof PRODUCT_LINE_RETAINED_INVENTORY_CLASSIFICATIONS[number]
export type ProductLineResidueKind = typeof PRODUCT_LINE_RESIDUE_KINDS[number]
export type ProductLineSeedRedactionSafeScalar = string | number | boolean | null
export type ProductLineSeedRedactionSafeValue =
  | ProductLineSeedRedactionSafeScalar
  | ProductLineSeedRedactionSafeValue[]
  | { [key: string]: ProductLineSeedRedactionSafeValue }
export type ProductLineSeedRedactionSafeIdentifiers = Record<string, ProductLineSeedRedactionSafeValue>

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
  | 'TARGET_REPO_CONFLICT'
  | 'TARGET_PRODUCT_LINE_CONFLICT'
  | 'TARGET_RESIDUE_BLOCKED'
  | 'CONFIG_PARSE_FAILED'
  | 'CONFIG_UNSAFE_YAML_SYNTAX'
  | 'CONFIG_SCHEMA_INVALID'
  | 'CONFIG_SCHEMA_VERSION_UNSUPPORTED'
  | 'CONFIG_REQUIRED_SECTION_MISSING'
  | 'CONFIG_UNKNOWN_FIELD'
  | 'CONFIG_FIELD_TYPE_INVALID'
  | 'CONFIG_DUPLICATE_DECLARATION'
  | 'CONFIG_CONFLICTING_DECLARATION'
  | 'PRODUCT_LINE_IDENTITY_INVALID'
  | 'GITHUB_OWNER_REPO_INVALID'
  | 'UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY'
  | 'WORKFLOW_CONTRACT_PATH_INVALID'
  | 'WORKFLOW_CONTRACT_PARSE_FAILED'
  | 'WORKFLOW_CONTRACT_REQUIRED_SLUGS_MISSING'
  | 'WORKFLOW_CONTRACT_REQUIRED_SLUG_AMBIGUOUS'
  | 'WORKFLOW_CONTRACT_REPO_MISMATCH'
  | 'WORKFLOW_TEMPLATE_OWNERSHIP_CONFLICT'
  | 'FEATURE_FLAG_UNKNOWN_ENABLED'
  | 'FEATURE_FLAG_UNKNOWN_DISABLED_OR_ABSENT'
  | 'FEATURE_FLAG_DUPLICATE'
  | 'FEATURE_FLAG_CONFLICT'
  | 'FEATURE_FLAG_RESERVED_FUTURE_ENABLED'
  | 'FEATURE_FLAGS_INVALID_JSON'
  | 'FEATURE_FLAG_ENV_FORCE_OFF'
  | 'FEATURE_FLAG_CASCADE_PREREQUISITE_MISSING'
  | 'DEPARTMENT_INVALID'
  | 'DEPARTMENT_GITHUB_REPO_MISMATCH'
  | 'AGENT_PREFIX_INVALID'
  | 'AGENT_KEY_INVALID'
  | 'AGENT_ASSIGNMENT_DEPARTMENT_MISSING'
  | 'SHARED_SUPPORT_ASSIGNMENT_INVALID'
  | 'GOVERNANCE_POLICY_INVALID'
  | 'GOVERNANCE_FIRST_INTAKE_BLOCKING'
  | 'GOVERNANCE_POLICY_IDENTITY_DUPLICATE'
  | 'APPLY_TRANSACTION_FAILED'
  | 'NO_MUTATION_PROOF_FAILED'
  | ProductLineBFocusedErrorCode
  | 'CLI_USAGE_ERROR'
  | 'CLI_UNKNOWN_FLAG'
  | 'CLI_REQUIRED_FLAG_MISSING'
  | 'CLI_MODE_INVALID'
  | 'CLI_DATABASE_INVALID'
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
  disabled_by_default?: boolean
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
  smoke_owned?: string[]
  paused_or_forbidden?: string[]
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

export interface ProductLineSeedRedactionSafeError {
  code: ProductLineSeedErrorCode
  path: string
  message: string
  remediation?: string
  identifiers?: ProductLineSeedRedactionSafeIdentifiers
}

export type ProductLineSeedValidationError = ProductLineSeedRedactionSafeError

export interface ProductLineNoMutationProof {
  compared: boolean
  passed: boolean
  before_hash?: string
  after_hash?: string
}

export interface ProductLineExistingTargetEvidence {
  outcome: ProductLineExistingTargetOutcome
  target_class?: ProductLineSeedTargetClass
  action_required?: '--allow-existing'
  blocking?: boolean
}

export interface ProductLineRetainedInventoryReport {
  identity: ProductLineRetainedInventoryIdentity | (string & {})
  source: ProductLineRetainedInventorySource | (string & {})
  classification?: ProductLineRetainedInventoryClassification
  ownership?: ProductLineRetainedInventoryClassification
  status?: string
  count?: number
  identifiers?: ProductLineSeedRedactionSafeIdentifiers
  assigned_to_product_line_b?: false
  explicitly_assigned_to_product_line_b?: false
  blocking: boolean
}

export interface ProductLineResidue {
  kind: ProductLineResidueKind | (string & {})
  repo?: string
  count: number
  project_ids?: number[]
  task_ids?: number[]
  identifiers?: ProductLineSeedRedactionSafeIdentifiers
}

export interface ProductLineABaselineEvidence {
  workspace_slug: string
  repo_sync_owner_count: number
  hash?: string
  surfaces?: ProductLineSeedRedactionSafeIdentifiers
}

export interface ProductLineBSeedEvidence {
  target_class?: ProductLineSeedTargetClass
  existing_target?: ProductLineExistingTargetEvidence
  no_mutation_proof?: ProductLineNoMutationProof
  product_line_a_baseline?: ProductLineABaselineEvidence
  residue: ProductLineResidue[]
  retained_inventory?: ProductLineRetainedInventoryReport[]
  cleanup_policy?: 'detection_only_no_automatic_deletion_or_unlinking'
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
  entrypoint: 'seed:product-line' | 'seed:paddock'
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
  entrypoint: 'seed:product-line' | 'seed:paddock'
  configPath: string
  dbPath?: string
  db?: ProductLineSeedDatabase
  mode: ProductLineSeedMode
  json: boolean
  allowExisting: boolean
  operatorEvidencePath?: string
}

export type ProductLineSeedDatabase = Database.Database
