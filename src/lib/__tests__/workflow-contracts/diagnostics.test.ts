import { describe, expect, it } from 'vitest'
import { getWorkflowContractDiagnostics } from '@/lib/workflow-contracts/diagnostics'
import { importWorkflowContract } from '@/lib/workflow-contracts/importer'
import { makeContract, makeWorkflowDb } from './test-helpers'

describe('workflow contract diagnostics', () => {
  it('returns read-only run summaries with redacted error details', () => {
    const db = makeWorkflowDb()
    importWorkflowContract(db, makeContract({ templates: [{ ...makeContract().templates[0]!, task_prompt: 'Use {{secrets.token}}' }] }), {
      mode: 'dry-run',
      sourcePath: 'bad.yaml',
    })
    const diagnostics = getWorkflowContractDiagnostics(db, { family: 'mission-control', workspaceId: 1 })
    const error = diagnostics.runs[0]?.errors[0] as { details?: string } | undefined
    expect(diagnostics.runs).toHaveLength(1)
    expect(error?.details).not.toContain('token')
    expect(diagnostics.last_known_good_available).toBe(false)
    expect(diagnostics.last_successful_apply).toBeNull()
    expect(diagnostics.last_run).toMatchObject({
      mode: 'import_dry_run',
      status: 'validation_failed',
      source_paths: ['bad.yaml'],
    })
  })

  it('exposes last successful apply and last-known-good state beside the latest failed run', () => {
    const db = makeWorkflowDb()
    const applied = importWorkflowContract(db, makeContract(), { mode: 'apply', sourcePath: 'contract.yaml' })
    const failed = importWorkflowContract(db, makeContract({ templates: [{ ...makeContract().templates[0]!, task_prompt: 'Use {{secrets.token}}' }] }), {
      mode: 'dry-run',
      sourcePath: 'bad.yaml',
    })

    const diagnostics = getWorkflowContractDiagnostics(db, { family: 'mission-control', workspaceId: 1 })

    expect(diagnostics.last_known_good_available).toBe(true)
    expect(diagnostics.last_successful_apply).toMatchObject({
      run_id: applied.run_id,
      snapshot_id: 1,
      canonical_object_hash: applied.contract_hash,
    })
    expect(diagnostics.last_run).toMatchObject({
      id: failed.run_id,
      status: 'validation_failed',
      source_paths: ['bad.yaml'],
      hashes: { canonical_object_hash: failed.contract_hash },
    })
    expect((diagnostics.errors as Array<{ code: string }>).map(error => error.code)).toEqual(['UNKNOWN_TEMPLATE_VARIABLE'])
  })
})
