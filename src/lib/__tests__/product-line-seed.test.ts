import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

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

const specStrictFiles = [
  'src/lib/product-line-seed/types.ts',
  'src/lib/product-line-seed/schema.ts',
  'src/lib/product-line-seed/config.ts',
  'src/lib/product-line-seed/evidence.ts',
  'src/lib/product-line-seed/preflight.ts',
  'src/lib/product-line-seed/seed.ts',
  'scripts/seed-product-line.ts',
  'scripts/seed-mission-control-product-line.ts',
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
      created_by TEXT NOT NULL DEFAULT 'system',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT 100,
      updated_at INTEGER NOT NULL DEFAULT 100,
      last_used_at INTEGER,
      use_count INTEGER NOT NULL DEFAULT 0
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
  db.prepare("INSERT INTO tasks (id, workspace_id, project_id, title, status, github_repo, github_issue_number, parent_task_id, root_task_id, chain_id) VALUES (1, 1, 1, 'Preserved issue', 'in_progress', 'racecraft-lab/mission-control', 42, 9, 9, 'chain-a')").run()
  db.prepare("INSERT INTO issues (task_id, external_id) VALUES (1, 'issue-42')").run()
  db.prepare("INSERT INTO activities (task_id, action) VALUES (1, 'created')").run()
  db.prepare("INSERT INTO task_histories (task_id, status) VALUES (1, 'in_progress')").run()
  db.prepare("INSERT INTO task_comments (task_id, body) VALUES (1, 'operator note')").run()
  db.prepare("INSERT INTO notifications (task_id, message) VALUES (1, 'notify')").run()
  db.prepare("INSERT INTO task_dispositions (task_id, outcome) VALUES (1, 'needs-human')").run()
  db.prepare("INSERT INTO task_artifacts (task_id, artifact_type, uri) VALUES (1, 'log', 'redacted://artifact')").run()
  db.prepare("INSERT INTO quality_reviews (task_id, reviewer) VALUES (1, 'aegis')").run()
  db.prepare("INSERT INTO github_sync_state (repo, cursor) VALUES ('racecraft-lab/mission-control', 'cursor-1')").run()
  db.prepare("INSERT INTO resource_policy_events (policy_id, action) VALUES (1, 'observed')").run()
  return db
}

export function invalidYamlFixture(body = 'schema_version: product-line-seed-v1\nproduct_line: ['): string {
  return body
}

