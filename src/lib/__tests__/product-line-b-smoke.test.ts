import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'

const RUN_ID = 'SPEC-010B-LOCAL-0001'
const PRODUCT_LINE_A_SLUG = 'paddock'
const PRODUCT_LINE_B_SLUG = 'product-line-b'
const PADDOCK_REPO = 'racecraft-lab/Paddock'
const PILOT_LABELS = ['pd:inbox', 'priority:medium', 'area:dev'] as const
const PRODUCT_LINE_A_WORKSPACE_ID = 1
const PRODUCT_LINE_B_WORKSPACE_ID = 2
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
const SPEC_014C_OWNED_PATHS = [
  'src/lib/harness-adapters/**',
  'src/app/api/agents/runtime-inventory/**',
  'src/lib/task-dispatch.ts',
  'src/lib/task-dispatch-codex-app-server.ts',
  'scripts/spec-014c/**',
  'specs/014c-first-real-harness-adapter/**',
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
const FORBIDDEN_LIVE_GITHUB_WRITES = [
  'repair_labels',
  'comment',
  'close_or_delete_issue',
  'create_pull_request',
  'enable_repo_sync_owner',
  'mutate_product_line_a_sync',
] as const

interface ProductLineBSmokeModule {
  validateSyntheticSmokeIssue?: (input: unknown) => Promise<unknown>
  buildSmokeEvidencePacket?: (input: unknown) => Promise<unknown>
  evaluateOneRunSmokeEligibility?: (input: unknown) => Promise<unknown>
  resolveOptionalLiveGitHubEvidence?: (input: unknown) => Promise<unknown>
  redactProductLineBSmokeEvidence?: (input: unknown) => unknown
  evaluateProductLineAIsolation?: (input: unknown) => Promise<unknown>
  validateScopedApiEvidence?: (input: unknown) => Promise<unknown>
  validateScopedDashboardEvidence?: (input: unknown) => Promise<unknown>
  classifyWorkspaceScopeOutcomes?: (input: unknown) => Promise<unknown>
  validateLiveGitHubWriteGuardrail?: (input: unknown) => Promise<unknown>
  validateRetainedIdentityGuardrail?: (input: unknown) => Promise<unknown>
  validateSpec014CParallelSafetyGuardrail?: (input: unknown) => Promise<unknown>
  validateRuntimeInventoryOptionalGuardrail?: (input: unknown) => Promise<unknown>
  validateFinalProductLineBDisabledState?: (input: unknown) => Promise<unknown>
  runSpec010bSmokePhase?: (phase: 'enable' | 'synthetic-issue' | 'disable' | 'cleanup-proof', options?: { db?: Database.Database; runId?: string }) => unknown
}

async function loadSmokeModule(): Promise<ProductLineBSmokeModule> {
  try {
    return await import(pathToFileURL(join(
      process.cwd(),
      'scripts/spec-010b/product-line-b-smoke.ts',
    )).href) as ProductLineBSmokeModule
  } catch {
    return {}
  }
}

function expectSmokeFunction<T extends keyof ProductLineBSmokeModule>(
  module: ProductLineBSmokeModule,
  exportName: T,
): NonNullable<ProductLineBSmokeModule[T]> {
  expect(typeof module[exportName]).toBe('function')
  return module[exportName] as NonNullable<ProductLineBSmokeModule[T]>
}

function syntheticIssue(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 'spec-010b.synthetic_issue.v1',
    run_id: RUN_ID,
    product_line_slug: PRODUCT_LINE_B_SLUG,
    repo: {
      owner: 'racecraft-lab',
      name: 'Paddock',
      full_name: PADDOCK_REPO,
    },
    issue: {
      number: 1001,
      title: `[mc-pilot][product-line-b] SPEC-010B synthetic smoke ${RUN_ID}`,
      labels: [...PILOT_LABELS],
    },
    metadata: {
      live_github_required: false,
      optional_live_issue_url: null,
    },
    ...overrides,
  }
}

function phase(status: 'passed' | 'failed' | 'skipped' = 'passed') {
  return {
    status,
    observed_at: '2026-06-05T12:00:00.000Z',
    evidence_refs: ['command:spec-010b:local-smoke'],
    notes: 'redaction-safe local smoke evidence',
  }
}

function productLineAScopedHashes(hash = 'product-line-a-stable-hash') {
  return Object.fromEntries(PRODUCT_LINE_A_HASH_SURFACES.map((surface) => [surface, hash]))
}

function createSmokeLifecycleDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      disabled_at TEXT,
      feature_flags TEXT,
      updated_at INTEGER
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      github_sync_enabled INTEGER NOT NULL DEFAULT 0,
      is_repo_sync_owner INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      assigned_to TEXT,
      status TEXT NOT NULL,
      metadata TEXT DEFAULT '{}'
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, disabled_at, feature_flags, updated_at) VALUES (?, ?, ?, ?, unixepoch())')
    .run(PRODUCT_LINE_A_WORKSPACE_ID, PRODUCT_LINE_A_SLUG, null, '{}')
  db.prepare('INSERT INTO workspaces (id, slug, disabled_at, feature_flags, updated_at) VALUES (?, ?, ?, ?, unixepoch())')
    .run(PRODUCT_LINE_B_WORKSPACE_ID, PRODUCT_LINE_B_SLUG, '2026-06-05T00:00:00.000Z', JSON.stringify(Object.fromEntries([
      ...SMOKE_OWNED_FLAGS.map((flag) => [flag, false] as const),
      ['FEATURE_GITHUB_SYNC_AUTOMATION', false],
      ['FEATURE_TASK_CONTROL_PLANE', false],
      ['FEATURE_AGENT_RUNNER_SANDBOXES', false],
      ['FEATURE_PRODUCT_LINE_B_DISPATCH', false],
      ['PILOT_PRODUCT_LINE_B_SMOKE', false],
    ])))
  db.prepare('INSERT INTO projects (workspace_id, github_sync_enabled, is_repo_sync_owner) VALUES (?, 0, 0)')
    .run(PRODUCT_LINE_B_WORKSPACE_ID)
  return db
}

