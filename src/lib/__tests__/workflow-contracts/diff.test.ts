import { describe, expect, it } from 'vitest'
import { diffWorkflowTemplates } from '@/lib/workflow-contracts/diff'
import { makeContract } from './test-helpers'

describe('workflow contract diff', () => {
  it('classifies create, update, disable, unchanged, and unrelated templates by workspace plus slug', () => {
    const contract = makeContract({
      templates: [
        makeContract().templates[0]!,
        { ...makeContract().templates[0]!, slug: 'new-template', name: 'New Template' },
      ],
    })
    const diff = diffWorkflowTemplates(contract, [
      { id: 1, workspace_id: 1, slug: 'intake', name: 'Old Intake', task_prompt: 'old', enabled: 1 },
      { id: 2, workspace_id: 1, slug: 'removed', name: 'Removed', task_prompt: 'old', enabled: 1 },
      { id: 3, workspace_id: 2, slug: 'intake', name: 'Other Workspace', task_prompt: 'old', enabled: 1 },
    ])
    expect(diff.update.map(item => item.slug)).toContain('intake')
    expect(diff.create.map(item => item.slug)).toContain('new-template')
    expect(diff.disable.map(item => item.slug)).toContain('removed')
    expect(diff.unrelated.map(item => item.slug)).toContain('intake')
  })
})
