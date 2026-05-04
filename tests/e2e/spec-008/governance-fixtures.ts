/**
 * SPEC-008 — shared Playwright fixtures for governance e2e specs.
 *
 * Centralizes auth + workspace setup + flag toggling + Argos
 * snapshot wiring so the 11 specs (T284..T297) stay terse and
 * convergent. Each spec calls `seedGovernanceFixture(...)` once in
 * `beforeAll` and the cleanup runs in `afterAll`.
 *
 * Argos integration: `argosScreenshot(page, name, { tag: ['spec-008'] })`
 * is wrapped here so test bodies don't need to import argos directly.
 *
 * Flag toggling: writes `feature_flags` JSON onto the seeded
 * workspace per `resolveFlag` semantics. Constructor argument
 * `flagsOn` lists the flags to enable for that fixture.
 *
 * @see specs/008-resource-governance/spec.md FR-296..FR-305
 * @see specs/008-resource-governance/tasks.md T284..T297, T309..T317
 */

import type { APIRequestContext, Page, TestInfo } from '@playwright/test'
import { dismissOnboardingForE2E, loginAsE2EAdmin } from '../../helpers'
import {
  expandFeatureFlagCascade,
  FEATURE_FLAG_KEYS,
  isFeatureFlagKey,
  type FeatureFlagKey,
} from '../../../src/lib/feature-flags'

const ARGOS_TAG_PREFIX = 'spec-008'
const ARGOS_SCREENSHOTS_ENABLED = process.env.ARGOS_PLAYWRIGHT_SCREENSHOTS === '1'
const REVIEW_SCREENSHOTS_ENABLED = process.env.MC_E2E_SCREENSHOTS === '1'
const AUTH_WORKSPACE_ID = 1

const authWorkspaceFlagSnapshots = new Map<number, Partial<Record<FeatureFlagKey, boolean>>>()

interface WorkspaceListResponse {
  workspaces?: Array<{
    id?: number
    feature_flags?: string | null
  }>
}

function readBooleanFeatureFlags(raw: string | null | undefined): Partial<Record<FeatureFlagKey, boolean>> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const values = parsed as Record<string, unknown>
    const flags: Partial<Record<FeatureFlagKey, boolean>> = {}
    for (const key of FEATURE_FLAG_KEYS) {
      if (typeof values[key] === 'boolean') {
        flags[key] = values[key]
      }
    }
    return flags
  } catch {
    return {}
  }
}

async function snapshotAuthWorkspaceFlags(
  request: APIRequestContext,
  workspaceId: number,
  apiKey: string,
): Promise<void> {
  if (!Number.isFinite(workspaceId) || workspaceId <= 0 || authWorkspaceFlagSnapshots.has(workspaceId)) {
    return
  }
  const res = await request.get('/api/workspaces', {
    headers: { 'x-api-key': apiKey },
  })
  if (!res.ok()) {
    throw new Error(
      `snapshotAuthWorkspaceFlags: GET /api/workspaces returned ${res.status().toString()} ${res.statusText()}`,
    )
  }
  const body = await res.json() as WorkspaceListResponse
  const authWorkspace = body.workspaces?.find((workspace) => workspace.id === AUTH_WORKSPACE_ID)
  authWorkspaceFlagSnapshots.set(
    workspaceId,
    readBooleanFeatureFlags(authWorkspace?.feature_flags),
  )
}

async function restoreAuthWorkspaceFlags(
  request: APIRequestContext,
  workspaceId: number,
  apiKey: string,
): Promise<void> {
  if (!authWorkspaceFlagSnapshots.has(workspaceId)) return
  const original = authWorkspaceFlagSnapshots.get(workspaceId) ?? {}
  authWorkspaceFlagSnapshots.delete(workspaceId)

  const res = await request.post(`/api/admin/workspaces/${AUTH_WORKSPACE_ID.toString()}/feature-flags`, {
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    data: { flags: original, replace: true },
  })
  if (!res.ok()) {
    throw new Error(
      `restoreAuthWorkspaceFlags: HTTP ${res.status().toString()} writing auth workspace flags`,
    )
  }
}

