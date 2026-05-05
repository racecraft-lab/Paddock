import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

async function loadVisualReviewStateModule() {
  const modulePath = '../../scripts/visual-review-state.mjs'
  return import(modulePath)
}

const context = {
  repository: 'racecraft-lab/mission-control',
  prNumber: '26',
  prTitle: 'SPEC-008 governance',
  prUrl: 'https://github.com/racecraft-lab/mission-control/pull/26',
  surface: 'playwright',
  surfaceLabel: 'Playwright UI E2E',
  runId: '123',
  runAttempt: '2',
  runKey: '123-attempt-2',
  runUrl: 'https://github.com/racecraft-lab/mission-control/actions/runs/123',
  headRef: '008-resource-governance',
  baseRef: 'main',
  headSha: 'abcdef1234567890',
  reportHref: 'https://racecraft-lab.github.io/mission-control/pr/26/playwright/latest/',
}

const items = [
  { id: 'changed-dashboard', raw: 'dashboard.png', variant: 'changed', group: 'governance' },
  { id: 'new-modal', raw: 'modal.png', variant: 'new', group: 'governance' },
  { id: 'deleted-old', raw: 'old.png', variant: 'deleted', group: 'legacy' },
  { id: 'passed-unchanged', raw: 'same.png', variant: 'passed', group: 'stable' },
]

