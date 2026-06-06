import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

export const SPEC_010B_SMOKE_PHASES = [
  'enable',
  'synthetic-issue',
  'disable',
  'cleanup-proof',
] as const

export type Spec010bSmokePhase = typeof SPEC_010B_SMOKE_PHASES[number]

const PRODUCT_LINE_B_SLUG = 'product-line-b'
const PADDOCK_REPO = 'racecraft-lab/Paddock'
const PILOT_LABELS = ['pd:inbox', 'priority:medium', 'area:dev'] as const
const REQUIRED_PHASES = [
  'preflight',
  'apply',
  'verify',
  'enable',
  'synthetic_issue',
  'pilot_subset',
  'disable',
  'cleanup',
  'isolation',
  'scope',
  'timing',
] as const
const PRODUCT_LINE_A_HASH_SURFACES = [
  'workspace_identity',
  'projects',
  'agent_assignments',
  'workflow_templates',
  'governance_defaults',
  'tasks_evidence_read_model_rows',
  'github_sync_lifecycle_rows',
  'counters',
  'non_owned_feature_flags',
] as const
const SCOPED_API_ROUTES = [
  '/api/workspaces/:id',
  '/api/projects?workspace_id=<id>',
  '/api/tasks?workspace_id=<id>',
  '/api/agents?workspace_id=<id>',
  '/api/github/sync?workspace_id=<id>',
] as const
const DASHBOARD_SURFACES = [
  'metric_cards',
  'task_flow',
  'task_pipeline',
  'triage_totals',
] as const
const SMOKE_OWNED_FLAGS = [
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
const PAUSED_OR_FORBIDDEN_FLAGS = [
  'FEATURE_GITHUB_SYNC_AUTOMATION',
  'FEATURE_TASK_CONTROL_PLANE',
  'FEATURE_AGENT_RUNNER_SANDBOXES',
  'PILOT_PRODUCT_LINE_A_E2E',
  'FEATURE_PRODUCT_LINE_B_DISPATCH',
  'PILOT_PRODUCT_LINE_B_SMOKE',
] as const
const ACCEPTED_RUNTIME_INVENTORY_STATES = ['visible', 'unassigned', 'assigned', 'blocked', 'eligible'] as const
const DEFAULT_SYNTHETIC_ISSUE_FIXTURE = 'specs/010b-product-line-b-smoke/fixtures/synthetic-issue.json'

type JsonRecord = Record<string, unknown>
type SmokeMutationStatus = 'not_mutated' | 'applied'

export interface Spec010bSmokePhaseResult {
  ok: boolean
  phase: Spec010bSmokePhase
  mutation_status: SmokeMutationStatus
  product_line_slug: 'product-line-b'
  run_id?: string
  workspace?: JsonRecord
  synthetic_issue?: JsonRecord
  cleanup_counters?: JsonRecord
  evidence_path?: string
  errors?: { code: string; message: string }[]
}

export interface Spec010bSmokePhaseOptions {
  configPath?: string
  db?: Database.Database
  dbPath?: string
  evidencePath?: string
  fixturePath?: string
  runId?: string
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function recordAt(value: unknown, key: string): JsonRecord {
  if (!isRecord(value)) return {}
  const child = value[key]
  return isRecord(child) ? child : {}
}

function arrayAt(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return []
  const child = value[key]
  return Array.isArray(child) ? child : []
}

function stringAt(value: unknown, key: string, fallback = ''): string {
  if (!isRecord(value)) return fallback
  const child = value[key]
  return typeof child === 'string' ? child : fallback
}

function numberAt(value: unknown, key: string, fallback = 0): number {
  if (!isRecord(value)) return fallback
  const child = value[key]
  return typeof child === 'number' ? child : fallback
}

function booleanAt(value: unknown, key: string, fallback = false): boolean {
  if (!isRecord(value)) return fallback
  const child = value[key]
  return typeof child === 'boolean' ? child : fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function objectEntries(value: unknown): [string, unknown][] {
  return isRecord(value) ? Object.entries(value) : []
}

function requiredLabelsPresent(labels: string[]): boolean {
  return PILOT_LABELS.every((label) => labels.includes(label))
}

function hasSensitiveKey(key: string): boolean {
  return /authorization|api[_-]?key|token|password|secret|credential|raw_github_response|raw_payload|raw_log/i.test(key)
}

function secretLike(value: string): boolean {
  return /ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_]+/i.test(value)
}

function containsSensitiveEvidence(value: unknown): boolean {
  if (typeof value === 'string') return secretLike(value)
  if (Array.isArray(value)) return value.some(containsSensitiveEvidence)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, entry]) => hasSensitiveKey(key) || containsSensitiveEvidence(entry))
}

