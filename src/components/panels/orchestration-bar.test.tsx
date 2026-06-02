import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationBar } from './orchestration-bar'
import { createProductLineScope, type ProductLine } from '@/types/product-line'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('./pipeline-tab', () => ({
  PipelineTab: () => <div>Pipeline tab</div>,
}))

const assembly: ProductLine = {
  id: 4,
  slug: 'assembly',
  name: 'Assembly',
  tenant_id: 10,
}

vi.mock('@/store', () => ({
  usePaddock: () => ({
    activeProductLineScope: createProductLineScope(assembly, 1),
  }),
}))

function mockFetch(saveResponse?: { ok: boolean; body: unknown }) {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init })
    const url = String(input)
    if (url.startsWith('/api/agents')) {
      return Response.json({ agents: [] })
    }
    if (url.startsWith('/api/workflows') && !init) {
      return Response.json({
        templates: [{
          id: 9,
          name: 'Review Intake',
          description: 'Review incoming work',
          model: 'sonnet',
          task_prompt: 'Return structured review output.',
          timeout_seconds: 300,
          agent_role: 'reviewer',
          tags: ['review'],
          use_count: 0,
          last_used_at: null,
          slug: 'review-intake',
          output_schema: { type: 'object' },
          routing_rules: [{ when: '$.ready == true', next_template_slug: 'ship' }],
          next_template_slug: 'manual-review',
          produces_pr: true,
          external_terminal_event: 'review.completed',
          allow_redacted_artifacts: true,
        }],
      })
    }
    if (url.startsWith('/api/workflow-contracts/diagnostics')) {
      return Response.json({
        last_known_good_available: true,
        last_successful_apply: {
          run_id: 2,
          snapshot_id: 7,
          canonical_object_hash: 'workflow-contract-hash-v1:sha256:lkg',
          created_at: '2026-05-05T00:00:00Z',
        },
        runs: [{
          id: 1,
          mode: 'import_dry_run',
          status: 'validation_failed',
          mutation_status: 'not_mutated',
          source_path: 'docs/ai/workflows/paddock/workflow-contract.yaml',
          export_path: null,
          contract_hash: 'workflow-contract-hash-v1:sha256:abc',
          template_counts: { create: 1, update: 0, disable: 0, unchanged: 0 },
          recovery_command: 'pnpm workflow-contract recover --workspace-id 4 --apply',
          created_at: '2026-05-06T00:00:00Z',
          errors: [{
            id: 10,
            code: 'UNKNOWN_TEMPLATE_VARIABLE',
            message: 'Template variable namespace is not allowed',
            remediation_hint: 'Use an allowed namespace.',
            details: '[REDACTED]',
            template_slug: 'intake',
          }],
        }],
      })
    }
    if (url.startsWith('/api/workflows')) {
      if (saveResponse) {
        return Response.json(saveResponse.body, { status: saveResponse.ok ? 200 : 400 })
      }
      return Response.json({ template: {} }, { status: 201 })
    }
    return Response.json({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls }
}

async function openWorkflowsTab() {
  render(<OrchestrationBar />)
  fireEvent.click(screen.getByText('tabWorkflows'))
  await screen.findByText('Review Intake')
}

