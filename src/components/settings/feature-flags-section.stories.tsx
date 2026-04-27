import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { argosScreenshot } from '@argos-ci/storybook/vitest'
import { expect, userEvent, within } from 'storybook/test'
import { FeatureFlagsSection } from '@/components/settings/feature-flags-section'
import { useMissionControl } from '@/store'

type Scenario = 'default' | 'enabled'

interface FeatureFlagAdminStoryArgs {
  scenario: Scenario
}

const authWorkspace = {
  id: 1,
  slug: 'racecraft-admin',
  name: 'Racecraft Admin',
  tenant_id: 1,
  is_facility: false,
  is_auth_workspace: true,
}

const alphaWorkspace = {
  id: 2,
  slug: 'product-line-alpha',
  name: 'Product Line Alpha',
  tenant_id: 1,
  is_facility: false,
  is_auth_workspace: false,
}

const workspaces = [authWorkspace, alphaWorkspace]

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function flagDefinition(key: string, overrides: Record<string, unknown> = {}) {
  return {
    key,
    label: key === 'FEATURE_WORKSPACE_SWITCHER' ? 'Product Line switcher' : 'Global Aegis',
    description: key === 'FEATURE_WORKSPACE_SWITCHER'
      ? 'Header Product Line selector, activeWorkspace scope, REST/SSE scoping, and filtered panel behavior.'
      : 'Facility-wide Aegis resolution with legacy workspace-scoped fallback.',
    spec: key === 'FEATURE_WORKSPACE_SWITCHER' ? 'SPEC-002' : 'SPEC-003',
    phase: key === 'FEATURE_WORKSPACE_SWITCHER' ? 1 : 2,
    upstreamImpact: key === 'FEATURE_WORKSPACE_SWITCHER' ? 'upstream-safe' : 'upstream-divergent',
    activationScope: key === 'FEATURE_WORKSPACE_SWITCHER' ? 'authWorkspace' : 'productLineWorkspace',
    riskTier: key === 'FEATURE_WORKSPACE_SWITCHER' ? 'medium' : 'high',
    adminManageable: key === 'FEATURE_WORKSPACE_SWITCHER',
    requiresReason: false,
    implementationStatus: key === 'FEATURE_WORKSPACE_SWITCHER' ? 'ready_for_canary' : 'not_implemented',
    enableRequires: key === 'FEATURE_WORKSPACE_SWITCHER' ? [] : ['FEATURE_WORKSPACE_SWITCHER'],
    rollbackBehavior: key === 'FEATURE_WORKSPACE_SWITCHER'
      ? 'Disable to hide the switcher and return API/UI behavior to legacy authenticated-workspace scoping.'
      : 'Leave disabled until implementation ships.',
    evidence: {
      playwright: key === 'FEATURE_WORKSPACE_SWITCHER'
        ? ['tests/feature-flags-admin-ui.spec.ts']
        : [],
      argos: key === 'FEATURE_WORKSPACE_SWITCHER'
        ? ['spec-002-playwright', 'spec-002-storybook']
        : [],
      storybook: key === 'FEATURE_WORKSPACE_SWITCHER'
        ? ['src/components/settings/feature-flags-section.stories.tsx']
        : [],
    },
    ...overrides,
  }
}

function featureFlagPayload(workspaceSwitcherEnabled: boolean) {
  return {
    workspace: authWorkspace,
    workspaces,
    flags: [
      {
        definition: flagDefinition('FEATURE_WORKSPACE_SWITCHER'),
        stored_value: workspaceSwitcherEnabled ? true : null,
        evaluated_value: workspaceSwitcherEnabled,
        evaluation_reason: workspaceSwitcherEnabled ? 'workspace override true' : 'default false',
        env_locked: false,
        env_value: null,
        can_update: true,
        enable_blockers: [],
        warnings: ['This flag controls the SPEC-002 Product Line switcher currently under review.'],
        last_change: workspaceSwitcherEnabled
          ? {
              actor: 'testadmin',
              actor_id: 1,
              updated_at: 1777248000,
              reason: 'Storybook visual toggle proof',
            }
          : null,
      },
      {
        definition: flagDefinition('FEATURE_GLOBAL_AEGIS'),
        stored_value: null,
        evaluated_value: false,
        evaluation_reason: 'not implemented',
        env_locked: false,
        env_value: null,
        can_update: false,
        enable_blockers: [
          'This feature is not implemented yet.',
          'Requires FEATURE_WORKSPACE_SWITCHER to be enabled first.',
        ],
        warnings: ['Potential fork pressure: upstream-divergent behavior requires explicit review.'],
        last_change: null,
      },
    ],
  }
}

