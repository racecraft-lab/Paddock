import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runMissionControlPreflight } from '@/lib/mission-control-seed/preflight'
import { applyMissionControlSeed } from '@/lib/mission-control-seed/seed'
import { makeResidueSnapshotHash } from '@/lib/mission-control-seed/evidence'
import {
  makeMissionControlSeedDb,
  missionControlContractPath,
  operatorEvidenceFixturePath,
} from './test-db'

describe('mission-control seed preflight', () => {
  it('blocks non-Mission-Control project, task, cron, OpenClaw, and FocusEngine residue without mutating rows', () => {
    const db = makeMissionControlSeedDb()
    db.prepare(`
      INSERT INTO projects (workspace_id, name, slug, ticket_prefix, github_repo, github_sync_enabled)
      VALUES (1, 'FocusEngine', 'focusengine', 'FE', 'racecraft-lab/focusengine', 1)
    `).run()
    db.prepare(`
      INSERT INTO tasks (title, workspace_id, github_repo, github_issue_number)
      VALUES ('FocusEngine issue', 1, 'racecraft-lab/focusengine', 9)
    `).run()
    const beforeHash = makeResidueSnapshotHash(db)

    const result = runMissionControlPreflight(db, {
      contractPath: missionControlContractPath(),
      operatorEvidencePath: operatorEvidenceFixturePath(),
    })
    const applyResult = applyMissionControlSeed(db, {
      contractPath: missionControlContractPath(),
      operatorEvidencePath: operatorEvidenceFixturePath(),
    })
    const afterHash = makeResidueSnapshotHash(db)

    expect(result.ok).toBe(false)
    expect(result.status).toBe('blocked_preflight')
    if (result.status !== 'blocked_preflight') throw new Error('expected blocked preflight')
    expect(result.mutation_status).toBe('not_mutated')
    expect(result.residue.map((entry: { kind: string }) => entry.kind)).toEqual(
      expect.arrayContaining([
        'project_github_sync',
        'task_github_sync',
        'operator_cron',
        'openclaw_github_automation',
        'focusengine_operator_residue',
      ]),
    )
    expect(applyResult.ok).toBe(false)
    expect(applyResult.mutation_status).toBe('not_mutated')
    expect(beforeHash).toBe(afterHash)
    expect(db.prepare("SELECT COUNT(*) as count FROM workspaces WHERE slug = 'mission-control'").get()).toEqual({ count: 0 })
  })

  it('redacts blocked output and references the cleanup runbook', () => {
    const db = makeMissionControlSeedDb()

    const result = runMissionControlPreflight(db, {
      contractPath: missionControlContractPath(),
      operatorEvidencePath: operatorEvidenceFixturePath(),
    })
    const output = JSON.stringify(result)

    expect(result.ok).toBe(false)
    if (result.status !== 'blocked_preflight') throw new Error('expected blocked preflight')
    expect(result.cleanup_checklist).toBe('docs/runbooks/mission-control-seed-predeploy.md')
    expect(result.redaction.raw_secret_values_emitted).toBe(false)
    expect(output).not.toContain('ghp_focusengine_secret_value')
    expect(output).not.toContain('openclaw-operator-secret')
    expect(output).not.toContain('sk-focusengine-secret')
    expect(output).toContain('ssh hall')
    expect(output).toContain('racecraft-lab/focusengine')
  })

  it('allows FocusEngine OpenClaw runtime inventory when no GitHub sync or project residue is present', () => {
    const db = makeMissionControlSeedDb()
    const dir = mkdtempSync(join(tmpdir(), 'mc-seed-preflight-'))
    const runtimeInventoryPath = join(dir, 'operator-evidence.json')
    writeFileSync(runtimeInventoryPath, JSON.stringify({
      openclaw: {
        host: 'ssh hall',
        agents: [
          { name: 'focusengine-macos-dev', role: 'dev', managed_by: 'openclaw' },
          { name: 'focusengine-macos-review', role: 'review', managed_by: 'openclaw' },
        ],
      },
    }))

    const result = runMissionControlPreflight(db, {
      contractPath: missionControlContractPath(),
      operatorEvidencePath: runtimeInventoryPath,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ready preflight')
    expect(result.status).toBe('ready')
    expect(result.residue).toEqual([])
  })
})
