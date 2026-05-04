import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const context = {
  baseRef: 'main',
  headRef: '008-resource-governance',
  headSha: 'abcdef1234567890',
  prIndexHref: 'https://racecraft-lab.github.io/mission-control/pr/26/',
  prNumber: '26',
  prTitle: 'SPEC-008 governance',
  prUrl: 'https://github.com/racecraft-lab/mission-control/pull/26',
  regVizHref: './reg-viz.html',
  repository: 'racecraft-lab/mission-control',
  runId: '123',
  runKey: '123-attempt-1',
  runUrl: 'https://github.com/racecraft-lab/mission-control/actions/runs/123',
  surface: 'playwright',
  surfaceLabel: 'Playwright UI E2E',
  workflowName: 'Mission Control UI E2E',
}

const payload = {
  actualDir: './__reg__/1_actual',
  deletedItems: [{ encoded: 'legacy/removed.png', raw: 'legacy/removed.png' }],
  diffDir: './__reg__/0_diff',
  diffImageExtention: 'webp',
  expectedDir: './__reg__/2_expected',
  failedItems: [{
    encoded: 'governance/dashboard.png',
    raw: 'governance/dashboard.png',
    review: {
      description: 'Budget guardrail coverage for the governance policy summary.',
      domain: 'spec-008',
      expected: 'The policy summary should show active budgets without clipping the utilization copy.',
      focus: ['Budget cards stay readable', 'Policy status badges remain visible'],
      kind: 'playwright',
      sourceFile: 'tests/e2e/governance-tab-landing.e2e.ts:42',
      subtitle: 'tests/e2e/governance-tab-landing.e2e.ts > governance tab landing > renders policy summary',
      tags: ['spec-008', 'visual', 'budget-guardrail'],
      testAnnotations: [{ type: 'review-focus', description: 'Check budget guardrail labels.' }],
      testTitle: 'renders policy summary',
      testTitlePath: ['governance tab landing', 'renders policy summary'],
      title: 'renders policy summary',
    },
  }],
  newItems: [{ encoded: 'governance/new-modal.png', raw: 'governance/new-modal.png' }],
  passedItems: [],
}

function prepareDom() {
  window.history.replaceState(null, '', '/visual-review.html')
  document.body.innerHTML = `
    <div id="visual-review-root"></div>
    <script id="visual-review-data" type="application/json">${JSON.stringify({ context, payload })}</script>
  `
}

async function loadVisualReviewApp() {
  await import('../../scripts/visual-review-app.js')
}

