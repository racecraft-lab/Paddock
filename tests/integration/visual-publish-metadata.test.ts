import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function extractReviewData(html: string) {
  const match = html.match(/<script id="visual-review-data" type="application\/json">([\s\S]*?)<\/script>/)
  if (!match) throw new Error('visual review data script not found')
  return JSON.parse(match[1])
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
        'racecraft-lab/mission-control',
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
        'https://racecraft-lab.github.io/mission-control',
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
})
