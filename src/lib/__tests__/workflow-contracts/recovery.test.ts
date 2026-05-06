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
})
