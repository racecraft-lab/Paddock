import { describe, expect, it } from 'vitest'
import { parseWorkflowContractCliArgs } from '../../../../scripts/workflow-contracts/workflow-contract-cli'

describe('workflow contract CLI arguments', () => {
  it('defaults import to dry-run and rejects apply plus dry-run together', () => {
    const parsed = parseWorkflowContractCliArgs(['import', '--file', 'contract.yaml'])
    expect(parsed).toMatchObject({ command: 'import', mode: 'dry-run' })
    expect(parsed.command === 'import' ? parsed.workspaceId : undefined).toBeUndefined()
    expect(() => parseWorkflowContractCliArgs(['import', '--file', 'contract.yaml', '--apply', '--dry-run'])).toThrow(/mutually exclusive/i)
  })

  it('maps export and recover commands deterministically', () => {
    expect(parseWorkflowContractCliArgs(['export', '--workspace-id', '2'])).toMatchObject({ command: 'export', workspaceId: 2 })
    expect(parseWorkflowContractCliArgs(['export', '--workspace', '3'])).toMatchObject({ command: 'export', workspaceId: 3 })
    expect(parseWorkflowContractCliArgs(['recover', '--apply'])).toMatchObject({ command: 'recover', mode: 'apply' })
  })

  it('accepts documented source and workspace aliases and rejects unknown flags', () => {
    expect(parseWorkflowContractCliArgs(['import', '--source', 'docs/ai/workflows/mission-control', '--workspace', '2'])).toMatchObject({
      command: 'import',
      file: 'docs/ai/workflows/mission-control/workflow-contract.yaml',
      workspaceId: 2,
    })
    expect(parseWorkflowContractCliArgs(['import', '--source', 'contract.yaml', '--workspace', '3', '--json'])).toMatchObject({
      command: 'import',
      file: 'contract.yaml',
      workspaceId: 3,
    })
    expect(parseWorkflowContractCliArgs(['recover', '--workspace', '1', '--family', 'mission-control', '--snapshot', 'latest'])).toMatchObject({
      command: 'recover',
      workspaceId: 1,
    })
    expect(() => parseWorkflowContractCliArgs(['import', '--workspace', '2', '--typo'])).toThrow(/unknown flag/i)
  })
})
