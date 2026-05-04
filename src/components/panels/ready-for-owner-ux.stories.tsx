import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { NotificationsPanel } from '@/components/panels/notifications-panel'
import { TaskBoardPanel } from '@/components/panels/task-board-panel'
import { useMissionControl } from '@/store'
import { createFacilityScope, type ProductLine } from '@/types/product-line'

type Surface = 'task-board' | 'notifications'

interface ReadyForOwnerStoryArgs {
  surface: Surface
}

const READY_FOR_OWNER_RECIPIENT = 'owner-storybook-ready-for-owner'
const FUTURE_TIMESTAMP_SECONDS = 4102444800
const READY_FOR_OWNER_REQUIRED_FLAGS = {
  FEATURE_WORKSPACE_SWITCHER: true,
  FEATURE_GLOBAL_AEGIS: true,
  FEATURE_TASK_PIPELINES: true,
  FEATURE_TWO_STEP_TERMINAL: true,
} as const

const facilityWorkspace: ProductLine = {
  id: 1,
  slug: 'facility',
  name: 'Facility',
  tenant_id: 1,
  feature_flags: { FEATURE_WORKSPACE_SWITCHER: true },
}

const readyForOwnerWorkspace: ProductLine = {
  id: 50,
  slug: 'spec-005-ready-for-owner',
  name: 'SPEC-005 Ready for Owner',
  tenant_id: 1,
  feature_flags: READY_FOR_OWNER_REQUIRED_FLAGS,
}

const workspaces = [facilityWorkspace, readyForOwnerWorkspace]

const readyForOwnerTask = {
  id: 505,
  title: 'Owner merge gate for SPEC-005',
  description: 'Pull request is approved and waiting on the owner merge gate.',
  status: 'ready_for_owner' as const,
  priority: 'high' as const,
  assigned_to: 'Aegis',
  created_by: 'HAL',
  created_at: FUTURE_TIMESTAMP_SECONDS,
  updated_at: FUTURE_TIMESTAMP_SECONDS,
  project_id: 50,
  project_name: 'SPEC-005 Ready for Owner',
  project_prefix: 'S005',
  ticket_ref: 'S005-5',
  github_repo: 'racecraft-lab/mission-control',
  github_issue_number: 23,
  github_pr_number: 23,
  github_pr_state: 'open',
  tags: ['ready-for-owner', 'owner-action'],
}

const qualityReviewTask = {
  id: 504,
  title: 'Aegis quality review handoff',
  description: 'Adjacent lane fixture for Ready for Owner ordering.',
  status: 'quality_review' as const,
  priority: 'medium' as const,
  assigned_to: 'Aegis',
  created_by: 'HAL',
  created_at: FUTURE_TIMESTAMP_SECONDS,
  updated_at: FUTURE_TIMESTAMP_SECONDS,
  project_id: 50,
  project_name: 'SPEC-005 Ready for Owner',
  project_prefix: 'S005',
  ticket_ref: 'S005-4',
  tags: ['quality-review'],
}

const doneTask = {
  id: 506,
  title: 'Merged owner-approved PR',
  description: 'Adjacent lane fixture after the owner merge gate.',
  status: 'done' as const,
  priority: 'low' as const,
  assigned_to: 'HAL',
  created_by: 'Aegis',
  created_at: FUTURE_TIMESTAMP_SECONDS,
  updated_at: FUTURE_TIMESTAMP_SECONDS,
  project_id: 50,
  project_name: 'SPEC-005 Ready for Owner',
  project_prefix: 'S005',
  ticket_ref: 'S005-6',
  tags: ['done'],
}