export function parsedConfigFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 'product-line-seed-v1',
    product_line: { slug: 'mission-control', display_name: 'Mission Control', agent_prefix: 'mission-control-platform' },
    github: { owner: 'racecraft-lab', repo: 'mission-control', full_name: 'racecraft-lab/mission-control' },
    workflow_contract: {
      family: 'mission-control',
      path: 'docs/ai/workflows/mission-control/workflow-contract.yaml',
      required_slugs: ['mission-control_issue_triage'],
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

export function assertNoProductLineSeedScopeDrift(sourceName: string, content: string): void {
  const matches = staticScopeGuardTerms.filter((term) => content.toLowerCase().includes(term.toLowerCase()))
  expect(matches, `${sourceName} contains out-of-scope terms: ${matches.join(', ')}`).toEqual([])
}

function source(path: string): string {
  return readFileSync(path, 'utf8')
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

  it('exposes generic config/result/snapshot/mutation/residue constants and Mission Control seed defaults', async () => {
    const types = await importTypeModule()

    expect(types['PRODUCT_LINE_SEED_SCHEMA_VERSION']).toBe('product-line-seed-v1')
    expect(types['PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION']).toBe('product-line-seed-result-v1')
    expect(types['PRODUCT_LINE_SEED_SNAPSHOT_SCHEMA_VERSION']).toBe('product-line-seed-snapshot-v1')
    expect(types['PRODUCT_LINE_SEED_HASH_PREFIX']).toBe('product-line-seed-snapshot-v1:sha256:')
    expect(types['PRODUCT_LINE_SEED_MODES']).toEqual(['preflight', 'apply', 'verify'])
    expect(types['MUTATION_STATUSES']).toEqual(['not_mutated', 'applied', 'verified'])
    expect(types['CONFIG_OWNED_SURFACES']).toEqual([...expectedConfigOwnedSurfaces])
    expect(types['FR020_PRESERVED_SURFACES']).toEqual([...expectedPreservedSurfaces])
    expect(types['MISSION_CONTROL_SEED_DEFAULTS']).toMatchObject({
      productLineSlug: 'mission-control',
      displayName: 'Mission Control',
      agentPrefix: 'mission-control-platform',
      githubFullName: 'racecraft-lab/mission-control',
      workflowFamily: 'mission-control',
      configPath: 'docs/ai/product-lines/mission-control.yaml',
      workflowContractPath: 'docs/ai/workflows/mission-control/workflow-contract.yaml',
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
      product_line: { slug: 'mission-control' },
    })
    expect(targetResidueFixture()).toMatchObject({ kind: 'project_github_sync', count: 1 })
    expect(preservedOperationalStateFixture()).toMatchObject({ task: { count: 1 } })

    assertNoProductLineSeedScopeDrift('clean-fixture', 'Mission Control seed config only validates reviewed YAML state.')
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
      product_line: { slug: 'mission-control', display_name: 'Mission Control', agent_prefix: 'mission-control-platform' },
      github: { owner: 'racecraft-lab', repo: 'mission-control', full_name: 'racecraft-lab/mission-control' },
      workflow_contract: {
        family: 'mission-control',
        path: 'docs/ai/workflows/mission-control/workflow-contract.yaml',
        required_slugs: ['mission-control_issue_triage'],
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
        { slug: 'qa', name: 'QA', ticket_prefix: 'QA', area_slug: 'qa', github_repo: 'racecraft-lab/mission-control', github_sync_enabled: true, is_triage_project: true, is_repo_sync_owner: true },
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

  it('loads the canonical Mission Control config with reviewed identity, ownership, routing, flags, governance, and safety policy', async () => {
    const types = await importTypeModule()
    const config = await importConfigModule()
    const load = config['loadProductLineSeedConfigFromFile'] as (path: string) => Record<string, unknown>
    const validate = config['validateProductLineSeedConfig'] as (value: unknown) => { code: string, path: string, message: string }[]

    const canonical = load('docs/ai/product-lines/mission-control.yaml')

    expect(validate(canonical)).toEqual([])
    expect(canonical).toMatchObject({
      schema_version: 'product-line-seed-v1',
      product_line: {
        slug: 'mission-control',
        display_name: 'Mission Control',
        agent_prefix: 'mission-control-platform',
      },
      github: {
        owner: 'racecraft-lab',
        repo: 'mission-control',
        full_name: 'racecraft-lab/mission-control',
      },
      workflow_contract: {
        family: 'mission-control',
        path: 'docs/ai/workflows/mission-control/workflow-contract.yaml',
        required_slugs: types['MISSION_CONTROL_REQUIRED_WORKFLOW_SLUGS'],
      },
      feature_flags: {
        enabled: types['MISSION_CONTROL_ENABLED_FLAGS'],
        disabled_or_absent: types['MISSION_CONTROL_DISABLED_OR_ABSENT_FLAGS'],
      },
      governance_defaults: types['MISSION_CONTROL_GOVERNANCE_DEFAULTS'],
      safety_policy: {
        existing_target: 'refuse_unless_allow_existing',
        allow_first_intake_blocking_governance: false,
        config_owned_surfaces: types['CONFIG_OWNED_SURFACES'],
        preserved_surfaces: types['FR020_PRESERVED_SURFACES'],
        blocked_side_effects: types['BLOCKED_SIDE_EFFECTS'],
      },
    })
    expect(canonical['departments']).toEqual(types['MISSION_CONTROL_DEPARTMENTS'])
    expect(canonical['agent_assignments']).toEqual({
      product_line_assignments: types['MISSION_CONTROL_ROLE_ASSIGNMENTS'],
    })
  })

  it('keeps the canonical config free of Product Line B config and runtime authorization surfaces', async () => {
    const types = await importTypeModule()
    const configSource = source('docs/ai/product-lines/mission-control.yaml')
    const config = await importConfigModule()
    const load = config['loadProductLineSeedConfigFromFile'] as (path: string) => Record<string, unknown>
    const canonical = load('docs/ai/product-lines/mission-control.yaml')

    expect(configSource).not.toMatch(/Product Line B|product-line-b|focusengine/i)
    expect(configSource).not.toMatch(/(authorize|enable|launch|start|create|mutate|claim|merge)[^\n]*(github|dispatch|task|runner|sandbox|adapter|auto.?merge|speckit)/i)
    expect((canonical['safety_policy'] as { blocked_side_effects: unknown[] }).blocked_side_effects)
      .toEqual(types['BLOCKED_SIDE_EFFECTS'])
  })
})
