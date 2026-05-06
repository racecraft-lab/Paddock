import { describe, expect, it } from 'vitest'
import { loadWorkflowContractFromString } from '@/lib/workflow-contracts/yaml-loader'

const validYaml = `
family: mission-control
version: workflow-contract-v1
workspace_id: 1
allowed_variable_namespaces:
  - workspace
  - task
templates:
  - slug: intake
    name: Intake
    model: sonnet
    task_prompt: |
      Review {{task.title}} for {{workspace.name}}.
    timeout_seconds: 300
`

describe('workflow contract YAML loader', () => {
  it('loads a single YAML 1.2 mapping and preserves LF-normalized literal prompt text', () => {
    const contract = loadWorkflowContractFromString(validYaml.replaceAll('\n', '\r\n'), 'contract.yaml')
    expect(contract.templates[0]?.task_prompt).toBe('Review {{task.title}} for {{workspace.name}}.\n')
  })

  it.each([
    ['multi-document streams', `${validYaml}\n---\nfamily: other\n`],
    ['non-mapping roots', '- one\n- two\n'],
    ['duplicate keys', 'family: one\nfamily: two\n'],
    ['custom tags', 'family: !unsafe value\n'],
    ['anchors', 'family: &family mission-control\nversion: *family\n'],
    ['merge keys', 'base: &base\n  family: mission-control\n<<: *base\n'],
    ['folded prompt scalars', validYaml.replace('task_prompt: |', 'task_prompt: >')],
  ])('rejects %s before canonical model construction', (_label, source) => {
    expect(() => loadWorkflowContractFromString(source, 'bad.yaml')).toThrow(/YAML|contract|prompt|anchor|duplicate|mapping|document/i)
  })

  it('passes malformed template items through for structured validation', () => {
    const contract = loadWorkflowContractFromString(`
family: mission-control
version: workflow-contract-v1
workspace_id: 1
allowed_variable_namespaces:
  - workspace
  - task
templates:
  - null
`, 'bad-template.yaml')

    expect(contract.templates[0]).toBeNull()
  })
})
