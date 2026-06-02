import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildPaddockSeedEvidence, verifyPaddockSeed } from '@/lib/paddock-seed/evidence'
import { applyPaddockSeed } from '@/lib/paddock-seed/seed'
import { DISABLED_OR_ABSENT_FLAGS, ENABLED_PADDOCK_FLAGS } from '@/lib/paddock-seed/types'
import { runSeedPaddockCli } from '../../../../scripts/seed-paddock-product-line'
import { makePaddockSeedDb, paddockContractPath } from './test-db'

describe('paddock seed evidence', () => {
  it('emits counts, workflow, flag, governance, and non-dispatch evidence after apply', () => {
    const db = makePaddockSeedDb()

    applyPaddockSeed(db, { contractPath: paddockContractPath() })
    const evidence = buildPaddockSeedEvidence(db, { contractPath: paddockContractPath() })

    expect(evidence.counts).toMatchObject({
      paddock_product_lines: 1,
      facility_workspaces: 1,
      department_projects: 6,
      required_role_assignments: 6,
      workflow_templates: 9,
      governance_policies: 3,
      new_pilot_tasks: 0,
      new_successor_records: 0,
      new_per_agent_seed_tasks: 0,
    })
    expect(evidence.flags.enabled.sort()).toEqual([...ENABLED_PADDOCK_FLAGS].sort())
    expect(evidence.flags.disabled_or_absent.sort()).toEqual([...DISABLED_OR_ABSENT_FLAGS].sort())
    expect(evidence.governance.identities.sort()).toEqual([
      'SPEC-009B:paddock:daily-token-budget',
      'SPEC-009B:paddock:daily-usd-budget',
      'SPEC-009B:paddock:wip-visibility-template',
    ].sort())
    expect(evidence.governance.normal_intake_decision).toBe('allow')
    expect(evidence.non_dispatch).toMatchObject({
      claims: 0,
      dispatched_tasks: 0,
      runner_rows: 0,
      sandbox_rows: 0,
      auto_merge_markers: 0,
    })
  })

  it('is idempotent across two apply runs and verify mode succeeds on the stable target', () => {
    const db = makePaddockSeedDb()

    const first = applyPaddockSeed(db, { contractPath: paddockContractPath() })
    const firstEvidence = buildPaddockSeedEvidence(db, { contractPath: paddockContractPath() })
    const second = applyPaddockSeed(db, { contractPath: paddockContractPath() })
    const secondEvidence = buildPaddockSeedEvidence(db, { contractPath: paddockContractPath() })
    const verified = verifyPaddockSeed(db, { contractPath: paddockContractPath() })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(firstEvidence.identity_hash).toBe(secondEvidence.identity_hash)
    expect(verified.ok).toBe(true)
    expect(verified.status).toBe('verified')
  })

  it('fails verify mode when any required feature flag is missing', () => {
    const db = makePaddockSeedDb()
    applyPaddockSeed(db, { contractPath: paddockContractPath() })
    const row = db.prepare("SELECT id, feature_flags FROM workspaces WHERE slug = 'paddock'").get() as {
      id: number
      feature_flags: string
    }
    const flags = JSON.parse(row.feature_flags) as Record<string, boolean>
    delete flags.FEATURE_GLOBAL_AEGIS
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?').run(JSON.stringify(flags), row.id)

    const result = verifyPaddockSeed(db, { contractPath: paddockContractPath() })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('required feature flag is not enabled: FEATURE_GLOBAL_AEGIS')
    }
  })

  it('fails verify mode when any disallowed feature flag is enabled', () => {
    const db = makePaddockSeedDb()
    applyPaddockSeed(db, { contractPath: paddockContractPath() })
    const row = db.prepare("SELECT id, feature_flags FROM workspaces WHERE slug = 'paddock'").get() as {
      id: number
      feature_flags: string
    }
    const flags = JSON.parse(row.feature_flags) as Record<string, boolean>
    flags.FEATURE_AUTO_MERGE = true
    db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?').run(JSON.stringify(flags), row.id)

    const result = verifyPaddockSeed(db, { contractPath: paddockContractPath() })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('disallowed feature flag is enabled: FEATURE_AUTO_MERGE')
    }
  })

  it('fails verify mode with exit code 4 on invariant failure and redacts output', () => {
    const db = makePaddockSeedDb()
    applyPaddockSeed(db, { contractPath: paddockContractPath() })
    db.prepare(`
      INSERT INTO tasks (title, workspace_id, status, assigned_to, created_by, github_repo, github_issue_number)
      VALUES (
        'Bad dispatched pilot task', 1, 'in_progress',
        'paddock-platform-dev', 'SPEC-009B',
        'racecraft-lab/Paddock', 123
      )
    `).run()

    const result = verifyPaddockSeed(db, { contractPath: paddockContractPath() })

    expect(result.ok).toBe(false)
    expect(result.exit_code).toBe(4)
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('documents backup/export-first cleanup, explicit confirmation, destructive warnings, and post-cleanup verification', () => {
    const runbook = readFileSync('docs/runbooks/paddock-seed-predeploy.md', 'utf8')

    expect(runbook).toContain('backup/export first')
    expect(runbook).toContain('explicit operator confirmation')
    expect(runbook).toContain('destructive cleanup')
    expect(runbook).toContain('post-cleanup verification')
    expect(runbook).toContain('ssh hall')
  })

  it('exposes CLI mode exit code mapping for preflight, apply, verify, and unexpected errors', async () => {
    const db = makePaddockSeedDb()

    const preflight = await runSeedPaddockCli(['--mode', 'preflight', '--json'], { db, contractPath: paddockContractPath() })
    const apply = await runSeedPaddockCli(['--mode', 'apply', '--json'], { db, contractPath: paddockContractPath() })
    const verify = await runSeedPaddockCli(['--mode', 'verify', '--json'], { db, contractPath: paddockContractPath() })
    const unexpected = await runSeedPaddockCli(['--mode', 'bad-mode', '--json'], { db, contractPath: paddockContractPath() })

    expect(preflight.exitCode).toBe(0)
    expect(apply.exitCode).toBe(0)
    expect(verify.exitCode).toBe(0)
    expect(unexpected.exitCode).toBe(5)
    expect(JSON.parse(verify.stdout).mode).toBe('verify')
  })

  it('fails fast for missing or unmigrated operator database paths', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mc-seed-cli-'))
    const missingDbPath = join(dir, 'missing.db')
    const emptyDbPath = join(dir, 'empty.db')
    writeFileSync(emptyDbPath, '')

    const missing = await runSeedPaddockCli([
      '--mode',
      'preflight',
      '--db',
      missingDbPath,
      '--contract',
      paddockContractPath(),
      '--json',
    ])
    const empty = await runSeedPaddockCli([
      '--mode',
      'preflight',
      '--db',
      emptyDbPath,
      '--contract',
      paddockContractPath(),
      '--json',
    ])

    expect(missing.exitCode).toBe(5)
    expect(existsSync(missingDbPath)).toBe(false)
    expect(JSON.parse(missing.stderr).error).toContain('Database file does not exist')
    expect(empty.exitCode).toBe(5)
    expect(JSON.parse(empty.stderr).error).toContain('Database missing required tables')
  })
})
