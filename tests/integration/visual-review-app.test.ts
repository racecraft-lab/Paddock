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

  it('renders a guided reviewer checklist with progress checkpoints', async () => {
    await loadVisualReviewApp()

    expect(document.querySelector('.snapshot-name')?.textContent).toContain('renders policy summary')
    expect(document.querySelector('.snapshot-sub')?.textContent).toContain('governance tab landing')
    expect(document.querySelector('.snapshot-raw')?.textContent).toContain('governance/dashboard.png')
    expect(document.querySelector('.review-metadata-card')?.textContent).toContain('Budget guardrail coverage')
    expect(document.querySelector('.review-metadata-card')?.textContent).toContain('The policy summary should show active budgets')
    expect(document.querySelector('.review-metadata-card')?.textContent).toContain('Budget cards stay readable')
    expect(document.querySelector('.review-metadata-card')?.textContent).toContain('budget-guardrail')
    expect(document.querySelector('.review-metadata-card')?.textContent).toContain('review-focus')
    expect(document.querySelector('.review-metadata-card')?.textContent).toContain('Check budget guardrail labels')
    expect(document.querySelector('.context-card')?.textContent).toContain('tests/e2e/governance-tab-landing.e2e.ts:42')
    expect(document.querySelector('.review-guide')?.textContent).toContain('Review Playwright UI E2E in five steps')
    expect(document.querySelector('.review-guide')?.textContent).toContain('Start with shared state')
    expect(document.querySelector('.review-guide')?.textContent).toContain('Inspect every open snapshot')
    expect(document.querySelector('.review-guide')?.textContent).toContain('Apply the decision rule')
    expect(document.querySelector('.review-guide')?.textContent).toContain('Leave a durable trail')
    expect(document.querySelector('.review-guide')?.textContent).toContain('Finish both surfaces')
    expect(document.querySelector('[data-guide-checkpoint="open"] strong')?.textContent).toBe('3')
  })

  it('searches reviewer metadata, tags, and source context', async () => {
    await loadVisualReviewApp()

    const search = document.querySelector<HTMLInputElement>('[data-action="search"]')
    expect(search).not.toBeNull()

    search!.value = 'budget guardrail'
    search!.dispatchEvent(new Event('input', { bubbles: true }))

    expect(document.querySelector('.snapshot-list')?.textContent).toContain('renders policy summary')
    expect(document.querySelector('.snapshot-list')?.textContent).not.toContain('new-modal')
    expect(document.querySelector('.review-metadata-card')?.textContent).toContain('budget-guardrail')
  })

  it('updates guide checkpoints as reviewers make decisions', async () => {
    await loadVisualReviewApp()

    document.querySelector<HTMLButtonElement>('[data-review="approved"]')?.click()

    expect(document.querySelector('[data-guide-checkpoint="approved"] strong')?.textContent).toBe('1')
    expect(document.querySelector('[data-guide-checkpoint="open"] strong')?.textContent).toBe('2')
    expect(document.querySelector('.guide-status')?.textContent).toContain('2 snapshots still need a decision')
  })

  it('opens and dismisses GitHub token creation instructions', async () => {
    await loadVisualReviewApp()

    document.querySelector<HTMLButtonElement>('[data-action="open-token-help"]')?.click()

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog?.textContent).toContain('Create a GitHub token')
    expect(dialog?.textContent).toContain('Fine-grained tokens')
    expect(dialog?.textContent).toContain('Only select repositories')
    expect(dialog?.textContent).toContain('racecraft-lab/mission-control')
    expect(dialog?.textContent).toContain('Issues to Read and write')
    expect(dialog?.textContent).toContain('Commit statuses to Read and write')
    expect(dialog?.textContent).toContain('sessionStorage')
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
