import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { HeaderBar } from '@/components/layout/header-bar'
import { WorkspaceSwitcher } from '@/components/layout/workspace-switcher'
import { TaskBoardPanel } from '@/components/panels/task-board-panel'
import { usePaddock } from '@/store'
import {
  createFacilityScope,
  createProductLineScope,
  type ActiveProductLineScope,
  type ProductLine,
} from '@/types/product-line'

type Surface = 'switcher' | 'header' | 'task-board'
type Scenario = 'facility' | 'alpha' | 'loading' | 'error'

interface ProductLineStoryArgs {
  surface: Surface
  scenario: Scenario
}

const alphaWorkspace: ProductLine = {
  id: 2,
  slug: 'product-line-alpha',
  name: 'Product Line Alpha',
  tenant_id: 1,
  feature_flags: { FEATURE_WORKSPACE_SWITCHER: true },
}

const betaWorkspace: ProductLine = {
  id: 3,
  slug: 'product-line-beta',
  name: 'Product Line Beta',
  tenant_id: 1,
  feature_flags: { FEATURE_WORKSPACE_SWITCHER: true },
}

const facilityWorkspace: ProductLine = {
  id: 1,
  slug: 'facility',
  name: 'Facility',
  tenant_id: 1,
  feature_flags: { FEATURE_WORKSPACE_SWITCHER: true },
}

const workspaces = [facilityWorkspace, alphaWorkspace, betaWorkspace]

const alphaTask = {
  id: 201,
  title: 'Alpha launch QA pass',
  description: 'Validate Product Line Alpha scope before release.',
  status: 'in_progress' as const,
  priority: 'high' as const,
  assigned_to: 'Aegis',
  created_by: 'HAL',
  created_at: 1777248000,
  updated_at: 1777249800,
  project_id: 11,
  project_name: 'Alpha Launch',
  project_prefix: 'PLA',
  ticket_ref: 'PLA-42',
  tags: ['scope', 'visual'],
}

const betaTask = {
  id: 301,
  title: 'Beta backlog triage',
  description: 'Confirm Product Line Beta tasks remain hidden when Alpha is selected.',
  status: 'inbox' as const,
  priority: 'medium' as const,
  assigned_to: 'HAL',
  created_by: 'Aegis',
  created_at: 1777247000,
  updated_at: 1777249000,
  project_id: 12,
  project_name: 'Beta Operations',
  project_prefix: 'PLB',
  ticket_ref: 'PLB-17',
  tags: ['scope'],
}

const agents = [
  {
    id: 1,
    name: 'Aegis',
    role: 'Quality Review',
    status: 'idle' as const,
    taskStats: { total: 1, assigned: 0, in_progress: 1, completed: 0 },
  },
  {
    id: 2,
    name: 'HAL',
    role: 'Orchestrator',
    status: 'busy' as const,
    taskStats: { total: 2, assigned: 0, in_progress: 1, completed: 1 },
  },
]

const projects = [
  { id: 11, name: 'Alpha Launch', slug: 'alpha-launch', ticket_prefix: 'PLA', status: 'active' },
  { id: 12, name: 'Beta Operations', slug: 'beta-operations', ticket_prefix: 'PLB', status: 'active' },
]

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function tasksForScope(scope: ActiveProductLineScope | null) {
  if (scope?.kind === 'productLine') {
    return scope.productLineId === alphaWorkspace.id ? [alphaTask] : [betaTask]
  }
  return [alphaTask, betaTask]
}

function installProductLineFetchMock(scenario: Scenario) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    const url = new URL(rawUrl, 'http://storybook.local')
    const workspaceId = url.searchParams.get('workspace_id')
    const scope = workspaceId === String(alphaWorkspace.id)
      ? createProductLineScope(alphaWorkspace, 1)
      : workspaceId === String(betaWorkspace.id)
        ? createProductLineScope(betaWorkspace, 1)
        : createFacilityScope(1, 1)

    if (url.pathname === '/api/workspaces') {
      if (scenario === 'error') {
        return jsonResponse({ error: 'workspace list unavailable' }, 503)
      }
      return jsonResponse({
        tenant_id: 1,
        active_workspace_id: alphaWorkspace.id,
        workspaces,
      })
    }
    if (url.pathname === '/api/tasks') {
      return jsonResponse({ tasks: tasksForScope(scope) })
    }
    if (url.pathname === '/api/agents') {
      return jsonResponse({ agents })
    }
    if (url.pathname === '/api/projects') {
      return jsonResponse({ projects })
    }
    if (url.pathname === '/api/quality-review') {
      return jsonResponse({ latest: {} })
    }
    if (url.pathname === '/api/mentions') {
      return jsonResponse({ mentions: [] })
    }
    if (url.pathname === '/api/sessions') {
      return jsonResponse({ sessions: [] })
    }
    if (url.pathname === '/api/gnap') {
      return jsonResponse({ enabled: false, taskCount: 0 })
    }
    if (url.pathname === '/api/search') {
      return jsonResponse({ results: [] })
    }
    return jsonResponse({})
  }) as typeof fetch
}

