/**
 * SPEC-006 — ProjectManagerModal (US3, US6)
 *
 * Covers T034 RED + T037 GREEN (US3):
 *   T034 — no-triage banner test (FR-040b)
 *   T037 — banner visible when flag ON & no triage; hidden when flag OFF or
 *          when any project has is_triage_project=1.
 *
 * Covers T065 RED + T069 GREEN (US6, FR-040a, P5-AC9):
 *   T065 — when `FEATURE_AREA_LABEL_ROUTING` is OFF for the workspace,
 *          the three new fields (`area_slug`, `is_triage_project`,
 *          `is_repo_sync_owner`) MUST render visibly with HTML `disabled`
 *          (or `aria-disabled='true'` on non-form elements) and a tooltip
 *          'Available after FEATURE_AREA_LABEL_ROUTING is enabled for this
 *          workspace.'
 *   T069 — modal renders the disabled visible state.
 *
 * Uses `@testing-library/react` against jsdom (vitest config). Network is
 * stubbed via `vi.stubGlobal('fetch', ...)`. The modal pulls workspace and
 * scope state from `useMissionControl` so we drive the test by setting store
 * state directly. The banner condition is derived client-side via
 * `resolveFlag('FEATURE_AREA_LABEL_ROUTING', ...)` against the active
 * workspace's `feature_flags` blob.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectManagerModal } from '../project-manager-modal'
import { useMissionControl } from '../../../store'
import {
  createFacilityScope,
  createProductLineScope,
  type ProductLine,
} from '../../../types/product-line'

// ── Type-safe project shape for the /api/projects response ───────
interface ProjectFixture {
  id: number
  name: string
  slug: string
  ticket_prefix: string
  status: 'active' | 'archived'
  github_repo?: string | null
  area_slug?: string | null
  is_triage_project?: boolean
  is_repo_sync_owner?: boolean
}

interface FetchPayloads {
  projects: ProjectFixture[]
  agents: Array<{ id: number; name: string; role: string; status: string }>
}

function buildWorkspace(overrides: Partial<ProductLine> = {}): ProductLine {
  return {
    id: 42,
    slug: 'assembly',
    name: 'Assembly',
    tenant_id: 7,
    feature_flags: '{"FEATURE_WORKSPACE_SWITCHER":true,"FEATURE_AREA_LABEL_ROUTING":true}',
    ...overrides,
  }
}

function setupStore(workspace: ProductLine): void {
  // The modal sources its `projects` array from a per-mount fetch, so we only
  // need workspace + scope state in the store. The fetch stub supplies the
  // project list verbatim.
  useMissionControl.setState({
    workspaceSwitcherEnabled: true,
    workspaceListStatus: 'ready',
    workspaceScopeNotice: null,
    workspaces: [workspace],
    activeProductLine: workspace,
    activeProductLineScope: createProductLineScope(workspace, 2),
    scopeKey: `tenant:${workspace.tenant_id ?? 7}:product-line:${workspace.id}`,
  })
}

function setupFetchStub(payloads: FetchPayloads): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/projects')) {
        return new Response(JSON.stringify({ projects: payloads.projects }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/api/agents')) {
        return new Response(JSON.stringify({ agents: payloads.agents }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('{}', { status: 200 })
    }),
  )
}

// FR-040b banner copy — exact text the modal renders.
const BANNER_TEXT =
  'No triage project designated. Unresolvable issues will route to the sync-owner project until you designate one.'

beforeEach(() => {
  // Reset store to a known empty baseline.
  useMissionControl.setState({
    workspaceSwitcherEnabled: false,
    workspaceListStatus: 'idle',
    workspaceScopeNotice: null,
    workspaces: [],
    activeProductLine: null,
    activeProductLineScope: createFacilityScope(7, 1),
    scopeKey: 'tenant:7:facility',
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SPEC-006 / T034 — no-triage-designated banner (FR-040b)', () => {
  it('renders the yellow banner when FEATURE_AREA_LABEL_ROUTING is ON and no project has is_triage_project=true', async () => {
    const workspace = buildWorkspace()
    const projects: ProjectFixture[] = [
      {
        id: 1,
        name: 'Default',
        slug: 'general',
        ticket_prefix: 'GEN',
        status: 'active',
        is_triage_project: false,
      },
      {
        id: 2,
        name: 'Quality Assurance',
        slug: 'qa',
        ticket_prefix: 'QA',
        status: 'active',
        is_triage_project: false,
      },
    ]
    setupStore(workspace)
    setupFetchStub({ projects, agents: [] })

    render(<ProjectManagerModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(BANNER_TEXT)).toBeInTheDocument())
    const banner = screen.getByTestId('no-triage-banner')
    expect(banner).toBeInTheDocument()
    // Banner uses yellow/amber styling per FR-040b.
    expect(banner.className).toMatch(/(amber|yellow)/i)
  })

  it('hides the banner when any project has is_triage_project=true', async () => {
    const workspace = buildWorkspace()
    const projects: ProjectFixture[] = [
      {
        id: 1,
        name: 'Default',
        slug: 'general',
        ticket_prefix: 'GEN',
        status: 'active',
        is_triage_project: false,
      },
      {
        id: 2,
        name: 'Triage',
        slug: 'triage',
        ticket_prefix: 'TRI',
        status: 'active',
        is_triage_project: true,
      },
    ]
    setupStore(workspace)
    setupFetchStub({ projects, agents: [] })

    render(<ProjectManagerModal onClose={() => {}} />)
    // Wait for projects to render so we know the post-load tree is in view.
    await waitFor(() => expect(screen.getByText('Triage')).toBeInTheDocument())
    expect(screen.queryByTestId('no-triage-banner')).not.toBeInTheDocument()
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })

  it('hides the banner when FEATURE_AREA_LABEL_ROUTING is OFF', async () => {
    const workspace = buildWorkspace({
      feature_flags: '{"FEATURE_WORKSPACE_SWITCHER":true}',
    })
    const projects: ProjectFixture[] = [
      {
        id: 1,
        name: 'Default',
        slug: 'general',
        ticket_prefix: 'GEN',
        status: 'active',
        is_triage_project: false,
      },
    ]
    setupStore(workspace)
    setupFetchStub({ projects, agents: [] })

    render(<ProjectManagerModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument())
    expect(screen.queryByTestId('no-triage-banner')).not.toBeInTheDocument()
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })
})

// ── T065 — Visible-but-disabled when flag is OFF (FR-040a, P5-AC9) ──
//
// When FEATURE_AREA_LABEL_ROUTING is OFF for the active workspace, the
// three new fields (`area_slug`, `is_triage_project`, `is_repo_sync_owner`)
// MUST render visibly so operators discover them, but each interactive
// surface MUST be `disabled={true}` (or `aria-disabled='true'` on non-form
// surfaces) and carry a tooltip with the exact required copy.
const FLAG_OFF_TOOLTIP = 'Available after FEATURE_AREA_LABEL_ROUTING is enabled for this workspace.'

describe('SPEC-006 / T065 — flag-OFF visible-but-disabled fields (FR-040a)', () => {
  it('renders is_repo_sync_owner toggle disabled with tooltip when flag is OFF', async () => {
    const workspace = buildWorkspace({
      feature_flags: '{"FEATURE_WORKSPACE_SWITCHER":true}',
    })
    const projects: ProjectFixture[] = [
      {
        id: 1,
        name: 'Repo Project',
        slug: 'repo-project',
        ticket_prefix: 'REP',
        status: 'active',
        github_repo: 'org/repo',
      },
    ]
    setupStore(workspace)
    setupFetchStub({ projects, agents: [] })

    render(<ProjectManagerModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Repo Project')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Repo Project'))

    const ownerToggle = await screen.findByTestId('is-repo-sync-owner-toggle')
    expect(ownerToggle).toBeInTheDocument()
    expect(ownerToggle).toBeDisabled()
    expect(ownerToggle).toHaveAttribute('aria-disabled', 'true')
    expect(ownerToggle).toHaveAttribute('title', FLAG_OFF_TOOLTIP)
  })

  it('renders is_triage_project toggle disabled with tooltip when flag is OFF', async () => {
    const workspace = buildWorkspace({
      feature_flags: '{"FEATURE_WORKSPACE_SWITCHER":true}',
    })
    const projects: ProjectFixture[] = [
      {
        id: 1,
        name: 'Some Project',
        slug: 'some',
        ticket_prefix: 'SOM',
        status: 'active',
      },
    ]
    setupStore(workspace)
    setupFetchStub({ projects, agents: [] })

    render(<ProjectManagerModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Some Project')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Some Project'))

    const triageToggle = await screen.findByTestId('is-triage-project-toggle')
    expect(triageToggle).toBeInTheDocument()
    expect(triageToggle).toBeDisabled()
    expect(triageToggle).toHaveAttribute('aria-disabled', 'true')
    expect(triageToggle).toHaveAttribute('title', FLAG_OFF_TOOLTIP)
  })

  it('renders area_slug input disabled with tooltip when flag is OFF', async () => {
    const workspace = buildWorkspace({
      feature_flags: '{"FEATURE_WORKSPACE_SWITCHER":true}',
    })
    const projects: ProjectFixture[] = [
      {
        id: 1,
        name: 'Some Project',
        slug: 'some',
        ticket_prefix: 'SOM',
        status: 'active',
      },
    ]
    setupStore(workspace)
    setupFetchStub({ projects, agents: [] })

    render(<ProjectManagerModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Some Project')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Some Project'))

    const areaInput = await screen.findByTestId('area-slug-input')
    expect(areaInput).toBeInTheDocument()
    expect(areaInput).toBeDisabled()
    expect(areaInput).toHaveAttribute('aria-disabled', 'true')
    expect(areaInput).toHaveAttribute('title', FLAG_OFF_TOOLTIP)
  })

  it('does NOT render the disabled tooltip when flag is ON (fields are interactive)', async () => {
    const workspace = buildWorkspace() // flag ON by default
    const projects: ProjectFixture[] = [
      {
        id: 1,
        name: 'Some Project',
        slug: 'some',
        ticket_prefix: 'SOM',
        status: 'active',
      },
    ]
    setupStore(workspace)
    setupFetchStub({ projects, agents: [] })

    render(<ProjectManagerModal onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Some Project')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Some Project'))

    const triageToggle = await screen.findByTestId('is-triage-project-toggle')
    expect(triageToggle).not.toBeDisabled()
    expect(triageToggle).not.toHaveAttribute('aria-disabled', 'true')
    expect(triageToggle).not.toHaveAttribute('title', FLAG_OFF_TOOLTIP)
    const areaInput = await screen.findByTestId('area-slug-input')
    expect(areaInput).not.toBeDisabled()
    expect(areaInput).not.toHaveAttribute('aria-disabled', 'true')
    expect(areaInput).not.toHaveAttribute('title', FLAG_OFF_TOOLTIP)
  })
})
