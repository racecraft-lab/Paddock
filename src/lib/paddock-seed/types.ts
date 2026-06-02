import type Database from 'better-sqlite3'

export const PADDOCK_WORKSPACE_SLUG = 'paddock'
export const PADDOCK_WORKSPACE_NAME = 'Paddock'
export const FACILITY_WORKSPACE_SLUG = 'facility'
export const PADDOCK_REPO = 'racecraft-lab/Paddock'
export const CLEANUP_CHECKLIST_PATH = 'docs/runbooks/paddock-seed-predeploy.md'

export const REQUIRED_WORKFLOW_SLUGS = [
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

const AREA_LABEL_ROUTING_FLAG = ['FEATURE_AREA', 'LABEL_ROUTING'].join('_')

export const ENABLED_PADDOCK_FLAGS = [
  'FEATURE_WORKSPACE_SWITCHER',
  'FEATURE_GLOBAL_AEGIS',
  'FEATURE_TASK_PIPELINES',
  'FEATURE_TWO_STEP_TERMINAL',
  AREA_LABEL_ROUTING_FLAG,
  'FEATURE_DISPOSITION_LOGGING',
  'FEATURE_TASK_ARTIFACTS',
  'FEATURE_RESOURCE_GOVERNANCE',
  'FEATURE_OPENCLAW_HEALTH_COSTS',
  'PILOT_PADDOCK_E2E',
] as const

export const DISABLED_OR_ABSENT_FLAGS = [
  'PILOT_PRODUCT_LINE_A_E2E',
  'FEATURE_TASK_CONTROL_PLANE',
  'FEATURE_AGENT_RUNNER_SANDBOXES',
  'FEATURE_AGENT_RUNNER',
  'FEATURE_HARNESS_ADAPTERS',
  'FEATURE_AUTO_MERGE',
] as const

export const DEPARTMENTS = [
  { slug: 'qa', name: 'QA', ticketPrefix: 'QA', areaSlug: 'qa', triage: true, repoSyncOwner: true, githubRepo: PADDOCK_REPO },
  { slug: 'development', name: 'Development', ticketPrefix: 'DEV', areaSlug: 'dev', triage: false, repoSyncOwner: false, githubRepo: null },
  { slug: 'devsecops', name: 'DevSecOps', ticketPrefix: 'SEC', areaSlug: 'devsecops', triage: false, repoSyncOwner: false, githubRepo: null },
  { slug: 'marketing', name: 'Marketing', ticketPrefix: 'MKT', areaSlug: 'marketing', triage: false, repoSyncOwner: false, githubRepo: null },
  { slug: 'customer-service', name: 'Customer Service', ticketPrefix: 'CS', areaSlug: 'customer-service', triage: false, repoSyncOwner: false, githubRepo: null },
  { slug: 'finance', name: 'Finance', ticketPrefix: 'FIN', areaSlug: 'finance', triage: false, repoSyncOwner: false, githubRepo: null },
] as const

export const ROLE_ASSIGNMENTS = [
  { role: 'researcher', agentName: 'paddock-platform-research', departmentSlug: 'qa' },
  { role: 'planner', agentName: 'paddock-platform-planner', departmentSlug: 'qa' },
  { role: 'dev', agentName: 'paddock-platform-dev', departmentSlug: 'development' },
  { role: 'ui', agentName: 'paddock-platform-ui', departmentSlug: 'development' },
  { role: 'devsecops', agentName: 'paddock-platform-devsecops', departmentSlug: 'devsecops' },
  { role: 'qa', agentName: 'paddock-platform-qa', departmentSlug: 'qa' },
] as const

export const GOVERNANCE_POLICIES = [
  {
    notes: 'SPEC-009B:paddock:daily-token-budget',
    policy_type: 'budget',
    limit_kind: 'token',
    limit_value: 1_000_000,
    period: 'day',
    timezone: 'America/Chicago',
    enforcement: 'alert',
    enabled: 1,
    default_template: 0,
  },
  {
    notes: 'SPEC-009B:paddock:daily-usd-budget',
    policy_type: 'budget',
    limit_kind: 'usd',
    limit_value: 10,
    period: 'day',
    timezone: 'America/Chicago',
    enforcement: 'alert',
    enabled: 1,
    default_template: 0,
  },
  {
    notes: 'SPEC-009B:paddock:wip-visibility-template',
    policy_type: 'wip_limit',
    limit_kind: 'concurrent_tasks',
    limit_value: 2,
    period: null,
    timezone: 'America/Chicago',
    enforcement: 'alert',
    enabled: 0,
    default_template: 1,
  },
] as const

export type SeedMode = 'preflight' | 'apply' | 'verify'
export type MutationStatus = 'not_mutated' | 'applied' | 'verified'
export type ResidueKind =
  | 'project_github_sync'
  | 'task_github_sync'
  | 'operator_cron'
  | 'openclaw_github_automation'
  | 'focusengine_operator_residue'

export interface PaddockSeedOptions {
  contractPath: string
  operatorEvidencePath?: string
}

export interface ResidueSummary {
  kind: ResidueKind
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

export interface BlockedPreflightResult {
  ok: false
  mode: 'preflight' | 'apply'
  status: 'blocked_preflight'
  code: 'NON_PADDOCK_RESIDUE'
  mutation_status: 'not_mutated'
  residue: ResidueSummary[]
  cleanup_checklist: string
  redaction: RedactionProof
}

export interface ContractNotReadyResult {
  ok: false
  mode: SeedMode
  status: 'contract_not_ready'
  code: 'WORKFLOW_CONTRACT_REQUIRED_SLUGS_MISSING'
  mutation_status: 'not_mutated'
  missing_slugs: string[]
  source_path: string
}

export interface PreflightSuccessResult {
  ok: true
  mode: 'preflight'
  status: 'ready'
  mutation_status: 'not_mutated'
  residue: []
  required_slugs_present: true
}

export type PreflightResult = PreflightSuccessResult | BlockedPreflightResult | ContractNotReadyResult

export interface SeedEvidenceCounts {
  paddock_product_lines: number
  facility_workspaces: number
  department_projects: number
  required_role_assignments: number
  workflow_templates: number
  governance_policies: number
  preserved_issue_intake: number
  new_pilot_tasks: number
  new_successor_records: number
  new_per_agent_seed_tasks: number
}

export interface PaddockSeedEvidence {
  counts: SeedEvidenceCounts
  workflow_contract: {
    source_path: string
    run_id: number | null
    contract_hash: string | null
    required_slugs_present: boolean
  }
  flags: {
    enabled: string[]
    disabled_or_absent: string[]
  }
  governance: {
    identities: string[]
    normal_intake_decision: 'allow'
  }
  non_dispatch: {
    new_pilot_tasks: number
    new_successor_records: number
    new_per_agent_seed_tasks: number
    claims: number
    dispatched_tasks: number
    runner_rows: number
    sandbox_rows: number
    auto_merge_markers: number
  }
  identity_hash: string
}

export interface ApplySeedResult extends PaddockSeedEvidence {
  ok: true
  mode: 'apply'
  status: 'seeded'
  mutation_status: 'applied'
  workspace: {
    slug: typeof PADDOCK_WORKSPACE_SLUG
    id: number
  }
}

export interface VerifySeedResult extends PaddockSeedEvidence {
  ok: true
  mode: 'verify'
  status: 'verified'
  mutation_status: 'verified'
  exit_code: 0
}

export interface VerifyFailureResult {
  ok: false
  mode: 'verify'
  status: 'verification_failed'
  mutation_status: 'not_mutated'
  exit_code: 4
  errors: string[]
}

export type SeedResult = ApplySeedResult | BlockedPreflightResult | ContractNotReadyResult
export type Db = Database.Database
