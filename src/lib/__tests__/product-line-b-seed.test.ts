import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  loadProductLineSeedConfigFromFile,
  validateProductLineSeedConfig,
} from '../product-line-seed/config.ts'
import { runProductLineSeed } from '../product-line-seed/seed.ts'
import {
  CONFIG_OWNED_SURFACES,
  FR020_PRESERVED_SURFACES,
  PADDOCK_REQUIRED_WORKFLOW_SLUGS,
  PRODUCT_LINE_B_BLOCKED_SIDE_EFFECTS,
} from '../product-line-seed/types.ts'
import type {
  ProductLineSeedConfig,
  ProductLineSeedResultEnvelope,
  ProductLineSeedValidationError,
} from '../product-line-seed/types.ts'

const PRODUCT_LINE_B_CONFIG_PATH = 'docs/ai/product-lines/product-line-b.yaml'

const REQUIRED_PRODUCT_LINE_B_ASSIGNMENTS = [
  'plb-platform-research',
  'plb-platform-planner',
  'plb-platform-dev',
  'plb-platform-ui',
  'plb-platform-devsecops',
  'plb-platform-qa',
] as const

const FORBIDDEN_HARNESS_MANIFEST_IDENTITIES = [
  'paddock_owned_sandbox_fake',
  'external_harness_fake',
  'codex-app-server',
] as const

function loadProductLineBConfig(): {
  config: ProductLineSeedConfig | null
  errors: ProductLineSeedValidationError[]
} {
  if (!existsSync(PRODUCT_LINE_B_CONFIG_PATH)) {
    return {
      config: null,
      errors: [{
        code: 'CONFIG_REQUIRED_SECTION_MISSING',
        path: PRODUCT_LINE_B_CONFIG_PATH,
        message: 'Missing reviewed Product Line B seed config.',
      }],
    }
  }

  try {
    const config = loadProductLineSeedConfigFromFile(PRODUCT_LINE_B_CONFIG_PATH)
    return {
      config,
      errors: validateProductLineSeedConfig(config),
    }
  } catch (error) {
    return {
      config: null,
      errors: [{
        code: 'CONFIG_PARSE_FAILED',
        path: PRODUCT_LINE_B_CONFIG_PATH,
        message: error instanceof Error ? error.message : 'Product Line B seed config failed to load.',
      }],
    }
  }
}

function productLineBAssignmentKeys(config: ProductLineSeedConfig | null): string[] {
  return config?.agent_assignments.product_line_assignments.map((assignment) => assignment.agent_key) ?? []
}

function productLineBConfigFixture(): ProductLineSeedConfig {
  return {
    schema_version: 'product-line-seed-v1',
    product_line: {
      slug: 'product-line-b',
      display_name: 'Product Line B',
      agent_prefix: 'plb-platform',
      disabled_by_default: true,
    },
    github: {
      owner: 'racecraft-lab',
      repo: 'Paddock',
      full_name: 'racecraft-lab/Paddock',
    },
    workflow_contract: {
      family: 'paddock',
      path: 'docs/ai/workflows/paddock/workflow-contract.yaml',
      required_slugs: [...PADDOCK_REQUIRED_WORKFLOW_SLUGS],
    },
    departments: [
      productLineBDepartment('qa', 'QA', 'PLBQA', 'qa'),
      productLineBDepartment('development', 'Development', 'PLBDEV', 'dev'),
      productLineBDepartment('devsecops', 'DevSecOps', 'PLBSEC', 'devsecops'),
      productLineBDepartment('marketing', 'Marketing', 'PLBMKT', 'marketing'),
      productLineBDepartment('customer-service', 'Customer Service', 'PLBCS', 'customer-service'),
      productLineBDepartment('finance', 'Finance', 'PLBFIN', 'finance'),
    ],
    agent_assignments: {
      product_line_assignments: [
        { agent_key: 'plb-platform-research', role: 'researcher', department_slug: 'qa' },
        { agent_key: 'plb-platform-planner', role: 'planner', department_slug: 'qa' },
        { agent_key: 'plb-platform-dev', role: 'dev', department_slug: 'development' },
        { agent_key: 'plb-platform-ui', role: 'ui', department_slug: 'development' },
        { agent_key: 'plb-platform-devsecops', role: 'devsecops', department_slug: 'devsecops' },
        { agent_key: 'plb-platform-qa', role: 'qa', department_slug: 'qa' },
      ],
    },
    feature_flags: {
      enabled: [],
      disabled_or_absent: [
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
        'FEATURE_GITHUB_SYNC_AUTOMATION',
        'PILOT_PRODUCT_LINE_A_E2E',
        'FEATURE_TASK_CONTROL_PLANE',
        'FEATURE_AGENT_RUNNER_SANDBOXES',
        'FEATURE_PRODUCT_LINE_B_DISPATCH',
        'PILOT_PRODUCT_LINE_B_SMOKE',
      ],
      owned_keys: [
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
        'FEATURE_PRODUCT_LINE_B_DISPATCH',
        'PILOT_PRODUCT_LINE_B_SMOKE',
      ],
      smoke_owned: [
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
      ],
      paused_or_forbidden: [
        'FEATURE_GITHUB_SYNC_AUTOMATION',
        'FEATURE_TASK_CONTROL_PLANE',
        'FEATURE_AGENT_RUNNER_SANDBOXES',
        'PILOT_PRODUCT_LINE_A_E2E',
        'FEATURE_PRODUCT_LINE_B_DISPATCH',
        'PILOT_PRODUCT_LINE_B_SMOKE',
      ],
    },
    governance_defaults: [
      {
        identity: 'product-line-b-daily-token-budget',
        notes: 'SPEC-010B:product-line-b:daily-token-budget',
        policy_type: 'budget',
        limit_kind: 'token',
        limit_value: 1000000,
        period: 'day',
        timezone: 'America/Chicago',
        enforcement: 'alert',
        enabled: true,
        default_template: false,
      },
    ],
    safety_policy: {
      existing_target: 'refuse_unless_allow_existing',
      allow_first_intake_blocking_governance: false,
      config_owned_surfaces: [...CONFIG_OWNED_SURFACES],
      preserved_surfaces: [...FR020_PRESERVED_SURFACES],
      blocked_side_effects: [...PRODUCT_LINE_B_BLOCKED_SIDE_EFFECTS],
    },
  }
}

