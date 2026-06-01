import { describe, expect, it } from 'vitest'
import { importWorkflowContract } from '@/lib/workflow-contracts/importer'
import { recoverLastKnownGood } from '@/lib/workflow-contracts/recovery'
import { makeContract, makeWorkflowDb } from './test-helpers'

describe('workflow contract recovery', () => {
  it('reports no snapshot without mutating templates', () => {
    const db = makeWorkflowDb()
    const result = recoverLastKnownGood(db, { family: 'mission-control', workspaceId: 1, mode: 'dry-run' })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('NO_LAST_KNOWN_GOOD')
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_templates').get()).toEqual({ count: 0 })
  })

  it('dry-runs and explicitly applies the last-known-good snapshot', () => {
    const db = makeWorkflowDb()
    importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })
    db.prepare('DELETE FROM workflow_templates WHERE workspace_id = 1').run()
    const dryRun = recoverLastKnownGood(db, { family: 'mission-control', workspaceId: 1, mode: 'dry-run' })
    expect(dryRun.ok).toBe(true)
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_templates').get()).toEqual({ count: 0 })
    const apply = recoverLastKnownGood(db, { family: 'mission-control', workspaceId: 1, mode: 'apply' })
    expect(apply.ok).toBe(true)
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_templates').get()).toEqual({ count: 1 })
  })

  it('does not restore unrelated same-workspace templates from workflow-contract snapshots', () => {
    const db = makeWorkflowDb()
    db.prepare('INSERT INTO workflow_templates (workspace_id, slug, name, task_prompt, model, created_by) VALUES (1, ?, ?, ?, ?, ?)').run('manual', 'Manual Template', 'manual prompt', 'sonnet', 'system')
    importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })
    db.prepare('DELETE FROM workflow_templates WHERE workspace_id = 1').run()
    const apply = recoverLastKnownGood(db, { family: 'mission-control', workspaceId: 1, mode: 'apply' })
    expect(apply.ok).toBe(true)
    expect(db.prepare('SELECT slug FROM workflow_templates ORDER BY slug ASC').all()).toEqual([{ slug: 'intake' }])
  })

  it('does not recover workflow-contract templates removed before the latest snapshot', () => {
    const db = makeWorkflowDb()
    const base = makeContract().templates[0]!
    const removed = { ...base, slug: 'removed', name: 'Removed Contract Template' }
    importWorkflowContract(db, makeContract({ templates: [base, removed] }), { mode: 'apply', sourcePath: 'contract.yaml' })
    importWorkflowContract(db, makeContract({ templates: [base] }), { mode: 'apply', sourcePath: 'contract.yaml' })
    expect(db.prepare('SELECT enabled FROM workflow_templates WHERE slug = ?').get('removed')).toEqual({ enabled: 0 })

    db.prepare('DELETE FROM workflow_templates WHERE workspace_id = 1').run()
    const apply = recoverLastKnownGood(db, { family: 'mission-control', workspaceId: 1, mode: 'apply' })

    expect(apply.ok).toBe(true)
    expect(db.prepare('SELECT slug, enabled FROM workflow_templates ORDER BY slug ASC').all()).toEqual([
      { slug: 'intake', enabled: 1 },
    ])
  })

  it('filters unrelated rows from legacy snapshots that captured all workspace templates', () => {
    const db = makeWorkflowDb()
    const contract = makeContract()
    db.prepare(`
      INSERT INTO workflow_contract_snapshots (family, workspace_id, contract_hash, canonical_json, runtime_templates_json, recovery_command)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'mission-control',
      1,
      'workflow-contract-hash-v1:sha256:legacy',
      JSON.stringify(contract),
      JSON.stringify([
        {
          workspace_id: 1,
          slug: 'intake',
          name: 'Paddock Intake',
          task_prompt: 'Review {{task.title}} for {{workspace.name}}.',
          model: 'sonnet',
          created_by: 'workflow-contract',
        },
        {
          workspace_id: 1,
          slug: 'manual',
          name: 'Manual Template',
          task_prompt: 'manual prompt',
          model: 'sonnet',
          created_by: 'system',
        },
      ]),
      'pnpm workflow-contract recover --workspace-id 1 --apply'
    )

    const apply = recoverLastKnownGood(db, { family: 'mission-control', workspaceId: 1, mode: 'apply' })

    expect(apply.ok).toBe(true)
    expect(db.prepare('SELECT slug FROM workflow_templates ORDER BY slug ASC').all()).toEqual([{ slug: 'intake' }])
  })

  it('filters disabled workflow-contract rows from legacy snapshots', () => {
    const db = makeWorkflowDb()
    const contract = makeContract()
    db.prepare(`
      INSERT INTO workflow_contract_snapshots (family, workspace_id, contract_hash, canonical_json, runtime_templates_json, recovery_command)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'mission-control',
      1,
      'workflow-contract-hash-v1:sha256:legacy-disabled',
      JSON.stringify(contract),
      JSON.stringify([
        {
          workspace_id: 1,
          slug: 'intake',
          name: 'Paddock Intake',
          task_prompt: 'Review {{task.title}} for {{workspace.name}}.',
          model: 'sonnet',
          enabled: 1,
          created_by: 'workflow-contract',
        },
        {
          workspace_id: 1,
          slug: 'old-contract',
          name: 'Old Contract',
          task_prompt: 'disabled prompt',
          model: 'sonnet',
          enabled: 0,
          created_by: 'workflow-contract',
        },
      ]),
      'pnpm workflow-contract recover --workspace-id 1 --apply'
    )

    const apply = recoverLastKnownGood(db, { family: 'mission-control', workspaceId: 1, mode: 'apply' })

    expect(apply.ok).toBe(true)
    expect(db.prepare('SELECT slug FROM workflow_templates ORDER BY slug ASC').all()).toEqual([{ slug: 'intake' }])
  })
})
