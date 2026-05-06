import { describe, expect, it } from 'vitest'
import { computeContractHash, computeTemplateHashes } from '@/lib/workflow-contracts/hash'
import { makeContract } from './test-helpers'

describe('workflow contract hashing', () => {
  it('computes a versioned stable contract hash over sorted canonical JSON', () => {
    const contract = makeContract()
    const first = computeContractHash(contract)
    const second = computeContractHash({ ...contract, local_path: '/tmp/ignored', diagnostics_run_id: 99 })
    expect(first).toMatch(/^workflow-contract-hash-v1:sha256:[a-f0-9]{64}$/)
    expect(second).toBe(first)
  })

  it('normalizes prompt line endings before hashing', () => {
    const lf = makeContract()
    const crlf = makeContract({
      templates: [{ ...lf.templates[0]!, task_prompt: lf.templates[0]!.task_prompt.replaceAll('\n', '\r\n') }],
    })
    expect(computeContractHash(crlf)).toBe(computeContractHash(lf))
  })

  it('sorts templates by slug before hashing', () => {
    const base = makeContract()
    const other = { ...base.templates[0]!, slug: 'aaa-review', name: 'AAA Review' }
    const first = makeContract({ templates: [base.templates[0]!, other] })
    const second = makeContract({ templates: [other, base.templates[0]!] })
    expect(computeContractHash(first)).toBe(computeContractHash(second))
  })

  it('computes distinct per-template routing and output-schema hashes', () => {
    const hashes = computeTemplateHashes(makeContract().templates[0]!)
    expect(hashes.routing_rule_hash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(hashes.output_schema_hash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(hashes.routing_rule_hash).not.toBe(hashes.output_schema_hash)
  })
})