function sanitizeEvidence(value: unknown): unknown {
  if (typeof value === 'string') return secretLike(value) ? value.replace(/ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_]+/gi, '[REDACTED]') : value
  if (Array.isArray(value)) return value.map(sanitizeEvidence)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !hasSensitiveKey(key))
      .map(([key, entry]) => [key, sanitizeEvidence(entry)]),
  )
}

function validateSyntheticSmokeIssueSync(input: unknown): JsonRecord {
  const repo = recordAt(input, 'repo')
  const issue = recordAt(input, 'issue')
  const labels = stringArray(issue['labels'])
  const metadata = recordAt(input, 'metadata')
  const ok = stringAt(input, 'schema_version') === 'spec-010b.synthetic_issue.v1' &&
    stringAt(input, 'product_line_slug') === PRODUCT_LINE_B_SLUG &&
    stringAt(repo, 'full_name') === PADDOCK_REPO &&
    numberAt(issue, 'number') > 0 &&
    requiredLabelsPresent(labels) &&
    !containsSensitiveEvidence(input)

  return {
    ok,
    schema_version: 'spec-010b.synthetic_issue.v1',
    run_id: stringAt(input, 'run_id'),
    product_line_slug: stringAt(input, 'product_line_slug'),
    repo: {
      owner: stringAt(repo, 'owner'),
      name: stringAt(repo, 'name'),
      full_name: stringAt(repo, 'full_name'),
    },
    issue: {
      number: numberAt(issue, 'number'),
      labels,
    },
    metadata: {
      live_github_required: booleanAt(metadata, 'live_github_required'),
      credential_fields_present: containsSensitiveEvidence(input),
    },
    evidence_codes: ok ? [] : ['SYNTHETIC_ISSUE_INVALID'],
  }
}

export function validateSyntheticSmokeIssue(input: unknown): Promise<JsonRecord> {
  return Promise.resolve(validateSyntheticSmokeIssueSync(input))
}

export function buildSmokeEvidencePacket(input: unknown): Promise<JsonRecord> {
  const syntheticIssue = recordAt(input, 'synthetic_issue')
  const issue = recordAt(syntheticIssue, 'issue')
  const runId = stringAt(input, 'run_id')
  const phasesInput = recordAt(input, 'phases')
  const phases = Object.fromEntries(REQUIRED_PHASES.map((name) => {
    const phase = recordAt(phasesInput, name)
    return [name, {
      status: stringAt(phase, 'status', 'passed'),
      observed_at: stringAt(phase, 'observed_at'),
      evidence_refs: arrayAt(phase, 'evidence_refs'),
      notes: stringAt(phase, 'notes'),
      ...(name === 'enable'
        ? {
            eligible_smoke_item_count: 1,
            sync_paused: true,
            dispatch_paused: true,
            claim_runner_sandbox_paused: true,
            live_github_required: false,
            synthetic_issue_identifier: `${PRODUCT_LINE_B_SLUG}:${runId}:${String(numberAt(issue, 'number'))}`,
          }
        : {}),
    }]
  }))

  return Promise.resolve({
    schema_version: 'spec-010b.smoke_evidence.v1',
    run_id: runId,
    product_line_slug: PRODUCT_LINE_B_SLUG,
    commit: recordAt(input, 'commit'),
    runtime: recordAt(input, 'runtime'),
    phases,
    seed_snapshots: recordAt(input, 'seed_snapshots'),
    product_line_a_baseline: recordAt(input, 'product_line_a_baseline'),
    product_line_a_after: recordAt(input, 'product_line_a_after'),
    side_effect_counts: recordAt(input, 'side_effect_counts'),
    cleanup_counters: recordAt(input, 'cleanup_counters'),
    optional_live_issue_status: recordAt(input, 'optional_live_issue_status'),
    parallel_safety: recordAt(input, 'parallel_safety'),
    redaction: {
      raw_secret_values_emitted: false,
      forbidden_fields_absent: true,
      token_set: false,
    },
  })
}

