import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { OrchestrationBar } from '@/components/panels/orchestration-bar'
import { useMissionControl } from '@/store'
import { createProductLineScope, type ProductLine } from '@/types/product-line'

const workflowContractsProductLine: ProductLine = {
  id: 9,
  slug: 'workflow-contracts',
  name: 'Workflow Contracts',
  tenant_id: 1,
  feature_flags: { FEATURE_WORKSPACE_SWITCHER: true, FEATURE_TASK_PIPELINES: true },
}

const agents = [
  { id: 1, name: 'Contract Auditor', role: 'Auditor', status: 'idle', session_key: 'agent:contract-auditor' },
  { id: 2, name: 'Workflow Runner', role: 'Operator', status: 'idle', session_key: 'agent:workflow-runner' },
]

const workflowTemplates = [
  {
    id: 901,
    name: 'Import dry run review',
    description: 'Review the latest workflow contract validation result.',
    model: 'sonnet',
    task_prompt: 'Review the workflow-contract dry-run diagnostics and summarize required remediation.',
    timeout_seconds: 300,
    agent_role: 'auditor',
    tags: ['workflow-contracts', 'validation'],
    use_count: 4,
    last_used_at: 1777248000,
    slug: 'import-dry-run-review',
    output_schema: null,
    routing_rules: [],
    next_template_slug: null,
    produces_pr: false,
    external_terminal_event: null,
    allow_redacted_artifacts: true,
  },
]

const workflowContractDiagnostics = {
  last_known_good_available: true,
  last_successful_apply: {
    run_id: 73,
    snapshot_id: 42,
    canonical_object_hash: 'workflow-contract-hash-v1:sha256:lkg',
  },
  runs: [
    {
      id: 84,
      mode: 'import_dry_run',
      status: 'validation_failed',
      mutation_status: 'not_mutated',
      source_path: 'docs/ai/workflows/mission-control/workflow-contract.yaml',
      export_path: null,
      contract_hash: 'workflow-contract-hash-v1:sha256:storybook',
      template_counts: { create: 1, update: 0, disable: 0, unchanged: 18 },
      recovery_command: 'pnpm workflow-contract recover --workspace-id 9 --apply',
      created_at: '2026-05-06T18:22:00.000Z',
      errors: [
        {
          id: 8401,
          code: 'UNKNOWN_TEMPLATE_VARIABLE',
          message: 'Template variable namespace is not allowed',
          remediation_hint: 'Use an allowed namespace.',
          details: '[REDACTED]',
          template_slug: 'mission-control-intake',
        },
      ],
    },
  ],
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installWorkflowContractsFetchMock() {
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

    if (url.pathname === '/api/workflow-contracts/diagnostics') {
      return jsonResponse(workflowContractDiagnostics)
    }

    return jsonResponse({})
  }) as typeof fetch
}

function configureWorkflowContractsState() {
  installWorkflowContractsFetchMock()
  const activeProductLineScope = createProductLineScope(workflowContractsProductLine, workflowContractsProductLine.id)

  useMissionControl.setState({
    activeTenant: {
      id: 1,
      slug: 'racecraft-facility',
      display_name: 'Racecraft Facility',
      status: 'active',
      linux_user: 'mission-control',
    },
    workspaces: [workflowContractsProductLine],
    workspaceSwitcherEnabled: true,
    activeProductLine: workflowContractsProductLine,
    activeProductLineScope,
    scopeKey: activeProductLineScope.scopeKey,
    fetchWorkspaces: async () => undefined,
  })
}

function WorkflowContractsOrchestrationSurface() {
  return (
    <div className="min-h-[620px] bg-background p-6 text-foreground">
      <div className="mx-auto max-w-5xl">
        <OrchestrationBar />
      </div>
    </div>
  )
}

const meta = {
  title: 'Workflow Contracts/Diagnostics UI',
  component: WorkflowContractsOrchestrationSurface,
  tags: ['visual', 'workflow-contracts'],
  loaders: [
    async () => {
      configureWorkflowContractsState()
      return {}
    },
  ],
  parameters: {
    screenshot: {
      fullPage: true,
    },
  },
} satisfies Meta<typeof WorkflowContractsOrchestrationSurface>

export default meta
type Story = StoryObj<typeof meta>

export const ReadOnlyRedactedDiagnostics: Story = {
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /^Workflow Contracts$/ }))

    const diagnostics = await canvas.findByTestId('workflow-contract-diagnostics')
    await expect(diagnostics).toBeVisible()
    await expect(within(diagnostics).getByText('import_dry_run')).toBeVisible()
    await expect(within(diagnostics).getByText('UNKNOWN_TEMPLATE_VARIABLE')).toBeVisible()
    await expect(within(diagnostics).getByText('[REDACTED]')).toBeVisible()
    await expect(within(diagnostics).queryByText(/sk-test|hunter2|secret-value/)).toBeNull()
  },
}
