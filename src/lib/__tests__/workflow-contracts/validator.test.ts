import { describe, expect, it } from 'vitest'
import { computeTemplateHashes } from '@/lib/workflow-contracts/hash'
import type { WorkflowContractTemplate } from '@/lib/workflow-contracts/types'
import { validateWorkflowContract } from '@/lib/workflow-contracts/validator'
import { makeContract } from './test-helpers'

describe('workflow contract validator', () => {
  it('accepts a valid Mission Control workflow contract', () => {
    const contract = makeContract()
    const result = validateWorkflowContract(contract)
    expect(result.ok).toBe(true)
  })

  it('rejects unknown template variables outside allowlisted namespaces', () => {
    const contract = makeContract({
      templates: [{ ...makeContract().templates[0]!, task_prompt: 'Do {{secrets.token}} now.' }],
    })
    const result = validateWorkflowContract(contract)
    expect(result.ok).toBe(false)
    expect(result.errors[0]?.code).toBe('UNKNOWN_TEMPLATE_VARIABLE')
    expect(result.errors[0]?.details).not.toContain('token')
  })

  it.each([
    ['tracker identity', { tracker: { type: 'github', identity_version: 'v2', repo: '', labels: [] } }],
    ['capability declarations', { capabilities: [''] }],
    ['adapter requirements', { adapter_requirements: [''] }],
    ['feature-flag dependencies', { feature_flags: ['not-a-feature'] }],
    ['governance declarations', { governance: 'invalid' }],
    ['concurrency declarations', { concurrency: { max_parallel: 0 } }],
    ['retry declarations', { retry: { max_attempts: -1 } }],
    ['sandbox declarations', { sandbox: { mode: 'root' } }],
  ])('rejects invalid %s before mutation', (_label, templatePatch) => {
    const base = makeContract().templates[0]!
    const result = validateWorkflowContract(makeContract({ templates: [{ ...base, ...(templatePatch as unknown as Partial<WorkflowContractTemplate>) }] }))
    expect(result.ok).toBe(false)
  })

  it('rejects routing and output schema hash mismatches when declared', () => {
    const base = makeContract().templates[0]!
    const hashes = computeTemplateHashes(base)
    const result = validateWorkflowContract(makeContract({
      templates: [{ ...base, routing_rule_hash: hashes.routing_rule_hash, output_schema_hash: 'bad-hash' }],
    }))
    expect(result.ok).toBe(false)
    expect(result.errors[0]?.code).toBe('OUTPUT_SCHEMA_HASH_MISMATCH')
  })
})