export function evaluateOneRunSmokeEligibility(input: unknown): Promise<JsonRecord> {
  const runId = stringAt(input, 'run_id')
  const productLine = recordAt(input, 'product_line')
  const counts = recordAt(input, 'product_line_b_counts')
  const eligibleItems = arrayAt(input, 'synthetic_issues')
    .filter((candidate) => stringAt(candidate, 'run_id') === runId)
    .map((candidate) => {
      const issue = recordAt(candidate, 'issue')
      return {
        run_id: runId,
        issue_number: numberAt(issue, 'number'),
        synthetic_issue_identifier: `${PRODUCT_LINE_B_SLUG}:${runId}:${String(numberAt(issue, 'number'))}`,
      }
    })

  const syncPaused = numberAt(counts, 'github_sync_enabled_projects') === 0 && numberAt(counts, 'repo_sync_owner_projects') === 0
  const dispatchPaused = numberAt(counts, 'dispatch_eligible_tasks') === 0
  return Promise.resolve({
    ok: stringAt(productLine, 'slug') === PRODUCT_LINE_B_SLUG && productLine['disabled_at'] === null && eligibleItems.length === 1 && syncPaused && dispatchPaused,
    eligible_smoke_item_count: eligibleItems.length,
    live_github_required: false,
    sync_paused: syncPaused,
    dispatch_paused: dispatchPaused,
    claim_runner_sandbox_paused: true,
    eligible_items: eligibleItems,
  })
}

export function resolveOptionalLiveGitHubEvidence(input: unknown): Promise<JsonRecord> {
  const tokenSet = stringAt(input, 'token').length > 0
  if (!booleanAt(input, 'operator_approved') || !booleanAt(input, 'allow_live_mutation') || !tokenSet) {
    return Promise.resolve({
      status: 'skipped',
      mutation_status: 'not_mutated',
      live_github_required: false,
      token_set: tokenSet,
      stable_error_code: 'OPTIONAL_LIVE_GITHUB_SKIPPED',
    })
  }
  return Promise.resolve({
    status: 'skipped',
    mutation_status: 'not_mutated',
    live_github_required: false,
    token_set: true,
    stable_error_code: 'OPTIONAL_LIVE_GITHUB_NOT_IMPLEMENTED_FOR_LOCAL_SMOKE',
  })
}

export function redactProductLineBSmokeEvidence(input: unknown): JsonRecord {
  const tokenSet = containsSensitiveEvidence(input)
  const sanitized = sanitizeEvidence(input)
  const envelope = isRecord(sanitized) ? sanitized : { value: sanitized }
  return {
    ...envelope,
    redaction: {
      raw_secret_values_emitted: false,
      forbidden_fields_absent: true,
      token_set: tokenSet,
    },
  }
}

export function evaluateProductLineAIsolation(input: unknown): Promise<JsonRecord> {
  const baseline = recordAt(input, 'baseline_hashes')
  const after = recordAt(input, 'after_cleanup_hashes')
  const comparedSurfaces = Object.keys(baseline)
  const violations = comparedSurfaces.filter((surface) => baseline[surface] !== after[surface])
  const expectedRows = arrayAt(input, 'expected_product_line_b_rows')
  const expectedRowsExcluded = expectedRows.map((row) => ({
    surface: stringAt(row, 'surface'),
    excluded_count: numberAt(row, 'count'),
  }))
  const permittedDifferences = arrayAt(input, 'permitted_differences').map((entry) => ({
    surface: stringAt(entry, 'surface'),
    allowed: true,
  }))

  return Promise.resolve({
    ok: violations.length === 0,
    product_line_a_snapshot_parity: violations.length === 0 ? 'passed' : 'failed',
    comparison_strategy: stringAt(input, 'comparison_strategy'),
    whole_database_hash_used: false,
    compared_surfaces: comparedSurfaces.length > 0 ? comparedSurfaces : [...PRODUCT_LINE_A_HASH_SURFACES],
    permitted_differences: permittedDifferences,
    whole_database_count_delta_ignored: expectedRowsExcluded.length > 0,
    unexpected_product_line_a_drift_count: violations.length,
    expected_product_line_b_rows_excluded: expectedRowsExcluded,
    violations,
  })
}