describe('visual review state', () => {
  it('builds exportable surface state that covers every reviewable snapshot', async () => {
    const { buildSurfaceReviewState } = await loadVisualReviewStateModule()

    const surface = buildSurfaceReviewState({
      context,
      items,
      reviews: {
        'changed-dashboard': 'approved',
        'new-modal': 'rejected',
      },
      comments: {
        'new-modal': 'Rejecting because the budget copy is clipped.',
      },
      reviewer: 'nyk',
      updatedAt: '2026-05-04T12:00:00.000Z',
    })

    expect(surface.summary).toEqual({
      approved: 1,
      open: 1,
      rejected: 1,
      reviewable: 3,
      reviewed: 2,
      status: 'changes_requested',
    })
    expect(Object.keys(surface.decisions)).toEqual(['changed-dashboard', 'new-modal', 'deleted-old'])
    expect(surface.decisions['changed-dashboard']).toMatchObject({
      decision: 'approved',
      reviewer: 'nyk',
      snapshot: 'dashboard.png',
      variant: 'changed',
    })
    expect(surface.decisions['new-modal']).toMatchObject({
      comment: 'Rejecting because the budget copy is clipped.',
      decision: 'rejected',
      reviewer: 'nyk',
    })
    expect(surface.decisions['deleted-old']).toMatchObject({
      decision: 'open',
      snapshot: 'old.png',
      variant: 'deleted',
    })
  })

  it('round-trips PR comment JSON while rendering a human review summary', async () => {
    const {
      buildSurfaceReviewState,
      mergeSurfaceReviewState,
      parseReviewCommentBody,
      renderReviewComment,
      VISUAL_REVIEW_COMMENT_MARKER,
    } = await loadVisualReviewStateModule()
    const surface = buildSurfaceReviewState({
      context,
      items,
      reviews: {
        'changed-dashboard': 'approved',
        'new-modal': 'approved',
        'deleted-old': 'approved',
      },
      reviewer: 'nyk',
      updatedAt: '2026-05-04T12:00:00.000Z',
    })
    const state = mergeSurfaceReviewState(null, surface)

    const body = renderReviewComment(state)
    const parsed = parseReviewCommentBody(body)

    expect(body).toContain(VISUAL_REVIEW_COMMENT_MARKER)
    expect(body).toContain('Visual review state')
    expect(body).toContain('Playwright UI E2E')
    expect(body).toContain('3/3 reviewed')
    expect(parsed).toEqual(state)
  })

  it('fails approval until required surfaces are approved for the current head SHA', async () => {
    const { buildSurfaceReviewState, mergeSurfaceReviewState, validateVisualApproval } =
      await loadVisualReviewStateModule()
    const approvedPlaywright = buildSurfaceReviewState({
      context,
      items,
      reviews: {
        'changed-dashboard': 'approved',
        'new-modal': 'approved',
        'deleted-old': 'approved',
      },
      reviewer: 'nyk',
      updatedAt: '2026-05-04T12:00:00.000Z',
    })
    const rejectedStorybook = buildSurfaceReviewState({
      context: {
        ...context,
        surface: 'storybook',
        surfaceLabel: 'Storybook Components',
        reportHref: 'https://racecraft-lab.github.io/mission-control/pr/26/storybook/latest/',
      },
      items,
      reviews: {
        'changed-dashboard': 'approved',
        'new-modal': 'rejected',
        'deleted-old': 'approved',
      },
      reviewer: 'nyk',
      updatedAt: '2026-05-04T12:02:00.000Z',
    })

    const playwrightOnly = mergeSurfaceReviewState(null, approvedPlaywright)
    expect(
      validateVisualApproval(playwrightOnly, {
        headSha: context.headSha,
        prNumber: context.prNumber,
        repository: context.repository,
        requiredSurfaces: ['playwright', 'storybook'],
      })
    ).toMatchObject({
      approved: false,
      failures: ['storybook visual review state is missing'],
    })

    const withRejectedStorybook = mergeSurfaceReviewState(playwrightOnly, rejectedStorybook)
    expect(
      validateVisualApproval(withRejectedStorybook, {
        headSha: context.headSha,
        prNumber: context.prNumber,
        repository: context.repository,
        requiredSurfaces: ['playwright', 'storybook'],
      }).failures
    ).toContain('storybook has 1 rejected snapshot(s)')

    const approvedStorybook = buildSurfaceReviewState({
      context: {
        ...context,
        surface: 'storybook',
        surfaceLabel: 'Storybook Components',
        reportHref: 'https://racecraft-lab.github.io/mission-control/pr/26/storybook/latest/',
      },
      items,
      reviews: {
        'changed-dashboard': 'approved',
        'new-modal': 'approved',
        'deleted-old': 'approved',
      },
      reviewer: 'nyk',
      updatedAt: '2026-05-04T12:03:00.000Z',
    })
    const fullyApproved = mergeSurfaceReviewState(playwrightOnly, approvedStorybook)

    expect(
      validateVisualApproval(fullyApproved, {
        headSha: context.headSha,
        prNumber: context.prNumber,
        repository: context.repository,
        requiredSurfaces: ['playwright', 'storybook'],
      })
    ).toEqual({
      approved: true,
      failures: [],
      summary: 'Visual review approved for playwright, storybook',
    })
  })

  it('detects when a PR changed files that require visual approval', async () => {
    const { visualReviewRequiredForFiles } = await loadVisualReviewStateModule()

    expect(visualReviewRequiredForFiles([
      'docs/operator-guides/visual-baseline-approval.md',
      'scripts/deploy-standalone.sh',
    ])).toBe(false)
    expect(visualReviewRequiredForFiles([
      '.specify/memory/constitution.md',
    ])).toBe(false)
    expect(visualReviewRequiredForFiles([
      'src/components/panels/task-board-panel.tsx',
    ])).toBe(true)
    expect(visualReviewRequiredForFiles([
      'src/components/panels/task-board-panel.stories.tsx',
    ])).toBe(true)
    expect(visualReviewRequiredForFiles([
      'tests/e2e/spec-008/governance-budget.spec.ts',
    ])).toBe(true)
    expect(visualReviewRequiredForFiles([
      'regconfig.storybook.json',
    ])).toBe(true)
  })

  it('CLI exits nonzero until PR comments contain approved visual review state', async () => {
    const { buildSurfaceReviewState, mergeSurfaceReviewState, renderReviewComment } =
      await loadVisualReviewStateModule()
    const approvedPlaywright = buildSurfaceReviewState({
      context,
      items,
      reviews: {
        'changed-dashboard': 'approved',
        'new-modal': 'approved',
        'deleted-old': 'approved',
      },
      reviewer: 'nyk',
      updatedAt: '2026-05-04T12:00:00.000Z',
    })
    const approvedStorybook = buildSurfaceReviewState({
      context: {
        ...context,
        surface: 'storybook',
        surfaceLabel: 'Storybook Components',
      },
      items,
      reviews: {
        'changed-dashboard': 'approved',
        'new-modal': 'approved',
        'deleted-old': 'approved',
      },
      reviewer: 'nyk',
      updatedAt: '2026-05-04T12:02:00.000Z',
    })
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'visual-review-state-'))
    const commentsPath = path.join(tempDir, 'comments.json')
    const runCheck = () => spawnSync(process.execPath, [
      'scripts/check-visual-review-approval.mjs',
      '--comments-file',
      commentsPath,
      '--head-sha',
      context.headSha,
      '--pr-number',
      context.prNumber,
      '--repository',
      context.repository,
      '--required-surfaces',
      'playwright,storybook',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    try {
      writeFileSync(commentsPath, JSON.stringify([
        {
          body: renderReviewComment(mergeSurfaceReviewState(null, approvedPlaywright)),
          updated_at: '2026-05-04T12:01:00.000Z',
          user: { login: 'nyk' },
        },
      ]))

      const blocked = runCheck()
      expect(blocked.status).toBe(1)
      expect(`${blocked.stdout}\n${blocked.stderr}`).toContain('storybook visual review state is missing')

      writeFileSync(commentsPath, JSON.stringify([
        {
          body: renderReviewComment(
            mergeSurfaceReviewState(mergeSurfaceReviewState(null, approvedPlaywright), approvedStorybook)
          ),
          updated_at: '2026-05-04T12:03:00.000Z',
          user: { login: 'nyk' },
        },
      ]))

      const approved = runCheck()
      expect(approved.status).toBe(0)
      expect(approved.stdout).toContain('Visual review approved for playwright, storybook')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