function configureProductLineState(scenario: Scenario) {
  installProductLineFetchMock(scenario)

  const activeScope = scenario === 'alpha'
    ? createProductLineScope(alphaWorkspace, 1)
    : createFacilityScope(1, 1)
  const activeProductLine = scenario === 'alpha' ? alphaWorkspace : null
  const workspaceListStatus = scenario === 'loading'
    ? 'loading'
    : scenario === 'error'
      ? 'error'
      : 'ready'
  const workspaceScopeNotice = scenario === 'error' ? 'workspace-list-failure' : null

  usePaddock.setState({
    activeTenant: {
      id: 1,
      slug: 'racecraft-facility',
      display_name: 'Racecraft Facility',
      status: 'active',
      linux_user: 'paddock',
    },
    workspaces,
    workspaceSwitcherEnabled: true,
    workspaceListStatus,
    workspaceScopeNotice,
    activeProductLine,
    activeProductLineScope: activeScope,
    scopeKey: activeScope.scopeKey,
    activeProject: null,
    selectedTask: null,
    selectedAgent: null,
    activeConversation: null,
    chatInput: '',
    showProjectManagerModal: false,
    tasks: tasksForScope(activeScope),
    sessions: [
      {
        id: 'session-alpha',
        key: 'agent:aegis:alpha',
        agent: 'Aegis',
        kind: 'claude-code',
        age: '4m',
        model: 'sonnet',
        tokens: '12k',
        flags: ['active'],
        active: true,
      },
    ],
    unreadNotificationCount: 2,
    connection: {
      isConnected: true,
      url: 'ws://127.0.0.1:8765',
      reconnectAttempts: 0,
      latency: 18,
      sseConnected: true,
    },
    dashboardMode: 'local',
    availableModels: [{
      alias: 'sonnet',
      name: 'Claude Sonnet',
      provider: 'anthropic',
      description: 'Storybook visual fixture model',
      costPer1k: 0.003,
    }],
    spawnRequests: [],
    fetchWorkspaces: async () => {
      if (scenario === 'loading') return
      if (scenario === 'error') {
        usePaddock.setState({
          workspaceListStatus: 'error',
          workspaceScopeNotice: 'workspace-list-failure',
        })
        return
      }
      usePaddock.setState({
        workspaces,
        workspaceSwitcherEnabled: true,
        workspaceListStatus: 'ready',
        workspaceScopeNotice: null,
      })
    },
  })
}

function ProductLineVisualSurface({ surface }: ProductLineStoryArgs) {
  if (surface === 'header') {
    return (
      <div className="min-h-screen bg-background">
        <HeaderBar />
        <div className="border-b border-border/40 px-4 py-3 text-xs text-muted-foreground">
          Product Line visual shell
        </div>
      </div>
    )
  }

  if (surface === 'task-board') {
    return (
      <div className="h-[760px] bg-background">
        <TaskBoardPanel />
      </div>
    )
  }

  return (
    <div className="min-h-[22rem] bg-background p-6">
      <div className="w-fit">
        <WorkspaceSwitcher />
      </div>
    </div>
  )
}

const meta = {
  title: 'Product Line/Visual States',
  component: ProductLineVisualSurface,
  tags: ['visual', 'product-line-switcher'],
  loaders: [
    async ({ args }) => {
      configureProductLineState((args as ProductLineStoryArgs).scenario)
      return {}
    },
  ],
  parameters: {
    screenshot: {
      fullPage: true,
    },
  },
} satisfies Meta<typeof ProductLineVisualSurface>

export default meta
type Story = StoryObj<typeof meta>

export const WorkspaceSwitcherFacility: Story = {
  args: { surface: 'switcher', scenario: 'facility' },
}

export const WorkspaceSwitcherMenuOpen: Story = {
  args: { surface: 'switcher', scenario: 'facility' },
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /change facility or product line scope/i }))
    await expect(canvas.getByRole('listbox', { name: /facility and product line scopes/i })).toBeVisible()
  },
}

export const WorkspaceSwitcherLoading: Story = {
  args: { surface: 'switcher', scenario: 'loading' },
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /change facility or product line scope/i }))
    await expect(canvas.getByRole('status')).toHaveTextContent(/loading scopes/i)
  },
}

export const WorkspaceSwitcherError: Story = {
  args: { surface: 'switcher', scenario: 'error' },
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /change facility or product line scope/i }))
    await expect(canvas.getByRole('alert')).toHaveTextContent(/failed to load/i)
  },
}

export const HeaderDesktopFacility: Story = {
  args: { surface: 'header', scenario: 'facility' },
}

export const HeaderMobileScopeMenu: Story = {
  args: { surface: 'header', scenario: 'facility' },
  parameters: {
    screenshot: {
      fullPage: true,
    },
  },
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /change facility or product line scope/i }))
    await expect(canvas.getByRole('listbox', { name: /facility and product line scopes/i })).toBeVisible()
  },
}

export const TaskBoardFacilityScope: Story = {
  args: { surface: 'task-board', scenario: 'facility' },
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await expect(await canvas.findByRole('button', { name: /alpha launch qa pass/i })).toBeVisible()
    await expect(await canvas.findByRole('button', { name: /beta backlog triage/i })).toBeVisible()
  },
}

export const TaskBoardAlphaScope: Story = {
  args: { surface: 'task-board', scenario: 'alpha' },
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await expect(await canvas.findByRole('button', { name: /alpha launch qa pass/i })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /beta backlog triage/i })).not.toBeInTheDocument()
  },
}
