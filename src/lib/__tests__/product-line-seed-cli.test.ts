import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

export interface PnpmSeedInvocation {
  command: 'pnpm'
  args: string[]
  cwd: string
}

export interface CliRunResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

export function buildPnpmSeedInvocation(
  scriptName: 'seed:product-line' | 'seed:mission-control',
  args: string[],
  cwd = process.cwd(),
): PnpmSeedInvocation {
  return {
    command: 'pnpm',
    args: [scriptName, '--', ...args],
    cwd,
  }
}

export function invokePnpmSeedScript(
  scriptName: 'seed:product-line' | 'seed:mission-control',
  args: string[],
  cwd = process.cwd(),
): CliRunResult {
  const invocation = buildPnpmSeedInvocation(scriptName, args, cwd)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    encoding: 'utf8',
  })
  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

export function parseProductLineSeedJsonOutput(result: Pick<CliRunResult, 'stdout' | 'stderr'>): Record<string, unknown> {
  const payload = result.stdout.trim() || result.stderr.trim()
  expect(payload.length).toBeGreaterThan(0)
  return JSON.parse(payload) as Record<string, unknown>
}

function makeWrapperParityDb(): Database.Database {
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
  `)
  db.prepare("INSERT INTO workspaces (id, slug, name, feature_flags) VALUES (1, 'facility', 'Facility', '{}')").run()
  return db
}

function evidenceCategoryKeys(envelope: unknown): string[] {
  const evidence = (envelope as Record<string, unknown>)['evidence'] as Record<string, unknown>
  const validation = evidence['validation'] as Record<string, unknown> | undefined
  return Object.keys(validation ?? {}).sort()
}

function snapshotSurfaceCounts(envelope: unknown): Record<string, number> {
  const snapshot = (envelope as Record<string, unknown>)['snapshot_after'] as { surfaces: Record<string, { count: number }> }
  return Object.fromEntries(Object.entries(snapshot.surfaces).map(([key, value]) => [key, value.count]))
}

describe('generic product-line seed CLI foundation', () => {
  it('registers the generic pnpm script without replacing the Paddock compatibility script', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['seed:mission-control']).toContain('scripts/seed-mission-control-product-line.ts')
    expect(packageJson.scripts['seed:product-line']).toBe(
      'pnpm run verify:node && node --experimental-strip-types scripts/seed-product-line.ts',
    )
    expect(existsSync('scripts/seed-product-line.ts')).toBe(true)
  })

  it('builds pnpm script invocations with the argument separator preserved', () => {
    expect(buildPnpmSeedInvocation('seed:product-line', [
      '--config',
      'docs/ai/product-lines/mission-control.yaml',
      '--db',
      '.data/spec-010a-safe.db',
      '--mode',
      'preflight',
      '--json',
    ])).toEqual({
      command: 'pnpm',
      args: [
        'seed:product-line',
        '--',
        '--config',
        'docs/ai/product-lines/mission-control.yaml',
        '--db',
        '.data/spec-010a-safe.db',
        '--mode',
        'preflight',
        '--json',
      ],
      cwd: process.cwd(),
    })
  })

  it('parses structured JSON result envelopes from stdout or stderr', () => {
    const parsed = parseProductLineSeedJsonOutput({
      stdout: JSON.stringify({
        schema_version: 'product-line-seed-result-v1',
        ok: false,
        status: 'cli_error',
        mutation_status: 'not_mutated',
      }),
      stderr: '',
    })
    const parsedFromStderr = parseProductLineSeedJsonOutput({
      stdout: '',
      stderr: JSON.stringify({
        schema_version: 'product-line-seed-result-v1',
        ok: false,
        status: 'unexpected_error',
        mutation_status: 'not_mutated',
      }),
    })

    expect(parsed).toMatchObject({ schema_version: 'product-line-seed-result-v1', status: 'cli_error' })
    expect(parsedFromStderr).toMatchObject({ schema_version: 'product-line-seed-result-v1', status: 'unexpected_error' })
  })
})

describe('generic product-line seed CLI contracts', () => {
  it('parses required config, db, mode, json, allow-existing, and operator-evidence flags for every mode', async () => {
    const { runSeedProductLineCli: runCli } = await import('../../../scripts/seed-product-line')

    for (const mode of ['preflight', 'apply', 'verify']) {
      const result = runCli([
        '--config',
        'docs/ai/product-lines/mission-control.yaml',
        '--db',
        ':memory:',
        '--mode',
        mode,
        '--json',
        '--allow-existing',
        '--operator-evidence',
        'operator-evidence.json',
      ])
      const parsed = parseProductLineSeedJsonOutput(result)
      expect(parsed).toMatchObject({
        entrypoint: 'seed:product-line',
        mode,
        config: { path: 'docs/ai/product-lines/mission-control.yaml' },
      })
    }
  })

  it('accepts the pnpm argument separator when it reaches the script argv', async () => {
    const { runSeedProductLineCli: runCli } = await import('../../../scripts/seed-product-line')

    const result = runCli([
      '--',
      '--config',
      'docs/ai/product-lines/mission-control.yaml',
      '--db',
      ':memory:',
      '--mode',
      'preflight',
      '--json',
    ])
    const parsed = parseProductLineSeedJsonOutput(result)

    expect(parsed).toMatchObject({
      ok: true,
      entrypoint: 'seed:product-line',
      mode: 'preflight',
      status: 'ready',
    })
  })

  it('rejects missing required flags, invalid modes, and unknown flags with structured JSON', async () => {
    const { runSeedProductLineCli: runCli } = await import('../../../scripts/seed-product-line')

    for (const args of [
      ['--db', ':memory:', '--mode', 'preflight', '--json'],
      ['--config', 'docs/ai/product-lines/mission-control.yaml', '--mode', 'preflight', '--json'],
      ['--config', 'docs/ai/product-lines/mission-control.yaml', '--db', ':memory:', '--mode', 'plan', '--json'],
      ['--config', 'docs/ai/product-lines/mission-control.yaml', '--db', ':memory:', '--mode', 'preflight', '--unknown'],
    ]) {
      const result = runCli(args)
      const parsed = parseProductLineSeedJsonOutput(result)
      expect(result.exitCode).toBe(5)
      expect(parsed).toMatchObject({
        ok: false,
        status: 'cli_error',
        code: 'CLI_USAGE_ERROR',
        mutation_status: 'not_mutated',
        redaction: { raw_secret_values_emitted: false },
      })
    }
  })

  it('never emits, snapshots, or hashes raw operator evidence', async () => {
    const { runSeedProductLineCli: runCli } = await import('../../../scripts/seed-product-line')
    const dir = mkdtempSync(join(tmpdir(), 'product-line-seed-evidence-'))
    const evidencePath = join(dir, 'operator-evidence.json')
    const rawSecret = 'sk-test-operator-secret-raw-value'
    writeFileSync(evidencePath, JSON.stringify({
      token: rawSecret,
      raw_operator_evidence: rawSecret,
      nested: { password: rawSecret, safe_id: 'operator-check-1' },
    }))

    const result = runCli([
      '--config',
      'docs/ai/product-lines/mission-control.yaml',
      '--db',
      ':memory:',
      '--mode',
      'preflight',
      '--json',
      '--operator-evidence',
      evidencePath,
    ])
    const output = `${result.stdout}\n${result.stderr}`
    const parsed = parseProductLineSeedJsonOutput(result)

    expect(output).not.toContain(rawSecret)
    expect(output).not.toContain(`"raw_operator_evidence":`)
    expect(output).not.toContain('sk-test')
    const redaction = parsed['redaction'] as { raw_secret_values_emitted: boolean; redacted_fields: string[] }
    expect(redaction.raw_secret_values_emitted).toBe(false)
    expect(redaction.redacted_fields).toEqual(expect.arrayContaining(['$.nested.password', '$.raw_operator_evidence', '$.token']))
    expect(JSON.stringify(parsed['snapshot_before'])).not.toContain(rawSecret)
    expect(JSON.stringify(parsed['snapshot_after'])).not.toContain(rawSecret)
  })
})

describe('Paddock seed compatibility wrapper', () => {
  it('delegates preflight, apply, verify, refusal, and allow-existing to the canonical generic config behavior', async () => {
    const { runProductLineSeed } = await import('../product-line-seed/seed')
    const { runSeedMissionControlCli } = await import('../../../scripts/seed-mission-control-product-line')
    const canonicalArgs = {
      configPath: 'docs/ai/product-lines/mission-control.yaml',
      dbPath: ':memory:',
      json: true,
    }
    const genericPreflight = runProductLineSeed({
      ...canonicalArgs,
      entrypoint: 'seed:product-line',
      db: makeWrapperParityDb(),
      mode: 'preflight',
      allowExisting: false,
    })
    const wrapperPreflight = parseProductLineSeedJsonOutput(runSeedMissionControlCli([
      '--db',
      ':memory:',
      '--mode',
      'preflight',
      '--json',
    ], { db: makeWrapperParityDb() }))
    const wrapperDb = makeWrapperParityDb()
    const wrapperApply = parseProductLineSeedJsonOutput(runSeedMissionControlCli([
      '--db',
      ':memory:',
      '--mode',
      'apply',
      '--json',
    ], { db: wrapperDb }))
    const wrapperRefusal = parseProductLineSeedJsonOutput(runSeedMissionControlCli([
      '--db',
      ':memory:',
      '--mode',
      'apply',
      '--json',
    ], { db: wrapperDb }))
    const wrapperAllowExisting = parseProductLineSeedJsonOutput(runSeedMissionControlCli([
      '--db',
      ':memory:',
      '--mode',
      'apply',
      '--allow-existing',
      '--json',
    ], { db: wrapperDb }))
    const wrapperVerify = parseProductLineSeedJsonOutput(runSeedMissionControlCli([
      '--db',
      ':memory:',
      '--mode',
      'verify',
      '--json',
    ], { db: wrapperDb }))

    expect(wrapperPreflight).toMatchObject({
      schema_version: 'product-line-seed-result-v1',
      ok: true,
      entrypoint: 'seed:mission-control',
      mode: 'preflight',
      status: 'ready',
      mutation_status: 'not_mutated',
      config: { path: 'docs/ai/product-lines/mission-control.yaml', product_line_slug: 'mission-control' },
    })
    expect(evidenceCategoryKeys(wrapperPreflight)).toEqual(evidenceCategoryKeys(genericPreflight))
    expect(snapshotSurfaceCounts(wrapperPreflight)).toEqual(snapshotSurfaceCounts(genericPreflight))
    expect(wrapperApply).toMatchObject({
      ok: true,
      entrypoint: 'seed:mission-control',
      mode: 'apply',
      status: 'seeded',
      mutation_status: 'applied',
      config: { path: 'docs/ai/product-lines/mission-control.yaml', product_line_slug: 'mission-control' },
    })
    expect(wrapperRefusal).toMatchObject({
      ok: false,
      entrypoint: 'seed:mission-control',
      mode: 'apply',
      status: 'existing_target_refused',
      code: 'EXISTING_TARGET_REQUIRES_ALLOW_EXISTING',
      action_required: '--allow-existing',
    })
    expect(wrapperAllowExisting).toMatchObject({
      ok: true,
      entrypoint: 'seed:mission-control',
      mode: 'apply',
      status: 'seeded',
      mutation_status: 'applied',
      config: { path: 'docs/ai/product-lines/mission-control.yaml', product_line_slug: 'mission-control' },
    })
    expect(wrapperVerify).toMatchObject({
      ok: true,
      entrypoint: 'seed:mission-control',
      mode: 'verify',
      status: 'verified',
      mutation_status: 'verified',
    })
    wrapperDb.close()
  })
})