describe('SPEC-010B Product Line B smoke RED contract', () => {
  it('accepts the SPEC-010B synthetic issue envelope', async () => {
    const smokeModule = await loadSmokeModule()
    const validateSyntheticSmokeIssue = expectSmokeFunction(smokeModule, 'validateSyntheticSmokeIssue')

    await expect(validateSyntheticSmokeIssue(syntheticIssue())).resolves.toMatchObject({
      ok: true,
      schema_version: 'spec-010b.synthetic_issue.v1',
      run_id: RUN_ID,
      product_line_slug: PRODUCT_LINE_B_SLUG,
      repo: {
        owner: 'racecraft-lab',
        name: 'Paddock',
        full_name: PADDOCK_REPO,
      },
      issue: {
        number: 1001,
        labels: [...PILOT_LABELS],
      },
      metadata: {
        live_github_required: false,
        credential_fields_present: false,
      },
    })
  })

  it('emits the SPEC-010B smoke evidence envelope', async () => {
    const smokeModule = await loadSmokeModule()
    const buildSmokeEvidencePacket = expectSmokeFunction(smokeModule, 'buildSmokeEvidencePacket')

    const packet = await buildSmokeEvidencePacket({
      run_id: RUN_ID,
      synthetic_issue: syntheticIssue(),
      commit: {
        branch: '010b-product-line-b-smoke',
        sha: 'local-red-test',
      },
      runtime: {
        node: process.version,
        database: 'sqlite-disposable',
      },
      phases: Object.fromEntries(REQUIRED_PHASES.map((name) => [name, phase()])),
      seed_snapshots: {
        before_hash: 'seed-before-hash',
        after_hash: 'seed-after-hash',
      },
      product_line_a_baseline: {
        workspace_slug: 'paddock',
        hash: 'product-line-a-hash',
      },
      product_line_a_after: {
        workspace_slug: 'paddock',
        hash: 'product-line-a-hash',
      },
      side_effect_counts: {
        successors: 0,
        claims: 0,
        runner_launches: 0,
        github_writes: 0,
      },
      cleanup_counters: {
        product_line_b_disabled_at_non_null: true,
        smoke_owned_flags_enabled: 0,
        github_sync_enabled_projects: 0,
        repo_sync_owner_projects: 0,
        remaining_eligible_smoke_work: 0,
        unintended_side_effect_rows: 0,
        product_line_a_snapshot_parity: 'passed',
        retained_evidence_rows: [{
          kind: 'smoke_evidence_packet',
          rationale: 'reviewable SPEC-010B proof',
        }],
      },
      optional_live_issue_status: {
        status: 'skipped',
        mutation_status: 'not_mutated',
        token_set: false,
      },
      parallel_safety: {
        active_spec_014c_noted: true,
        files_avoided: [
          'src/lib/runtime-inventory',
          'src/lib/task-dispatch',
          'src/lib/adapters',
        ],
        runtime_inventory_required: false,
        runtime_inventory_evidence_status: 'skipped',
        adapter_file_ownership_taken: false,
      },
    })

    expect(packet).toMatchObject({
      schema_version: 'spec-010b.smoke_evidence.v1',
      run_id: RUN_ID,
      product_line_slug: PRODUCT_LINE_B_SLUG,
      commit: {
        branch: '010b-product-line-b-smoke',
      },
      runtime: {
        node: process.version,
      },
      seed_snapshots: {
        before_hash: 'seed-before-hash',
        after_hash: 'seed-after-hash',
      },
      product_line_a_baseline: {
        hash: 'product-line-a-hash',
      },
      product_line_a_after: {
        hash: 'product-line-a-hash',
      },
      optional_live_issue_status: {
        status: 'skipped',
        mutation_status: 'not_mutated',
        token_set: false,
      },
      redaction: {
        raw_secret_values_emitted: false,
        forbidden_fields_absent: true,
      },
      parallel_safety: {
        active_spec_014c_noted: true,
        runtime_inventory_required: false,
        adapter_file_ownership_taken: false,
      },
    })
    expect(Object.keys((packet as { phases: Record<string, unknown> }).phases)).toEqual([...REQUIRED_PHASES])
    expect((packet as { phases: Record<string, { evidence_refs: unknown[] }> }).phases['enable']).toMatchObject({
      eligible_smoke_item_count: 1,
      sync_paused: true,
      dispatch_paused: true,
      claim_runner_sandbox_paused: true,
      live_github_required: false,
      synthetic_issue_identifier: `${PRODUCT_LINE_B_SLUG}:${RUN_ID}:1001`,
    })
  })

  it('limits Product Line B smoke eligibility to one run-scoped item', async () => {
    const smokeModule = await loadSmokeModule()
    const evaluateOneRunSmokeEligibility = expectSmokeFunction(smokeModule, 'evaluateOneRunSmokeEligibility')

    await expect(evaluateOneRunSmokeEligibility({
      run_id: RUN_ID,
      product_line: {
        slug: PRODUCT_LINE_B_SLUG,
        disabled_at: null,
        feature_flags: {
          FEATURE_WORKSPACE_SWITCHER: true,
          FEATURE_TASK_PIPELINES: true,
          FEATURE_GITHUB_SYNC_AUTOMATION: false,
          FEATURE_TASK_CONTROL_PLANE: false,
          FEATURE_AGENT_RUNNER_SANDBOXES: false,
        },
      },
      synthetic_issues: [
        syntheticIssue(),
        syntheticIssue({
          run_id: 'SPEC-010B-LOCAL-OTHER',
          issue: {
            number: 1002,
            title: '[mc-pilot][product-line-b] SPEC-010B synthetic smoke SPEC-010B-LOCAL-OTHER',
            labels: [...PILOT_LABELS],
          },
        }),
      ],
      product_line_b_counts: {
        github_sync_enabled_projects: 0,
        repo_sync_owner_projects: 0,
        dispatch_eligible_tasks: 0,
      },
    })).resolves.toMatchObject({
      ok: true,
      eligible_smoke_item_count: 1,
      live_github_required: false,
      sync_paused: true,
      dispatch_paused: true,
      claim_runner_sandbox_paused: true,
      eligible_items: [{
        run_id: RUN_ID,
        issue_number: 1001,
        synthetic_issue_identifier: `${PRODUCT_LINE_B_SLUG}:${RUN_ID}:1001`,
      }],
    })
  })

  it('enables and disables Product Line B against a disposable DB', async () => {
    const smokeModule = await loadSmokeModule()
    const runSpec010bSmokePhase = expectSmokeFunction(smokeModule, 'runSpec010bSmokePhase')
    const db = createSmokeLifecycleDb()
    try {
      const enableResult = runSpec010bSmokePhase('enable', { db, runId: RUN_ID })
      expect(enableResult).toMatchObject({
        ok: true,
        phase: 'enable',
        mutation_status: 'applied',
        workspace: {
          disabled_at: null,
          smoke_owned_flags_enabled: SMOKE_OWNED_FLAGS.length,
          paused_or_forbidden_flags_enabled: 0,
          sync_paused: true,
          dispatch_paused: true,
          claim_runner_sandbox_paused: true,
        },
      })
      const enabled = db.prepare('SELECT disabled_at, feature_flags FROM workspaces WHERE slug = ?').get(PRODUCT_LINE_B_SLUG) as { disabled_at: string | null; feature_flags: string }
      const enabledFlags = JSON.parse(enabled.feature_flags) as Record<string, unknown>
      expect(enabled.disabled_at).toBeNull()
      expect(SMOKE_OWNED_FLAGS.every((flag) => enabledFlags[flag] === true)).toBe(true)
      expect(enabledFlags['FEATURE_GITHUB_SYNC_AUTOMATION']).toBe(false)
      expect(enabledFlags['FEATURE_PRODUCT_LINE_B_DISPATCH']).toBe(false)

      const disableResult = runSpec010bSmokePhase('disable', { db, runId: RUN_ID })
      expect(disableResult).toMatchObject({
        ok: true,
        phase: 'disable',
        mutation_status: 'applied',
        workspace: {
          disabled_at_non_null: true,
          smoke_owned_flags_enabled: 0,
          paused_or_forbidden_flags_enabled: 0,
        },
      })
      const disabled = db.prepare('SELECT disabled_at, feature_flags FROM workspaces WHERE slug = ?').get(PRODUCT_LINE_B_SLUG) as { disabled_at: string | null; feature_flags: string }
      const disabledFlags = JSON.parse(disabled.feature_flags) as Record<string, unknown>
      expect(typeof disabled.disabled_at).toBe('string')
      expect(SMOKE_OWNED_FLAGS.every((flag) => disabledFlags[flag] === false)).toBe(true)

      expect(runSpec010bSmokePhase('cleanup-proof', { db, runId: RUN_ID })).toMatchObject({
        ok: true,
        phase: 'cleanup-proof',
        mutation_status: 'not_mutated',
        cleanup_counters: {
          product_line_b_disabled_at_non_null: true,
          smoke_owned_flags_enabled: 0,
          github_sync_enabled_projects: 0,
          repo_sync_owner_projects: 0,
          assigned_dispatch_eligible_tasks: 0,
          remaining_eligible_smoke_work: 0,
          unintended_side_effect_rows: 0,
          product_line_a_snapshot_parity: 'passed',
        },
      })
    } finally {
      db.close()
    }
  })

  it('skips optional live GitHub evidence without making a network call', async () => {
    const smokeModule = await loadSmokeModule()
    const resolveOptionalLiveGitHubEvidence = expectSmokeFunction(smokeModule, 'resolveOptionalLiveGitHubEvidence')
    const fetchImpl = vi.fn()

    await expect(resolveOptionalLiveGitHubEvidence({
      run_id: RUN_ID,
      synthetic_issue: syntheticIssue(),
      operator_approved: false,
      allow_live_mutation: false,
      token: '',
      fetch_impl: fetchImpl,
    })).resolves.toMatchObject({
      status: 'skipped',
      mutation_status: 'not_mutated',
      live_github_required: false,
      token_set: false,
      stable_error_code: 'OPTIONAL_LIVE_GITHUB_SKIPPED',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('emits redaction proof without secret-bearing fields', async () => {
    const smokeModule = await loadSmokeModule()
    const redactProductLineBSmokeEvidence = expectSmokeFunction(smokeModule, 'redactProductLineBSmokeEvidence')
    const ghp = 'ghp_spec010bsecretvalue'
    const pat = 'github_pat_11AAAAAA_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const apiKey = 'sk-spec010bsecretvalue'

    const redacted = redactProductLineBSmokeEvidence({
      schema_version: 'spec-010b.smoke_evidence.v1',
      run_id: RUN_ID,
      optional_live_issue_status: {
        status: 'failed_not_required',
        token: ghp,
        api_key: apiKey,
        authorization: `Bearer ${ghp}`,
        raw_github_response: {
          headers: { authorization: `Bearer ${pat}` },
          body: `upstream included ${pat}`,
        },
      },
      notes: `request failed with ${ghp}`,
      safe_reference: `${PADDOCK_REPO}#1001`,
    })

    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain(ghp)
    expect(serialized).not.toContain(pat)
    expect(serialized).not.toContain(apiKey)
    expect(serialized).not.toContain('"authorization"')
    expect(serialized).not.toContain('"raw_github_response"')
    expect(serialized).not.toContain('"api_key"')
    expect(serialized).not.toContain('"token"')
    expect(redacted).toMatchObject({
      schema_version: 'spec-010b.smoke_evidence.v1',
      run_id: RUN_ID,
      safe_reference: `${PADDOCK_REPO}#1001`,
      redaction: {
        raw_secret_values_emitted: false,
        forbidden_fields_absent: true,
        token_set: true,
      },
    })
  })

  it('passes Product Line A isolation on scoped hash parity', async () => {
    const smokeModule = await loadSmokeModule()
    const evaluateProductLineAIsolation = expectSmokeFunction(smokeModule, 'evaluateProductLineAIsolation')

    await expect(evaluateProductLineAIsolation({
      run_id: RUN_ID,
      comparison_strategy: 'product_line_a_scoped',
      product_line_a: {
        workspace_id: PRODUCT_LINE_A_WORKSPACE_ID,
        slug: PRODUCT_LINE_A_SLUG,
      },
      product_line_b: {
        workspace_id: PRODUCT_LINE_B_WORKSPACE_ID,
        slug: PRODUCT_LINE_B_SLUG,
      },
      baseline_hashes: productLineAScopedHashes(),
      after_cleanup_hashes: productLineAScopedHashes(),
      whole_database_snapshot_hashes: {
        before: 'whole-db-before-product-line-b',
        after: 'whole-db-after-product-line-b-expected-rows',
      },
      permitted_differences: [{
        surface: 'inspection_logs',
        reason: 'read-only scoped API/dashboard evidence timestamp',
      }],
    })).resolves.toMatchObject({
      ok: true,
      product_line_a_snapshot_parity: 'passed',
      comparison_strategy: 'product_line_a_scoped',
      whole_database_hash_used: false,
      compared_surfaces: [...PRODUCT_LINE_A_HASH_SURFACES],
      permitted_differences: [{
        surface: 'inspection_logs',
        allowed: true,
      }],
      violations: [],
    })
  })

  it('requires scoped API evidence fields', async () => {
    const smokeModule = await loadSmokeModule()
    const validateScopedApiEvidence = expectSmokeFunction(smokeModule, 'validateScopedApiEvidence')

    await expect(validateScopedApiEvidence({
      run_id: RUN_ID,
      product_line_a_workspace_id: PRODUCT_LINE_A_WORKSPACE_ID,
      product_line_b_workspace_id: PRODUCT_LINE_B_WORKSPACE_ID,
      routes: [
        {
          route: '/api/workspaces/:id',
          scope: 'product_line_a',
          status: 200,
          response: {
            workspace: {
              id: PRODUCT_LINE_A_WORKSPACE_ID,
              slug: PRODUCT_LINE_A_SLUG,
              name: 'Paddock',
              tenant_id: 1,
              feature_flags: { FEATURE_WORKSPACE_SWITCHER: true },
              disabled_at: null,
              agent_count: 6,
            },
          },
        },
        {
          route: '/api/projects?workspace_id=<id>',
          scope: 'product_line_b',
          status: 200,
          response: {
            projects: [{
              id: 20,
              workspace_id: PRODUCT_LINE_B_WORKSPACE_ID,
              slug: 'development',
              github_repo: PADDOCK_REPO,
              github_sync_enabled: false,
              is_repo_sync_owner: false,
              assigned_agents: ['plb-platform-dev'],
            }],
          },
        },
        {
          route: '/api/tasks?workspace_id=<id>',
          scope: 'product_line_b',
          status: 200,
          response: {
            tasks: [{
              id: 3001,
              workspace_id: PRODUCT_LINE_B_WORKSPACE_ID,
              project_id: 20,
              status: 'inbox',
              assigned_to: 'plb-platform-dev',
              metadata: {
                product_line_slug: PRODUCT_LINE_B_SLUG,
                spec_010b_run_id: RUN_ID,
              },
            }],
            total: 1,
            page: 1,
            limit: 25,
          },
        },
        {
          route: '/api/agents?workspace_id=<id>',
          scope: 'product_line_b',
          status: 200,
          response: {
            agents: [{
              id: 401,
              workspace_id: PRODUCT_LINE_B_WORKSPACE_ID,
              name: 'plb-platform-dev',
              role: 'dev',
              config: { product_line_slug: PRODUCT_LINE_B_SLUG },
              taskStats: {
                total: 1,
                assigned: 1,
                in_progress: 0,
                done: 0,
              },
            }],
          },
        },
        {
          route: '/api/github/sync?workspace_id=<id>',
          scope: 'product_line_b',
          status: 200,
          response: {
            syncs: [{
              project_id: 20,
              github_repo: PADDOCK_REPO,
              sync_count: 0,
            }],
            github_sync_lifecycle: {
              scopes: [{
                workspace_id: PRODUCT_LINE_B_WORKSPACE_ID,
                github_repo: PADDOCK_REPO,
                enabled: false,
              }],
              flag: {
                enabled: false,
              },
            },
          },
        },
      ],
    })).resolves.toMatchObject({
      ok: true,
      required_routes_present: [...SCOPED_API_ROUTES],
      required_response_paths_present: true,
      product_line_a_baseline_matches_after: true,
      product_line_b_explicit_scope_inspectable: true,
      product_line_b_repo_sync_owner_count: 0,
      evidence_codes: [],
    })
  })

  it('requires scoped dashboard evidence fields', async () => {
    const smokeModule = await loadSmokeModule()
    const validateScopedDashboardEvidence = expectSmokeFunction(smokeModule, 'validateScopedDashboardEvidence')

    await expect(validateScopedDashboardEvidence({
      run_id: RUN_ID,
      status_requests: [
        {
          scope: 'product_line_a',
          url: `/api/status?action=dashboard&workspace_id=${String(PRODUCT_LINE_A_WORKSPACE_ID)}`,
        },
        {
          scope: 'product_line_b',
          url: `/api/status?action=dashboard&workspace_id=${String(PRODUCT_LINE_B_WORKSPACE_ID)}`,
        },
      ],
      product_line_a_baseline: {
        metric_cards: { tasks_total: 12, agents_total: 6 },
        task_flow: { inbox: 2, in_progress: 1, done: 9 },
        task_pipeline: { active: 1, recentDay: 3 },
        triage_totals: { actionable: 2, held: 0 },
      },
      product_line_a_after: {
        metric_cards: { tasks_total: 12, agents_total: 6 },
        task_flow: { inbox: 2, in_progress: 1, done: 9 },
        task_pipeline: { active: 1, recentDay: 3 },
        triage_totals: { actionable: 2, held: 0 },
      },
      product_line_b_during_smoke: {
        metric_cards: { tasks_total: 1, agents_total: 6 },
        task_flow: { inbox: 1, in_progress: 0, done: 0 },
        task_pipeline: { active: 0, recentDay: 1 },
        triage_totals: { actionable: 1, held: 0 },
      },
      switcher: {
        after_seed: [PRODUCT_LINE_A_SLUG],
        during_smoke_enablement: [PRODUCT_LINE_A_SLUG, PRODUCT_LINE_B_SLUG],
        after_final_disablement: [PRODUCT_LINE_A_SLUG],
      },
    })).resolves.toMatchObject({
      ok: true,
      status_endpoint: '/api/status?action=dashboard',
      explicit_workspace_id_used: true,
      dashboard_surfaces_present: [...DASHBOARD_SURFACES],
      product_line_a_metrics_match_baseline: true,
      product_line_b_metrics_scoped: true,
      disabled_product_line_b_switcher_absent_after_seed: true,
      disabled_product_line_b_switcher_absent_after_disable: true,
      include_disabled_preview_mode_added: false,
      product_line_metrics_widget_added: false,
    })
  })

  it('classifies invalid workspace scope outcomes', async () => {
    const smokeModule = await loadSmokeModule()
    const classifyWorkspaceScopeOutcomes = expectSmokeFunction(smokeModule, 'classifyWorkspaceScopeOutcomes')

    await expect(classifyWorkspaceScopeOutcomes({
      cases: [
        {
          route: '/api/projects',
          reason: 'malformed_workspace_id',
          request: { workspace_id: 'not-a-number' },
          route_behavior_status: 400,
        },
        {
          route: '/api/tasks',
          reason: 'duplicate_scope_parameters',
          request: { workspace_id: '1', workspace_scope: 'facility' },
          route_behavior_status: 400,
        },
        {
          route: '/api/agents',
          reason: 'unsupported_workspace_scope',
          request: { workspace_scope: 'facility' },
          route_behavior_status: 400,
        },
        {
          route: '/api/github/sync',
          reason: 'tenant_boundary',
          request: { workspace_id: '999' },
          route_behavior_status: 403,
        },
        {
          route: '/api/workspaces/:id',
          reason: 'path_workspace_out_of_scope',
          request: { id: '999' },
          route_behavior_status: 404,
        },
      ],
    })).resolves.toEqual([
      {
        route: '/api/projects',
        http_status: 400,
        evidence_code: 'invalid_workspace_scope',
        mutation_status: 'not_mutated',
        reason: 'malformed_workspace_id',
      },
      {
        route: '/api/tasks',
        http_status: 400,
        evidence_code: 'invalid_workspace_scope',
        mutation_status: 'not_mutated',
        reason: 'duplicate_scope_parameters',
      },
      {
        route: '/api/agents',
        http_status: 400,
        evidence_code: 'invalid_workspace_scope',
        mutation_status: 'not_mutated',
        reason: 'unsupported_workspace_scope',
      },
      {
        route: '/api/github/sync',
        http_status: 403,
        evidence_code: 'forbidden_workspace_scope',
        mutation_status: 'not_mutated',
        reason: 'tenant_boundary',
      },
      {
        route: '/api/workspaces/:id',
        http_status: 404,
        evidence_code: 'workspace_not_found_or_out_of_scope',
        mutation_status: 'not_mutated',
        reason: 'path_workspace_out_of_scope',
      },
    ])
  })

  it('excludes expected Product Line B rows from drift counts', async () => {
    const smokeModule = await loadSmokeModule()
    const evaluateProductLineAIsolation = expectSmokeFunction(smokeModule, 'evaluateProductLineAIsolation')

    await expect(evaluateProductLineAIsolation({
      run_id: RUN_ID,
      comparison_strategy: 'product_line_a_scoped',
      product_line_a: {
        workspace_id: PRODUCT_LINE_A_WORKSPACE_ID,
        slug: PRODUCT_LINE_A_SLUG,
      },
      product_line_b: {
        workspace_id: PRODUCT_LINE_B_WORKSPACE_ID,
        slug: PRODUCT_LINE_B_SLUG,
      },
      baseline_hashes: productLineAScopedHashes(),
      after_cleanup_hashes: productLineAScopedHashes(),
      whole_database_count_deltas: [
        { surface: 'workspaces', before: 1, after: 2, delta: 1 },
        { surface: 'projects', before: 6, after: 12, delta: 6 },
        { surface: 'project_agent_assignments', before: 6, after: 12, delta: 6 },
        { surface: 'task_artifacts', before: 0, after: 1, delta: 1 },
      ],
      expected_product_line_b_rows: [
        {
          surface: 'workspaces',
          count: 1,
          rationale: 'retained disabled Product Line B workspace',
        },
        {
          surface: 'projects',
          count: 6,
          rationale: 'retained Product Line B departments',
        },
        {
          surface: 'project_agent_assignments',
          count: 6,
          rationale: 'retained plb-platform assignments',
        },
        {
          surface: 'task_artifacts',
          count: 1,
          rationale: 'retained reviewable smoke evidence packet',
        },
      ],
    })).resolves.toMatchObject({
      ok: true,
      product_line_a_snapshot_parity: 'passed',
      whole_database_count_delta_ignored: true,
      unexpected_product_line_a_drift_count: 0,
      expected_product_line_b_rows_excluded: [
        { surface: 'workspaces', excluded_count: 1 },
        { surface: 'projects', excluded_count: 6 },
        { surface: 'project_agent_assignments', excluded_count: 6 },
        { surface: 'task_artifacts', excluded_count: 1 },
      ],
      violations: [],
    })
  })

  it('proves live GitHub writes are never required for the smoke gate', async () => {
    const smokeModule = await loadSmokeModule()
    const validateLiveGitHubWriteGuardrail = expectSmokeFunction(smokeModule, 'validateLiveGitHubWriteGuardrail')

    await expect(validateLiveGitHubWriteGuardrail({
      run_id: RUN_ID,
      synthetic_issue: syntheticIssue(),
      required_evidence: {
        synthetic_issue_metadata: true,
        local_pilot_subset: true,
        smoke_evidence_packet: true,
      },
      optional_live_github: {
        operator_approved: false,
        allow_live_mutation: false,
        token_set: false,
        required_for_closeout: false,
        mutation_status: 'not_mutated',
      },
      forbidden_automatic_writes: Object.fromEntries(
        FORBIDDEN_LIVE_GITHUB_WRITES.map((action) => [action, false]),
      ),
    })).resolves.toMatchObject({
      ok: true,
      live_github_required: false,
      required_evidence_satisfied_without_live_write: true,
      optional_live_github_status: {
        status: 'skipped',
        mutation_status: 'not_mutated',
        stable_error_code: 'OPTIONAL_LIVE_GITHUB_SKIPPED',
      },
      forbidden_automatic_writes: Object.fromEntries(
        FORBIDDEN_LIVE_GITHUB_WRITES.map((action) => [action, 'not_requested']),
      ),
      evidence_codes: [],
    })
  })

  it('keeps retained FocusEngine and OpenClaw identities out of Product Line B ownership', async () => {
    const smokeModule = await loadSmokeModule()
    const validateRetainedIdentityGuardrail = expectSmokeFunction(smokeModule, 'validateRetainedIdentityGuardrail')

    await expect(validateRetainedIdentityGuardrail({
      run_id: RUN_ID,
      product_line_b: {
        slug: PRODUCT_LINE_B_SLUG,
        logical_agent_prefix: 'plb-platform-',
        assignment_names: ['plb-platform-dev', 'plb-platform-review'],
      },
      retained_inventory: [
        {
          identity: 'FocusEngine',
          source: 'agent_rows',
          status: 'offline',
          explicitly_assigned_to_product_line_b: false,
        },
        {
          identity: 'OpenClaw',
          source: 'runtime_inventory',
          status: 'hidden',
          explicitly_assigned_to_product_line_b: false,
        },
      ],
      takeover_policy: {
        reuse_retained_identity: false,
        automatic_cleanup: false,
        mutate_retained_identity: false,
      },
    })).resolves.toMatchObject({
      ok: true,
      retained_identity_policy: 'inventory_only',
      product_line_b_identity_prefix: 'plb-platform-',
      focusengine_takeover: false,
      openclaw_takeover: false,
      automatic_cleanup: false,
      retained_inventory: [
        { identity: 'FocusEngine', blocking: false, ownership: 'retained_inventory' },
        { identity: 'OpenClaw', blocking: false, ownership: 'retained_inventory' },
      ],
      evidence_codes: [],
    })
  })

  it('records SPEC-014C adapter, runtime-inventory, and dispatch files as avoided', async () => {
    const smokeModule = await loadSmokeModule()
    const validateSpec014CParallelSafetyGuardrail = expectSmokeFunction(
      smokeModule,
      'validateSpec014CParallelSafetyGuardrail',
    )

    await expect(validateSpec014CParallelSafetyGuardrail({
      run_id: RUN_ID,
      active_parallel_spec: 'SPEC-014C',
      files_avoided: [...SPEC_014C_OWNED_PATHS],
      adapter_file_ownership_taken: false,
      runtime_inventory_file_ownership_taken: false,
      dispatch_file_ownership_taken: false,
      harness_manifest_ids: [{
        manifest_id: 'paddock_owned_sandbox_fake',
        role: 'selected_substrate_evidence_only',
        used_as_product_line_b_agent_identity: false,
      }],
    })).resolves.toMatchObject({
      ok: true,
      active_spec_014c_noted: true,
      files_avoided: [...SPEC_014C_OWNED_PATHS],
      adapter_file_ownership_taken: false,
      runtime_inventory_file_ownership_taken: false,
      dispatch_file_ownership_taken: false,
      harness_manifest_ids_used_as_agent_identity: false,
      evidence_codes: [],
    })
  })

  it('treats runtime-inventory eligible as optional supporting evidence only', async () => {
    const smokeModule = await loadSmokeModule()
    const validateRuntimeInventoryOptionalGuardrail = expectSmokeFunction(
      smokeModule,
      'validateRuntimeInventoryOptionalGuardrail',
    )

    await expect(validateRuntimeInventoryOptionalGuardrail({
      run_id: RUN_ID,
      runtime_inventory: {
        status: 'skipped',
        reason: 'active_spec_014c_file_overlap',
        observed_states: ['visible', 'assigned'],
        required_state: null,
        closeout_requires_eligible: false,
        adapter_or_runtime_file_edit_required: false,
      },
      smoke_closeout: {
        required_runtime_inventory_state: null,
        accepts_skipped_supporting_evidence: true,
        product_line_b_smoke_eligible_count: 0,
      },
    })).resolves.toMatchObject({
      ok: true,
      runtime_inventory_required: false,
      runtime_inventory_evidence_status: 'skipped',
      closeout_requires_eligible: false,
      accepted_runtime_inventory_states: ['visible', 'unassigned', 'assigned', 'blocked', 'eligible'],
      adapter_or_runtime_file_edit_required: false,
      evidence_codes: [],
    })
  })

  it('requires Product Line B to finish disabled with no remaining smoke work', async () => {
    const smokeModule = await loadSmokeModule()
    const validateFinalProductLineBDisabledState = expectSmokeFunction(smokeModule, 'validateFinalProductLineBDisabledState')

    await expect(validateFinalProductLineBDisabledState({
      run_id: RUN_ID,
      product_line_b: {
        workspace_id: PRODUCT_LINE_B_WORKSPACE_ID,
        slug: PRODUCT_LINE_B_SLUG,
        disabled_at: '2026-06-05T12:30:00.000Z',
        feature_flags: Object.fromEntries(SMOKE_OWNED_FLAGS.map((flag) => [flag, false])),
      },
      cleanup_counters: {
        github_sync_enabled_projects: 0,
        repo_sync_owner_projects: 0,
        assigned_dispatch_eligible_tasks: 0,
        remaining_eligible_smoke_work: 0,
        unintended_side_effect_rows: 0,
      },
      switcher: {
        after_final_disablement: [PRODUCT_LINE_A_SLUG],
        include_disabled_preview_mode_added: false,
      },
      seed_verify: {
        config_path: 'docs/ai/product-lines/product-line-b.yaml',
        status: 'verified',
        mutation_status: 'not_mutated',
      },
    })).resolves.toMatchObject({
      ok: true,
      product_line_slug: PRODUCT_LINE_B_SLUG,
      disabled_at_non_null: true,
      smoke_owned_flags_absent_or_false: [...SMOKE_OWNED_FLAGS],
      cleanup_counters: {
        github_sync_enabled_projects: 0,
        repo_sync_owner_projects: 0,
        assigned_dispatch_eligible_tasks: 0,
        remaining_eligible_smoke_work: 0,
        unintended_side_effect_rows: 0,
      },
      product_line_b_switcher_absent_after_disable: true,
      seed_verify_status: 'verified',
      evidence_codes: [],
    })
  })
})
