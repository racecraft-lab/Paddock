import { expect, test } from '@playwright/test'

import { API_KEY_HEADER, enableWorkspaceSwitcherFlagForE2E } from '../helpers'

interface WorkspaceResponse {
  workspace?: { id: number; name: string; slug: string }
}

interface WorkflowTemplate {
  id: number
  name: string
  workspace_id: number
  slug: string | null
  output_schema: Record<string, unknown> | null
  routing_rules: Array<{ when: string; next_template_slug: string }>
  next_template_slug: string | null
  use_count: number
}

function scoped(pathname: string, workspaceId: number): string {
  const separator = pathname.includes('?') ? '&' : '?'
  return `${pathname}${separator}workspace_id=${encodeURIComponent(String(workspaceId))}`
}

test.describe.serial('SPEC-004 task-pipeline workflow templates', () => {
  let restoreWorkspaceSwitcherFlag: (() => void) | null = null
  let workspaceId = 0
  const createdTemplateIds: number[] = []

  test.beforeAll(async ({ request }) => {
    restoreWorkspaceSwitcherFlag = await enableWorkspaceSwitcherFlagForE2E(request)
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const workspaceRes = await request.post('/api/workspaces', {
      headers: API_KEY_HEADER,
      data: {
        name: `SPEC-004 Pipeline ${suffix}`,
        slug: `spec-004-pipeline-${suffix}`,
      },
    })
    const workspaceBody = await workspaceRes.json().catch(() => ({})) as WorkspaceResponse
    expect(workspaceRes.status(), JSON.stringify(workspaceBody)).toBe(201)
    expect(workspaceBody.workspace?.id).toBeTruthy()
    workspaceId = workspaceBody.workspace!.id
  })

  test.afterAll(async ({ request }) => {
    for (const id of [...createdTemplateIds].reverse()) {
      await request.delete(scoped(`/api/workflows?id=${id}`, workspaceId), { headers: API_KEY_HEADER }).catch(() => undefined)
    }
    if (workspaceId) {
      await request.delete(`/api/workspaces/${workspaceId}`, { headers: API_KEY_HEADER }).catch(() => undefined)
    }
    restoreWorkspaceSwitcherFlag?.()
  })

  test('creates, edits, reads, usage-tracks, validates, and query-deletes scoped chain templates', async ({ request }) => {
    const schema = {
      type: 'object',
      properties: {
        outcome: { type: 'string' },
      },
      required: ['outcome'],
      additionalProperties: false,
    }
    const createRules = [{ when: '$.outcome == "ready"', next_template_slug: 'build-review' }]

    const createRes = await request.post(scoped('/api/workflows', workspaceId), {
      headers: API_KEY_HEADER,
      data: {
        name: 'SPEC-004 Routed Template',
        task_prompt: 'Validate output and choose the next pipeline task.',
        slug: 'spec-004-routed',
        output_schema: schema,
        routing_rules: createRules,
        next_template_slug: 'manual-review',
      },
    })
    const createBody = await createRes.json()
    expect(createRes.status(), JSON.stringify(createBody)).toBe(201)
    const routed = createBody.template as WorkflowTemplate
    createdTemplateIds.push(routed.id)
    expect(routed).toMatchObject({
      workspace_id: workspaceId,
      slug: 'spec-004-routed',
      output_schema: schema,
      routing_rules: createRules,
      next_template_slug: 'manual-review',
    })

    const invalidRes = await request.post(scoped('/api/workflows', workspaceId), {
      headers: API_KEY_HEADER,
      data: {
        name: 'SPEC-004 Invalid Routed Template',
        task_prompt: 'This should not persist without an output schema.',
        slug: 'spec-004-invalid-routed',
        routing_rules: createRules,
      },
    })
    const invalidBody = await invalidRes.json()
    expect(invalidRes.status(), JSON.stringify(invalidBody)).toBe(400)
    expect(JSON.stringify(invalidBody)).toContain('routing_rules')
    expect(JSON.stringify(invalidBody)).toContain('output_schema')

    const staticRes = await request.post(scoped('/api/workflows', workspaceId), {
      headers: API_KEY_HEADER,
      data: {
        name: 'SPEC-004 Static Template',
        task_prompt: 'Static next-template routing without structured output.',
        slug: 'spec-004-static',
        next_template_slug: 'spec-004-routed',
      },
    })
    const staticBody = await staticRes.json()
    expect(staticRes.status(), JSON.stringify(staticBody)).toBe(201)
    const staticTemplate = staticBody.template as WorkflowTemplate
    createdTemplateIds.push(staticTemplate.id)
    expect(staticTemplate).toMatchObject({
      workspace_id: workspaceId,
      output_schema: null,
      routing_rules: [],
      next_template_slug: 'spec-004-routed',
    })

    const updateRules = [{ when: '$.outcome == "blocked"', next_template_slug: 'blocked-review' }]
    const updateRes = await request.put(scoped('/api/workflows', workspaceId), {
      headers: API_KEY_HEADER,
      data: {
        id: routed.id,
        name: 'SPEC-004 Routed Template Updated',
        output_schema: schema,
        routing_rules: updateRules,
        next_template_slug: 'archive',
      },
    })
    const updateBody = await updateRes.json()
    expect(updateRes.status(), JSON.stringify(updateBody)).toBe(200)
    expect(updateBody.template).toMatchObject({
      id: routed.id,
      name: 'SPEC-004 Routed Template Updated',
      routing_rules: updateRules,
      next_template_slug: 'archive',
    })

    const listRes = await request.get(scoped('/api/workflows', workspaceId), { headers: API_KEY_HEADER })
    const listBody = await listRes.json()
    expect(listRes.status(), JSON.stringify(listBody)).toBe(200)
    const templates = listBody.templates as WorkflowTemplate[]
    expect(templates.find((template) => template.id === routed.id)).toMatchObject({
      name: 'SPEC-004 Routed Template Updated',
      workspace_id: workspaceId,
      routing_rules: updateRules,
    })
    expect(templates.find((template) => template.id === staticTemplate.id)).toMatchObject({
      slug: 'spec-004-static',
      next_template_slug: 'spec-004-routed',
    })

    const usageRes = await request.put(scoped('/api/workflows', workspaceId), {
      headers: API_KEY_HEADER,
      data: { id: routed.id },
    })
    const usageBody = await usageRes.json()
    expect(usageRes.status(), JSON.stringify(usageBody)).toBe(200)
    expect((usageBody.template as WorkflowTemplate).use_count).toBeGreaterThanOrEqual(1)

    const deleteRes = await request.delete(scoped(`/api/workflows?id=${staticTemplate.id}`, workspaceId), {
      headers: API_KEY_HEADER,
    })
    const deleteBody = await deleteRes.json()
    expect(deleteRes.status(), JSON.stringify(deleteBody)).toBe(200)
    expect(deleteBody.success).toBe(true)
    createdTemplateIds.splice(createdTemplateIds.indexOf(staticTemplate.id), 1)

    const afterDeleteRes = await request.get(scoped('/api/workflows', workspaceId), { headers: API_KEY_HEADER })
    const afterDeleteBody = await afterDeleteRes.json()
    expect(afterDeleteRes.status(), JSON.stringify(afterDeleteBody)).toBe(200)
    expect((afterDeleteBody.templates as WorkflowTemplate[]).some((template) => template.id === staticTemplate.id)).toBe(false)
  })
})