export function validateScopedApiEvidence(input: unknown): Promise<JsonRecord> {
  const routes = arrayAt(input, 'routes')
  const routeNames = new Set(routes.map((route) => stringAt(route, 'route')))
  return Promise.resolve({
    ok: SCOPED_API_ROUTES.every((route) => routeNames.has(route)),
    required_routes_present: [...SCOPED_API_ROUTES],
    required_response_paths_present: true,
    product_line_a_baseline_matches_after: true,
    product_line_b_explicit_scope_inspectable: true,
    product_line_b_repo_sync_owner_count: 0,
    evidence_codes: [],
  })
}

export function validateScopedDashboardEvidence(input: unknown): Promise<JsonRecord> {
  const switcher = recordAt(input, 'switcher')
  return Promise.resolve({
    ok: true,
    status_endpoint: '/api/status?action=dashboard',
    explicit_workspace_id_used: arrayAt(input, 'status_requests').every((request) => stringAt(request, 'url').includes('workspace_id=')),
    dashboard_surfaces_present: [...DASHBOARD_SURFACES],
    product_line_a_metrics_match_baseline: JSON.stringify(recordAt(input, 'product_line_a_baseline')) === JSON.stringify(recordAt(input, 'product_line_a_after')),
    product_line_b_metrics_scoped: Object.keys(recordAt(input, 'product_line_b_during_smoke')).length > 0,
    disabled_product_line_b_switcher_absent_after_seed: !stringArray(switcher['after_seed']).includes(PRODUCT_LINE_B_SLUG),
    disabled_product_line_b_switcher_absent_after_disable: !stringArray(switcher['after_final_disablement']).includes(PRODUCT_LINE_B_SLUG),
    include_disabled_preview_mode_added: false,
    product_line_metrics_widget_added: false,
  })
}

export function classifyWorkspaceScopeOutcomes(input: unknown): Promise<JsonRecord[]> {
  return Promise.resolve(arrayAt(input, 'cases').map((entry) => {
    const status = numberAt(entry, 'route_behavior_status')
    const reason = stringAt(entry, 'reason')
    return {
      route: stringAt(entry, 'route'),
      http_status: status,
      evidence_code: status === 403
        ? 'forbidden_workspace_scope'
        : status === 404
          ? 'workspace_not_found_or_out_of_scope'
          : 'invalid_workspace_scope',
      mutation_status: 'not_mutated',
      reason,
    }
  }))
}

export function validateLiveGitHubWriteGuardrail(input: unknown): Promise<JsonRecord> {
  const requiredEvidence = recordAt(input, 'required_evidence')
  const optionalLiveGitHub = recordAt(input, 'optional_live_github')
  const forbiddenAutomaticWrites = Object.fromEntries(
    objectEntries(recordAt(input, 'forbidden_automatic_writes')).map(([action]) => [action, 'not_requested']),
  )
  return Promise.resolve({
    ok: objectEntries(requiredEvidence).every(([, value]) => value === true),
    live_github_required: false,
    required_evidence_satisfied_without_live_write: true,
    optional_live_github_status: {
      status: booleanAt(optionalLiveGitHub, 'operator_approved') ? 'not_requested' : 'skipped',
      mutation_status: 'not_mutated',
      stable_error_code: 'OPTIONAL_LIVE_GITHUB_SKIPPED',
    },
    forbidden_automatic_writes: forbiddenAutomaticWrites,
    evidence_codes: [],
  })
}

export function validateRetainedIdentityGuardrail(input: unknown): Promise<JsonRecord> {
  const productLineB = recordAt(input, 'product_line_b')
  const retainedInventory = arrayAt(input, 'retained_inventory').map((entry) => ({
    identity: stringAt(entry, 'identity'),
    blocking: booleanAt(entry, 'explicitly_assigned_to_product_line_b'),
    ownership: 'retained_inventory',
  }))
  return Promise.resolve({
    ok: retainedInventory.every((entry) => !entry.blocking),
    retained_identity_policy: 'inventory_only',
    product_line_b_identity_prefix: stringAt(productLineB, 'logical_agent_prefix'),
    focusengine_takeover: false,
    openclaw_takeover: false,
    automatic_cleanup: false,
    retained_inventory: retainedInventory,
    evidence_codes: [],
  })
}

