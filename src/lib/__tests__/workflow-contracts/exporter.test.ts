import { describe, expect, it } from 'vitest'
import { exportWorkflowContractMarkdown } from '@/lib/workflow-contracts/exporter'
import { computeContractHash } from '@/lib/workflow-contracts/hash'
import { importWorkflowContract } from '@/lib/workflow-contracts/importer'
import { makeContract, makeWorkflowDb } from './test-helpers'

describe('workflow contract exporter', () => {
  it('exports deterministic Markdown review output with stable hashes', () => {
    const db = makeWorkflowDb()
    importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })
    const first = exportWorkflowContractMarkdown(db, { family: 'mission-control', workspaceId: 1 })
    const second = exportWorkflowContractMarkdown(db, { family: 'mission-control', workspaceId: 1 })
    expect(first.markdown).toBe(second.markdown)
    expect(first.markdown).toContain('workflow-contract-hash-v1:sha256:')
    expect(first.markdown).toContain('Paddock Intake')
  })

  it('redacts secret-like values in Markdown review output', () => {
    const db = makeWorkflowDb()
    const contract = makeContract({
      templates: [{ ...makeContract().templates[0]!, task_prompt: 'Use token sk-test-secret-value and password hunter2.' }],
    })
    importWorkflowContract(db, contract, { mode: 'apply', sourcePath: 'contract.yaml' })
    const exportResult = exportWorkflowContractMarkdown(db, { family: 'mission-control', workspaceId: 1 })
    expect(exportResult.markdown).not.toContain('sk-test-secret-value')
    expect(exportResult.markdown).not.toContain('hunter2')
  })

  it('preserves future policy declarations from the last-known-good canonical snapshot', () => {
    const db = makeWorkflowDb()
    const base = makeContract().templates[0]!
    const contract = makeContract({
      templates: [{
        ...base,
        capabilities: ['code-edit', 'test-run'],
        adapter_requirements: ['codex-cli'],
        feature_flags: ['FEATURE_RC_FACTORY_WORKFLOWS'],
        governance: { budget_policy: 'advisory' },
        concurrency: { max_parallel: 2 },
        retry: { max_attempts: 1 },
        sandbox: { mode: 'workspace-write' },
        prompt_version: 'v1',
      }],
    })
    importWorkflowContract(db, contract, { mode: 'apply', sourcePath: 'contract.yaml' })
    const exportResult = exportWorkflowContractMarkdown(db, { family: 'mission-control', workspaceId: 1 })
    expect(exportResult.contract.templates[0]?.capabilities).toEqual(['code-edit', 'test-run'])
    expect(exportResult.contract.templates[0]?.governance).toEqual({ budget_policy: 'advisory' })
    expect(exportResult.contract_hash).toBe(computeContractHash(contract))
  })

  it('excludes unrelated same-workspace templates from generated review output', () => {
    const db = makeWorkflowDb()
    db.prepare('INSERT INTO workflow_templates (workspace_id, slug, name, task_prompt, model, created_by) VALUES (1, ?, ?, ?, ?, ?)').run('manual', 'Manual Template', 'manual prompt', 'sonnet', 'system')
    importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })
    const exportResult = exportWorkflowContractMarkdown(db, { family: 'mission-control', workspaceId: 1 })
    expect(exportResult.contract.templates.map(template => template.slug)).not.toContain('manual')
    expect(exportResult.markdown).not.toContain('Manual Template')
  })

  it('excludes disabled workflow-contract templates from snapshot-backed review output', () => {
    const db = makeWorkflowDb()
    db.prepare('INSERT INTO workflow_templates (workspace_id, slug, name, task_prompt, model, created_by) VALUES (1, ?, ?, ?, ?, ?)').run('old-contract', 'Old Contract', 'old prompt', 'sonnet', 'workflow-contract')
    importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })

    const exportResult = exportWorkflowContractMarkdown(db, { family: 'mission-control', workspaceId: 1 })

    expect(exportResult.contract.templates.map(template => template.slug)).toEqual(['intake'])
    expect(exportResult.markdown).not.toContain('Old Contract')
  })

  it('persists export diagnostics with the artifact path and contract hash', () => {
    const db = makeWorkflowDb()
    importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })
    const exportResult = exportWorkflowContractMarkdown(db, {
      family: 'mission-control',
      workspaceId: 1,
      exportPath: 'docs/ai/workflows/mission-control/exports/workflow-contract.md',
    })

    expect(db.prepare(`
      SELECT mode, status, mutation_status, export_path, contract_hash
      FROM workflow_contract_runs
      WHERE mode = 'export'
    `).get()).toEqual({
      mode: 'export',
      status: 'success',
      mutation_status: 'not_mutated',
      export_path: 'docs/ai/workflows/mission-control/exports/workflow-contract.md',
      contract_hash: exportResult.contract_hash,
    })
  })
})