function productLineBDepartment(
  slug: string,
  name: string,
  ticketPrefix: string,
  areaSlug: string,
): ProductLineSeedConfig['departments'][number] {
  return {
    slug,
    name,
    ticket_prefix: ticketPrefix,
    area_slug: areaSlug,
    github_repo: 'racecraft-lab/Paddock',
    github_sync_enabled: false,
    is_triage_project: false,
    is_repo_sync_owner: false,
  }
}

function writeProductLineBConfigFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'product-line-b-seed-'))
  const path = join(dir, 'product-line-b.yaml')
  writeFileSync(path, JSON.stringify(productLineBConfigFixture(), null, 2))
  return path
}

function makeProductLineBPreflightDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      disabled_at TEXT,
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
      created_at INTEGER NOT NULL DEFAULT 100
    );
  `)
  db.prepare("INSERT INTO workspaces (id, slug, name, feature_flags) VALUES (1, 'facility', 'Facility', '{\"UNRELATED_FLAG\":true}')").run()
  db.prepare("INSERT INTO workspaces (id, slug, name, feature_flags) VALUES (2, 'paddock', 'Paddock', '{\"PILOT_PADDOCK_E2E\":true}')").run()
  db.prepare(`
    INSERT INTO projects (id, workspace_id, slug, name, ticket_prefix, area_slug, github_repo, github_sync_enabled, is_triage_project, is_repo_sync_owner)
    VALUES (1, 2, 'qa', 'QA', 'QA', 'qa', 'racecraft-lab/Paddock', 1, 1, 1)
  `).run()
  db.prepare(`
    INSERT INTO tasks (id, workspace_id, project_id, title, status, github_repo, github_issue_number)
    VALUES (1, 2, 1, 'Product Line A preserved issue', 'in_progress', 'racecraft-lab/Paddock', 42)
  `).run()
  return db
}

function runProductLineBPreflight(db: Database.Database): ProductLineSeedResultEnvelope {
  return runProductLineBSeed(db, 'preflight')
}

function runProductLineBSeed(
  db: Database.Database,
  mode: 'preflight' | 'apply' | 'verify',
  allowExisting = false,
): ProductLineSeedResultEnvelope {
  return runProductLineSeed({
    entrypoint: 'seed:product-line',
    configPath: writeProductLineBConfigFixture(),
    db,
    dbPath: ':memory:',
    mode,
    json: true,
    allowExisting,
  })
}

function tableCounts(db: Database.Database): Record<string, number> {
  return Object.fromEntries(
    ['workspaces', 'projects', 'project_agent_assignments', 'tasks'].map((table) => [
      table,
      (db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }).count,
    ]),
  )
}

describe('SPEC-010B Product Line B seed config contract', () => {
  it('loads a reviewed Product Line B config at the canonical path', () => {
    const { config, errors } = loadProductLineBConfig()

    expect(errors).toEqual([])
    expect(config).not.toBeNull()
  })

  it('declares the canonical Product Line B identity and Paddock smoke repo metadata', () => {
    const { config } = loadProductLineBConfig()

    expect(config?.schema_version).toBe('product-line-seed-v1')
    expect(config?.product_line).toMatchObject({
      slug: 'product-line-b',
      display_name: 'Product Line B',
      agent_prefix: 'plb-platform',
    })
    expect(config?.github).toEqual({
      owner: 'racecraft-lab',
      repo: 'Paddock',
      full_name: 'racecraft-lab/Paddock',
    })
    expect(config?.workflow_contract).toMatchObject({
      family: 'paddock',
      path: 'docs/ai/workflows/paddock/workflow-contract.yaml',
    })
  })

  it('uses plb-platform logical assignment names for Product Line B agents', () => {
    const { config } = loadProductLineBConfig()
    const assignmentKeys = productLineBAssignmentKeys(config)

    expect(assignmentKeys).toEqual([...REQUIRED_PRODUCT_LINE_B_ASSIGNMENTS])
    for (const assignmentKey of assignmentKeys) {
      expect(assignmentKey).toMatch(/^plb-platform-[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }
  })

  it('does not reuse harness manifest IDs as Product Line B identity or assignment names', () => {
    const { config } = loadProductLineBConfig()
    const assignmentKeys = productLineBAssignmentKeys(config)
    const source = existsSync(PRODUCT_LINE_B_CONFIG_PATH)
      ? readFileSync(PRODUCT_LINE_B_CONFIG_PATH, 'utf8')
      : ''

    expect(config).not.toBeNull()
    for (const forbiddenIdentity of FORBIDDEN_HARNESS_MANIFEST_IDENTITIES) {
      expect(config?.product_line.agent_prefix).not.toBe(forbiddenIdentity)
      expect(assignmentKeys).not.toContain(forbiddenIdentity)
      expect(source).not.toContain(forbiddenIdentity)
    }
  })
})

describe('SPEC-010B Product Line B preflight RED contract', () => {
  it('returns an absent-ready no-mutation preflight proof without changing Product Line A rows', () => {
    const db = makeProductLineBPreflightDb()
    const beforeCounts = tableCounts(db)

    const result = runProductLineBPreflight(db)

    expect(result).toMatchObject({
      ok: true,
      mode: 'preflight',
      status: 'ready',
      code: 'READY',
      mutation_status: 'not_mutated',
      target: {
        product_line_slug: 'product-line-b',
        existing_target: false,
      },
    })
    expect(result.evidence).toMatchObject({
      target_class: 'absent_ready',
      no_mutation_proof: {
        compared: true,
        passed: true,
        before_hash: result.snapshot_before?.hash,
        after_hash: result.snapshot_after?.hash,
      },
      product_line_a_baseline: {
        workspace_slug: 'paddock',
        repo_sync_owner_count: 1,
      },
      residue: [],
    })
    expect(tableCounts(db)).toEqual(beforeCounts)
    db.close()
  })

  it('blocks existing Product Line B residue before mutation with typed evidence', () => {
    const db = makeProductLineBPreflightDb()
    db.prepare("INSERT INTO workspaces (slug, name, feature_flags) VALUES ('product-line-b', 'Legacy Product Line B', '{}')").run()

    const result = runProductLineBPreflight(db)

    expect(result).toMatchObject({
      ok: false,
      mode: 'preflight',
      status: 'blocked_preflight',
      code: 'TARGET_PRODUCT_LINE_CONFLICT',
      mutation_status: 'not_mutated',
    })
    expect(result.evidence).toMatchObject({
      existing_target: {
        outcome: 'residue_blocked',
      },
      no_mutation_proof: {
        compared: true,
        passed: true,
      },
      cleanup_policy: 'detection_only_no_automatic_deletion_or_unlinking',
    })
    expect(result.evidence['residue']).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'product_line_identity_conflict',
        count: 1,
      }),
    ]))
    db.close()
  })

  it('blocks conflicting plb-platform assignments outside Product Line B before mutation', () => {
    const db = makeProductLineBPreflightDb()
    db.prepare(`
      INSERT INTO project_agent_assignments (project_id, agent_name, role)
      VALUES (1, 'plb-platform-dev', 'dev')
    `).run()

    const result = runProductLineBPreflight(db)

    expect(result).toMatchObject({
      ok: false,
      mode: 'preflight',
      status: 'blocked_preflight',
      code: 'TARGET_PRODUCT_LINE_CONFLICT',
      mutation_status: 'not_mutated',
    })
    expect(result.evidence['residue']).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'plb_platform_assignment_conflict',
        count: 1,
        identifiers: {
          agent_names: ['plb-platform-dev'],
        },
      }),
    ]))
    db.close()
  })

  it('blocks Product Line B repo sync-owner conflicts for racecraft-lab/Paddock before mutation', () => {
    const db = makeProductLineBPreflightDb()
    db.prepare("INSERT INTO workspaces (id, slug, name, feature_flags) VALUES (3, 'product-line-b', 'Product Line B', '{}')").run()
    db.prepare(`
      INSERT INTO projects (workspace_id, slug, name, ticket_prefix, area_slug, github_repo, github_sync_enabled, is_triage_project, is_repo_sync_owner)
      VALUES (3, 'qa', 'QA', 'PLBQA', 'qa', 'racecraft-lab/Paddock', 1, 1, 1)
    `).run()

    const result = runProductLineBPreflight(db)

    expect(result).toMatchObject({
      ok: false,
      mode: 'preflight',
      status: 'blocked_preflight',
      code: 'TARGET_REPO_CONFLICT',
      mutation_status: 'not_mutated',
    })
    expect(result.evidence).toMatchObject({
      existing_target: {
        outcome: 'ownership_conflict',
      },
    })
    expect(result.evidence['residue']).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'repo_sync_owner_conflict',
        repo: 'racecraft-lab/Paddock',
        count: 1,
      }),
    ]))
    db.close()
  })

  it('reports retained FocusEngine and OpenClaw inventory without treating it as blocking residue', () => {
    const db = makeProductLineBPreflightDb()
    db.exec(`
      CREATE TABLE agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        source TEXT,
        hidden INTEGER NOT NULL DEFAULT 0,
        status TEXT
      );
      INSERT INTO agents (name, source, hidden, status)
      VALUES ('FocusEngine', 'agent_rows', 1, 'offline');
      INSERT INTO agents (name, source, hidden, status)
      VALUES ('OpenClaw', 'openclaw_config', 1, 'offline');
    `)

    const result = runProductLineBPreflight(db)

    expect(result).toMatchObject({
      ok: true,
      mode: 'preflight',
      status: 'ready',
      code: 'READY',
      mutation_status: 'not_mutated',
    })
    expect(result.evidence['residue']).toEqual([])
    expect(result.evidence['retained_inventory']).toEqual(expect.arrayContaining([
      expect.objectContaining({
        identity: 'FocusEngine',
        classification: 'retained_inventory',
        blocking: false,
      }),
      expect.objectContaining({
        identity: 'OpenClaw',
        classification: 'retained_inventory',
        blocking: false,
      }),
    ]))
    db.close()
  })
})

describe('SPEC-010B disabled Product Line B seed lifecycle RED contract', () => {
  it('applies Product Line B disabled by default with sync and smoke paths off', () => {
    const db = makeProductLineBPreflightDb()

    const result = runProductLineBSeed(db, 'apply')

    expect(result).toMatchObject({
      ok: true,
      mode: 'apply',
      status: 'seeded',
      code: 'SEEDED',
      mutation_status: 'applied',
    })
    const workspace = db.prepare(`
      SELECT id, disabled_at, feature_flags
      FROM workspaces
      WHERE slug = 'product-line-b'
    `).get() as { id: number; disabled_at: string | null; feature_flags: string | null } | undefined
    expect(workspace?.disabled_at).toEqual(expect.any(String))
    expect(JSON.parse(workspace?.feature_flags ?? '{}')).toMatchObject({
      PILOT_PRODUCT_LINE_B_SMOKE: false,
      FEATURE_PRODUCT_LINE_B_DISPATCH: false,
    })
    expect(db.prepare(`
      SELECT COUNT(*) as count
      FROM projects
      WHERE workspace_id = ? AND github_sync_enabled = 1
    `).get(workspace?.id) as { count: number }).toEqual({ count: 0 })
    db.close()
  })

  it('refuses an existing Product Line B target unless allowExisting is set', () => {
    const db = makeProductLineBPreflightDb()
    expect(runProductLineBSeed(db, 'apply').ok).toBe(true)

    const result = runProductLineBSeed(db, 'apply')

    expect(result).toMatchObject({
      ok: false,
      mode: 'apply',
      status: 'existing_target_refused',
      code: 'EXISTING_TARGET_REQUIRES_ALLOW_EXISTING',
      mutation_status: 'not_mutated',
      action_required: '--allow-existing',
    })
    db.close()
  })

  it('allows idempotent repeated apply only with allowExisting and creates no duplicate config-owned rows', () => {
    const db = makeProductLineBPreflightDb()
    const firstApply = runProductLineBSeed(db, 'apply')
    const afterFirstCounts = tableCounts(db)

    const secondApply = runProductLineBSeed(db, 'apply', true)

    expect(firstApply.ok).toBe(true)
    expect(secondApply).toMatchObject({
      ok: true,
      mode: 'apply',
      status: 'seeded',
      code: 'SEEDED',
      mutation_status: 'applied',
    })
    expect(tableCounts(db)).toEqual(afterFirstCounts)
    expect(secondApply.snapshot_before?.hash).toBe(firstApply.snapshot_after?.hash)
    expect(secondApply.snapshot_after?.hash).toBe(firstApply.snapshot_after?.hash)
    db.close()
  })

  it('verifies Product Line B read-only with stable snapshot hashes after repeated verify', () => {
    const db = makeProductLineBPreflightDb()
    const apply = runProductLineBSeed(db, 'apply')
    const firstVerify = runProductLineBSeed(db, 'verify', true)
    const countsAfterFirstVerify = tableCounts(db)
    const secondVerify = runProductLineBSeed(db, 'verify', true)

    expect(apply.ok).toBe(true)
    expect(firstVerify).toMatchObject({
      ok: true,
      mode: 'verify',
      status: 'verified',
      code: 'VERIFIED',
      mutation_status: 'verified',
      evidence: {
        disabled_by_default: true,
        drift: [],
      },
    })
    expect(secondVerify.snapshot_before?.hash).toBe(firstVerify.snapshot_after?.hash)
    expect(secondVerify.snapshot_after?.hash).toBe(firstVerify.snapshot_after?.hash)
    expect(tableCounts(db)).toEqual(countsAfterFirstVerify)
    db.close()
  })

  it('fails verify when stored Product Line B feature flags are malformed', () => {
    const db = makeProductLineBPreflightDb()
    expect(runProductLineBSeed(db, 'apply')).toMatchObject({ ok: true })
    db.prepare("UPDATE workspaces SET feature_flags = ? WHERE slug = 'product-line-b'").run('{not-json')

    const result = runProductLineBSeed(db, 'verify', true)

    expect(result).toMatchObject({
      ok: false,
      mode: 'verify',
      status: 'blocked_preflight',
      code: 'FEATURE_FLAGS_INVALID_JSON',
      mutation_status: 'not_mutated',
    })
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'FEATURE_FLAGS_INVALID_JSON',
        path: '$.target.workspaces.product-line-b.feature_flags',
      }),
    ]))
    db.close()
  })

  it('blocks preflight when target feature flags are malformed instead of treating them as empty', () => {
    const db = makeProductLineBPreflightDb()
    db.prepare("INSERT INTO workspaces (slug, name, feature_flags) VALUES ('product-line-b', 'Product Line B', ?)")
      .run('{not-json')

    const result = runProductLineBPreflight(db)

    expect(result).toMatchObject({
      ok: false,
      mode: 'preflight',
      status: 'blocked_preflight',
      code: 'FEATURE_FLAGS_INVALID_JSON',
      mutation_status: 'not_mutated',
    })
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'FEATURE_FLAGS_INVALID_JSON',
        path: '$.target.workspaces.product-line-b.feature_flags',
      }),
    ]))
    db.close()
  })

  it('fails verify when Product Line B gains repo sync ownership drift', () => {
    const db = makeProductLineBPreflightDb()
    expect(runProductLineBSeed(db, 'apply')).toMatchObject({ ok: true })
    db.prepare(`
      UPDATE projects
      SET github_sync_enabled = 1, is_repo_sync_owner = 1
      WHERE workspace_id = (SELECT id FROM workspaces WHERE slug = 'product-line-b')
        AND slug = 'qa'
    `).run()

    const result = runProductLineBSeed(db, 'verify', true)

    expect(result).toMatchObject({
      ok: false,
      mode: 'verify',
      status: 'blocked_preflight',
      code: 'TARGET_REPO_CONFLICT',
      mutation_status: 'not_mutated',
    })
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_REPO_CONFLICT',
        path: '$.target.residue[0]',
      }),
    ]))
    db.close()
  })
})
