import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { buildMissionControlSeedEvidence, verifyMissionControlSeed } from '@/lib/mission-control-seed/evidence'
import { applyMissionControlSeed } from '@/lib/mission-control-seed/seed'
import { runSeedMissionControlCli } from '../../../../scripts/seed-mission-control-product-line'
import { makeMissionControlSeedDb, missionControlContractPath } from './test-db'

describe('mission-control seed evidence', () => {
  it('emits counts, workflow, flag, governance, and non-dispatch evidence after apply', () => {
    const db = makeMissionControlSeedDb()

    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })
    const evidence = buildMissionControlSeedEvidence(db, { contractPath: missionControlContractPath() })

    expect(evidence.counts).toMatchObject({
      mission_control_product_lines: 1,
      facility_workspaces: 1,
      department_projects: 6,
      required_role_assignments: 6,
      workflow_templates: 9,
      governance_policies: 3,
      new_pilot_tasks: 0,
      new_successor_records: 0,
      new_per_agent_seed_tasks: 0,
    })
    expect(evidence.flags.enabled).toContain('PILOT_MISSION_CONTROL_E2E')
    expect(evidence.flags.disabled_or_absent).toEqual(
      expect.arrayContaining([
        'PILOT_PRODUCT_LINE_A_E2E',
        'FEATURE_TASK_CONTROL_PLANE',
        'FEATURE_AGENT_RUNNER_SANDBOXES',
      ]),
    )
    expect(evidence.governance.identities.sort()).toEqual([
      'SPEC-009B:mission-control:daily-token-budget',
      'SPEC-009B:mission-control:daily-usd-budget',
      'SPEC-009B:mission-control:wip-visibility-template',
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
    const db = makeMissionControlSeedDb()

    const first = applyMissionControlSeed(db, { contractPath: missionControlContractPath() })
    const firstEvidence = buildMissionControlSeedEvidence(db, { contractPath: missionControlContractPath() })
    const second = applyMissionControlSeed(db, { contractPath: missionControlContractPath() })
    const secondEvidence = buildMissionControlSeedEvidence(db, { contractPath: missionControlContractPath() })
    const verified = verifyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(firstEvidence.identity_hash).toBe(secondEvidence.identity_hash)
    expect(verified.ok).toBe(true)
    expect(verified.status).toBe('verified')
  })

  it('fails verify mode with exit code 4 on invariant failure and redacts output', () => {
    const db = makeMissionControlSeedDb()
    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })
    db.prepare(`
      INSERT INTO tasks (title, workspace_id, status, assigned_to, created_by, github_repo, github_issue_number)
      VALUES (
        'Bad dispatched pilot task', 1, 'in_progress',
        'mission-control-platform-dev', 'SPEC-009B',
        'racecraft-lab/mission-control', 123
      )
    `).run()

    const result = verifyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    expect(result.ok).toBe(false)
    expect(result.exit_code).toBe(4)
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('documents backup/export-first cleanup, explicit confirmation, destructive warnings, and post-cleanup verification', () => {
    const runbook = readFileSync('docs/runbooks/mission-control-seed-predeploy.md', 'utf8')

    expect(runbook).toContain('backup/export first')
    expect(runbook).toContain('explicit operator confirmation')
    expect(runbook).toContain('destructive cleanup')
    expect(runbook).toContain('post-cleanup verification')
    expect(runbook).toContain('ssh hall')
  })

  it('exposes CLI mode exit code mapping for preflight, apply, verify, and unexpected errors', async () => {
    const db = makeMissionControlSeedDb()

    const preflight = await runSeedMissionControlCli(['--mode', 'preflight', '--json'], { db, contractPath: missionControlContractPath() })
    const apply = await runSeedMissionControlCli(['--mode', 'apply', '--json'], { db, contractPath: missionControlContractPath() })
    const verify = await runSeedMissionControlCli(['--mode', 'verify', '--json'], { db, contractPath: missionControlContractPath() })
    const unexpected = await runSeedMissionControlCli(['--mode', 'bad-mode', '--json'], { db, contractPath: missionControlContractPath() })

    expect(preflight.exitCode).toBe(0)
    expect(apply.exitCode).toBe(0)
    expect(verify.exitCode).toBe(0)
    expect(unexpected.exitCode).toBe(5)
    expect(JSON.parse(verify.stdout).mode).toBe('verify')
  })
})
