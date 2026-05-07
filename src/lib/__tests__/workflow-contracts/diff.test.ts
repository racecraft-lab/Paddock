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
      { id: 1, workspace_id: 1, slug: 'intake', name: 'Old Intake', task_prompt: 'old', enabled: 1, created_by: 'workflow-contract' },
      { id: 2, workspace_id: 1, slug: 'removed', name: 'Removed', task_prompt: 'old', enabled: 1, created_by: 'workflow-contract' },
      { id: 3, workspace_id: 2, slug: 'intake', name: 'Other Workspace', task_prompt: 'old', enabled: 1 },
      { id: 4, workspace_id: 1, slug: 'manual', name: 'Manual Template', task_prompt: 'keep', enabled: 1, created_by: 'system' },
    ])
    expect(diff.update.map(item => item.slug)).toContain('intake')
    expect(diff.create.map(item => item.slug)).toContain('new-template')
    expect(diff.disable.map(item => item.slug)).toContain('removed')
    expect(diff.unrelated.map(item => item.slug)).toContain('intake')
    expect(diff.unrelated.map(item => item.slug)).toContain('manual')
    expect(diff.disable.map(item => item.slug)).not.toContain('manual')
  })

  it('classifies same-workspace non-contract slug collisions as conflicts', () => {
    const diff = diffWorkflowTemplates(makeContract(), [
      { id: 1, workspace_id: 1, slug: 'intake', name: 'Manual Intake', task_prompt: 'manual prompt', model: 'sonnet', enabled: 1, created_by: 'system' },
    ])

    expect((diff as { conflicts?: { slug: string | null }[] }).conflicts?.map(item => item.slug)).toEqual(['intake'])
    expect(diff.create).toHaveLength(0)
    expect(diff.update).toHaveLength(0)
    expect(diff.unchanged).toHaveLength(0)
  })

  it('treats every import-persisted field as update parity', () => {
    const base = makeContract().templates[0]!
    const runtime = {
      workspace_id: 1,
      slug: base.slug,
      name: base.name,
      description: base.description,
      model: base.model,
      task_prompt: base.task_prompt,
      timeout_seconds: base.timeout_seconds,
      agent_role: base.agent_role,
      tags: JSON.stringify(base.tags ?? []),
      output_schema: JSON.stringify(base.output_schema ?? null),
      routing_rules: JSON.stringify(base.routing_rules ?? []),
      next_template_slug: base.next_template_slug ?? null,
      produces_pr: base.produces_pr ? 1 : 0,
      external_terminal_event: base.external_terminal_event ?? null,
      allow_redacted_artifacts: base.allow_redacted_artifacts ? 1 : 0,
      created_by: 'workflow-contract',
      enabled: 1,
    }

    expect(diffWorkflowTemplates(makeContract(), [runtime]).unchanged.map(item => item.slug)).toEqual(['intake'])

    const changedRows = [
      { description: 'stale description' },
      { timeout_seconds: 30 },
      { agent_role: 'runner' },
      { tags: JSON.stringify(['stale']) },
      { next_template_slug: 'next' },
      { produces_pr: 1 },
      { external_terminal_event: 'ready_for_owner' },
      { allow_redacted_artifacts: 1 },
    ]

    for (const patch of changedRows) {
      expect(diffWorkflowTemplates(makeContract(), [{ ...runtime, ...patch }]).update.map(item => item.slug)).toEqual(['intake'])
    }
  })
})
