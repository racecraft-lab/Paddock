import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { stringify as stringifyYaml } from 'yaml'

const productLineSeedFiles = [
  'docs/ai/product-lines',
  'src/lib/product-line-seed/types.ts',
  'src/lib/product-line-seed/schema.ts',
  'src/lib/product-line-seed/config.ts',
  'src/lib/product-line-seed/evidence.ts',
  'src/lib/product-line-seed/preflight.ts',
  'src/lib/product-line-seed/seed.ts',
  'scripts/seed-product-line.ts',
] as const

const productLineSeedDocs = [
  'docs/runbooks/product-line-seed.md',
  'docs/runbooks/paddock-seed-predeploy.md',
  'docs/ai/specs/SPEC-010A-workflow.md',
] as const

const staticScopeGuardSources = [
  'docs/ai/product-lines/paddock.yaml',
  'scripts/seed-product-line.ts',
  'scripts/seed-paddock-product-line.ts',
  'src/lib/product-line-seed/types.ts',
  'src/lib/product-line-seed/schema.ts',
  'src/lib/product-line-seed/config.ts',
  'src/lib/product-line-seed/evidence.ts',
  'src/lib/product-line-seed/preflight.ts',
  'src/lib/product-line-seed/seed.ts',
  'src/lib/__tests__/product-line-seed.test.ts',
  'src/lib/__tests__/product-line-seed-cli.test.ts',
] as const

const specStrictFiles = [
  'src/lib/product-line-seed/types.ts',
  'src/lib/product-line-seed/schema.ts',
  'src/lib/product-line-seed/config.ts',
  'src/lib/product-line-seed/evidence.ts',
  'src/lib/product-line-seed/preflight.ts',
  'src/lib/product-line-seed/seed.ts',
  'scripts/seed-product-line.ts',
  'scripts/seed-paddock-product-line.ts',
  'src/lib/__tests__/product-line-seed.test.ts',
  'src/lib/__tests__/product-line-seed-cli.test.ts',
] as const

const expectedConfigOwnedSurfaces = [
  'workspace_identity',
  'department_projects',
  'agent_assignments',
  'workflow_contract_templates',
  'feature_flags',
  'governance_defaults',
] as const

