import { describe, expect, it } from 'vitest'
import { importWorkflowContract } from '@/lib/workflow-contracts/importer'
import { loadWorkflowContractFromFile } from '@/lib/workflow-contracts/yaml-loader'
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
    db.prepare('INSERT INTO workflow_templates (workspace_id, slug, name, task_prompt, model, created_by) VALUES (1, ?, ?, ?, ?, ?)').run('manual', 'Manual', 'Keep manual', 'sonnet', 'system')
    const result = importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })
    expect(result.ok).toBe(true)
    expect(result.mutation_status).toBe('applied')
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_templates WHERE workspace_id = 1').get()).toEqual({ count: 2 })
    expect(db.prepare('SELECT enabled FROM workflow_templates WHERE workspace_id = 1 AND slug = ?').get('manual')).toEqual({ enabled: 1 })
    expect(db.prepare('SELECT name FROM workflow_templates WHERE workspace_id = 2 AND slug = ?').get('intake')).toEqual({ name: 'Unrelated' })
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_contract_snapshots').get()).toEqual({ count: 1 })
  })

  it('fails closed when a contract slug collides with a manual same-workspace template', () => {
    const db = makeWorkflowDb()
    db.prepare('INSERT INTO workflow_templates (workspace_id, slug, name, task_prompt, model, created_by) VALUES (1, ?, ?, ?, ?, ?)').run('intake', 'Manual Intake', 'Keep manual', 'sonnet', 'system')

    const result = importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('validation_failed')
    expect(result.mutation_status).toBe('not_mutated')
    expect(db.prepare('SELECT name, created_by FROM workflow_templates WHERE workspace_id = 1 AND slug = ?').get('intake')).toEqual({
      name: 'Manual Intake',
      created_by: 'system',
    })
    expect(db.prepare('SELECT COUNT(*) as count FROM workflow_contract_snapshots').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT code FROM workflow_contract_run_errors').get()).toEqual({ code: 'WORKFLOW_TEMPLATE_OWNERSHIP_CONFLICT' })
  })

  it('updates persisted template fields beyond prompt, model, routing rules, and output schema', () => {
    const db = makeWorkflowDb()
    importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })

    const changed = makeContract({
      templates: [{
        ...makeContract().templates[0]!,
        description: 'Changed description',
        timeout_seconds: 600,
        agent_role: 'reviewer',
        tags: ['changed'],
        next_template_slug: 'implementation',
        produces_pr: true,
        external_terminal_event: 'terminal.ready',
        allow_redacted_artifacts: true,
      }],
    })
    const result = importWorkflowContract(db, changed, { mode: 'apply', sourcePath: 'contract.yaml' })

    expect(result.diff?.update.map(template => template.slug)).toEqual(['intake'])
    expect(db.prepare(`
      SELECT description, timeout_seconds, agent_role, tags, next_template_slug,
        produces_pr, external_terminal_event, allow_redacted_artifacts
      FROM workflow_templates WHERE workspace_id = 1 AND slug = ?
    `).get('intake')).toEqual({
      description: 'Changed description',
      timeout_seconds: 600,
      agent_role: 'reviewer',
      tags: JSON.stringify(['changed']),
      next_template_slug: 'implementation',
      produces_pr: 1,
      external_terminal_event: 'terminal.ready',
      allow_redacted_artifacts: 1,
    })
  })

  it('disables only previously imported workflow-contract templates missing from the new contract', () => {
    const db = makeWorkflowDb()
    db.prepare('INSERT INTO workflow_templates (workspace_id, slug, name, task_prompt, model, created_by) VALUES (1, ?, ?, ?, ?, ?)').run('old-contract', 'Old Contract', 'Disable me', 'sonnet', 'workflow-contract')
    db.prepare('INSERT INTO workflow_templates (workspace_id, slug, name, task_prompt, model, created_by) VALUES (1, ?, ?, ?, ?, ?)').run('manual', 'Manual', 'Keep manual', 'sonnet', 'system')
    const result = importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })
    expect(result.ok).toBe(true)
    expect(db.prepare('SELECT enabled FROM workflow_templates WHERE slug = ?').get('old-contract')).toEqual({ enabled: 0 })
    expect(db.prepare('SELECT enabled FROM workflow_templates WHERE slug = ?').get('manual')).toEqual({ enabled: 1 })
  })

  it('omits disabled workflow-contract templates from recovery snapshots', () => {
    const db = makeWorkflowDb()
    db.prepare('INSERT INTO workflow_templates (workspace_id, slug, name, task_prompt, model, created_by, enabled) VALUES (1, ?, ?, ?, ?, ?, ?)').run('old-contract', 'Old Contract', 'Disabled old contract', 'sonnet', 'workflow-contract', 0)

    const result = importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })

    expect(result.ok).toBe(true)
    const snapshot = db.prepare('SELECT runtime_templates_json FROM workflow_contract_snapshots').get() as { runtime_templates_json: string }
    const rows = JSON.parse(snapshot.runtime_templates_json) as Array<{ slug?: string }>
    expect(rows.map(row => row.slug)).toEqual(['intake'])
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

  it('imports the Mission Control pilot issue triage disposition taxonomy and actionable routing rule', () => {
    const db = makeWorkflowDb()
    const contract = loadWorkflowContractFromFile('docs/ai/workflows/mission-control/workflow-contract.yaml')
    const triage = contract.templates.find(template => template.slug === 'mission-control_issue_triage')

    expect(triage).toBeDefined()
    expect(triage!.next_template_slug ?? null).toBeNull()
    expect(triage!.routing_rules).toEqual([
      {
        when: '$.disposition == "ACTIONABLE_REMEDIATION"',
        next_template_slug: 'mission-control_remediation_plan',
      },
    ])
    expect(triage!.output_schema).toMatchObject({
      required: ['disposition', 'rationale'],
      properties: {
        disposition: {
          type: 'string',
          enum: [
            'ACTIONABLE_REMEDIATION',
            'DUPLICATE',
            'OBSOLETE',
            'INVALID',
            'NEEDS_HUMAN',
            'NEEDS_SPECIALIST',
            'NEEDS_SPEC',
          ],
        },
        rationale: { type: 'string' },
      },
    })

    const result = importWorkflowContract(db, contract, {
      mode: 'apply',
      sourcePath: 'docs/ai/workflows/mission-control/workflow-contract.yaml',
    })

    expect(result.ok).toBe(true)
    const runtime = db.prepare(`
      SELECT output_schema, routing_rules, next_template_slug
      FROM workflow_templates
      WHERE workspace_id = 1 AND slug = 'mission-control_issue_triage'
    `).get() as { output_schema: string; routing_rules: string; next_template_slug: string | null }
    expect(JSON.parse(runtime.output_schema).properties.disposition.enum).toContain('ACTIONABLE_REMEDIATION')
    expect(JSON.parse(runtime.routing_rules)).toEqual(triage!.routing_rules)
    expect(runtime.next_template_slug).toBeNull()
  })
})
