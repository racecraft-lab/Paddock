import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentSquadPanel } from '@/components/panels/agent-squad-panel'
import type { RuntimeInventoryEnvelope } from '@/lib/harness-adapters/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, number>) => {
    if (key === 'minutesAgo') return `${String(params?.['count'] ?? 0)} minutes ago`
    if (key === 'hoursAgo') return `${String(params?.['count'] ?? 0)} hours ago`
    if (key === 'daysAgo') return `${String(params?.['count'] ?? 0)} days ago`
    const labels: Record<string, string> = {
      activity: 'Activity',
      addAgent: 'Add agent',
      addFirstAgent: 'Add the first agent',
      assigned: 'Assigned',
      busy: 'Busy',
      cancel: 'Cancel',
      createNewAgent: 'Create new agent',
      created: 'Created',
      done: 'Done',
      editAgent: 'Edit agent',
      inProgress: 'In progress',
      lastSeen: 'Last seen',
      lastUpdated: 'Last updated',
      live: 'Live',
      loadingAgents: 'Loading agents',
      manual: 'Manual',
      never: 'Never',
      noAgents: 'No agents',
      notSet: 'Not set',
      refresh: 'Refresh',
      role: 'Role',
      saveChanges: 'Save changes',
      session: 'Session',
      sessionKey: 'Session key',
      sleep: 'Sleep',
      soulContent: 'Soul content',
      statusControl: 'Status control',
      taskStatistics: 'Task statistics',
      title: 'Agent squad',
      total: 'Total',
      totalTasks: 'Total tasks',
      wake: 'Wake',
    }
    return labels[key] ?? key
  },
}))

vi.mock('@/store', () => ({
  usePaddock: () => ({ activeProductLineScope: null }),
}))

const inventory: RuntimeInventoryEnvelope = {
  schema_version: 'runtime_inventory.v1',
  generated_at: '2026-06-03T00:00:00.000Z',
  scope: {
    kind: 'productLine',
    workspace_id: '1',
    workspace_ids: ['1'],
  },
  feature_flag: {
    name: 'FEATURE_AGENT_RUNNER_SANDBOXES',
    enabled: true,
    source: 'workspace',
  },
  entries: [{
    id: 'runtime_inventory:paddock_owned_sandbox_fake',
    state: 'eligible',
    selected_manifest: {
      manifest_id: 'paddock_owned_sandbox_fake',
      display_name: 'Paddock-owned sandbox fake',
      validation: {
        ok: true,
        issues: [],
        diagnostics: {
          manifest_id: 'paddock_owned_sandbox_fake',
          manifest_sha256: '0123456789abcdef',
          issue_count: 0,
          truncated: false,
        },
      },
    },
    assignment: {
      status: 'assigned',
      project_id: '10',
      role: 'builder',
      agent_name: 'paddock_owned_sandbox_fake',
    },
    capability_resolution: {
      schema_version: 'capability_resolution.v1',
      manifest_id: 'paddock_owned_sandbox_fake',
      requested_capability: 'launch',
      supported: true,
      policy: { approval: 'not_evaluated', timeout: 'not_evaluated', user_input: 'not_evaluated' },
      reason_codes: [],
    },
    eligibility_gates: [],
    sandbox_lifecycle_refs: [{
      id: '77',
      owner: 'paddock',
      status: 'running',
      stage_key: 'issue_remediation',
      updated_at: '2026-06-03T00:00:00.000Z',
    }],
    sanitized_fake_evidence: [],
    reason_codes: [],
  }],
  summary: {
    total: 1,
    visible: 0,
    unassigned: 0,
    assigned: 0,
    eligible: 1,
    blocked: 0,
  },
  diagnostics: {
    truncated: false,
    warnings: [],
  },
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/agents' && init?.method === 'PUT') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (url === '/api/agents') {
      return new Response(JSON.stringify({
        agents: [{
          id: 1,
          name: 'paddock_owned_sandbox_fake',
          role: 'builder',
          status: 'idle',
          created_at: 1,
          updated_at: 1,
          last_seen: 1,
          taskStats: { total: 1, assigned: 1, in_progress: 0, completed: 0 },
        }],
      }), { status: 200 })
    }
    if (url === '/api/agents/runtime-inventory') {
      return new Response(JSON.stringify(inventory), { status: 200 })
    }
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('AgentSquadPanel runtime inventory integration', () => {
  it('fetches the dedicated runtime route, preserves /api/agents behavior, and adds no runtime mutation controls', async () => {
    const fetchMock = mockFetch()
    render(<AgentSquadPanel />)

    await screen.findByText('paddock_owned_sandbox_fake')
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/agents')
      expect(fetchMock).toHaveBeenCalledWith('/api/agents/runtime-inventory')
    })

    fireEvent.click(screen.getByText('paddock_owned_sandbox_fake'))
    const region = await screen.findByRole('region', { name: /runtime inventory evidence/i })
    expect(within(region).getByText(/state: eligible/i)).toBeDefined()
    expect(within(region).getByText(/manifest: paddock_owned_sandbox_fake/i)).toBeDefined()
    expect(within(region).queryByRole('button')).toBeNull()
    expect(within(region).queryByRole('form')).toBeNull()
    expect(within(region).queryByRole('menu')).toBeNull()
    expect(screen.queryByRole('button', { name: /launch|assign|retry|lifecycle/i })).toBeNull()
  })
})