const expectedPreservedSurfaces = [
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

export function makeProductLineSeedTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      feature_flags TEXT,
      created_at INTEGER NOT NULL DEFAULT 100,
      updated_at INTEGER NOT NULL DEFAULT 100
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      ticket_prefix TEXT NOT NULL,
      ticket_counter INTEGER NOT NULL DEFAULT 0,
      area_slug TEXT,
      github_repo TEXT,
      github_sync_enabled INTEGER NOT NULL DEFAULT 0,
      is_triage_project INTEGER NOT NULL DEFAULT 0,
      is_repo_sync_owner INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 100,
      updated_at INTEGER NOT NULL DEFAULT 100,
      UNIQUE(workspace_id, slug)
    );
    CREATE TABLE project_agent_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      agent_name TEXT NOT NULL,
      role TEXT NOT NULL,
      assigned_at INTEGER NOT NULL DEFAULT 100,
      UNIQUE(project_id, agent_name)
    );
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      slug TEXT,
      name TEXT NOT NULL,
      description TEXT,
      model TEXT NOT NULL DEFAULT 'sonnet',
      task_prompt TEXT NOT NULL DEFAULT '',
      timeout_seconds INTEGER NOT NULL DEFAULT 300,
      agent_role TEXT,
      tags TEXT,
      output_schema TEXT,
      routing_rules TEXT,
      next_template_slug TEXT,
      produces_pr INTEGER NOT NULL DEFAULT 0,
      external_terminal_event TEXT,
      allow_redacted_artifacts INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT 'system',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT 100,
      updated_at INTEGER NOT NULL DEFAULT 100,
      last_used_at INTEGER,
      use_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX idx_workflow_templates_workspace_slug
      ON workflow_templates(workspace_id, slug)
      WHERE slug IS NOT NULL;
    CREATE TABLE workflow_contract_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      mutation_status TEXT NOT NULL,
      source_path TEXT,
      export_path TEXT,
      contract_hash TEXT,
      routing_hashes_json TEXT,
      output_schema_hashes_json TEXT,
      diff_json TEXT NOT NULL DEFAULT '{}',
      template_counts_json TEXT NOT NULL DEFAULT '{}',
      error_count INTEGER NOT NULL DEFAULT 0,
      lkg_snapshot_id INTEGER,
      recovery_command TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );
    CREATE TABLE workflow_contract_run_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES workflow_contract_runs(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      manifest_path TEXT,
      canonical_model_path TEXT,
      template_slug TEXT,
      message TEXT NOT NULL,
      remediation_hint TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE workflow_contract_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      contract_hash TEXT NOT NULL,
      canonical_json TEXT NOT NULL,
      runtime_templates_json TEXT NOT NULL,
      recovery_command TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE resource_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER,
      notes TEXT,
      policy_type TEXT NOT NULL,
      limit_kind TEXT NOT NULL,
      limit_value REAL,
      period TEXT,
      timezone TEXT,
      enforcement TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      default_template INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00Z',
      updated_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00Z'
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      project_id INTEGER,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'inbox',
      github_repo TEXT,
      github_issue_number INTEGER,
      github_synced_at INTEGER,
      github_branch TEXT,
      github_pr_number INTEGER,
      github_pr_state TEXT,
      parent_task_id INTEGER,
      root_task_id INTEGER,
      chain_id TEXT,
      chain_stage INTEGER,
      dispatch_attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 100
    );
    CREATE TABLE issues (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, external_id TEXT);
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, action TEXT);
    CREATE TABLE task_histories (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, status TEXT);
    CREATE TABLE task_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, body TEXT);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, message TEXT);
    CREATE TABLE task_dispositions (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, outcome TEXT);
    CREATE TABLE task_artifacts (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, artifact_type TEXT, uri TEXT);
    CREATE TABLE quality_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, reviewer TEXT);
    CREATE TABLE github_sync_state (id INTEGER PRIMARY KEY AUTOINCREMENT, repo TEXT, cursor TEXT);
    CREATE TABLE resource_policy_events (id INTEGER PRIMARY KEY AUTOINCREMENT, policy_id INTEGER, action TEXT);
  `)
  db.prepare("INSERT INTO workspaces (id, slug, name, feature_flags) VALUES (1, 'facility', 'Facility', '{\"UNRELATED_FLAG\":true}')").run()
  db.prepare("INSERT INTO projects (id, workspace_id, slug, name, ticket_prefix, ticket_counter) VALUES (1, 1, 'manual', 'Manual', 'MAN', 7)").run()
  db.prepare("INSERT INTO workflow_templates (id, workspace_id, slug, name, created_by, use_count) VALUES (1, 1, 'manual-template', 'Manual Template', 'operator', 3)").run()
  db.prepare("INSERT INTO tasks (id, workspace_id, project_id, title, status, github_repo, github_issue_number, parent_task_id, root_task_id, chain_id) VALUES (1, 1, 1, 'Preserved issue', 'in_progress', 'racecraft-lab/Paddock', 42, 9, 9, 'chain-a')").run()
  db.prepare("INSERT INTO issues (task_id, external_id) VALUES (1, 'issue-42')").run()
  db.prepare("INSERT INTO activities (task_id, action) VALUES (1, 'created')").run()
  db.prepare("INSERT INTO task_histories (task_id, status) VALUES (1, 'in_progress')").run()
  db.prepare("INSERT INTO task_comments (task_id, body) VALUES (1, 'operator note')").run()
  db.prepare("INSERT INTO notifications (task_id, message) VALUES (1, 'notify')").run()
  db.prepare("INSERT INTO task_dispositions (task_id, outcome) VALUES (1, 'needs-human')").run()
  db.prepare("INSERT INTO task_artifacts (task_id, artifact_type, uri) VALUES (1, 'log', 'redacted://artifact')").run()
  db.prepare("INSERT INTO quality_reviews (task_id, reviewer) VALUES (1, 'aegis')").run()
  db.prepare("INSERT INTO github_sync_state (repo, cursor) VALUES ('racecraft-lab/Paddock', 'cursor-1')").run()
  db.prepare("INSERT INTO resource_policy_events (policy_id, action) VALUES (1, 'observed')").run()
  return db
}

export function invalidYamlFixture(body = 'schema_version: product-line-seed-v1\nproduct_line: ['): string {
  return body
}

export function parsedConfigFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 'product-line-seed-v1',
    product_line: { slug: 'paddock', display_name: 'Paddock', agent_prefix: 'paddock-platform' },
    github: { owner: 'racecraft-lab', repo: 'Paddock', full_name: 'racecraft-lab/Paddock' },
    workflow_contract: {
      family: 'paddock',
      path: 'docs/ai/workflows/paddock/workflow-contract.yaml',
      required_slugs: ['paddock_issue_triage'],
    },
    departments: [],
    agent_assignments: { product_line_assignments: [] },
    feature_flags: { enabled: [], disabled_or_absent: [] },
    governance_defaults: [],
    safety_policy: {
      existing_target: 'refuse_unless_allow_existing',
      config_owned_surfaces: [...expectedConfigOwnedSurfaces],
      preserved_surfaces: [...expectedPreservedSurfaces],
      blocked_side_effects: ['github_mutation', 'dispatch'],
      allow_first_intake_blocking_governance: false,
    },
    ...overrides,
  }
}

export function targetResidueFixture(): Record<string, unknown> {
  return {
    kind: 'project_github_sync',
    repo: 'other-owner/other-repo',
    count: 1,
    project_ids: [1],
  }
}

export function preservedOperationalStateFixture(): Record<string, unknown> {
  return {
    task: { count: 1 },
    task_evidence_read_model_state: { count: 1 },
    issue: { count: 1 },
    activity: { count: 1 },
    manual_workflow_template: { count: 1 },
    non_owned_feature_flags: { count: 1 },
  }
}

export const staticScopeGuardTerms = [
  'Product Line B',
  'product-line-b',
  'focusengine',
  'github mutation',
  'dispatch',
  'claim',
  'runner',
  'sandbox',
  'adapter',
  'auto-merge',
  'speckit-setup',
  'speckit-autopilot',
] as const

const staticScopeGuardPattern =
  /Product Line B|product-line-b|focusengine|createTask\(|INSERT INTO tasks|gh issue|github.*(create|comment|close|label)|live enablement|smoke evidence|task creation|dispatch|claim|runner|sandbox|harness adapter|auto.?merge|speckit-setup|speckit-autopilot/i

export function assertNoProductLineSeedScopeDrift(sourceName: string, content: string): void {
  const matches = staticScopeGuardTerms.filter((term) => content.toLowerCase().includes(term.toLowerCase()))
  expect(matches, `${sourceName} contains out-of-scope terms: ${matches.join(', ')}`).toEqual([])
}

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

function matchingLines(path: string, pattern: RegExp): string[] {
  return source(path)
    .split('\n')
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(({ line }) => pattern.test(line))
    .map(({ line, index }) => `${path}:${String(index)}:${line.trim()}`)
}

function isNegativeStaticGuardMatch(match: string): boolean {
  return /\b(no|not|without|exclusion|excluded|blocked|block|guard|negative|forbid|forbidden|does not|must not|never|free of|out-of-scope|scope)\b/i.test(match)
    || /blocked_side_effects|disabled_or_absent|FEATURE_AGENT_RUNNER_SANDBOXES|FEATURE_TASK_CONTROL_PLANE|FEATURE_AUTO_MERGE/i.test(match)
    || /paddock\.yaml:\d+:- (dispatch|claim|runner|sandbox|auto_merge)$/i.test(match)
    || /types\.ts:\d+:'(dispatch|claim|runner|sandbox|auto_merge)'/i.test(match)
    || /dispatch_attempts|github_sync_state|is_repo_sync_owner|enforcement:.*block_dispatch|block_dispatch|SELECT .* FROM tasks|INSERT INTO tasks .*Preserved issue/i.test(match)
    || /product-line-seed\.test\.ts:\d+:'(Product Line B|product-line-b|focusengine|dispatch|claim|runner|sandbox|auto-merge|speckit-setup|speckit-autopilot)'/i.test(match)
    || /product-line-seed\.test\.ts:\d+:\/Product Line B\|product-line-b\|focusengine/i.test(match)
    || /staticScopeGuard|static-scope guard helper|staticScopeGuardPattern|This would authorize Product Line B dispatch|toThrow\(|test\(match\)/i.test(match)
    || /rg -n "Product Line B\|product-line-b\|focusengine/i.test(match)
    || /non-dispatch safety boundaries/i.test(match)
}

function writeSeedConfigFixture(config: Record<string, unknown>, name = 'product-line-seed.yaml'): string {
  const dir = mkdtempSync(join(tmpdir(), 'product-line-seed-us4-'))
  const path = join(dir, name)
  writeFileSync(path, stringifyYaml(config))
  return path
}

function expectNoMutationProof(result: Record<string, unknown>): void {
  const snapshotBefore = result['snapshot_before'] as Record<string, unknown>
  const snapshotAfter = result['snapshot_after'] as Record<string, unknown>
  const evidence = result['evidence'] as Record<string, unknown>

  expect(snapshotBefore).toBeTruthy()
  expect(snapshotAfter).toBeTruthy()
  expect(snapshotAfter).toEqual(snapshotBefore)
  expect(evidence['no_mutation_proof']).toEqual({
    compared: true,
    passed: true,
    before_hash: snapshotBefore['hash'],
    after_hash: snapshotAfter['hash'],
  })
}

async function importTypeModule(): Promise<Record<string, unknown>> {
  const path = 'src/lib/product-line-seed/types.ts'
  expect(existsSync(path)).toBe(true)
  return import(pathToFileURL(`${process.cwd()}/${path}`).href) as Promise<Record<string, unknown>>
}

async function importEvidenceModule(): Promise<Record<string, unknown>> {
  const path = 'src/lib/product-line-seed/evidence.ts'
  expect(existsSync(path)).toBe(true)
  return import(pathToFileURL(`${process.cwd()}/${path}`).href) as Promise<Record<string, unknown>>
}

async function importSchemaModule(): Promise<Record<string, unknown>> {
  const path = 'src/lib/product-line-seed/schema.ts'
  expect(existsSync(path)).toBe(true)
  return import(pathToFileURL(`${process.cwd()}/${path}`).href) as Promise<Record<string, unknown>>
}

async function importConfigModule(): Promise<Record<string, unknown>> {
  const path = 'src/lib/product-line-seed/config.ts'
  expect(existsSync(path)).toBe(true)
  return import(pathToFileURL(`${process.cwd()}/${path}`).href) as Promise<Record<string, unknown>>
}

async function importSeedModule(): Promise<Record<string, unknown>> {
  const path = 'src/lib/product-line-seed/seed.ts'
  expect(existsSync(path)).toBe(true)
  return import(pathToFileURL(`${process.cwd()}/${path}`).href) as Promise<Record<string, unknown>>
}

describe('generic product-line seed foundation', () => {
  it('creates the setup files and registers them in strict TypeScript and ESLint scopes', () => {
    expect(productLineSeedFiles.filter((path) => !existsSync(path))).toEqual([])
    const tsconfig = source('tsconfig.spec-strict.json')
    const eslintConfig = source('eslint.config.mjs')

    for (const file of specStrictFiles) {
      expect(tsconfig).toContain(file)
      expect(eslintConfig).toContain(file)
    }
  })

  it('exposes generic config/result/snapshot/mutation/residue constants and Paddock seed defaults', async () => {
    const types = await importTypeModule()

    expect(types['PRODUCT_LINE_SEED_SCHEMA_VERSION']).toBe('product-line-seed-v1')
    expect(types['PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION']).toBe('product-line-seed-result-v1')
    expect(types['PRODUCT_LINE_SEED_SNAPSHOT_SCHEMA_VERSION']).toBe('product-line-seed-snapshot-v1')
    expect(types['PRODUCT_LINE_SEED_HASH_PREFIX']).toBe('product-line-seed-snapshot-v1:sha256:')
    expect(types['PRODUCT_LINE_SEED_MODES']).toEqual(['preflight', 'apply', 'verify'])
    expect(types['MUTATION_STATUSES']).toEqual(['not_mutated', 'applied', 'verified'])
    expect(types['CONFIG_OWNED_SURFACES']).toEqual([...expectedConfigOwnedSurfaces])
    expect(types['FR020_PRESERVED_SURFACES']).toEqual([...expectedPreservedSurfaces])
    expect(types['PADDOCK_SEED_DEFAULTS']).toMatchObject({
      productLineSlug: 'paddock',
      displayName: 'Paddock',
      agentPrefix: 'paddock-platform',
      githubFullName: 'racecraft-lab/Paddock',
      workflowFamily: 'paddock',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      workflowContractPath: 'docs/ai/workflows/paddock/workflow-contract.yaml',
    })
  })

  it('hashes redaction-safe ordered JSON snapshots deterministically', async () => {
    const evidence = await importEvidenceModule()
    const orderedJsonStringify = evidence['orderedJsonStringify']
    const hashProductLineSeedSnapshot = evidence['hashProductLineSeedSnapshot']
    const assertRedactionSafeSnapshotInput = evidence['assertRedactionSafeSnapshotInput']
    expect(typeof orderedJsonStringify).toBe('function')
    expect(typeof hashProductLineSeedSnapshot).toBe('function')
    expect(typeof assertRedactionSafeSnapshotInput).toBe('function')

    expect((orderedJsonStringify as (value: unknown) => string)({ b: 1, a: { d: 4, c: 3 } }))
      .toBe('{"a":{"c":3,"d":4},"b":1}')
    const first = (hashProductLineSeedSnapshot as (value: unknown) => string)({ b: 1, a: 2 })
    const second = (hashProductLineSeedSnapshot as (value: unknown) => string)({ a: 2, b: 1 })
    expect(first).toBe(second)
    expect(first).toMatch(/^product-line-seed-snapshot-v1:sha256:[a-f0-9]{64}$/)
    expect(() => {
      (assertRedactionSafeSnapshotInput as (value: unknown) => void)({ raw_operator_evidence: 'do-not-hash' })
    }).toThrow(/raw_operator_evidence/)
  })

  it('provides a disposable SQLite harness with config-owned and FR-020 preserved surfaces', async () => {
    const types = await importTypeModule()
    const db = makeProductLineSeedTestDb()

    expect(types['CONFIG_OWNED_SURFACES']).toEqual([...expectedConfigOwnedSurfaces])
    expect(types['FR020_PRESERVED_SURFACES']).toEqual([...expectedPreservedSurfaces])
    expect(db.prepare('SELECT COUNT(*) as count FROM workspaces').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) as count FROM projects').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) as count FROM project_agent_assignments').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_templates WHERE created_by <> ?').get('workflow-contract')).toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) as count FROM tasks').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) as count FROM task_artifacts').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT feature_flags FROM workspaces WHERE slug = ?').get('facility')).toEqual({
      feature_flags: '{"UNRELATED_FLAG":true}',
    })
    db.close()
  })

  it('provides invalid config, residue, preserved-state, and static-scope guard helpers for later RED tests', () => {
    expect(invalidYamlFixture()).toContain('product_line: [')
    expect(parsedConfigFixture()).toMatchObject({
      schema_version: 'product-line-seed-v1',
      product_line: { slug: 'paddock' },
    })
    expect(targetResidueFixture()).toMatchObject({ kind: 'project_github_sync', count: 1 })
    expect(preservedOperationalStateFixture()).toMatchObject({ task: { count: 1 } })

    assertNoProductLineSeedScopeDrift('clean-fixture', 'Paddock seed config only validates reviewed YAML state.')
    expect(() => {
      assertNoProductLineSeedScopeDrift('dirty-fixture', 'This would authorize Product Line B dispatch.')
    }).toThrow(/Product Line B/)
  })
})

describe('product-line seed config review validation', () => {
  it('defines a closed JSON-schema surface for the required top-level sections', async () => {
    const schema = await importSchemaModule()

    expect(schema['PRODUCT_LINE_SEED_REQUIRED_TOP_LEVEL_SECTIONS']).toEqual([
      'schema_version',
      'product_line',
      'github',
      'workflow_contract',
      'departments',
      'agent_assignments',
      'feature_flags',
      'governance_defaults',
      'safety_policy',
    ])
    expect(schema['PRODUCT_LINE_SEED_CONFIG_JSON_SCHEMA']).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: schema['PRODUCT_LINE_SEED_REQUIRED_TOP_LEVEL_SECTIONS'],
      properties: {
        schema_version: { const: 'product-line-seed-v1' },
        product_line: { type: 'object', additionalProperties: false },
        github: { type: 'object', additionalProperties: false },
        workflow_contract: { type: 'object', additionalProperties: false },
        departments: { type: 'array' },
        agent_assignments: { type: 'object', additionalProperties: false },
        feature_flags: { type: 'object', additionalProperties: false },
        governance_defaults: { type: 'array' },
        safety_policy: { type: 'object', additionalProperties: false },
      },
    })
  })

  it('reports missing required sections, bad schema marker, unknown top-level fields, and duplicate declarations', async () => {
    const config = await importConfigModule()
    const validate = config['validateProductLineSeedConfig'] as (value: unknown) => { code: string, path: string, message: string }[]

    const missingAndUnknown = validate({
      schema_version: 'wrong-version',
      product_line: { slug: 'paddock', display_name: 'Paddock', agent_prefix: 'paddock-platform' },
      github: { owner: 'racecraft-lab', repo: 'Paddock', full_name: 'racecraft-lab/Paddock' },
      workflow_contract: {
        family: 'paddock',
        path: 'docs/ai/workflows/paddock/workflow-contract.yaml',
        required_slugs: ['paddock_issue_triage'],
      },
      departments: [],
      feature_flags: { enabled: [], disabled_or_absent: [] },
      governance_defaults: [],
      safety_policy: {
        existing_target: 'refuse_unless_allow_existing',
        allow_first_intake_blocking_governance: false,
        config_owned_surfaces: [...expectedConfigOwnedSurfaces],
        preserved_surfaces: [...expectedPreservedSurfaces],
        blocked_side_effects: ['github_mutation'],
      },
      out_of_contract: true,
    })

    expect(missingAndUnknown).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CONFIG_SCHEMA_INVALID', path: '$.schema_version' }),
      expect.objectContaining({ code: 'CONFIG_SCHEMA_INVALID', path: '$.agent_assignments' }),
      expect.objectContaining({ code: 'CONFIG_SCHEMA_INVALID', path: '$.out_of_contract' }),
    ]))

    const duplicates = validate(parsedConfigFixture({
      departments: [
        { slug: 'qa', name: 'QA', ticket_prefix: 'QA', area_slug: 'qa', github_repo: 'racecraft-lab/Paddock', github_sync_enabled: true, is_triage_project: true, is_repo_sync_owner: true },
        { slug: 'qa', name: 'Duplicate QA', ticket_prefix: 'QA2', area_slug: 'qa-2', github_repo: null, github_sync_enabled: false, is_triage_project: false, is_repo_sync_owner: false },
      ],
      agent_assignments: {
        product_line_assignments: [
          { agent_key: 'qa', role: 'qa', department_slug: 'qa' },
          { agent_key: 'qa', role: 'qa-review', department_slug: 'qa' },
        ],
      },
      feature_flags: {
        enabled: ['FEATURE_WORKSPACE_SWITCHER', 'FEATURE_WORKSPACE_SWITCHER', 'FEATURE_GLOBAL_AEGIS'],
        disabled_or_absent: ['FEATURE_GLOBAL_AEGIS'],
      },
      governance_defaults: [
        { identity: 'daily-budget', policy_type: 'budget', limit_kind: 'usd', limit_value: 10, period: 'day', timezone: 'America/Chicago', enforcement: 'alert', enabled: true, default_template: false },
        { identity: 'daily-budget', policy_type: 'budget', limit_kind: 'token', limit_value: 1000, period: 'day', timezone: 'America/Chicago', enforcement: 'alert', enabled: true, default_template: false },
      ],
    }))

    expect(duplicates).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.departments[1].slug' }),
      expect.objectContaining({ path: '$.agent_assignments.product_line_assignments[1].agent_key' }),
      expect.objectContaining({ path: '$.feature_flags.enabled[1]' }),
      expect.objectContaining({ path: '$.feature_flags.disabled_or_absent[0]' }),
      expect.objectContaining({ path: '$.governance_defaults[1].identity' }),
    ]))
  })

  it.each([
    ['custom tags', 'schema_version: !unsafe product-line-seed-v1\n'],
    ['anchors', 'schema_version: &version product-line-seed-v1\nproduct_line: *version\n'],
    ['aliases', 'schema_version: product-line-seed-v1\nproduct_line: *missing\n'],
    ['merge keys', 'base: &base\n  schema_version: product-line-seed-v1\n<<: *base\n'],
    ['multi-document streams', 'schema_version: product-line-seed-v1\n---\nschema_version: product-line-seed-v1\n'],
    ['executable tags', 'schema_version: !!js/function >\n  function () { return process.env; }\n'],
    ['remote references', 'schema_version: product-line-seed-v1\n$ref: https://example.invalid/product-line.yaml\n'],
  ])('rejects unsafe YAML %s before semantic validation', async (_label, yaml) => {
    const config = await importConfigModule()
    const classify = config['classifyUnsafeProductLineSeedYamlSyntax'] as (source: string, path?: string) => { code: string, path: string, message: string }[]
    const load = config['loadProductLineSeedConfigFromString'] as (source: string, path?: string) => unknown

    expect(classify(yaml, 'unsafe.yaml')).toEqual([
      expect.objectContaining({ code: 'CONFIG_UNSAFE_YAML_SYNTAX', path: 'unsafe.yaml' }),
    ])
    expect(() => load(yaml, 'unsafe.yaml')).toThrow(/CONFIG_UNSAFE_YAML_SYNTAX/)
  })

  it('loads the canonical Paddock config with reviewed identity, ownership, routing, flags, governance, and safety policy', async () => {
    const types = await importTypeModule()
    const config = await importConfigModule()
    const load = config['loadProductLineSeedConfigFromFile'] as (path: string) => Record<string, unknown>
    const validate = config['validateProductLineSeedConfig'] as (value: unknown) => { code: string, path: string, message: string }[]

    const canonical = load('docs/ai/product-lines/paddock.yaml')

    expect(validate(canonical)).toEqual([])
    expect(canonical).toMatchObject({
      schema_version: 'product-line-seed-v1',
      product_line: {
        slug: 'paddock',
        display_name: 'Paddock',
        agent_prefix: 'paddock-platform',
      },
      github: {
        owner: 'racecraft-lab',
        repo: 'Paddock',
        full_name: 'racecraft-lab/Paddock',
      },
      workflow_contract: {
        family: 'paddock',
        path: 'docs/ai/workflows/paddock/workflow-contract.yaml',
        required_slugs: types['PADDOCK_REQUIRED_WORKFLOW_SLUGS'],
      },
      feature_flags: {
        enabled: types['PADDOCK_ENABLED_FLAGS'],
        disabled_or_absent: types['PADDOCK_DISABLED_OR_ABSENT_FLAGS'],
      },
      governance_defaults: types['PADDOCK_GOVERNANCE_DEFAULTS'],
      safety_policy: {
        existing_target: 'refuse_unless_allow_existing',
        allow_first_intake_blocking_governance: false,
        config_owned_surfaces: types['CONFIG_OWNED_SURFACES'],
        preserved_surfaces: types['FR020_PRESERVED_SURFACES'],
        blocked_side_effects: types['BLOCKED_SIDE_EFFECTS'],
      },
    })
    expect(canonical['departments']).toEqual(types['PADDOCK_DEPARTMENTS'])
    expect(canonical['agent_assignments']).toEqual({
      product_line_assignments: types['PADDOCK_ROLE_ASSIGNMENTS'],
    })
  })

  it('keeps the canonical config free of Product Line B config and runtime authorization surfaces', async () => {
    const types = await importTypeModule()
    const configSource = source('docs/ai/product-lines/paddock.yaml')
    const config = await importConfigModule()
    const load = config['loadProductLineSeedConfigFromFile'] as (path: string) => Record<string, unknown>
    const canonical = load('docs/ai/product-lines/paddock.yaml')

    expect(configSource).not.toMatch(/Product Line B|product-line-b|focusengine/i)
    expect(configSource).not.toMatch(/(authorize|enable|launch|start|create|mutate|claim|merge)[^\n]*(github|dispatch|task|runner|sandbox|adapter|auto.?merge|speckit)/i)
    expect((canonical['safety_policy'] as { blocked_side_effects: unknown[] }).blocked_side_effects)
      .toEqual(types['BLOCKED_SIDE_EFFECTS'])
  })
})

describe('product-line seed generic preflight/apply/verify', () => {
  it('preflights identity, ownership, workflow, flags, assignments, governance, and target residue without writes', async () => {
    const seed = await importSeedModule()
    const run = seed['runProductLineSeed'] as (options: Record<string, unknown>) => Record<string, unknown>
    const db = makeProductLineSeedTestDb()
    const before = db.prepare('SELECT COUNT(*) as count FROM workspaces').get()

    const result = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'preflight',
      json: true,
      allowExisting: false,
    })

    expect(result).toMatchObject({
      ok: true,
      status: 'ready',
      code: 'READY',
      mutation_status: 'not_mutated',
      exit_code: 0,
      config: { schema_version: 'product-line-seed-v1', product_line_slug: 'paddock' },
      target: { product_line_slug: 'paddock', existing_target: false },
      redaction: { raw_secret_values_emitted: false },
    })
    expect(result['evidence']).toMatchObject({
      validation: {
        identity: 'safe',
        github_ownership: 'safe',
        workflow_contract: 'safe',
        required_slugs: 'safe',
        feature_flags: 'safe',
        assignments: 'safe',
        governance_defaults: 'safe',
        target_residue: 'safe',
      },
      residue: [],
      cleanup_policy: 'detection_only_no_automatic_deletion_or_unlinking',
    })
    expect(db.prepare('SELECT COUNT(*) as count FROM workspaces').get()).toEqual(before)
    db.close()
  })

  it('applies an empty safe target by creating only config-owned seed surfaces', async () => {
    const seed = await importSeedModule()
    const run = seed['runProductLineSeed'] as (options: Record<string, unknown>) => Record<string, unknown>
    const db = makeProductLineSeedTestDb()

    const result = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'apply',
      json: true,
      allowExisting: false,
    })

    expect(result).toMatchObject({ ok: true, status: 'seeded', code: 'SEEDED', mutation_status: 'applied', exit_code: 0 })
    expect(db.prepare("SELECT name, feature_flags FROM workspaces WHERE slug = 'paddock'").get()).toMatchObject({
      name: 'Paddock',
    })
    expect(db.prepare("SELECT COUNT(*) as count FROM projects WHERE workspace_id = (SELECT id FROM workspaces WHERE slug = 'paddock')").get())
      .toEqual({ count: 6 })
    expect(db.prepare('SELECT COUNT(*) as count FROM project_agent_assignments').get()).toEqual({ count: 6 })
    expect(db.prepare("SELECT COUNT(*) as count FROM workflow_templates WHERE created_by = 'workflow-contract' AND enabled = 1").get())
      .toEqual({ count: 9 })
    expect(db.prepare("SELECT COUNT(*) as count FROM resource_policies WHERE notes LIKE 'SPEC-009B:paddock:%'").get())
      .toEqual({ count: 3 })
    expect(db.prepare("SELECT json_extract(feature_flags, '$.FEATURE_WORKSPACE_SWITCHER') as enabled FROM workspaces WHERE slug = 'paddock'").get())
      .toEqual({ enabled: 1 })
    db.close()
  })

  it('verifies matching targets read-only and reports drift with exit code 4', async () => {
    const seed = await importSeedModule()
    const run = seed['runProductLineSeed'] as (options: Record<string, unknown>) => Record<string, unknown>
    const db = makeProductLineSeedTestDb()
    run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'apply',
      json: true,
      allowExisting: false,
    })
    const beforeVerify = db.prepare('SELECT COUNT(*) as count FROM workflow_contract_runs').get()

    const verified = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'verify',
      json: true,
      allowExisting: false,
    })
    db.prepare("UPDATE workspaces SET name = 'Drifted' WHERE slug = 'paddock'").run()
    const drifted = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'verify',
      json: true,
      allowExisting: false,
    })

    expect(verified).toMatchObject({ ok: true, status: 'verified', code: 'VERIFIED', mutation_status: 'verified', exit_code: 0 })
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_contract_runs').get()).toEqual(beforeVerify)
    expect(drifted).toMatchObject({
      ok: false,
      status: 'verification_failed',
      code: 'VERIFY_DRIFT_DETECTED',
      mutation_status: 'not_mutated',
      exit_code: 4,
    })
    expect(drifted['errors']).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VERIFY_DRIFT_DETECTED', path: '$.target.workspace_identity.name' }),
    ]))
    db.close()
  })

  it('refuses existing targets without allow-existing and preserves FR-020 state during config-owned updates', async () => {
    const seed = await importSeedModule()
    const run = seed['runProductLineSeed'] as (options: Record<string, unknown>) => Record<string, unknown>
    const db = makeProductLineSeedTestDb()
    run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'apply',
      json: true,
      allowExisting: false,
    })
    const refusalSnapshot = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'apply',
      json: true,
      allowExisting: false,
    })
    const preservedBefore = {
      task: db.prepare('SELECT id, status, github_repo, github_issue_number, parent_task_id, root_task_id, chain_id FROM tasks WHERE id = 1').get(),
      issue: db.prepare('SELECT id, external_id FROM issues WHERE id = 1').get(),
      activity: db.prepare('SELECT id, action FROM activities WHERE id = 1').get(),
      history: db.prepare('SELECT id, status FROM task_histories WHERE id = 1').get(),
      comment: db.prepare('SELECT id, body FROM task_comments WHERE id = 1').get(),
      notification: db.prepare('SELECT id, message FROM notifications WHERE id = 1').get(),
      disposition: db.prepare('SELECT id, outcome FROM task_dispositions WHERE id = 1').get(),
      artifact: db.prepare('SELECT id, artifact_type, uri FROM task_artifacts WHERE id = 1').get(),
      qualityReview: db.prepare('SELECT id, reviewer FROM quality_reviews WHERE id = 1').get(),
      githubSync: db.prepare('SELECT id, repo, cursor FROM github_sync_state WHERE id = 1').get(),
      governanceAudit: db.prepare('SELECT id, policy_id, action FROM resource_policy_events WHERE id = 1').get(),
      manualWorkflow: db.prepare("SELECT id, slug, use_count FROM workflow_templates WHERE slug = 'manual-template'").get(),
      facilityFlags: db.prepare("SELECT feature_flags FROM workspaces WHERE slug = 'facility'").get(),
      manualProject: db.prepare("SELECT id, ticket_counter, created_at FROM projects WHERE slug = 'manual'").get(),
    }
    db.prepare("UPDATE workspaces SET name = 'Needs Update', feature_flags = '{\"UNRELATED_FLAG\":true,\"FEATURE_WORKSPACE_SWITCHER\":false}' WHERE slug = 'paddock'").run()
    db.prepare("UPDATE project_agent_assignments SET role = 'old-role', assigned_at = 123 WHERE agent_name = 'paddock-platform-qa'").run()

    const updated = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'apply',
      json: true,
      allowExisting: true,
    })

    expect(refusalSnapshot).toMatchObject({
      ok: false,
      status: 'existing_target_refused',
      code: 'EXISTING_TARGET_REQUIRES_ALLOW_EXISTING',
      mutation_status: 'not_mutated',
      action_required: '--allow-existing',
      exit_code: 2,
    })
    expect(updated).toMatchObject({ ok: true, status: 'seeded', mutation_status: 'applied' })
    expect(db.prepare("SELECT name, json_extract(feature_flags, '$.UNRELATED_FLAG') as unrelated, json_extract(feature_flags, '$.FEATURE_WORKSPACE_SWITCHER') as switcher FROM workspaces WHERE slug = 'paddock'").get())
      .toEqual({ name: 'Paddock', unrelated: 1, switcher: 1 })
    expect(db.prepare("SELECT role, assigned_at FROM project_agent_assignments WHERE agent_name = 'paddock-platform-qa'").get())
      .toEqual({ role: 'qa', assigned_at: 123 })
    expect({
      task: db.prepare('SELECT id, status, github_repo, github_issue_number, parent_task_id, root_task_id, chain_id FROM tasks WHERE id = 1').get(),
      issue: db.prepare('SELECT id, external_id FROM issues WHERE id = 1').get(),
      activity: db.prepare('SELECT id, action FROM activities WHERE id = 1').get(),
      history: db.prepare('SELECT id, status FROM task_histories WHERE id = 1').get(),
      comment: db.prepare('SELECT id, body FROM task_comments WHERE id = 1').get(),
      notification: db.prepare('SELECT id, message FROM notifications WHERE id = 1').get(),
      disposition: db.prepare('SELECT id, outcome FROM task_dispositions WHERE id = 1').get(),
      artifact: db.prepare('SELECT id, artifact_type, uri FROM task_artifacts WHERE id = 1').get(),
      qualityReview: db.prepare('SELECT id, reviewer FROM quality_reviews WHERE id = 1').get(),
      githubSync: db.prepare('SELECT id, repo, cursor FROM github_sync_state WHERE id = 1').get(),
      governanceAudit: db.prepare('SELECT id, policy_id, action FROM resource_policy_events WHERE id = 1').get(),
      manualWorkflow: db.prepare("SELECT id, slug, use_count FROM workflow_templates WHERE slug = 'manual-template'").get(),
      facilityFlags: db.prepare("SELECT feature_flags FROM workspaces WHERE slug = 'facility'").get(),
      manualProject: db.prepare("SELECT id, ticket_counter, created_at FROM projects WHERE slug = 'manual'").get(),
    }).toEqual(preservedBefore)
    db.close()
  })
})

describe('Paddock product-line seed parity', () => {
  it('matches Paddock identity, ownership, departments, workflows, flags, governance, and non-dispatch safety boundaries', async () => {
    const types = await importTypeModule()
    const config = await importConfigModule()
    const load = config['loadProductLineSeedConfigFromFile'] as (path: string) => Record<string, unknown>
    const canonical = load('docs/ai/product-lines/paddock.yaml')

    expect(canonical).toMatchObject({
      product_line: {
        slug: 'paddock',
        display_name: 'Paddock',
        agent_prefix: 'paddock-platform',
      },
      github: {
        owner: 'racecraft-lab',
        repo: 'Paddock',
        full_name: 'racecraft-lab/Paddock',
      },
      workflow_contract: {
        family: 'paddock',
        path: 'docs/ai/workflows/paddock/workflow-contract.yaml',
        required_slugs: types['PADDOCK_REQUIRED_WORKFLOW_SLUGS'],
      },
      feature_flags: {
        enabled: types['PADDOCK_ENABLED_FLAGS'],
        disabled_or_absent: types['PADDOCK_DISABLED_OR_ABSENT_FLAGS'],
      },
      governance_defaults: types['PADDOCK_GOVERNANCE_DEFAULTS'],
      safety_policy: {
        blocked_side_effects: types['BLOCKED_SIDE_EFFECTS'],
        allow_first_intake_blocking_governance: false,
      },
    })
    expect(canonical['departments']).toEqual(types['PADDOCK_DEPARTMENTS'])
    expect(canonical['agent_assignments']).toEqual({
      product_line_assignments: types['PADDOCK_ROLE_ASSIGNMENTS'],
    })
  })

  it('applies twice with allow-existing without duplicating config-owned records or changing stable hashes', async () => {
    const evidence = await importEvidenceModule()
    const seed = await importSeedModule()
    const summarizeParityEvidence = evidence['summarizeProductLineSeedParityEvidence'] as (value: unknown) => Record<string, unknown>
    const run = seed['runProductLineSeed'] as (options: Record<string, unknown>) => Record<string, unknown>
    const db = makeProductLineSeedTestDb()

    const first = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'apply',
      json: true,
      allowExisting: false,
    })
    const second = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'apply',
      json: true,
      allowExisting: true,
    })

    const workspace = db.prepare("SELECT COUNT(*) as count FROM workspaces WHERE slug = 'paddock'").get()
    const departments = db.prepare("SELECT COUNT(*) as count FROM projects WHERE workspace_id = (SELECT id FROM workspaces WHERE slug = 'paddock')").get()
    const assignments = db.prepare(`
      SELECT COUNT(*) as count
      FROM project_agent_assignments paa
      JOIN projects p ON p.id = paa.project_id
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.slug = 'paddock'
    `).get()
    const workflows = db.prepare(`
      SELECT COUNT(*) as count
      FROM workflow_templates wt
      JOIN workspaces w ON w.id = wt.workspace_id
      WHERE w.slug = 'paddock' AND wt.created_by = 'workflow-contract'
    `).get()
    const governance = db.prepare(`
      SELECT COUNT(*) as count
      FROM resource_policies rp
      JOIN workspaces w ON w.id = rp.workspace_id
      WHERE w.slug = 'paddock' AND rp.notes LIKE 'SPEC-009B:paddock:%'
    `).get()
    const flags = db.prepare("SELECT feature_flags FROM workspaces WHERE slug = 'paddock'").get() as { feature_flags: string }
    const parsedFlags = JSON.parse(flags.feature_flags) as Record<string, boolean>

    expect(first).toMatchObject({
      ok: true,
      entrypoint: 'seed:product-line',
      config: { path: 'docs/ai/product-lines/paddock.yaml' },
      status: 'seeded',
      mutation_status: 'applied',
    })
    expect(second).toMatchObject({
      ok: true,
      entrypoint: 'seed:product-line',
      config: { path: 'docs/ai/product-lines/paddock.yaml' },
      status: 'seeded',
      mutation_status: 'applied',
    })
    expect({ workspace, departments, assignments, workflows, governance }).toEqual({
      workspace: { count: 1 },
      departments: { count: 6 },
      assignments: { count: 6 },
      workflows: { count: 9 },
      governance: { count: 3 },
    })
    expect(Object.keys(parsedFlags).filter((key) => key.startsWith('FEATURE_') || key.startsWith('PILOT_')).sort()).toEqual([
      'FEATURE_AREA_LABEL_ROUTING',
      'FEATURE_DISPOSITION_LOGGING',
      'FEATURE_GLOBAL_AEGIS',
      'FEATURE_OPENCLAW_HEALTH_COSTS',
      'FEATURE_RESOURCE_GOVERNANCE',
      'FEATURE_TASK_ARTIFACTS',
      'FEATURE_TASK_PIPELINES',
      'FEATURE_TWO_STEP_TERMINAL',
      'FEATURE_WORKSPACE_SWITCHER',
      'PILOT_PADDOCK_E2E',
    ])
    expect(second['snapshot_before']).toMatchObject({
      surfaces: {
        workspace_identity: { count: 1 },
        department_projects: { count: 6 },
        agent_assignments: { count: 6 },
        workflow_contract_templates: { count: 9 },
        feature_flags: { count: 1 },
        governance_defaults: { count: 3 },
      },
    })
    expect(second['snapshot_after']).toMatchObject((second['snapshot_before'] as Record<string, unknown>))
    expect((second['snapshot_after'] as { hash: string }).hash).toBe((second['snapshot_before'] as { hash: string }).hash)
    expect(summarizeParityEvidence(second)).toEqual({
      schema_version: 'product-line-seed-result-v1',
      entrypoint: 'seed:product-line',
      mode: 'apply',
      status: 'seeded',
      config_path: 'docs/ai/product-lines/paddock.yaml',
      product_line_slug: 'paddock',
      snapshot_before_hash: (second['snapshot_before'] as { hash: string }).hash,
      snapshot_after_hash: (second['snapshot_after'] as { hash: string }).hash,
      apply_twice_hash_stable: true,
      snapshot_counts: {
        workspace_identity: 1,
        department_projects: 6,
        agent_assignments: 6,
        workflow_contract_templates: 9,
        feature_flags: 1,
        governance_defaults: 3,
      },
    })
    db.close()
  })

  it('snapshots current Paddock operational tables without assuming legacy task_id columns', async () => {
    const evidence = await importEvidenceModule()
    const collectSnapshot = evidence['collectProductLineSeedSnapshot'] as (db: Database.Database) => {
      preserved_operational_state: {
        subsurfaces: Record<string, { count: number; unavailable?: boolean }>
      }
    }
    const db = makeProductLineSeedTestDb()
    db.exec(`
      DROP TABLE activities;
      CREATE TABLE activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        entity_type TEXT,
        entity_id INTEGER,
        actor TEXT,
        description TEXT,
        data TEXT,
        created_at TEXT,
        workspace_id INTEGER
      );
      INSERT INTO activities (type, entity_type, entity_id, actor, description, data, created_at, workspace_id)
      VALUES ('task.created', 'task', 1, 'aegis', 'created task', '{}', '2026-01-01T00:00:00Z', 1);

      DROP TABLE notifications;
      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient TEXT,
        type TEXT,
        title TEXT,
        message TEXT,
        source_type TEXT,
        source_id INTEGER,
        read_at TEXT,
        delivered_at TEXT,
        created_at TEXT,
        workspace_id INTEGER
      );
      INSERT INTO notifications (recipient, type, title, message, source_type, source_id, created_at, workspace_id)
      VALUES ('owner', 'task', 'Task', 'Ready', 'task', 1, '2026-01-01T00:00:00Z', 1);
    `)

    const snapshot = collectSnapshot(db)
    const subsurfaces = snapshot.preserved_operational_state.subsurfaces

    expect(subsurfaces['activities']).toMatchObject({ count: 1 })
    expect(subsurfaces['activities']?.unavailable).toBeUndefined()
    expect(subsurfaces['notifications']).toMatchObject({ count: 1 })
    expect(subsurfaces['notifications']?.unavailable).toBeUndefined()
    db.close()
  })
})

describe('product-line seed fail-closed validation', () => {
  it('maps identity, GitHub ownership, unsupported fields, invalid types, duplicate declarations, and conflicts to stable field codes', async () => {
    const config = await importConfigModule()
    const validate = config['validateProductLineSeedConfig'] as (value: unknown) => { code: string, path: string, message: string }[]

    const errors = validate(parsedConfigFixture({
      product_line: { display_name: 42, agent_prefix: 'Paddock Platform' },
      github: { owner: 'racecraft-lab', repo: 42, full_name: 'racecraft-lab/not-paddock', unsupported: true },
      departments: [
        { slug: 'qa', name: 'QA', ticket_prefix: 'QA', area_slug: 'qa', github_repo: 'racecraft-lab/Paddock', github_sync_enabled: true, is_triage_project: true, is_repo_sync_owner: true },
        { slug: 'qa', name: 'Duplicate QA', ticket_prefix: 'QA', area_slug: 'qa-2', github_repo: null, github_sync_enabled: false, is_triage_project: false, is_repo_sync_owner: false },
      ],
      feature_flags: {
        enabled: ['FEATURE_WORKSPACE_SWITCHER'],
        disabled_or_absent: ['FEATURE_WORKSPACE_SWITCHER'],
      },
    }))

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PRODUCT_LINE_IDENTITY_INVALID', path: '$.product_line.slug' }),
      expect.objectContaining({ code: 'CONFIG_FIELD_TYPE_INVALID', path: '$.product_line.display_name' }),
      expect.objectContaining({ code: 'AGENT_PREFIX_INVALID', path: '$.product_line.agent_prefix' }),
      expect.objectContaining({ code: 'CONFIG_UNKNOWN_FIELD', path: '$.github.unsupported' }),
      expect.objectContaining({ code: 'GITHUB_OWNER_REPO_INVALID', path: '$.github.repo' }),
      expect.objectContaining({ code: 'GITHUB_OWNER_REPO_INVALID', path: '$.github.full_name' }),
      expect.objectContaining({ code: 'CONFIG_DUPLICATE_DECLARATION', path: '$.departments[1].slug' }),
      expect.objectContaining({ code: 'CONFIG_DUPLICATE_DECLARATION', path: '$.departments[1].ticket_prefix' }),
      expect.objectContaining({ code: 'CONFIG_CONFLICTING_DECLARATION', path: '$.feature_flags.disabled_or_absent[0]' }),
    ]))
  })

  it('fails closed for workflow family, path, parse, slug, repo, and template ownership contract errors', async () => {
    const config = await importConfigModule()
    const seed = await importSeedModule()
    const validate = config['validateProductLineSeedConfig'] as (value: unknown) => { code: string, path: string, message: string }[]
    const run = seed['runProductLineSeed'] as (options: Record<string, unknown>) => Record<string, unknown>
    const brokenContract = writeSeedConfigFixture({ family: 'paddock', templates: '[' }, 'broken-workflow.yaml')
    const repoMismatchContract = writeSeedConfigFixture({}, 'repo-mismatch-workflow.yaml')
    writeFileSync(repoMismatchContract, source('docs/ai/workflows/paddock/workflow-contract.yaml').replaceAll('repo: racecraft-lab/Paddock', 'repo: other-owner/other-repo'))

    expect(validate(parsedConfigFixture({ workflow_contract: { family: 'not-supported', path: 'docs/ai/workflows/paddock/workflow-contract.yaml', required_slugs: ['paddock_issue_triage'] } })))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY', path: '$.workflow_contract.family' })]))
    expect(validate(parsedConfigFixture({ workflow_contract: { family: 'paddock', path: '../outside.yaml', required_slugs: ['paddock_issue_triage'] } })))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'WORKFLOW_CONTRACT_PATH_INVALID', path: '$.workflow_contract.path' })]))
    expect(validate(parsedConfigFixture({ workflow_contract: { family: 'paddock', path: brokenContract, required_slugs: ['paddock_issue_triage'] } })))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'WORKFLOW_CONTRACT_PARSE_FAILED', path: '$.workflow_contract.path' })]))
    expect(validate(parsedConfigFixture({ workflow_contract: { family: 'paddock', path: 'docs/ai/workflows/paddock/workflow-contract.yaml', required_slugs: ['missing_slug', 'missing_slug'] } })))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'WORKFLOW_CONTRACT_REQUIRED_SLUGS_MISSING', path: '$.workflow_contract.required_slugs[0]' }),
        expect.objectContaining({ code: 'WORKFLOW_CONTRACT_REQUIRED_SLUG_AMBIGUOUS', path: '$.workflow_contract.required_slugs[1]' }),
      ]))
    expect(validate(parsedConfigFixture({ workflow_contract: { family: 'paddock', path: repoMismatchContract, required_slugs: ['paddock_issue_triage'] } })))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'WORKFLOW_CONTRACT_REPO_MISMATCH', path: '$.workflow_contract.path' })]))

    const db = makeProductLineSeedTestDb()
    db.prepare("INSERT INTO workspaces (slug, name, feature_flags) VALUES ('paddock', 'Paddock', '{}')").run()
    db.prepare("INSERT INTO workflow_templates (workspace_id, slug, name, created_by) VALUES ((SELECT id FROM workspaces WHERE slug = 'paddock'), 'paddock_issue_triage', 'Manual collision', 'operator')").run()
    const ownershipConflict = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'preflight',
      json: true,
      allowExisting: false,
    })

    expect(ownershipConflict).toMatchObject({
      ok: false,
      status: 'contract_not_ready',
      code: 'WORKFLOW_TEMPLATE_OWNERSHIP_CONFLICT',
      mutation_status: 'not_mutated',
      exit_code: 3,
    })
    expectNoMutationProof(ownershipConflict)
    db.close()
  })

  it('maps feature flag validation and reserved target state failures to stable codes', async () => {
    const config = await importConfigModule()
    const seed = await importSeedModule()
    const validate = config['validateProductLineSeedConfig'] as (value: unknown) => { code: string, path: string, message: string }[]
    const run = seed['runProductLineSeed'] as (options: Record<string, unknown>) => Record<string, unknown>
    const previousEnv = process.env['FEATURE_WORKSPACE_SWITCHER']
    process.env['FEATURE_WORKSPACE_SWITCHER'] = '0'
    try {
      const errors = validate(parsedConfigFixture({
        feature_flags: {
          enabled: ['UNKNOWN_ENABLED', 'FEATURE_WORKSPACE_SWITCHER', 'FEATURE_WORKSPACE_SWITCHER', 'FEATURE_TWO_STEP_TERMINAL', 'FEATURE_TASK_CONTROL_PLANE'],
          disabled_or_absent: ['UNKNOWN_DISABLED', 'FEATURE_WORKSPACE_SWITCHER', 'UNKNOWN_DISABLED'],
        },
      }))

      expect(errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'FEATURE_FLAG_UNKNOWN_ENABLED', path: '$.feature_flags.enabled[0]' }),
        expect.objectContaining({ code: 'FEATURE_FLAG_ENV_FORCE_OFF', path: '$.feature_flags.enabled[1]' }),
        expect.objectContaining({ code: 'FEATURE_FLAG_DUPLICATE', path: '$.feature_flags.enabled[2]' }),
        expect.objectContaining({ code: 'FEATURE_FLAG_RESERVED_FUTURE_ENABLED', path: '$.feature_flags.enabled[4]' }),
        expect.objectContaining({ code: 'FEATURE_FLAG_UNKNOWN_DISABLED_OR_ABSENT', path: '$.feature_flags.disabled_or_absent[0]' }),
        expect.objectContaining({ code: 'FEATURE_FLAG_CONFLICT', path: '$.feature_flags.disabled_or_absent[1]' }),
        expect.objectContaining({ code: 'FEATURE_FLAG_DUPLICATE', path: '$.feature_flags.disabled_or_absent[2]' }),
        expect.objectContaining({ code: 'FEATURE_FLAG_CASCADE_PREREQUISITE_MISSING', path: '$.feature_flags.enabled' }),
      ]))
    } finally {
      if (previousEnv === undefined) {
        Reflect.deleteProperty(process.env, 'FEATURE_WORKSPACE_SWITCHER')
      } else {
        process.env['FEATURE_WORKSPACE_SWITCHER'] = previousEnv
      }
    }

    const db = makeProductLineSeedTestDb()
    db.prepare("UPDATE workspaces SET feature_flags = ? WHERE slug = 'facility'")
      .run(JSON.stringify({ FEATURE_TASK_CONTROL_PLANE: true }))
    const result = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db,
      dbPath: ':memory:',
      mode: 'preflight',
      json: true,
      allowExisting: false,
    })

    expect(result).toMatchObject({
      ok: false,
      status: 'blocked_preflight',
      code: 'FEATURE_FLAG_RESERVED_FUTURE_ENABLED',
      mutation_status: 'not_mutated',
      exit_code: 2,
    })
    expect(result['errors']).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FEATURE_FLAG_RESERVED_FUTURE_ENABLED', path: '$.target.feature_flags.FEATURE_TASK_CONTROL_PLANE' }),
    ]))
    expectNoMutationProof(result)
    db.close()
  })

  it('maps department and agent validation failures to stable codes', async () => {
    const config = await importConfigModule()
    const validate = config['validateProductLineSeedConfig'] as (value: unknown) => { code: string, path: string, message: string }[]
    const errors = validate(parsedConfigFixture({
      product_line: { slug: 'paddock', display_name: 'Paddock', agent_prefix: 'Paddock' },
      departments: [
        { slug: '', name: '', ticket_prefix: 'QA', area_slug: 'qa', github_repo: 'other-owner/other-repo', github_sync_enabled: 'yes', is_triage_project: true, is_repo_sync_owner: true },
      ],
      agent_assignments: {
        product_line_assignments: [
          { agent_key: 'paddock-platform-qa', role: 'qa', department_slug: 'missing' },
          { agent_key: 'Bad Key', role: 'qa', department_slug: 'qa' },
        ],
        shared_support: [
          { scope: 'workspace', shared_support_role: '', agent_name: '' },
        ],
      },
    }))

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'AGENT_PREFIX_INVALID', path: '$.product_line.agent_prefix' }),
      expect.objectContaining({ code: 'DEPARTMENT_INVALID', path: '$.departments[0].slug' }),
      expect.objectContaining({ code: 'DEPARTMENT_GITHUB_REPO_MISMATCH', path: '$.departments[0].github_repo' }),
      expect.objectContaining({ code: 'DEPARTMENT_INVALID', path: '$.departments[0].github_sync_enabled' }),
      expect.objectContaining({ code: 'AGENT_KEY_INVALID', path: '$.agent_assignments.product_line_assignments[0].agent_key' }),
      expect.objectContaining({ code: 'AGENT_ASSIGNMENT_DEPARTMENT_MISSING', path: '$.agent_assignments.product_line_assignments[0].department_slug' }),
      expect.objectContaining({ code: 'AGENT_KEY_INVALID', path: '$.agent_assignments.product_line_assignments[1].agent_key' }),
      expect.objectContaining({ code: 'SHARED_SUPPORT_ASSIGNMENT_INVALID', path: '$.agent_assignments.shared_support[0].scope' }),
      expect.objectContaining({ code: 'SHARED_SUPPORT_ASSIGNMENT_INVALID', path: '$.agent_assignments.shared_support[0].shared_support_role' }),
      expect.objectContaining({ code: 'SHARED_SUPPORT_ASSIGNMENT_INVALID', path: '$.agent_assignments.shared_support[0].agent_name' }),
    ]))
  })

  it('blocks first-intake governance defaults unless explicit allowance and per-policy reason are present', async () => {
    const config = await importConfigModule()
    const validate = config['validateProductLineSeedConfig'] as (value: unknown) => { code: string, path: string, message: string }[]

    const unsafe = validate(parsedConfigFixture({
      governance_defaults: [
        { identity: 'blocking-wip', policy_type: 'wip_limit', limit_kind: 'concurrent_tasks', limit_value: 1, period: null, timezone: 'America/Chicago', enforcement: 'alert', enabled: true, default_template: true },
        { identity: 'defer-budget', policy_type: 'budget', limit_kind: 'usd', limit_value: 1, period: 'day', timezone: 'America/Chicago', enforcement: 'defer', enabled: true, default_template: false },
      ],
      safety_policy: {
        existing_target: 'refuse_unless_allow_existing',
        allow_first_intake_blocking_governance: false,
        config_owned_surfaces: [...expectedConfigOwnedSurfaces],
        preserved_surfaces: [...expectedPreservedSurfaces],
        blocked_side_effects: ['github_mutation'],
      },
    }))
    const allowed = validate(parsedConfigFixture({
      governance_defaults: [
        { identity: 'blocking-wip', policy_type: 'wip_limit', limit_kind: 'concurrent_tasks', limit_value: 1, period: null, timezone: 'America/Chicago', enforcement: 'alert', enabled: true, default_template: true, first_intake_blocking_reason: 'Operator explicitly wants first intake blocked.' },
      ],
      safety_policy: {
        existing_target: 'refuse_unless_allow_existing',
        allow_first_intake_blocking_governance: true,
        config_owned_surfaces: [...expectedConfigOwnedSurfaces],
        preserved_surfaces: [...expectedPreservedSurfaces],
        blocked_side_effects: ['github_mutation'],
      },
    }))

    expect(unsafe).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'GOVERNANCE_FIRST_INTAKE_BLOCKING', path: '$.governance_defaults[0].first_intake_blocking_reason' }),
      expect.objectContaining({ code: 'GOVERNANCE_FIRST_INTAKE_BLOCKING', path: '$.governance_defaults[1].first_intake_blocking_reason' }),
    ]))
    expect(allowed).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'GOVERNANCE_FIRST_INTAKE_BLOCKING' }),
    ]))
  })

  it('blocks target repo/product-line conflicts and emits redaction-safe cleanup evidence without cleanup mutation', async () => {
    const seed = await importSeedModule()
    const run = seed['runProductLineSeed'] as (options: Record<string, unknown>) => Record<string, unknown>
    const repoConflictDb = makeProductLineSeedTestDb()
    repoConflictDb.prepare("INSERT INTO projects (workspace_id, slug, name, ticket_prefix, github_repo, github_sync_enabled) VALUES (1, 'external-sync', 'External Sync', 'EXT', 'other-owner/other-repo', 1)").run()

    const repoConflict = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db: repoConflictDb,
      dbPath: ':memory:',
      mode: 'preflight',
      json: true,
      allowExisting: false,
    })

    expect(repoConflict).toMatchObject({
      ok: false,
      status: 'blocked_preflight',
      code: 'TARGET_REPO_CONFLICT',
      mutation_status: 'not_mutated',
      redaction: { raw_secret_values_emitted: false },
      evidence: {
        cleanup_policy: 'detection_only_no_automatic_deletion_or_unlinking',
      },
      exit_code: 2,
    })
    expect(JSON.stringify(repoConflict)).not.toContain('sk-test-operator-secret-raw-value')
    expect(JSON.stringify(repoConflict)).not.toContain('"raw_operator_evidence":')
    expect(repoConflict['errors']).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TARGET_REPO_CONFLICT', path: '$.target.residue[0]' }),
      expect.objectContaining({ code: 'TARGET_RESIDUE_BLOCKED', path: '$.target.residue' }),
    ]))
    expectNoMutationProof(repoConflict)
    expect(repoConflictDb.prepare("SELECT COUNT(*) as count FROM projects WHERE slug = 'external-sync'").get()).toEqual({ count: 1 })
    repoConflictDb.close()

    const productLineConflictDb = makeProductLineSeedTestDb()
    productLineConflictDb.prepare("INSERT INTO workspaces (slug, name, feature_flags) VALUES ('paddock', 'Not Paddock', '{}')").run()
    const productLineConflict = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db: productLineConflictDb,
      dbPath: ':memory:',
      mode: 'preflight',
      json: true,
      allowExisting: false,
    })

    expect(productLineConflict).toMatchObject({
      ok: false,
      status: 'blocked_preflight',
      code: 'TARGET_PRODUCT_LINE_CONFLICT',
      mutation_status: 'not_mutated',
      exit_code: 2,
    })
    expectNoMutationProof(productLineConflict)
    productLineConflictDb.close()
  })

  it('proves no mutation for validation failures, blocked preflight, existing-target refusal, and proof failure handling', async () => {
    const seed = await importSeedModule()
    const evidence = await importEvidenceModule()
    const run = seed['runProductLineSeed'] as (options: Record<string, unknown>) => Record<string, unknown>
    const makeResult = evidence['makeProductLineSeedResultEnvelope'] as (options: Record<string, unknown>) => Record<string, unknown>
    const invalidPath = writeSeedConfigFixture(parsedConfigFixture({ github: { owner: 'racecraft-lab' } }), 'invalid.yaml')
    const validationDb = makeProductLineSeedTestDb()
    const validationFailure = run({
      entrypoint: 'seed:product-line',
      configPath: invalidPath,
      db: validationDb,
      dbPath: ':memory:',
      mode: 'apply',
      json: true,
      allowExisting: false,
    })
    expect(validationFailure).toMatchObject({ ok: false, status: 'validation_failed', mutation_status: 'not_mutated' })
    expectNoMutationProof(validationFailure)
    validationDb.close()

    const existingDb = makeProductLineSeedTestDb()
    run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db: existingDb,
      dbPath: ':memory:',
      mode: 'apply',
      json: true,
      allowExisting: false,
    })
    const existingRefusal = run({
      entrypoint: 'seed:product-line',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      db: existingDb,
      dbPath: ':memory:',
      mode: 'apply',
      json: true,
      allowExisting: false,
    })
    expect(existingRefusal).toMatchObject({
      ok: false,
      status: 'existing_target_refused',
      code: 'EXISTING_TARGET_REQUIRES_ALLOW_EXISTING',
      mutation_status: 'not_mutated',
    })
    expectNoMutationProof(existingRefusal)
    existingDb.close()

    const failedProof = makeResult({
      ok: false,
      entrypoint: 'seed:product-line',
      mode: 'apply',
      status: 'unexpected_error',
      code: 'UNEXPECTED_ERROR',
      mutationStatus: 'not_mutated',
      configPath: 'docs/ai/product-lines/paddock.yaml',
      evidence: {},
      snapshotBefore: { schema_version: 'product-line-seed-snapshot-v1', hash: 'before', surfaces: {}, preserved_operational_state: { hash: 'before', subsurfaces: {} } },
      snapshotAfter: { schema_version: 'product-line-seed-snapshot-v1', hash: 'after', surfaces: {}, preserved_operational_state: { hash: 'after', subsurfaces: {} } },
    })

    expect(failedProof).toMatchObject({
      ok: false,
      status: 'unexpected_error',
      code: 'NO_MUTATION_PROOF_FAILED',
      mutation_status: 'not_mutated',
      exit_code: 5,
      evidence: {
        no_mutation_proof: {
          compared: true,
          passed: false,
          before_hash: 'before',
          after_hash: 'after',
        },
      },
    })
  })
})

describe('product-line seed reuse docs and static guards', () => {
  it('keeps seed surfaces free of Product Line B and runtime execution behavior except negative guard evidence', () => {
    const matches = staticScopeGuardSources.flatMap((path) => matchingLines(path, staticScopeGuardPattern))
    const disallowedMatches = matches.filter((match) => !isNegativeStaticGuardMatch(match))

    expect(disallowedMatches).toEqual([])
    expect(matches).toEqual(expect.arrayContaining([
      expect.stringContaining('docs/ai/product-lines/paddock.yaml'),
      expect.stringContaining('blocked_side_effects'),
    ]))
  })

  it('documents reusable schema, modes, evidence, safety policy, wrapper parity, exclusions, rollback, and validation', () => {
    expect(productLineSeedDocs.filter((path) => !existsSync(path))).toEqual([])

    const runbook = source('docs/runbooks/product-line-seed.md')
    const predeploy = source('docs/runbooks/paddock-seed-predeploy.md')
    const workflowLedger = source('docs/ai/specs/SPEC-010A-workflow.md')

    expect(runbook).toEqual(expect.stringContaining('## Schema'))
    expect(runbook).toEqual(expect.stringContaining('schema_version: product-line-seed-v1'))
    expect(runbook).toEqual(expect.stringContaining('## Command Modes'))
    expect(runbook).toEqual(expect.stringContaining('preflight'))
    expect(runbook).toEqual(expect.stringContaining('apply'))
    expect(runbook).toEqual(expect.stringContaining('verify'))
    expect(runbook).toEqual(expect.stringContaining('## Evidence Shape'))
    expect(runbook).toEqual(expect.stringContaining('schema_version:"product-line-seed-result-v1"'))
    expect(runbook).toEqual(expect.stringContaining('snapshot_before'))
    expect(runbook).toEqual(expect.stringContaining('snapshot_after'))
    expect(runbook).toEqual(expect.stringContaining('preserved_operational_state.subsurfaces'))
    expect(runbook).toEqual(expect.stringContaining('## Existing Target Policy'))
    expect(runbook).toEqual(expect.stringContaining('--allow-existing'))
    expect(runbook).toEqual(expect.stringContaining('EXISTING_TARGET_REQUIRES_ALLOW_EXISTING'))
    expect(runbook).toEqual(expect.stringContaining('## Residue Blocking Policy'))
    expect(runbook).toEqual(expect.stringContaining('detection_only_no_automatic_deletion_or_unlinking'))
    expect(runbook).toEqual(expect.stringContaining('TARGET_RESIDUE_BLOCKED'))
    expect(runbook).toEqual(expect.stringContaining('## Paddock Compatibility Wrapper'))
    expect(runbook).toEqual(expect.stringContaining('pnpm seed:paddock'))
    expect(runbook).toEqual(expect.stringContaining('docs/ai/product-lines/paddock.yaml'))
    expect(runbook).toEqual(expect.stringContaining('## Product Line B Exclusion'))
    expect(runbook).toEqual(expect.stringContaining('SPEC-010A does not create Product Line B'))
    expect(runbook).toEqual(expect.stringContaining('## Rollback By No-Op'))
    expect(runbook).toEqual(expect.stringContaining('no migration'))
    expect(runbook).toEqual(expect.stringContaining('not running the command leaves target state unchanged'))
    expect(runbook).toEqual(expect.stringContaining('## Implementation Validation'))
    expect(runbook).toEqual(expect.stringContaining('pnpm test -- src/lib/__tests__/product-line-seed.test.ts'))
    expect(runbook).toEqual(expect.stringContaining('rg -n "Product Line B|product-line-b|focusengine'))

    expect(predeploy).toEqual(expect.stringContaining('pnpm seed:paddock'))
    expect(predeploy).toEqual(expect.stringContaining('compatibility wrapper'))
    expect(predeploy).toEqual(expect.stringContaining('generic product-line evidence model'))
    expect(predeploy).toEqual(expect.stringContaining('schema_version:"product-line-seed-result-v1"'))
    expect(predeploy).toEqual(expect.stringContaining('preserved_operational_state.subsurfaces'))
    expect(predeploy).toEqual(expect.stringContaining('docs/ai/product-lines/paddock.yaml'))

    expect(workflowLedger).toEqual(expect.stringContaining('pnpm seed:product-line --'))
    expect(workflowLedger).toEqual(expect.stringContaining('seed:paddock'))
    expect(workflowLedger).toEqual(expect.stringContaining('pnpm test src/lib/__tests__/product-line-seed.test.ts'))
    expect(workflowLedger).toEqual(expect.stringContaining('pnpm typecheck'))
    expect(workflowLedger).toEqual(expect.stringContaining('pnpm lint'))
    expect(workflowLedger).toEqual(expect.stringContaining('invalid-config no-mutation'))
    expect(workflowLedger).toEqual(expect.stringContaining('wrapper verify commands passed'))
    expect(workflowLedger).toEqual(expect.stringContaining('Static/diff guardrails'))
    expect(workflowLedger).toEqual(expect.stringContaining('rollback-by-no-op'))
  })
})
