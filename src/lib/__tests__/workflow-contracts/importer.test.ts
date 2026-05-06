import { describe, expect, it } from 'vitest'
import { importWorkflowContract } from '@/lib/workflow-contracts/importer'
import { makeContract, makeWorkflowDb } from './test-helpers'

describe('workflow contract importer', () => {
  it('dry-run persists diagnostics and diff but mutates no workflow templates or snapshots', () => {
    const db = makeWorkflowDb()
    const result = importWorkflowContract(db, makeContract(), { mode: 'dry-run', sourcePath: 'contract.yaml' })
    expect(result.ok).toBe(true)
    expect(result.mutation_status).toBe('dry_run')
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_templates').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_contract_runs').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_contract_snapshots').get()).toEqual({ count: 0 })
  })

  it('apply transactionally upserts owned templates and preserves unrelated templates', () => {
    const db = makeWorkflowDb()
    db.prepare('INSERT INTO workflow_templates (workspace_id, slug, name, task_prompt, model) VALUES (2, ?, ?, ?, ?)').run('intake', 'Unrelated', 'Keep me', 'sonnet')
    const result = importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })
    expect(result.ok).toBe(true)
    expect(result.mutation_status).toBe('applied')
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_templates WHERE workspace_id = 1').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT name FROM workflow_templates WHERE workspace_id = 2 AND slug = ?').get('intake')).toEqual({ name: 'Unrelated' })
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_contract_snapshots').get()).toEqual({ count: 1 })
  })

  it('fails closed before mutation when validation fails', () => {
    const db = makeWorkflowDb()
    const bad = makeContract({ templates: [{ ...makeContract().templates[0]!, task_prompt: 'Use {{secrets.token}}' }] })
    const result = importWorkflowContract(db, bad, { mode: 'apply', sourcePath: 'bad.yaml' })
    expect(result.ok).toBe(false)
    expect(result.mutation_status).toBe('not_mutated')
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_templates').get()).toEqual({ count: 0 })
    const error = db.prepare('SELECT details FROM workflow_contract_run_errors').get() as { details: string }
    expect(error.details).not.toContain('token')
  })
})