const tasks = [qualityReviewTask, readyForOwnerTask, doneTask]
const agents = [
  {
    id: 1,
    name: 'Aegis',
    role: 'Quality Review',
    status: 'idle' as const,
    taskStats: { total: 2, assigned: 0, in_progress: 0, ready_for_owner: 1, completed: 0 },
  },
  {
    id: 2,
    name: 'HAL',
    role: 'Orchestrator',
    status: 'busy' as const,
    taskStats: { total: 1, assigned: 0, in_progress: 0, ready_for_owner: 0, completed: 1 },
  },
]
const projects = [
  { id: 50, name: 'SPEC-005 Ready for Owner', slug: 'spec-005-ready-for-owner', ticket_prefix: 'S005', status: 'active' },
]
const notifications = [
  {
    id: 9005,
    recipient: READY_FOR_OWNER_RECIPIENT,
    type: 'task_ready_for_owner',
    title: 'Ready for owner merge',
    message: 'Owner action required: Owner merge gate for SPEC-005 is ready for owner merge.',
    source_type: 'task',
    source_id: readyForOwnerTask.id,
    read_at: null,
    delivered_at: null,
    created_at: FUTURE_TIMESTAMP_SECONDS,
  },
]

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installReadyForOwnerFetchMock() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    const url = new URL(rawUrl, 'http://storybook.local')
    const method = init?.method ?? 'GET'

    if (url.pathname === '/api/tasks') {
      return jsonResponse({ tasks })
    }
    if (url.pathname === '/api/workspaces') {
      return jsonResponse({
        tenant_id: 1,
        active_workspace_id: facilityWorkspace.id,
        workspaces,
      })
    }
    if (url.pathname === '/api/agents') {
      return jsonResponse({ agents })
    }
    if (url.pathname === '/api/projects') {
      return jsonResponse({ projects })
    }
    if (url.pathname === '/api/quality-review') {
      return jsonResponse({ latest: { [readyForOwnerTask.id]: { reviewer: 'aegis', status: 'approved' } } })
    }
    if (url.pathname === '/api/notifications' && method === 'GET') {
      return jsonResponse({ notifications })
    }
    if (url.pathname === '/api/notifications' && method === 'PUT') {
      return jsonResponse({ success: true })
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

function configureReadyForOwnerState() {
  installReadyForOwnerFetchMock()
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('mc.notifications.recipient', READY_FOR_OWNER_RECIPIENT)
  }

  useMissionControl.setState({
    activeTenant: {
      id: 1,
      slug: 'racecraft-facility',
      display_name: 'Racecraft Facility',
      status: 'active',
      linux_user: 'mission-control',
    },
    workspaces,
    workspaceSwitcherEnabled: true,
    workspaceListStatus: 'ready',
    workspaceScopeNotice: null,
    activeProductLine: null,
    activeProductLineScope: createFacilityScope(1, facilityWorkspace.id),
    scopeKey: 'tenant:1:facility',
    activeProject: null,
    selectedTask: null,
    selectedAgent: null,
    activeConversation: null,
    chatInput: '',
    showProjectManagerModal: false,
    tasks,
    unreadNotificationCount: 1,
    connection: {
      isConnected: true,
      url: 'ws://127.0.0.1:8765',
      reconnectAttempts: 0,
      latency: 18,
      sseConnected: true,
    },
    dashboardMode: 'local',
    availableModels: [],
    spawnRequests: [],
    fetchWorkspaces: async () => undefined,
  })
}

function ReadyForOwnerSurface({ surface }: ReadyForOwnerStoryArgs) {
  if (surface === 'notifications') {
    return (
      <div className="h-[620px] bg-background text-foreground">
        <NotificationsPanel />
      </div>
    )
  }

  return (
    <div className="h-[760px] bg-background text-foreground">
      <TaskBoardPanel />
    </div>
  )
}

const meta = {
  title: 'SPEC-005/Ready for Owner UX',
  component: ReadyForOwnerSurface,
  tags: ['visual', 'ready-for-owner'],
  loaders: [
    async () => {
      configureReadyForOwnerState()
      return {}
    },
  ],
  parameters: {
    screenshot: {
      fullPage: true,
    },
  },
} satisfies Meta<typeof ReadyForOwnerSurface>

export default meta
type Story = StoryObj<typeof meta>

export const KanbanLaneOrder: Story = {
  args: { surface: 'task-board' },
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    const readyForOwnerColumn = await canvas.findByRole('region', { name: /Ready for Owner column, 1 tasks/i })
    await expect(readyForOwnerColumn).toBeVisible()
    await expect(within(readyForOwnerColumn).getByRole('button', { name: /Owner merge gate for SPEC-005/i })).toBeVisible()
    await expect(readyForOwnerColumn).toHaveTextContent(/Owner action required/i)
  },
}

export const FocusedReadyForOwnerCard: Story = {
  args: { surface: 'task-board' },
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    const card = await canvas.findByRole('button', { name: /Owner merge gate for SPEC-005.*Owner action required/i })
    card.focus()
    await expect(card).toHaveFocus()
  },
}

export const NotificationActionRequired: Story = {
  args: { surface: 'notifications' },
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await expect(await canvas.findByText('Ready for owner merge')).toBeVisible()
    await expect(canvas.getByText('task_ready_for_owner')).toBeVisible()
    await expect(canvas.getByText('Owner action required')).toBeVisible()
    const markRead = canvas.getByRole('button', { name: /Mark read/i })
    markRead.focus()
    await expect(markRead).toHaveFocus()
  },
}