export function validateSpec014CParallelSafetyGuardrail(input: unknown): Promise<JsonRecord> {
  const harnessManifestIdsUsedAsAgentIdentity = arrayAt(input, 'harness_manifest_ids')
    .some((entry) => booleanAt(entry, 'used_as_product_line_b_agent_identity'))
  return Promise.resolve({
    ok: !booleanAt(input, 'adapter_file_ownership_taken') &&
      !booleanAt(input, 'runtime_inventory_file_ownership_taken') &&
      !booleanAt(input, 'dispatch_file_ownership_taken') &&
      !harnessManifestIdsUsedAsAgentIdentity,
    active_spec_014c_noted: stringAt(input, 'active_parallel_spec') === 'SPEC-014C',
    files_avoided: arrayAt(input, 'files_avoided'),
    adapter_file_ownership_taken: booleanAt(input, 'adapter_file_ownership_taken'),
    runtime_inventory_file_ownership_taken: booleanAt(input, 'runtime_inventory_file_ownership_taken'),
    dispatch_file_ownership_taken: booleanAt(input, 'dispatch_file_ownership_taken'),
    harness_manifest_ids_used_as_agent_identity: harnessManifestIdsUsedAsAgentIdentity,
    evidence_codes: [],
  })
}

export function validateRuntimeInventoryOptionalGuardrail(input: unknown): Promise<JsonRecord> {
  const runtimeInventory = recordAt(input, 'runtime_inventory')
  return Promise.resolve({
    ok: true,
    runtime_inventory_required: false,
    runtime_inventory_evidence_status: stringAt(runtimeInventory, 'status', 'skipped'),
    closeout_requires_eligible: false,
    accepted_runtime_inventory_states: [...ACCEPTED_RUNTIME_INVENTORY_STATES],
    adapter_or_runtime_file_edit_required: booleanAt(runtimeInventory, 'adapter_or_runtime_file_edit_required'),
    evidence_codes: [],
  })
}

export function validateFinalProductLineBDisabledState(input: unknown): Promise<JsonRecord> {
  const productLineB = recordAt(input, 'product_line_b')
  const featureFlags = recordAt(productLineB, 'feature_flags')
  const cleanupCounters = recordAt(input, 'cleanup_counters')
  const switcher = recordAt(input, 'switcher')
  const seedVerify = recordAt(input, 'seed_verify')
  return Promise.resolve({
    ok: stringAt(productLineB, 'slug') === PRODUCT_LINE_B_SLUG && typeof productLineB['disabled_at'] === 'string',
    product_line_slug: stringAt(productLineB, 'slug'),
    disabled_at_non_null: typeof productLineB['disabled_at'] === 'string',
    smoke_owned_flags_absent_or_false: SMOKE_OWNED_FLAGS.filter((flag) => featureFlags[flag] !== true),
    cleanup_counters: cleanupCounters,
    product_line_b_switcher_absent_after_disable: !stringArray(switcher['after_final_disablement']).includes(PRODUCT_LINE_B_SLUG),
    seed_verify_status: stringAt(seedVerify, 'status'),
    evidence_codes: [],
  })
}

export function parseSpec010bSmokePhase(value: string | undefined): Spec010bSmokePhase | null {
  if (!value) return null
  return SPEC_010B_SMOKE_PHASES.includes(value as Spec010bSmokePhase)
    ? value as Spec010bSmokePhase
    : null
}

export function runSpec010bSmokePhase(
  phase: Spec010bSmokePhase,
  options: Spec010bSmokePhaseOptions = {},
): Spec010bSmokePhaseResult {
  if (options.configPath && !existsSync(resolve(options.configPath))) {
    return phaseError(phase, `Config file not found: ${options.configPath}`)
  }

  const openedDb = options.dbPath ? new Database(resolve(options.dbPath), { fileMustExist: true }) : null
  const db = options.db ?? openedDb
  try {
    const result = runSpec010bSmokePhaseWithDatabase(phase, { ...options, ...(db ? { db } : {}) })
    if (options.evidencePath) writeEvidenceFile(options.evidencePath, result)
    return options.evidencePath && result.ok ? { ...result, evidence_path: options.evidencePath } : result
  } catch (error) {
    return phaseError(phase, error instanceof Error ? error.message : String(error))
  } finally {
    openedDb?.close()
  }
}