function installFeatureFlagFetchMock(scenario: Scenario) {
  let workspaceSwitcherEnabled = scenario === 'enabled'

  useMissionControl.setState({
    fetchWorkspaces: async () => undefined,
  })

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    const url = new URL(rawUrl, 'http://storybook.local')

    if (url.pathname === '/api/feature-flags' && (!init?.method || init.method === 'GET')) {
      return jsonResponse(featureFlagPayload(workspaceSwitcherEnabled))
    }

    if (url.pathname === '/api/feature-flags/FEATURE_WORKSPACE_SWITCHER' && init?.method === 'PATCH') {
      const body = init.body ? JSON.parse(String(init.body)) as { value?: boolean } : {}
      workspaceSwitcherEnabled = body.value === true
      return jsonResponse({
        updated: 'FEATURE_WORKSPACE_SWITCHER',
        workspace_id: authWorkspace.id,
        flag: featureFlagPayload(workspaceSwitcherEnabled).flags[0],
      })
    }

    if (url.pathname === '/api/workspaces') {
      return jsonResponse({
        tenant_id: 1,
        active_workspace_id: authWorkspace.id,
        workspaces,
      })
    }

    return jsonResponse({})
  }) as typeof fetch
}

function FeatureFlagAdminSurface() {
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <div className="min-h-[900px] bg-background text-foreground p-6">
      <div className="mx-auto max-w-5xl space-y-3">
        {feedback && (
          <div
            role={feedback.ok ? 'status' : 'alert'}
            className={`rounded-lg p-3 text-xs font-medium ${
              feedback.ok ? 'bg-green-500/10 text-green-400' : 'bg-destructive/10 text-destructive'
            }`}
          >
            {feedback.text}
          </div>
        )}
        <FeatureFlagsSection showFeedback={(ok, text) => setFeedback({ ok, text })} />
      </div>
    </div>
  )
}

const meta = {
  title: 'SPEC-002/Feature Flag Admin',
  component: FeatureFlagAdminSurface,
  tags: ['spec-002', 'visual', 'feature-flag-admin'],
  loaders: [
    async ({ args }) => {
      installFeatureFlagFetchMock((args as FeatureFlagAdminStoryArgs).scenario)
      return {}
    },
  ],
  parameters: {
    argos: {
      fitToContent: false,
    },
  },
} satisfies Meta<typeof FeatureFlagAdminSurface>

export default meta
type Story = StoryObj<typeof meta>

export const AdminDefaultState: Story = {
  args: { scenario: 'default' },
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await expect(await canvas.findByRole('heading', { name: /feature flags/i })).toBeVisible()
    await expect(canvas.getByTestId('feature-flag-card-FEATURE_WORKSPACE_SWITCHER')).toHaveTextContent(/Evaluated OFF/)
    await expect(canvas.getByTestId('feature-flag-card-FEATURE_GLOBAL_AEGIS')).toHaveTextContent(/not implemented/i)
    await argosScreenshot(ctx, 'feature-flag-admin-default')
  },
}

export const AdminToggleJourney: Story = {
  args: { scenario: 'default' },
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await expect(await canvas.findByRole('heading', { name: /feature flags/i })).toBeVisible()
    const switcherCard = canvas.getByTestId('feature-flag-card-FEATURE_WORKSPACE_SWITCHER')
    await userEvent.click(within(switcherCard).getByRole('button', { name: /enable product line switcher/i }))
    await expect(await canvas.findByRole('status')).toHaveTextContent(/Product Line switcher enabled/i)
    await expect(switcherCard).toHaveTextContent(/Evaluated ON/)
    await expect(switcherCard).toHaveTextContent(/Stored override\s*true/i)
    await argosScreenshot(ctx, 'feature-flag-admin-toggle-on')
  },
}
