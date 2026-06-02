/**
 * SPEC-006 — initializeLabels signature compat (T010 / T017, FR-053, US1-AC3, P5-AC1)
 *
 * Asserts:
 *   (a) 1-arg call `initializeLabels(repo)` creates ONLY pd:* and priority:*
 *       labels — independent of any workspace flag state. (Legacy contract.)
 *   (b) 2-arg call `initializeLabels(repo, workspaceId)` with the flag OFF
 *       behaves identically to the 1-arg call (only pd:* and priority:*).
 *
 * The ON-branch behavior — provisioning area:* labels — is delivered in T074
 * (US7); this test ONLY pins the OFF / no-workspaceId path.
 *
 * Uses relative imports per the worktree convention. Mocks `ensureLabels` in
 * `../github` so we can capture the exact label set that would be sent to the
 * GitHub API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── ensureLabels mock setup (hoisted) ─────────────────
const { ensureLabelsMock } = vi.hoisted(() => ({
  ensureLabelsMock: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('@/lib/github', async () => {
  const actual = await vi.importActual<typeof import('@/lib/github')>('@/lib/github')
  return {
    ...actual,
    ensureLabels: ensureLabelsMock,
  }
})

import { initializeLabels } from '../github-sync-engine'
import {
  ALL_AREA_LABEL_NAMES,
  ALL_PRIORITY_LABEL_NAMES,
  ALL_STATUS_LABEL_NAMES,
} from '../github-label-map'

interface CapturedLabel {
  name: string
}

beforeEach(() => {
  ensureLabelsMock.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SPEC-006 / T010 — initializeLabels(repo) 1-arg legacy signature', () => {
  it('creates ONLY the legacy pd:* and priority:* set (no area:* labels)', async () => {
    await initializeLabels('org/repo')

    expect(ensureLabelsMock).toHaveBeenCalledTimes(1)
    const call = ensureLabelsMock.mock.calls[0]
    const repoArg = call[0] as string
    const labelsArg = call[1] as CapturedLabel[]
    expect(repoArg).toBe('org/repo')

    const names = labelsArg.map((l) => l.name)
    // Legacy contract: exactly status + priority labels.
    expect(names).toEqual([...ALL_STATUS_LABEL_NAMES, ...ALL_PRIORITY_LABEL_NAMES])

    for (const areaName of ALL_AREA_LABEL_NAMES) {
      expect(names).not.toContain(areaName)
    }
  })
})

describe('SPEC-006 / T010 — initializeLabels(repo, workspaceId) 2-arg signature with flag OFF', () => {
  it('behaves identically to the 1-arg call when FEATURE_AREA_LABEL_ROUTING is unset', async () => {
    // No workspace seed → resolveFlag returns false (default_off).
    await initializeLabels('org/repo', 1)

    expect(ensureLabelsMock).toHaveBeenCalledTimes(1)
    const call = ensureLabelsMock.mock.calls[0]
    const labelsArg = call[1] as CapturedLabel[]
    const names = labelsArg.map((l) => l.name)

    // Identical to the 1-arg behavior: legacy set only.
    expect(names).toEqual([...ALL_STATUS_LABEL_NAMES, ...ALL_PRIORITY_LABEL_NAMES])
    for (const areaName of ALL_AREA_LABEL_NAMES) {
      expect(names).not.toContain(areaName)
    }
  })
})
