import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ComponentProps, ReactNode } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { Last7dTriageTotalsWidget } from '@/components/dashboard/dashboard'
import { AuditTrailPanel } from '@/components/panels/audit-trail-panel'
import ArtifactAdminPanel from '@/components/panels/artifact-admin-panel'
import { usePaddock } from '@/store'

const storyWorkspace = {
  id: 707,
  slug: 'spec-007-alpha',
  name: 'Spec 007 Alpha',
  tenant_id: 1,
  is_facility: false,
  is_auth_workspace: false,
  feature_flags: JSON.stringify({
    FEATURE_WORKSPACE_SWITCHER: true,
    FEATURE_DISPOSITION_LOGGING: true,
    FEATURE_TASK_ARTIFACTS: true,
  }),
}

const currentUser = {
  id: 1,
  username: 'testadmin',
  display_name: 'Test Admin',
  role: 'admin' as const,
  tenant_id: 1,
  workspace_id: storyWorkspace.id,
}

const activeProductLineScope = {
  kind: 'productLine' as const,
  tenantId: 1,
  productLineId: storyWorkspace.id,
  productLine: storyWorkspace,
  version: 1,
  scopeKey: 'tenant:1:product-line:707',
}

const dispositions = [
  {
    id: 3003,
    task_id: 9103,
    disposition: 'unknown',
    reason: 'missing disposition in output_schema',
    triaged_by_agent_id: 4401,
    triaged_at: 1777721400,
    workspace_id: storyWorkspace.id,
  },
  {
    id: 3002,
    task_id: 9102,
    disposition: 'rejected',
    reason: 'not actionable for this product line',
    triaged_by_agent_id: 4402,
    triaged_at: 1777720800,
    workspace_id: storyWorkspace.id,
  },
  {
    id: 3001,
    task_id: 9101,
    disposition: 'merged',
    reason: 'triage matched owner criteria',
    triaged_by_agent_id: 4401,
    triaged_at: 1777720200,
    workspace_id: storyWorkspace.id,
  },
]

const rollup: NonNullable<ComponentProps<typeof Last7dTriageTotalsWidget>['rollupOverride']> = {
  total: 50,
  days: [
    { date: '2026-04-26', total: 4, by_disposition: { merged: 2, rejected: 2 } },
    { date: '2026-04-27', total: 7, by_disposition: { closed: 3, duplicate: 4 } },
    { date: '2026-04-28', total: 8, by_disposition: { merged: 5, unknown: 3 } },
    { date: '2026-04-29', total: 6, by_disposition: { rerouted: 2, completed: 4 } },
    { date: '2026-04-30', total: 9, by_disposition: { rejected: 4, abandoned: 5 } },
    { date: '2026-05-01', total: 10, by_disposition: { merged: 6, duplicate: 4 } },
    { date: '2026-05-02', total: 6, by_disposition: { unknown: 1, closed: 5 } },
  ],
}