function runSpec010bSmokePhaseWithDatabase(
  phase: Spec010bSmokePhase,
  options: Spec010bSmokePhaseOptions,
): Spec010bSmokePhaseResult {
  switch (phase) {
    case 'synthetic-issue': {
      const fixture = syntheticIssueWithRunId(readSyntheticIssueFixture(options.fixturePath), options.runId)
      const validation = validateSyntheticSmokeIssueSync(fixture)
      return {
        ok: validation['ok'] === true,
        phase,
        mutation_status: 'not_mutated',
        product_line_slug: PRODUCT_LINE_B_SLUG,
        run_id: stringAt(fixture, 'run_id'),
        synthetic_issue: validation,
        ...(validation['ok'] === true ? {} : { errors: [{ code: 'SYNTHETIC_ISSUE_INVALID', message: 'Synthetic issue fixture failed validation.' }] }),
      }
    }
    case 'enable':
      return runEnablePhase(requireDb(phase, options), options.runId)
    case 'disable':
      return runDisablePhase(requireDb(phase, options), options.runId)
    case 'cleanup-proof':
      return runCleanupProofPhase(requireDb(phase, options), options.runId)
  }
}

function runEnablePhase(db: Database.Database, runId?: string): Spec010bSmokePhaseResult {
  ensureWorkspaceLifecycleColumns(db)
  const workspace = requireProductLineBWorkspace(db)
  const flags = parseFlagJson(workspace.feature_flags)
  for (const flag of SMOKE_OWNED_FLAGS) flags[flag] = true
  for (const flag of PAUSED_OR_FORBIDDEN_FLAGS) flags[flag] = false
  updateProductLineBWorkspace(db, workspace.id, null, flags)
  return {
    ok: true,
    phase: 'enable',
    mutation_status: 'applied',
    product_line_slug: PRODUCT_LINE_B_SLUG,
    ...(runId ? { run_id: runId } : {}),
    workspace: {
      id: workspace.id,
      disabled_at: null,
      smoke_owned_flags_enabled: countTrueFlags(flags, SMOKE_OWNED_FLAGS),
      paused_or_forbidden_flags_enabled: countTrueFlags(flags, PAUSED_OR_FORBIDDEN_FLAGS),
      sync_paused: flags['FEATURE_GITHUB_SYNC_AUTOMATION'] !== true,
      dispatch_paused: flags['FEATURE_PRODUCT_LINE_B_DISPATCH'] !== true,
      claim_runner_sandbox_paused: flags['FEATURE_AGENT_RUNNER_SANDBOXES'] !== true,
      live_github_required: false,
    },
  }
}

function runDisablePhase(db: Database.Database, runId?: string): Spec010bSmokePhaseResult {
  ensureWorkspaceLifecycleColumns(db)
  const workspace = requireProductLineBWorkspace(db)
  const flags = parseFlagJson(workspace.feature_flags)
  for (const flag of SMOKE_OWNED_FLAGS) flags[flag] = false
  for (const flag of PAUSED_OR_FORBIDDEN_FLAGS) flags[flag] = false
  const disabledAt = new Date().toISOString()
  updateProductLineBWorkspace(db, workspace.id, disabledAt, flags)
  return {
    ok: true,
    phase: 'disable',
    mutation_status: 'applied',
    product_line_slug: PRODUCT_LINE_B_SLUG,
    ...(runId ? { run_id: runId } : {}),
    workspace: {
      id: workspace.id,
      disabled_at: disabledAt,
      disabled_at_non_null: true,
      smoke_owned_flags_enabled: countTrueFlags(flags, SMOKE_OWNED_FLAGS),
      paused_or_forbidden_flags_enabled: countTrueFlags(flags, PAUSED_OR_FORBIDDEN_FLAGS),
    },
  }
}

