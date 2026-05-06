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
    expect(first.markdown).toContain('Mission Control Intake')
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
})
