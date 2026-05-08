import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { buildMissionControlSeedEvidence } from '@/lib/mission-control-seed/evidence'
import { applyMissionControlSeed } from '@/lib/mission-control-seed/seed'
import { makeMissionControlSeedDb, missionControlContractPath } from './test-db'

describe('mission-control seed guardrails', () => {
  it('keeps future task-control-plane, runner, sandbox, harness, and auto-merge flags disabled or absent', () => {
    const db = makeMissionControlSeedDb()

    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    const evidence = buildMissionControlSeedEvidence(db, { contractPath: missionControlContractPath() })
    expect(evidence.flags.disabled_or_absent).toEqual(
      expect.arrayContaining([
        'FEATURE_TASK_CONTROL_PLANE',
        'FEATURE_AGENT_RUNNER_SANDBOXES',
        'FEATURE_AGENT_RUNNER',
        'FEATURE_HARNESS_ADAPTERS',
        'FEATURE_AUTO_MERGE',
      ]),
    )
  })

  it('creates no pilot tasks, successor records, per-agent seed tasks, claims, dispatches, runner rows, or sandbox rows', () => {
    const db = makeMissionControlSeedDb()

    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    expect(buildMissionControlSeedEvidence(db, { contractPath: missionControlContractPath() }).non_dispatch).toEqual({
      new_pilot_tasks: 0,
      new_successor_records: 0,
      new_per_agent_seed_tasks: 0,
      claims: 0,
      dispatched_tasks: 0,
      runner_rows: 0,
      sandbox_rows: 0,
      auto_merge_markers: 0,
    })
  })

  it('does not misreport pre-existing execution rows as SPEC-009B side effects', () => {
    const db = makeMissionControlSeedDb()
    db.exec(`
      CREATE TABLE task_claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL
      );
    `)
    const task = db.prepare(`
      INSERT INTO tasks (
        title, status, assigned_to, created_by, parent_task_id, metadata,
        workspace_id, dispatch_attempts
      )
      VALUES (
        'Existing pilot cleanup task', 'in_progress', 'legacy-agent',
        'legacy-sync', 1, '{"auto_merge":true}', 1, 2
      )
    `).run()
    db.prepare('INSERT INTO task_claims (task_id) VALUES (?)').run(Number(task.lastInsertRowid))

    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    expect(buildMissionControlSeedEvidence(db, { contractPath: missionControlContractPath() }).non_dispatch).toEqual({
      new_pilot_tasks: 0,
      new_successor_records: 0,
      new_per_agent_seed_tasks: 0,
      claims: 0,
      dispatched_tasks: 0,
      runner_rows: 0,
      sandbox_rows: 0,
      auto_merge_markers: 0,
    })
  })

  it('keeps SPEC-009B source free of synthetic issue, scheduler, runner, sandbox, generic Product Line B, and auto-merge paths', () => {
    const source = [
      'src/lib/mission-control-seed/seed.ts',
      'src/lib/mission-control-seed/preflight.ts',
      'src/lib/mission-control-seed/evidence.ts',
      'scripts/seed-mission-control-product-line.ts',
    ].map((path) => readFileSync(path, 'utf8')).join('\n')

    expect(source).not.toMatch(/github\s+issue\s+create|createSyntheticIssue|createTask\(/i)
    expect(source).not.toMatch(/startScheduler|launchRunner|createSandbox|runSandbox|autoMergePullRequest/i)
    expect(source).not.toMatch(/Product Line B|FocusEngine seeder/i)
  })
})