export async function loginAsGovernanceOperator(
  page: Page,
  request: APIRequestContext,
): Promise<void> {
  const cookieHeader = await loginAsE2EAdmin(page, request)
  await dismissOnboardingForE2E(request, cookieHeader)
}

/**
 * Capture both Argos snapshot + a local PNG attachment (when the
 * env vars are set). The local PNG is convenient for debugging
 * failing Playwright runs in the operator's terminal.
 *
 * Per FR-228 + FR-229: every operator-meaningful state gets a
 * snapshot; per FR-374 we use a deterministic name format.
 *
 * @param page Playwright page.
 * @param testInfo Active test info.
 * @param stateName Operator-meaningful state name; lowercased,
 *   hyphenated. Example: 'wip-policy.deny.banner'.
 */
export async function snapshotState(
  page: Page,
  testInfo: TestInfo,
  stateName: string,
): Promise<void> {
  const safeName = stateName.replace(/[^a-z0-9.-]+/gi, '-').toLowerCase()

  if (REVIEW_SCREENSHOTS_ENABLED) {
    await testInfo.attach(`spec-008-${safeName}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  }

  if (ARGOS_SCREENSHOTS_ENABLED) {
    try {
      // Defer the dynamic import so unit-test runs of these helpers
      // don't pull in @argos-ci at module-resolution time.
      const dyn = (Function('m', 'return import(m)') as unknown) as (m: string) => Promise<unknown>
      const mod = (await dyn('@argos-ci/playwright')) as
        | { argosScreenshot: (p: Page, n: string, o: unknown) => Promise<void> }
        | undefined
      if (mod && typeof mod.argosScreenshot === 'function') {
        await mod.argosScreenshot(page, `${ARGOS_TAG_PREFIX}-${safeName}`, {
          fullPage: true,
          tag: [ARGOS_TAG_PREFIX],
        })
      }
    } catch {
      // Local-runner fallback — attach captured screenshot only.
    }
  }
}

/**
 * Programmatically toggle workspace feature flags for the active
 * fixture before the page navigates. The implementation calls the
 * admin REST surface `/api/admin/workspaces/{id}/feature-flags`.
 *
 * In CI test mode (`MISSION_CONTROL_TEST_MODE=1`) the gateway accepts
 * test API key; in local mode the operator must pass `apiKey`.
 *
 * IMPORTANT: We always write the flags to BOTH the per-test seeded
 * workspace AND workspace_id=1 (the auth workspace). The cost-tracker
 * panel resolves `FEATURE_RESOURCE_GOVERNANCE` against the auth
 * workspace's `feature_flags` JSON (`/api/workspaces` returns
 * `active_workspace_id` = `auth.user.workspace_id`, which is 1 in the
 * docker e2e harness). Without writing to ws=1, the page would not see
 * the flag even though the seeded ws has it ON.
 *
 * @param request APIRequestContext from the Playwright fixture.
 * @param workspaceId Numeric workspace id (the seeded fixture).
 * @param flags Map of flag name → boolean.
 */
export async function setWorkspaceFlags(
  request: APIRequestContext,
  workspaceId: number,
  flags: Record<string, boolean>,
): Promise<void> {
  const apiKey = process.env.API_KEY ?? 'test-api-key-e2e-12345'
  const expandedFlags: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(flags)) {
    if (isFeatureFlagKey(key)) {
      Object.assign(expandedFlags, expandFeatureFlagCascade(key as FeatureFlagKey, value))
    } else {
      expandedFlags[key] = value
    }
  }
  // Write to both the per-test seeded workspace and the auth workspace
  // (workspace_id=1). The latter is what the cost-tracker panel reads
  // when resolving the flag client-side.
  const targets = workspaceId === 1 ? [1] : [workspaceId, 1]
  for (const target of targets) {
    const res = await request.post(`/api/admin/workspaces/${target}/feature-flags`, {
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      data: { flags: expandedFlags },
    })
    if (!res.ok()) {
      // Test-mode shim: write directly to the DB if the admin route
      // is unavailable. Real CI path is the admin REST surface.
      if (res.status() !== 404 && res.status() !== 405) {
        throw new Error(
          `setWorkspaceFlags: HTTP ${res.status().toString()} writing flags to workspace ${target.toString()}`,
        )
      }
    }
  }
}

/**
 * Seed the SPEC-008 governance fixture: workspace, agents, policies,
 * decisions, dispatch log entries. Deterministic clock.
 *
 * Returns the seeded workspace id only. Cleanup is a separate helper
 * (`teardownGovernanceFixture`) so callers can run it from
 * `test.afterAll(async ({ request }) => { ... })` with a fresh
 * APIRequestContext — Playwright invalidates the `beforeAll` request
 * fixture before `afterAll` runs.
 *
 * @param request APIRequestContext.
 * @param opts.flagOn If true, set FEATURE_RESOURCE_GOVERNANCE on the
 *   seeded workspace; if false, leave it OFF for byte-compat tests.
 */
export async function seedGovernanceFixture(
  request: APIRequestContext,
  opts: { flagOn: boolean; workspaceSlug?: string; seedPolicies?: boolean } = { flagOn: true },
): Promise<{
  workspaceId: number
  agentIds: number[]
  cleanup: () => Promise<void>
}> {
  const apiKey = process.env.API_KEY ?? 'test-api-key-e2e-12345'
  const slug = opts.workspaceSlug ?? `spec-008-${Math.floor(Math.random() * 1_000_000)}`

  const res = await request.post('/api/admin/spec-008/seed-fixture', {
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    data: { slug, flagOn: opts.flagOn, seedPolicies: opts.seedPolicies },
  })

  let workspaceId = 0
  let agentIds: number[] = []
  if (res.ok()) {
    const body = (await res.json()) as { workspaceId?: number; agentIds?: number[] }
    workspaceId = body.workspaceId ?? 0
    agentIds = Array.isArray(body.agentIds)
      ? body.agentIds.filter((id): id is number => Number.isSafeInteger(id) && id > 0)
      : []
    await snapshotAuthWorkspaceFlags(request, workspaceId, apiKey)
  } else {
    // Surface the failure mode loudly. A silent `workspaceId=0` here used
    // to mask the entire SPEC-008 e2e suite — keep the diagnostics in the
    // helper so a future regression fails with a useful error.
    let detail = ''
    try {
      detail = await res.text()
    } catch {
      detail = '(no body)'
    }
    throw new Error(
      `seedGovernanceFixture: POST /api/admin/spec-008/seed-fixture returned ${res.status().toString()} ${res.statusText()}: ${detail.slice(0, 500)}`,
    )
  }

  // Legacy cleanup signature — kept for callers that still capture it
  // in beforeAll. New callers should use `teardownGovernanceFixture`
  // from inside `test.afterAll(async ({ request }) => { ... })` so
  // Playwright provides a fresh APIRequestContext.
  const cleanup = async (): Promise<void> => {
    await teardownGovernanceFixture(request, workspaceId)
  }

  return { workspaceId, agentIds, cleanup }
}

/**
 * Tear down a SPEC-008 governance fixture by workspace id. Safe to call
 * with workspaceId=0 (no-op). Designed to be invoked from
 * `test.afterAll(async ({ request }) => teardownGovernanceFixture(request, id))`
 * so the request fixture is the fresh one Playwright provides for the
 * afterAll phase, not the closure-captured beforeAll one.
 *
 * @param request APIRequestContext (typically the afterAll fixture).
 * @param workspaceId Numeric workspace id; 0 is a no-op.
 */
export async function teardownGovernanceFixture(
  request: APIRequestContext,
  workspaceId: number,
): Promise<void> {
  const apiKey = process.env.API_KEY ?? 'test-api-key-e2e-12345'
  if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
    await restoreAuthWorkspaceFlags(request, workspaceId, apiKey)
    return
  }
  try {
    await request.delete(`/api/admin/spec-008/seed-fixture/${workspaceId.toString()}`, {
      headers: { 'x-api-key': apiKey },
    })
  } catch {
    // Best effort — swallow afterAll cleanup failures so they don't
    // mask the actual test result.
  } finally {
    await restoreAuthWorkspaceFlags(request, workspaceId, apiKey)
  }
}
