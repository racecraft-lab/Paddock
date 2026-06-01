import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

function extractReviewData(html: string) {
  const match = html.match(/<script id="visual-review-data" type="application\/json">([\s\S]*?)<\/script>/)
  if (!match) throw new Error('visual review data script not found')
  return JSON.parse(match[1])
}

const GITHUB_ENV_KEYS = [
  'GITHUB_API_URL',
  'GITHUB_BASE_REF',
  'GITHUB_EVENT_PATH',
  'GITHUB_HEAD_REF',
  'GITHUB_REF_NAME',
  'GITHUB_REPOSITORY',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_RUN_ID',
  'GITHUB_SERVER_URL',
  'GITHUB_SHA',
  'GITHUB_TOKEN',
  'GITHUB_WORKFLOW',
  'MC_VISUAL_PAGES_BASE_URL',
  'MC_VISUAL_PAGES_BRANCH',
  'NODE_OPTIONS',
]

function isolatedGithubEnv(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of GITHUB_ENV_KEYS) {
    delete env[key]
  }
  return { ...env, ...overrides }
}

describe('visual PR Pages publisher metadata', () => {
  it('enriches reg-viz payloads from sibling visual manifests outside the report tree', () => {
    const repoRoot = process.cwd()
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'visual-pr-pages-'))
    const reportDir = path.join(tempDir, 'visual-report')
    const actualDir = path.join(reportDir, '__reg__', '1_actual')
    const pagesDir = path.join(tempDir, 'pages')
    const manifestDir = path.join(tempDir, 'test-results', 'visual-current', 'storybook')
    const snapshot = 'governance-demo--default.png'

    try {
      mkdirSync(actualDir, { recursive: true })
      mkdirSync(manifestDir, { recursive: true })
      writeFileSync(path.join(actualDir, snapshot), 'png')
      writeFileSync(
        path.join(manifestDir, snapshot.replace(/\.png$/, '.visual.json')),
        `${JSON.stringify({
          kind: 'storybook',
          domain: 'spec-008',
          name: 'governance-demo--default',
          story: {
            exportName: 'Default',
            id: 'governance-demo--default',
            name: 'Default',
            sourceFile: 'src/components/governance/demo.stories.tsx',
            tags: ['visual', 'spec-008'],
            title: 'Governance / Demo',
          },
          review: {
            description: 'Review the default governance demo story.',
            expected: 'The demo renders the seeded default state.',
            focus: ['Default copy is visible', 'Primary controls are not clipped'],
            tags: ['visual', 'spec-008'],
            title: 'Governance demo default state',
          },
          tags: ['visual', 'spec-008'],
        }, null, 2)}\n`
      )

      const payload = {
        actualDir: '__reg__/1_actual',
        deletedItems: [],
        diffDir: '__reg__/0_diff',
        expectedDir: '__reg__/2_expected',
        failedItems: [],
        newItems: [{ raw: snapshot, encoded: snapshot }],
        passedItems: [],
      }
      const reportFile = path.join(reportDir, 'storybook.html')
      mkdirSync(reportDir, { recursive: true })
      writeFileSync(reportFile, `<script>window['__reg__'] = ${JSON.stringify(payload)};</script>`)

      const result = spawnSync(process.execPath, [
        path.join(repoRoot, 'scripts', 'publish-visual-pr-pages.mjs'),
        '--surface',
        'storybook',
        '--report-file',
        reportFile,
        '--pages-dir',
        pagesDir,
        '--repository',
        'racecraft-lab/Paddock',
        '--pr-number',
        '26',
        '--head-ref',
        '008-resource-governance',
        '--base-ref',
        'main',
        '--sha',
        'abcdef1234567890',
        '--run-id',
        '123',
        '--run-attempt',
        '1',
        '--base-url',
        'https://racecraft-lab.github.io/Paddock',
      ], {
        cwd: tempDir,
        encoding: 'utf8',
      })

      expect(`${result.stdout}\n${result.stderr}`).toContain('published storybook report')
      expect(result.status).toBe(0)

      const reviewHtml = readFileSync(path.join(pagesDir, 'pr', '26', 'storybook', 'latest', 'index.html'), 'utf8')
      const reviewData = extractReviewData(reviewHtml)
      expect(reviewData.payload.newItems[0].review).toMatchObject({
        description: 'Review the default governance demo story.',
        domain: 'spec-008',
        focus: ['Default copy is visible', 'Primary controls are not clipped'],
        sourceFile: 'src/components/governance/demo.stories.tsx',
        storyExportName: 'Default',
        storyId: 'governance-demo--default',
        storyName: 'Default',
        storyTitle: 'Governance / Demo',
        tags: ['visual', 'spec-008'],
        title: 'Governance demo default state',
      })

      const regVizHtml = readFileSync(path.join(pagesDir, 'pr', '26', 'storybook', 'latest', 'reg-viz.html'), 'utf8')
      expect(regVizHtml).toContain('Governance demo default state')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('publishes main push reports without a pull request payload', () => {
    const repoRoot = process.cwd()
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'visual-main-pages-'))
    const reportDir = path.join(tempDir, 'visual-report')
    const actualDir = path.join(reportDir, '__reg__', '1_actual')
    const pagesDir = path.join(tempDir, 'pages')
    const eventFile = path.join(tempDir, 'push-event.json')
    const snapshot = 'governance-main--default.png'

    try {
      mkdirSync(actualDir, { recursive: true })
      writeFileSync(path.join(actualDir, snapshot), 'png')

      const payload = {
        actualDir: '__reg__/1_actual',
        deletedItems: [],
        diffDir: '__reg__/0_diff',
        expectedDir: '__reg__/2_expected',
        failedItems: [],
        newItems: [{ raw: snapshot, encoded: snapshot }],
        passedItems: [],
      }
      const reportFile = path.join(reportDir, 'storybook.html')
      mkdirSync(reportDir, { recursive: true })
      writeFileSync(reportFile, `<script>window['__reg__'] = ${JSON.stringify(payload)};</script>`)
      writeFileSync(
        eventFile,
        `${JSON.stringify({
          head_commit: {
            message: 'feat(SPEC-008): Resource Governance + Cost Tracker Enforcement (RC Factory Phase 7) (#26)',
          },
        })}\n`
      )

      const result = spawnSync(process.execPath, [
        path.join(repoRoot, 'scripts', 'publish-visual-pr-pages.mjs'),
        '--surface',
        'storybook',
        '--report-file',
        reportFile,
        '--pages-dir',
        pagesDir,
        '--repository',
        'racecraft-lab/Paddock',
        '--mode',
        'main',
        '--run-id',
        '456',
        '--run-attempt',
        '1',
        '--base-url',
        'https://racecraft-lab.github.io/Paddock',
      ], {
        cwd: tempDir,
        encoding: 'utf8',
        env: isolatedGithubEnv({
          GITHUB_REF_NAME: 'main',
          GITHUB_SHA: 'abcdef1234567890',
          GITHUB_EVENT_PATH: eventFile,
        }),
      })

      expect(`${result.stdout}\n${result.stderr}`).toContain('published storybook report')
      expect(result.status).toBe(0)

      const latestHtml = readFileSync(path.join(pagesDir, 'storybook', 'latest', 'index.html'), 'utf8')
      const latestData = extractReviewData(latestHtml)
      expect(latestData.context).toMatchObject({
        baseRef: 'main',
        headRef: 'main',
        headSha: 'abcdef1234567890',
        prIndexHref: 'https://racecraft-lab.github.io/Paddock/pr/26/',
        prNumber: '26',
        prTitle: 'feat(SPEC-008): Resource Governance + Cost Tracker Enforcement (RC Factory Phase 7)',
        prUrl: 'https://github.com/racecraft-lab/Paddock/pull/26',
        reportScope: 'latest',
        surface: 'storybook',
      })

      expect(readFileSync(path.join(pagesDir, 'storybook', 'abcdef1234567890', 'index.html'), 'utf8')).toContain('visual-review-data')
      expect(readFileSync(path.join(pagesDir, 'index.html'), 'utf8')).toContain('Main Branch Visual Reports')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('embeds approved PR review state into main reports during the publish action', () => {
    const repoRoot = process.cwd()
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'visual-main-pr-state-'))
    const reportDir = path.join(tempDir, 'visual-report')
    const actualDir = path.join(reportDir, '__reg__', '1_actual')
    const pagesDir = path.join(tempDir, 'pages')
    const fetchStub = path.join(tempDir, 'fetch-stub.mjs')
    const snapshot = 'governance-main--default.png'
    const mergedSha = 'abcdef1234567890'
    const prHeadSha = '645f75c000000000000000000000000000000000'
    const approvedState = {
      prNumber: '26',
      prTitle: 'SPEC-008 governance',
      prUrl: 'https://github.com/racecraft-lab/Paddock/pull/26',
      repository: 'racecraft-lab/Paddock',
      schema: 'mission-control.visual-review-state.v1',
      surfaces: {
        storybook: {
          baseRef: 'main',
          decisions: {
            [`new-${snapshot}`]: {
              decision: 'approved',
              group: 'spec-008',
              snapshot,
              updatedAt: '2026-05-04T20:00:00.000Z',
              variant: 'new',
            },
          },
          headRef: '008-resource-governance',
          headSha: prHeadSha,
          prNumber: '26',
          prTitle: 'SPEC-008 governance',
          prUrl: 'https://github.com/racecraft-lab/Paddock/pull/26',
          reportHref: 'https://racecraft-lab.github.io/Paddock/pr/26/storybook/latest/',
          repository: 'racecraft-lab/Paddock',
          runAttempt: '1',
          runId: '123',
          runKey: '123-attempt-1',
          runUrl: 'https://github.com/racecraft-lab/Paddock/actions/runs/123',
          summary: {
            approved: 1,
            open: 0,
            rejected: 0,
            reviewable: 1,
            reviewed: 1,
            status: 'approved',
          },
          surface: 'storybook',
          surfaceLabel: 'Storybook Components',
          updatedAt: '2026-05-04T20:00:00.000Z',
        },
      },
      updatedAt: '2026-05-04T20:00:00.000Z',
      version: 1,
    }
    try {
      mkdirSync(actualDir, { recursive: true })
      writeFileSync(path.join(actualDir, snapshot), 'png')
      const pullsResponse = JSON.stringify([{
        head: { sha: prHeadSha },
        html_url: 'https://github.com/racecraft-lab/Paddock/pull/26',
        merge_commit_sha: mergedSha,
        merged_at: '2026-05-04T23:42:05Z',
        number: 26,
        title: 'SPEC-008 governance',
      }])
      const commentsResponse = JSON.stringify([{
        body: `<!-- mission-control-visual-review-state:v1\n${JSON.stringify(approvedState, null, 2)}\n-->`,
        created_at: '2026-05-04T20:00:00Z',
        id: 2600,
        updated_at: '2026-05-04T20:00:00Z',
        user: { login: 'visual-reviewer' },
      }])
      writeFileSync(
        fetchStub,
        `
globalThis.fetch = async (url) => {
  const value = String(url)
  if (value.includes('/repos/racecraft-lab/Paddock/commits/${mergedSha}/pulls')) {
    return new Response(${JSON.stringify(pullsResponse)}, { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (value.includes('/repos/racecraft-lab/Paddock/issues/26/comments')) {
    return new Response(${JSON.stringify(commentsResponse)}, { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
}
`
      )

      const payload = {
        actualDir: '__reg__/1_actual',
        deletedItems: [],
        diffDir: '__reg__/0_diff',
        expectedDir: '__reg__/2_expected',
        failedItems: [],
        newItems: [{ raw: snapshot, encoded: snapshot }],
        passedItems: [],
      }
      const reportFile = path.join(reportDir, 'storybook.html')
      mkdirSync(reportDir, { recursive: true })
      writeFileSync(reportFile, `<script>window['__reg__'] = ${JSON.stringify(payload)};</script>`)

      const result = spawnSync(process.execPath, [
        path.join(repoRoot, 'scripts', 'publish-visual-pr-pages.mjs'),
        '--surface',
        'storybook',
        '--report-file',
        reportFile,
        '--pages-dir',
        pagesDir,
        '--repository',
        'racecraft-lab/Paddock',
        '--mode',
        'main',
        '--run-id',
        '456',
        '--run-attempt',
        '1',
        '--base-url',
        'https://racecraft-lab.github.io/Paddock',
      ], {
        cwd: tempDir,
        encoding: 'utf8',
        env: isolatedGithubEnv({
          GITHUB_REF_NAME: 'main',
          GITHUB_SHA: mergedSha,
          GITHUB_TOKEN: 'ghs_test',
          NODE_OPTIONS: `--import=${pathToFileURL(fetchStub).href}`,
        }),
      })

      expect(`${result.stdout}\n${result.stderr}`).toContain('published storybook report')
      expect(result.status).toBe(0)

      const latestHtml = readFileSync(path.join(pagesDir, 'storybook', 'latest', 'index.html'), 'utf8')
      const latestData = extractReviewData(latestHtml)
      expect(latestData.context).toMatchObject({
        headSha: mergedSha,
        initialReviewState: approvedState,
        initialReviewStateAuthor: 'visual-reviewer',
        initialReviewStateCommentId: 2600,
        prNumber: '26',
        sourcePullRequest: {
          headSha: prHeadSha,
          mergeCommitSha: mergedSha,
          number: '26',
        },
      })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('inherits covered PR review state for direct main commits after a merge', () => {
    const repoRoot = process.cwd()
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'visual-main-history-state-'))
    const reportDir = path.join(tempDir, 'visual-report')
    const actualDir = path.join(reportDir, '__reg__', '1_actual')
    const pagesDir = path.join(tempDir, 'pages')
    const fetchStub = path.join(tempDir, 'fetch-stub.mjs')
    const snapshot = 'governance-main--default.png'
    const currentSha = '2d65a057e44bc2fbecfd2ee127eb900717dd2a38'
    const directMainSha = '57d4fe157d4fe157d4fe157d4fe157d4fe157'
    const mergedSha = 'bd9a693937f9572fd8532484c084646e4fe8ff73'
    const prHeadSha = '645f75c230577f97f35ea5629abef97ea37ab7f9'
    const approvedState = {
      prNumber: '26',
      prTitle: 'SPEC-008 governance',
      prUrl: 'https://github.com/racecraft-lab/Paddock/pull/26',
      repository: 'racecraft-lab/Paddock',
      schema: 'mission-control.visual-review-state.v1',
      surfaces: {
        storybook: {
          baseRef: 'main',
          decisions: {
            [`new-${snapshot}`]: {
              decision: 'approved',
              group: 'spec-008',
              snapshot,
              updatedAt: '2026-05-04T20:00:00.000Z',
              variant: 'new',
            },
          },
          headRef: '008-resource-governance',
          headSha: prHeadSha,
          prNumber: '26',
          prTitle: 'SPEC-008 governance',
          prUrl: 'https://github.com/racecraft-lab/Paddock/pull/26',
          reportHref: 'https://racecraft-lab.github.io/Paddock/pr/26/storybook/latest/',
          repository: 'racecraft-lab/Paddock',
          runAttempt: '1',
          runId: '123',
          runKey: '123-attempt-1',
          runUrl: 'https://github.com/racecraft-lab/Paddock/actions/runs/123',
          summary: {
            approved: 1,
            open: 0,
            rejected: 0,
            reviewable: 1,
            reviewed: 1,
            status: 'approved',
          },
          surface: 'storybook',
          surfaceLabel: 'Storybook Components',
          updatedAt: '2026-05-04T20:00:00.000Z',
        },
      },
      updatedAt: '2026-05-04T20:00:00.000Z',
      version: 1,
    }

    try {
      mkdirSync(actualDir, { recursive: true })
      writeFileSync(path.join(actualDir, snapshot), 'png')
      const commitsResponse = JSON.stringify([
        { sha: currentSha, commit: { message: 'fix(visual): embed merged PR review state in main reports' } },
        { sha: directMainSha, commit: { message: 'fix(ci): publish main visual reports without reg-suit' } },
        { sha: mergedSha, commit: { message: 'feat(SPEC-008): Resource Governance + Cost Tracker Enforcement (RC Factory Phase 7) (#26)' } },
      ])
      const pullsResponse = JSON.stringify([{
        head: { sha: prHeadSha },
        html_url: 'https://github.com/racecraft-lab/Paddock/pull/26',
        merge_commit_sha: mergedSha,
        merged_at: '2026-05-04T23:42:05Z',
        number: 26,
        title: 'SPEC-008 governance',
      }])
      const commentsResponse = JSON.stringify([{
        body: `<!-- mission-control-visual-review-state:v1\n${JSON.stringify(approvedState, null, 2)}\n-->`,
        created_at: '2026-05-04T20:00:00Z',
        id: 2600,
        updated_at: '2026-05-04T20:00:00Z',
        user: { login: 'visual-reviewer' },
      }])
      writeFileSync(
        fetchStub,
        `
globalThis.fetch = async (url) => {
  const value = String(url)
  if (value.includes('/repos/racecraft-lab/Paddock/commits?')) {
    return new Response(${JSON.stringify(commitsResponse)}, { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (value.includes('/repos/racecraft-lab/Paddock/commits/${currentSha}/pulls')) {
    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (value.includes('/repos/racecraft-lab/Paddock/commits/${directMainSha}/pulls')) {
    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (value.includes('/repos/racecraft-lab/Paddock/commits/${mergedSha}/pulls')) {
    return new Response(${JSON.stringify(pullsResponse)}, { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (value.includes('/repos/racecraft-lab/Paddock/issues/26/comments')) {
    return new Response(${JSON.stringify(commentsResponse)}, { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
}
`
      )

      const payload = {
        actualDir: '__reg__/1_actual',
        deletedItems: [],
        diffDir: '__reg__/0_diff',
        expectedDir: '__reg__/2_expected',
        failedItems: [],
        newItems: [{ raw: snapshot, encoded: snapshot }],
        passedItems: [],
      }
      const reportFile = path.join(reportDir, 'storybook.html')
      mkdirSync(reportDir, { recursive: true })
      writeFileSync(reportFile, `<script>window['__reg__'] = ${JSON.stringify(payload)};</script>`)

      const result = spawnSync(process.execPath, [
        path.join(repoRoot, 'scripts', 'publish-visual-pr-pages.mjs'),
        '--surface',
        'storybook',
        '--report-file',
        reportFile,
        '--pages-dir',
        pagesDir,
        '--repository',
        'racecraft-lab/Paddock',
        '--mode',
        'main',
        '--run-id',
        '456',
        '--run-attempt',
        '1',
        '--base-url',
        'https://racecraft-lab.github.io/Paddock',
      ], {
        cwd: tempDir,
        encoding: 'utf8',
        env: isolatedGithubEnv({
          GITHUB_REF_NAME: 'main',
          GITHUB_SHA: currentSha,
          GITHUB_TOKEN: 'ghs_test',
          NODE_OPTIONS: `--import=${pathToFileURL(fetchStub).href}`,
        }),
      })

      expect(`${result.stdout}\n${result.stderr}`).toContain('published storybook report')
      expect(result.status).toBe(0)

      const latestHtml = readFileSync(path.join(pagesDir, 'storybook', 'latest', 'index.html'), 'utf8')
      const latestData = extractReviewData(latestHtml)
      expect(latestData.context).toMatchObject({
        headSha: currentSha,
        initialReviewState: approvedState,
        initialReviewStateAuthor: 'visual-reviewer',
        initialReviewStateCommentId: 2600,
        prNumber: '26',
        sourcePullRequest: {
          headSha: prHeadSha,
          mergeCommitSha: mergedSha,
          number: '26',
        },
      })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
