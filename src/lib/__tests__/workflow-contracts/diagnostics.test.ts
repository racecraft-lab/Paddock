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
  })
})