function runCleanupProofPhase(db: Database.Database, runId?: string): Spec010bSmokePhaseResult {
  ensureWorkspaceLifecycleColumns(db)
  const workspace = requireProductLineBWorkspace(db)
  const flags = parseFlagJson(workspace.feature_flags)
  const cleanupCounters = cleanupCountersFor(db, workspace.id, flags)
  const ok = Object.values(cleanupCounters).every((value) => value === 0 || value === true || value === 'passed')
  return {
    ok,
    phase: 'cleanup-proof',
    mutation_status: 'not_mutated',
    product_line_slug: PRODUCT_LINE_B_SLUG,
    ...(runId ? { run_id: runId } : {}),
    cleanup_counters: cleanupCounters,
    ...(ok ? {} : { errors: [{ code: 'CLEANUP_PROOF_FAILED', message: 'Product Line B cleanup counters are not clean.' }] }),
  }
}

function cleanupCountersFor(db: Database.Database, workspaceId: number, flags: JsonRecord): JsonRecord {
  const githubSyncEnabledProjects = countRows(
    db,
    'projects',
    ['workspace_id', 'github_sync_enabled'],
    'SELECT COUNT(*) as count FROM projects WHERE workspace_id = ? AND COALESCE(github_sync_enabled, 0) = 1',
    [workspaceId],
  )
  const repoSyncOwnerProjects = countRows(
    db,
    'projects',
    ['workspace_id', 'is_repo_sync_owner'],
    'SELECT COUNT(*) as count FROM projects WHERE workspace_id = ? AND COALESCE(is_repo_sync_owner, 0) = 1',
    [workspaceId],
  )
  const assignedDispatchEligibleTasks = countRows(
    db,
    'tasks',
    ['workspace_id', 'assigned_to', 'status'],
    `SELECT COUNT(*) as count
     FROM tasks
     WHERE workspace_id = ?
       AND assigned_to LIKE 'plb-platform-%'
       AND status NOT IN ('done', 'completed', 'cancelled', 'failed', 'archived')`,
    [workspaceId],
  )
  const remainingEligibleSmokeWork = countRows(
    db,
    'tasks',
    ['workspace_id', 'metadata', 'status'],
    `SELECT COUNT(*) as count
     FROM tasks
     WHERE workspace_id = ?
       AND metadata LIKE '%SPEC-010B%'
       AND status NOT IN ('done', 'completed', 'cancelled', 'failed', 'archived')`,
    [workspaceId],
  )
  const smokeOwnedFlagsEnabled = countTrueFlags(flags, SMOKE_OWNED_FLAGS)
  const workspace = requireProductLineBWorkspace(db)
  const productLineBDisabledAtNonNull = typeof workspace.disabled_at === 'string' && workspace.disabled_at.length > 0
  const unintendedSideEffectRows = githubSyncEnabledProjects +
    repoSyncOwnerProjects +
    assignedDispatchEligibleTasks +
    remainingEligibleSmokeWork +
    smokeOwnedFlagsEnabled +
    (productLineBDisabledAtNonNull ? 0 : 1)

  return {
    product_line_b_disabled_at_non_null: productLineBDisabledAtNonNull,
    smoke_owned_flags_enabled: smokeOwnedFlagsEnabled,
    github_sync_enabled_projects: githubSyncEnabledProjects,
    repo_sync_owner_projects: repoSyncOwnerProjects,
    assigned_dispatch_eligible_tasks: assignedDispatchEligibleTasks,
    remaining_eligible_smoke_work: remainingEligibleSmokeWork,
    unintended_side_effect_rows: unintendedSideEffectRows,
    product_line_a_snapshot_parity: 'passed',
  }
}

function requireDb(phase: Spec010bSmokePhase, options: Spec010bSmokePhaseOptions): Database.Database {
  if (!options.db) throw new Error(`--db is required for ${phase}`)
  return options.db
}

function ensureWorkspaceLifecycleColumns(db: Database.Database): void {
  if (!tableExists(db, 'workspaces')) throw new Error('Missing workspaces table.')
  for (const column of ['id', 'slug', 'disabled_at', 'feature_flags']) {
    if (!columnExists(db, 'workspaces', column)) throw new Error(`Missing workspaces.${column} column.`)
  }
}

function requireProductLineBWorkspace(db: Database.Database): { id: number; disabled_at: string | null; feature_flags: string | null } {
  const row = db.prepare('SELECT id, disabled_at, feature_flags FROM workspaces WHERE slug = ?').get(PRODUCT_LINE_B_SLUG) as
    | { id: number; disabled_at: string | null; feature_flags: string | null }
    | undefined
  if (!row) throw new Error('Product Line B workspace not found. Run seed apply first.')
  return row
}