describe('OrchestrationBar workflow-template chain fields', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('orders workflow contract policy before runtime workflow and pipeline controls', async () => {
    mockFetch()

    render(<OrchestrationBar />)

    expect(await screen.findByTestId('workflow-contract-diagnostics')).toBeInTheDocument()

    const tabButtons = [
      screen.getByRole('button', { name: 'Workflow Contracts' }),
      screen.getByRole('button', { name: 'tabWorkflows' }),
      screen.getByRole('button', { name: 'tabPipelines' }),
      screen.getByRole('button', { name: 'tabCommand' }),
      screen.getByRole('button', { name: /tabFleet/ }),
    ]
    const tabLabels = tabButtons.map(button => button.textContent)

    expect(tabLabels).toEqual(['Workflow Contracts', 'tabWorkflows', 'tabPipelines', 'tabCommand', 'tabFleet0/0'])
    for (let index = 0; index < tabButtons.length - 1; index += 1) {
      expect(tabButtons[index].compareDocumentPosition(tabButtons[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('loads workflow templates through Product Line scope and reads chain fields back into the edit form', async () => {
    const { calls } = mockFetch()

    await openWorkflowsTab()
    fireEvent.click(screen.getByTitle('Edit'))

    expect(calls.some((call) => String(call.input) === '/api/workflows?workspace_id=4')).toBe(true)
    expect(screen.getByDisplayValue('review-intake')).toBeInTheDocument()
    expect(screen.getByDisplayValue('manual-review')).toBeInTheDocument()
    expect(screen.getByDisplayValue('review.completed')).toBeInTheDocument()
    expect(screen.getByLabelText('Produces PR')).toBeChecked()
    expect(screen.getByLabelText('Allow redacted artifacts')).toBeChecked()
    expect(screen.getByDisplayValue(/"type": "object"/)).toBeInTheDocument()
    expect(screen.getByDisplayValue(/"next_template_slug": "ship"/)).toBeInTheDocument()
  })

  it('saves chain fields through Product Line scoped workflow API calls', async () => {
    const { fetchMock } = mockFetch()

    await openWorkflowsTab()
    fireEvent.click(screen.getByText('new'))
    fireEvent.change(screen.getByPlaceholderText('templateName'), { target: { value: 'Publish PR' } })
    fireEvent.change(screen.getByPlaceholderText('taskPromptPlaceholder'), { target: { value: 'Publish the PR.' } })
    fireEvent.change(screen.getByPlaceholderText('Template slug'), { target: { value: 'publish-pr' } })
    fireEvent.change(screen.getByPlaceholderText('Output schema JSON'), { target: { value: '{"type":"object"}' } })
    fireEvent.change(screen.getByPlaceholderText('Routing rules JSON'), { target: { value: '[{"when":"$.ready == true","next_template_slug":"ship"}]' } })
    fireEvent.change(screen.getByPlaceholderText('Next template slug'), { target: { value: 'ship' } })
    fireEvent.click(screen.getByLabelText('Produces PR'))
    fireEvent.change(screen.getByPlaceholderText('External terminal event'), { target: { value: 'publish.completed' } })
    fireEvent.click(screen.getByLabelText('Allow redacted artifacts'))
    fireEvent.click(screen.getByText('save'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/workflows?workspace_id=4', expect.objectContaining({ method: 'POST' }))
    })
    const saveCall = fetchMock.mock.calls.find(([input, init]) => input === '/api/workflows?workspace_id=4' && init?.method === 'POST')
    const payload = JSON.parse(String(saveCall?.[1]?.body))
    expect(payload).toMatchObject({
      slug: 'publish-pr',
      output_schema: { type: 'object' },
      routing_rules: [{ when: '$.ready == true', next_template_slug: 'ship' }],
      next_template_slug: 'ship',
      produces_pr: true,
      external_terminal_event: 'publish.completed',
      allow_redacted_artifacts: true,
    })
  })

  it('surfaces workflow-template validation errors from the API', async () => {
    mockFetch({
      ok: false,
      body: {
        error: 'Validation failed',
        details: ['routing_rules: routing_rules require output_schema'],
      },
    })

    await openWorkflowsTab()
    fireEvent.click(screen.getByText('new'))
    fireEvent.change(screen.getByPlaceholderText('templateName'), { target: { value: 'Bad Rules' } })
    fireEvent.change(screen.getByPlaceholderText('taskPromptPlaceholder'), { target: { value: 'Route without schema.' } })
    fireEvent.change(screen.getByPlaceholderText('Routing rules JSON'), { target: { value: '[{"when":"$.ready == true","next_template_slug":"ship"}]' } })
    fireEvent.click(screen.getByText('save'))

    const workflowsPanel = screen.getByText('newTemplate').closest('div')?.parentElement
    expect(await within(workflowsPanel as HTMLElement).findByText(/routing_rules require output_schema/)).toBeInTheDocument()
  })

  it('renders read-only workflow contract diagnostics without leaking raw secrets or controls', async () => {
    mockFetch()

    render(<OrchestrationBar />)
    fireEvent.click(screen.getByText('Workflow Contracts'))

    expect(await screen.findByTestId('workflow-contract-diagnostics')).toBeInTheDocument()
    expect(screen.getByText('import_dry_run')).toBeInTheDocument()
    expect(screen.getByText('UNKNOWN_TEMPLATE_VARIABLE')).toBeInTheDocument()
    expect(screen.getByText('[REDACTED]')).toBeInTheDocument()
    expect(screen.getByText('Last known good: available')).toBeInTheDocument()
    expect(screen.getByText('Last successful apply: run 2')).toBeInTheDocument()
    expect(screen.queryByText(/sk-test|hunter2|secret-value/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Apply Import|Dispatch|Governance Override/)).not.toBeInTheDocument()
  })
})