const artifacts = [
  {
    id: 7003,
    task_id: 9103,
    workspace_id: storyWorkspace.id,
    artifact_type: 'triage_outcome',
    storage_kind: 'inline_markdown',
    storage_uri: null,
    redaction_status: 'quarantined',
    security_scan_status: 'scanned_with_findings',
    sha256: 'b'.repeat(64),
    byte_size: 930,
    mime: 'text/markdown',
    preview_text: null,
    schema_version: null,
    workflow_template_slug: 'triage',
    original_filename: null,
    producer_agent_id: 4401,
    supersedes_artifact_id: null,
    created_at: 1777721400,
  },
  {
    id: 7002,
    task_id: 9102,
    workspace_id: storyWorkspace.id,
    artifact_type: 'review_notes',
    storage_kind: 'inline_markdown',
    storage_uri: null,
    redaction_status: 'redacted',
    security_scan_status: 'scanned_with_findings',
    sha256: 'c'.repeat(64),
    byte_size: 1280,
    mime: 'text/markdown',
    preview_text: 'Redacted operator notes with secret material removed.',
    schema_version: null,
    workflow_template_slug: 'review',
    original_filename: null,
    producer_agent_id: 4402,
    supersedes_artifact_id: null,
    created_at: 1777720800,
  },
  {
    id: 7001,
    task_id: 9101,
    workspace_id: storyWorkspace.id,
    artifact_type: 'triage_outcome',
    storage_kind: 'inline_json',
    storage_uri: null,
    redaction_status: 'clean',
    security_scan_status: 'scanned_clean',
    sha256: 'a'.repeat(64),
    byte_size: 1040,
    mime: 'application/json',
    preview_text: '{"outcome":"merged","risk":"low"}',
    schema_version: '2026-05',
    workflow_template_slug: 'triage',
    original_filename: null,
    producer_agent_id: 4401,
    supersedes_artifact_id: null,
    created_at: 1777720200,
  },
]

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installSpec007FetchMock() {
  usePaddock.setState({
    currentUser,
    workspaces: [storyWorkspace],
    workspaceSwitcherEnabled: true,
    activeProductLineScope,
    activeProductLine: storyWorkspace,
    scopeKey: activeProductLineScope.scopeKey,
    fetchWorkspaces: async () => undefined,
  })

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    const url = new URL(rawUrl, 'http://storybook.local')

    if (url.pathname === '/api/audit') {
      return jsonResponse({ events: [], total: 0 })
    }

    if (url.pathname === '/api/agents') {
      return jsonResponse({
        agents: [
          { id: 4401, name: 'spec-007-agent-alpha-triager' },
          { id: 4402, name: 'spec-007-agent-alpha-reviewer' },
        ],
      })
    }

    if (url.pathname === '/api/dispositions') {
      return jsonResponse({
        dispositions,
        next_cursor: null,
        has_more: false,
      })
    }

    if (url.pathname === '/api/dispositions/rollup') {
      return jsonResponse(rollup)
    }

    if (url.pathname === '/api/task-artifacts/health') {
      return jsonResponse({
        workspace_id: storyWorkspace.id,
        counts: {
          total: artifacts.length,
          by_redaction_status: { clean: 1, redacted: 1, quarantined: 1 },
          by_security_scan_status: { scanned_clean: 1, scanned_with_findings: 2 },
        },
        total_bytes: 3250,
        failed_publishes_24h: 1,
        failed_scans_24h: 1,
        failed_reads_24h: 0,
        failed_disposition_inserts_24h: 1,
        orphan_count: 2,
        free_space_bytes: 536870912,
        p95: 'insufficient_data',
      })
    }

    if (url.pathname === '/api/task-artifacts') {
      return jsonResponse({ rows: artifacts })
    }

    if (url.pathname.startsWith('/api/task-artifacts/') && init?.method === 'POST') {
      return jsonResponse({ ok: true, redaction_status: 'quarantined' })
    }

    return jsonResponse({})
  }) as typeof fetch
}

function Spec007Surface({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[760px] bg-background p-6 text-foreground">
      <div className="mx-auto max-w-6xl rounded-lg border border-border bg-card">
        {children}
      </div>
    </div>
  )
}

const meta = {
  title: 'SPEC-007/Disposition Artifacts UX',
  tags: ['visual', 'spec-007'],
  loaders: [
    async () => {
      installSpec007FetchMock()
      return {}
    },
  ],
  parameters: {
    screenshot: {
      fullPage: true,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const DashboardRollupWidget: Story = {
  render: () => (
    <Spec007Surface>
      <div className="p-4">
        <Last7dTriageTotalsWidget workspaceIdHint={storyWorkspace.id} rollupOverride={rollup} />
      </div>
    </Spec007Surface>
  ),
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await expect(await canvas.findByTestId('last-7d-triage-totals-widget')).toBeVisible()
    await expect(canvas.getByTestId('last-7d-triage-totals-total')).toHaveTextContent('50')
    await expect(canvas.getAllByTestId('last-7d-triage-totals-day')).toHaveLength(7)
    await expect(canvas.getByText('validation_failed')).toBeVisible()
  },
}

export const AuditDispositionsTab: Story = {
  render: () => (
    <Spec007Surface>
      <AuditTrailPanel />
    </Spec007Surface>
  ),
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await userEvent.click(await canvas.findByTestId('audit-tab-dispositions'))
    await expect(await canvas.findByTestId('dispositions-tab')).toBeVisible()
    await expect(await canvas.findByTestId('dispositions-list')).toBeVisible()
    await expect(canvas.getByTestId('dispositions-filter-chip-unknown')).toHaveTextContent('validation_failed')
  },
}

export const ArtifactAdminPanelMixedState: Story = {
  render: () => (
    <Spec007Surface>
      <ArtifactAdminPanel />
    </Spec007Surface>
  ),
  play: async (ctx) => {
    const canvas = within(ctx.canvasElement)
    await expect(await canvas.findByTestId('artifact-admin-panel')).toBeVisible()
    await expect(await canvas.findByTestId('artifact-health-tile')).toHaveTextContent('Total artifacts')
    await expect(canvas.getByTestId('artifact-p95-tile')).toHaveTextContent('insufficient data')
    await expect(await canvas.findByTestId('artifact-row-7003')).toHaveTextContent('quarantined')
    await expect(canvas.getByTestId('artifact-row-7003')).toHaveTextContent('triage_outcome')
  },
}