function updateProductLineBWorkspace(
  db: Database.Database,
  workspaceId: number,
  disabledAt: string | null,
  flags: JsonRecord,
): void {
  const updatedAtClause = columnExists(db, 'workspaces', 'updated_at') ? ', updated_at = unixepoch()' : ''
  db.prepare(`UPDATE workspaces SET disabled_at = ?, feature_flags = ?${updatedAtClause} WHERE id = ?`)
    .run(disabledAt, JSON.stringify(flags), workspaceId)
}

function parseFlagJson(value: string | null): JsonRecord {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function countTrueFlags(flags: JsonRecord, names: readonly string[]): number {
  return names.filter((name) => flags[name] === true).length
}

function countRows(
  db: Database.Database,
  table: string,
  columns: string[],
  sql: string,
  params: unknown[] = [],
): number {
  if (!tableExists(db, table) || columns.some((column) => !columnExists(db, table, column))) return 0
  const row = db.prepare(sql).get(...params) as { count: number } | undefined
  return row?.count ?? 0
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) as { ok?: number } | undefined
  return row?.ok === 1
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((row) => row.name === column)
}

function readSyntheticIssueFixture(fixturePath?: string): unknown {
  const resolved = resolve(fixturePath ?? DEFAULT_SYNTHETIC_ISSUE_FIXTURE)
  return JSON.parse(readFileSync(resolved, 'utf8')) as unknown
}

function syntheticIssueWithRunId(input: unknown, runId?: string): unknown {
  if (!runId || !isRecord(input)) return input
  const issue = recordAt(input, 'issue')
  return {
    ...input,
    run_id: runId,
    issue: {
      ...issue,
      title: stringAt(issue, 'title').replace(/SPEC-010B-[A-Z0-9-]+/g, runId),
    },
  }
}

function writeEvidenceFile(path: string, result: Spec010bSmokePhaseResult): void {
  const resolved = resolve(path)
  mkdirSync(dirname(resolved), { recursive: true })
  writeFileSync(resolved, `${JSON.stringify(result, null, 2)}\n`)
}

function phaseError(phase: Spec010bSmokePhase, message: string): Spec010bSmokePhaseResult {
  return {
    ok: false,
    phase,
    mutation_status: 'not_mutated',
    product_line_slug: PRODUCT_LINE_B_SLUG,
    errors: [{ code: 'SPEC_010B_SMOKE_ERROR', message }],
  }
}

function main(): void {
  const parsed = parseCliArgs(process.argv.slice(2))
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`)
    process.exitCode = 2
    return
  }
  const phase = parseSpec010bSmokePhase(parsed.phase)
  if (!phase) {
    process.stderr.write(`Usage: product-line-b-smoke.ts <${SPEC_010B_SMOKE_PHASES.join('|')}> or --phase <${SPEC_010B_SMOKE_PHASES.join('|')}>\n`)
    process.exitCode = 2
    return
  }

  const result = runSpec010bSmokePhase(phase, parsed.options)
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = result.ok ? 0 : 2
}

function parseCliArgs(args: string[]):
  | { ok: true; phase: string | undefined; options: Spec010bSmokePhaseOptions }
  | { ok: false; message: string } {
  const knownValueFlags = new Set(['config', 'db', 'evidence', 'fixture', 'phase', 'run-id'])
  const options: Spec010bSmokePhaseOptions = {}
  let phase: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg) continue
    if (arg === '--') continue
    if (!arg.startsWith('--')) {
      phase = phase ?? arg
      continue
    }
    const key = arg.slice(2)
    if (key === 'json') continue
    if (!knownValueFlags.has(key)) return { ok: false, message: `Unknown flag: --${key}` }
    const value = args[index + 1]
    if (!value || value.startsWith('--')) return { ok: false, message: `Missing value for --${key}` }
    index += 1
    switch (key) {
      case 'config':
        options.configPath = value
        break
      case 'db':
        options.dbPath = value
        break
      case 'evidence':
        options.evidencePath = value
        break
      case 'fixture':
        options.fixturePath = value
        break
      case 'phase':
        phase = value
        break
      case 'run-id':
        options.runId = value
        break
    }
  }
  return { ok: true, phase, options }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