describe('visual review app guidance', () => {
  beforeEach(() => {
    vi.resetModules()
    prepareDom()
    localStorage.clear()
    sessionStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => [],
      ok: true,
      status: 200,
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('renders an image-first review desk with focused reviewer context', async () => {
    await loadVisualReviewApp()

    expect(document.querySelector('.snapshot-name')?.textContent).toContain('renders policy summary')
    expect(document.querySelector('.snapshot-sub')?.textContent).toContain('governance-tab-landing.e2e.ts')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('Budget guardrail coverage')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('The policy summary should show active budgets')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('Budget cards stay readable')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('budget-guardrail')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('Review sequence')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('Identify the Playwright test')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('Inspect the visual state')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('Comment before rejecting')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('Decide')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('Approve only intentional UI changes')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('tests/e2e/governance-tab-landing.e2e.ts:42')
    expect(document.querySelector<HTMLTextAreaElement>('[data-action="review-comment"]')?.value).toBe('')
    expect(document.querySelector<HTMLButtonElement>('[data-action="post-inline-comment"]')?.textContent).toContain(
      'Post inline PR comment'
    )
    expect(document.querySelector<HTMLButtonElement>('[data-review="rejected"]')?.disabled).toBe(true)
    expect(document.querySelector<HTMLAnchorElement>('[data-source-link]')?.href).toContain(
      '/blob/abcdef1234567890/tests/e2e/governance-tab-landing.e2e.ts#L42'
    )
    expect(document.querySelector('.review-panel .sync-panel')).toBeNull()
    expect(document.querySelector('.submission-footer .sync-panel')?.textContent).toContain('Final review submission')
    expect(document.querySelector('.utility-panel')?.textContent || '').not.toContain('Copy summary')
    expect(document.querySelector('.context-card')?.textContent).toContain('tests/e2e/governance-tab-landing.e2e.ts:42')
    expect(document.querySelector('.viewer-card')?.textContent).toContain('renders policy summary')
    expect(document.querySelector('[data-summary="open"] strong')?.textContent).toBe('3')
    expect(document.querySelector('[data-summary="reviewed"] strong')?.textContent).toBe('0/3')
  })

  it('searches reviewer metadata, tags, and source context', async () => {
    await loadVisualReviewApp()

    const search = document.querySelector<HTMLInputElement>('[data-action="search"]')
    expect(search).not.toBeNull()

    search!.value = 'budget guardrail'
    search!.dispatchEvent(new Event('input', { bubbles: true }))

    expect(document.querySelector('.snapshot-list')?.textContent).toContain('renders policy summary')
    expect(document.querySelector('.snapshot-list')?.textContent).not.toContain('new-modal')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('budget-guardrail')
  })

  it('updates review progress as reviewers make decisions', async () => {
    await loadVisualReviewApp()

    document.querySelector<HTMLButtonElement>('[data-review="approved"]')?.click()

    expect(document.querySelector('[data-summary="reviewed"] strong')?.textContent).toBe('1/3')
    expect(document.querySelector('[data-summary="open"] strong')?.textContent).toBe('2')
    expect(document.querySelector('.progress-line')?.textContent).toContain('33% complete')
    expect(document.querySelector('[data-review-brief]')?.textContent).toContain('2 open on this surface')
  })

  it('requires a review comment before a rejection can be selected', async () => {
    await loadVisualReviewApp()

    const reject = document.querySelector<HTMLButtonElement>('[data-review="rejected"]')
    expect(reject?.disabled).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }))

    expect(document.querySelector('[data-summary="reviewed"] strong')?.textContent).toBe('0/3')
    expect(document.querySelector('[data-comment-status]')?.textContent).toContain(
      'Write a review comment before rejecting'
    )

    const textarea = document.querySelector<HTMLTextAreaElement>('[data-action="review-comment"]')
    textarea!.value = 'Rejecting because the budget card text clips at the right edge.'
    textarea!.dispatchEvent(new Event('input', { bubbles: true }))

    expect(document.querySelector<HTMLButtonElement>('[data-review="rejected"]')?.disabled).toBe(false)
    document.querySelector<HTMLButtonElement>('[data-review="rejected"]')?.click()

    expect(document.querySelector('[data-summary="reviewed"] strong')?.textContent).toBe('1/3')
    expect(document.querySelector('[data-summary="rejected"] strong')?.textContent).toBe('1')
  })

  it('posts a file-level inline PR review comment for the selected source file', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/user')) {
        return {
          json: async () => ({ login: 'fgabelmannjr' }),
          ok: true,
          status: 200,
        }
      }
      if (url.endsWith('/repos/racecraft-lab/mission-control/pulls/26/comments')) {
        return {
          json: async () => ({
            html_url: 'https://github.com/racecraft-lab/mission-control/pull/26#discussion-diff-1',
            id: 9001,
          }),
          ok: true,
          status: 201,
        }
      }
      return {
        json: async () => [],
        ok: true,
        status: 200,
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    await loadVisualReviewApp()

    const token = document.querySelector<HTMLInputElement>('[data-action="github-token"]')
    token!.value = 'github_pat_test'
    token!.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-action="save-token"]')?.click()
    await vi.waitFor(() => expect(document.querySelector('.sync-badge')?.textContent).toContain('@fgabelmannjr'))

    const textarea = document.querySelector<HTMLTextAreaElement>('[data-action="review-comment"]')
    textarea!.value = 'The policy summary is clipped in the current screenshot.'
    textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-action="post-inline-comment"]')?.click()

    await vi.waitFor(() => expect(document.querySelector('[data-comment-status]')?.textContent).toContain('Inline PR comment posted'))

    const commentCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/pulls/26/comments'))
    expect(commentCall).toBeTruthy()
    const body = JSON.parse(String(commentCall?.[1]?.body))
    expect(commentCall?.[1]?.method).toBe('POST')
    expect(body).toMatchObject({
      commit_id: 'abcdef1234567890',
      path: 'tests/e2e/governance-tab-landing.e2e.ts',
      subject_type: 'file',
    })
    expect(body.body).toContain('The policy summary is clipped')
    expect(body.body).toContain('Visual review page')
    expect(body.body).toContain('id=changed-governance%2Fdashboard.png')
    expect(body.body).toContain('tests/e2e/governance-tab-landing.e2e.ts:42')
  })

  it('opens and dismisses GitHub token creation instructions', async () => {
    await loadVisualReviewApp()

    const syncPanel = document.querySelector<HTMLElement>('.sync-panel')
    expect(syncPanel?.textContent).toContain('Final review submission')
    expect(syncPanel?.textContent).toContain('Publish surface decisions to the PR')
    expect(syncPanel?.textContent).toContain('Review in progress')
    expect(syncPanel?.textContent).toContain('Open3')
    expect(syncPanel?.textContent).toContain('Rejected0')
    expect(syncPanel?.textContent).toContain('Finish the queue')
    expect(syncPanel?.textContent).toContain('Create token')
    expect(syncPanel?.textContent).toContain('GitHub token')
    expect(syncPanel?.textContent).toContain('Load PR state')
    expect(syncPanel?.textContent).toContain("preserves teammate decisions")
    expect(syncPanel?.textContent).toContain('Publish to PR')
    expect(syncPanel?.textContent).toContain('visual-review-approval')
    expect(syncPanel?.querySelector('.sync-controls')).toBeNull()
    expect(syncPanel?.querySelector('.sync-controls [data-token-create-link]')).toBeNull()

    document.querySelector<HTMLButtonElement>('[data-action="open-token-help"]')?.click()

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog?.textContent).toContain('Create a GitHub token')
    expect(dialog?.textContent).toContain('prefilled GitHub token page')
    expect(dialog?.textContent).toContain('Only select repositories')
    expect(dialog?.textContent).toContain('racecraft-lab/mission-control')
    expect(dialog?.textContent).toContain('set Issues, Pull requests, and Commit statuses to Read and write')
    expect(dialog?.textContent).toMatch(/Issues\s+Read and write/)
    expect(dialog?.textContent).toMatch(/Pull requests\s+Read and write/)
    expect(dialog?.textContent).toMatch(/Commit statuses\s+Read and write/)
    expect(dialog?.textContent).toContain('sessionStorage')
    const directTokenLink = dialog?.querySelector<HTMLAnchorElement>('[data-token-create-link]')
    expect(directTokenLink?.href).toContain('https://github.com/settings/personal-access-tokens/new')
    expect(directTokenLink?.href).toContain('target_name=racecraft-lab')
    expect(directTokenLink?.href).toContain('issues=write')
    expect(directTokenLink?.href).toContain('pull_requests=write')
    expect(directTokenLink?.href).toContain('statuses=write')
    expect(directTokenLink?.target).toBe('_blank')
    expect(dialog?.querySelector<HTMLAnchorElement>('a[href*="docs.github.com"]')?.href).toContain(
      'managing-your-personal-access-tokens'
    )

    dialog?.querySelector<HTMLButtonElement>('[data-action="close-token-help"]')?.click()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    document.querySelector<HTMLButtonElement>('[data-action="open-token-help"]')?.click()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
