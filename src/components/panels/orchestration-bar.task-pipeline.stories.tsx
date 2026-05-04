import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fireEvent, userEvent, within } from 'storybook/test'

import { OrchestrationBar } from '@/components/panels/orchestration-bar'
import { useMissionControl } from '@/store'
import { createProductLineScope, type ProductLine } from '@/types/product-line'

const productLineAlpha: ProductLine = {
  id: 4,
  slug: 'product-line-alpha',
  name: 'Product Line Alpha',
  tenant_id: 1,
  feature_flags: { FEATURE_WORKSPACE_SWITCHER: true, FEATURE_TASK_PIPELINES: true },
}

const agents = [
  { id: 1, name: 'Planner', role: 'Planner', status: 'idle', session_key: 'agent:planner' },
  { id: 2, name: 'Reviewer', role: 'Reviewer', status: 'busy', session_key: 'agent:reviewer' },
]

const outputSchema = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['ready', 'blocked'] },
    confidence: { type: 'number' },
  },
  required: ['outcome'],
  additionalProperties: false,
}

const routingRules = [
  { when: '$.outcome == "ready"', next_template_slug: 'implementation-review' },
  { when: '$.outcome == "blocked"', next_template_slug: 'owner-follow-up' },
]

const workflowTemplates = [
  {
    id: 41,
    name: 'Review Intake',
    description: 'Validate structured output and route the next task.',
    model: 'sonnet',
    task_prompt: 'Review the owner brief, return structured JSON, and route the chain.',
    timeout_seconds: 300,
    agent_role: 'reviewer',
    tags: ['pipeline', 'review'],
    use_count: 7,
    last_used_at: 1777248000,
    slug: 'review-intake',
    output_schema: outputSchema,
    routing_rules: routingRules,
    next_template_slug: 'manual-review',
    produces_pr: true,
    external_terminal_event: 'review.completed',
    allow_redacted_artifacts: true,
  },
  {
    id: 42,
    name: 'Implementation Review',
    description: 'Second hop for ready pipeline outputs.',
    model: 'sonnet',
    task_prompt: 'Inspect implementation output and prepare the review decision.',
    timeout_seconds: 600,
    agent_role: 'reviewer',
    tags: ['pipeline'],
    use_count: 2,
    last_used_at: null,
    slug: 'implementation-review',
    output_schema: null,
    routing_rules: [],
    next_template_slug: null,
    produces_pr: false,
    external_terminal_event: null,
    allow_redacted_artifacts: false,
  },
]

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installTaskPipelineFetchMock() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    const url = new URL(rawUrl, 'http://storybook.local')

    if (url.pathname === '/api/agents') {
      return jsonResponse({ agents })
    }

    if (url.pathname === '/api/workflows' && method === 'GET') {
      return jsonResponse({ templates: workflowTemplates })
    }

    if (url.pathname === '/api/workflows' && (method === 'POST' || method === 'PUT')) {
      const requestBody = init?.body
      const body = requestBody ? JSON.parse(String(requestBody)) as {
        id?: number
        name?: string
        task_prompt?: string
        output_schema?: Record<string, unknown> | null
        routing_rules?: unknown[]
      } : {}

      if (body.routing_rules?.length && !body.output_schema) {
        return jsonResponse({
          error: 'Validation failed',
          details: ['routing_rules: routing_rules require output_schema'],
        }, 400)
      }

      return jsonResponse({
        template: {
          ...workflowTemplates[0],
          ...body,
          id: body.id ?? 99,
          name: body.name ?? 'New pipeline template',
          task_prompt: body.task_prompt ?? 'Run the next pipeline step.',
        },
      }, method === 'POST' ? 201 : 200)
    }

    return jsonResponse({})
  }) as typeof fetch
}

function configureTaskPipelineState() {
  installTaskPipelineFetchMock()
  const activeProductLineScope = createProductLineScope(productLineAlpha, 4)

  useMissionControl.setState({
    activeTenant: {
      id: 1,
      slug: 'racecraft-facility',
      display_name: 'Racecraft Facility',
      status: 'active',
      linux_user: 'mission-control',
    },
    workspaces: [productLineAlpha],
    workspaceSwitcherEnabled: true,
    activeProductLine: productLineAlpha,
    activeProductLineScope,
    scopeKey: activeProductLineScope.scopeKey,
    fetchWorkspaces: async () => undefined,
  })
}

function TaskPipelineOrchestrationSurface() {
  return (
    <div className="min-h-[860px] bg-background p-6 text-foreground">
      <div className="mx-auto max-w-5xl">
        <OrchestrationBar />
      </div>
    </div>
  )
}

const meta = {
  title: 'Task Pipeline/Workflow UI',
  component: TaskPipelineOrchestrationSurface,
  tags: ['visual', 'task-pipeline-workflows'],
  loaders: [
    async () => {
      configureTaskPipelineState()
      return {}
    },
  ],
  parameters: {
    screenshot: {
      fullPage: true,
    },
  },
} satisfies Meta<typeof TaskPipelineOrchestrationSurface>

export default meta
type Story = StoryObj<typeof meta>

export const WorkflowChainEditFields: Story = {
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /workflows/i }))
    await expect(await canvas.findByText('Review Intake')).toBeVisible()

    await userEvent.click(canvas.getAllByTitle('Edit')[0])

    await expect(canvas.getByDisplayValue('review-intake')).toBeVisible()
    await expect(canvas.getByDisplayValue('manual-review')).toBeVisible()
    await expect(canvas.getByDisplayValue('review.completed')).toBeVisible()
    await expect(canvas.getByLabelText('Produces PR')).toBeChecked()
    await expect(canvas.getByLabelText('Allow redacted artifacts')).toBeChecked()
    await expect(canvas.getByDisplayValue(/"outcome"/)).toBeVisible()
    await expect(canvas.getByDisplayValue(/"next_template_slug": "implementation-review"/)).toBeVisible()
  },
}

export const WorkflowRoutingValidationError: Story = {
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /workflows/i }))
    await userEvent.click(canvas.getByRole('button', { name: /\+ new/i }))
    await userEvent.type(canvas.getByPlaceholderText('Template name'), 'Invalid routed template')
    await userEvent.type(canvas.getByPlaceholderText('Task prompt for the agent...'), 'Route without a schema.')
    fireEvent.change(canvas.getByPlaceholderText('Routing rules JSON'), {
      target: {
        value: '[{"when":"$.outcome == \\"ready\\"","next_template_slug":"implementation-review"}]',
      },
    })
    await userEvent.click(canvas.getByRole('button', { name: /^save$/i }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/routing_rules require output_schema/i)
  },
}
