import { describe, expect, it } from 'vitest'
import { parseWorkflowContractCliArgs } from '../../../../scripts/workflow-contracts/workflow-contract-cli'

describe('workflow contract CLI arguments', () => {
  it('defaults import to dry-run and rejects apply plus dry-run together', () => {
    expect(parseWorkflowContractCliArgs(['import', '--file', 'contract.yaml'])).toMatchObject({ command: 'import', mode: 'dry-run' })
    expect(() => parseWorkflowContractCliArgs(['import', '--file', 'contract.yaml', '--apply', '--dry-run'])).toThrow(/mutually exclusive/i)
  })

  it('maps export and recover commands deterministically', () => {
    expect(parseWorkflowContractCliArgs(['export', '--workspace-id', '2'])).toMatchObject({ command: 'export', workspaceId: 2 })
    expect(parseWorkflowContractCliArgs(['recover', '--apply'])).toMatchObject({ command: 'recover', mode: 'apply' })
  })
})
